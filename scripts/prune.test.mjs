import assert from "node:assert/strict";
import { test } from "vitest";
import { pruneVideos } from "../video/scripts/prune.mjs";

const now = Date.parse("2026-11-17T20:00:00Z");
const old = "2026-10-17T20:00:00Z";
const main = "a".repeat(40);
const releases = ["b", "c", "d", "e", "f"].map(ch => ch.repeat(40));
const paths = {
  main: "videos/prompts/main/1111111111.mp4",
  deployed: "videos/prompts/live/2222222222.mp4",
  rollback1: "videos/intro/3333333333.webm",
  rollback2: "videos/extensions/until/4444444444.jpg",
  canonical: "videos/intro/5555555555.mp4",
  orphan: "videos/older/66% 66.mp4",
  boundary: "videos/boundary.mp4",
  recent: "videos/new.mp4",
};
const project = "pages/projects/pi-extensions";
const bucket = "r2/buckets/pi-extensions-media/objects";

function deployment(commit, status = "success", name = "deploy") {
  return { id: commit, environment: "production", latest_stage: { status, name },
    deployment_trigger: { metadata: { commit_hash: commit, commit_dirty: true } } };
}

function manifest(key) {
  return { videos: {
    "/prompts/live/": { mp4: { key }, webm: { key: key + ".webm" }, poster: { key: key + ".jpg" } },
    "/skills/live/": { shared_from: "/prompts/live/" },
  } };
}

function fixture() {
  const read = [];
  const requests = [];
  const state = {
    main,
    canonical: deployment(releases[4]),
    deployments: [
      [deployment(releases[0]), deployment("1".repeat(40), "failure"), deployment(releases[1])],
      [deployment(releases[1]), deployment(releases[2]), deployment(releases[3])],
    ],
    manifests: new Map([[main, paths.main], ...releases.map((sha, i) => [
      sha, [paths.deployed, paths.rollback1, paths.rollback2, paths.orphan, paths.canonical][i],
    ])].map(([sha,key]) => [sha, manifest(key)])),
    objects: Object.entries(paths).map(([name, key], i) => ({
      key, size: i + 100,
      last_modified: name === "boundary" ? "2026-10-18T20:00:00Z" :
        name === "recent" ? "2026-11-16T20:00:00Z" : old,
    })),
  };
  const request = async (resource, { method = "GET", query = {} } = {}) => {
    requests.push({ resource, method, query });
    if (resource === project) return { result: { canonical_deployment: state.canonical } };
    if (resource === project + "/deployments") {
      assert.equal(query.env, "production");
      return { result: state.deployments[query.page - 1], result_info: { total_pages: 2 } };
    }
    if (resource === bucket && query.prefix !== "videos/") return {
      result: state.objects.filter(({ key }) => key === query.prefix),
      result_info: { is_truncated: false },
    };
    if (resource === bucket) return query.cursor ? {
      result: state.objects.slice(4), result_info: { is_truncated: false },
    } : { result: state.objects.slice(0, 4), result_info: { is_truncated: true, cursor: "next" } };
    if (method === "DELETE") return { result: { key: paths.orphan } };
    assert.fail(resource);
  };
  return {
    state, requests, read, request, now,
    readMain: async () => state.main,
    readManifest: async sha => { read.push(sha); return state.manifests.get(sha); },
  };
}

test("dry-run protects main, three successful deployed revisions and the canonical rollback", async () => {
  const f = fixture();
  const result = await pruneVideos(f);
  assert.deepEqual(f.read, [main, releases[0], releases[1], releases[2], releases[4]]);
  assert.deepEqual(result.deployments, releases.slice(0, 3));
  assert.equal(result.canonical, releases[4]);
  assert.equal(result.listed, 8);
  assert.deepEqual(result.candidates, [{ key: paths.orphan, size: 105, last_modified: old }]);
  assert.equal(result.deleted, 0);
  assert.ok(f.requests.every(({ method }) => method === "GET"));
  assert.equal(f.requests.filter(({ resource }) => resource === bucket).length, 2);
});

test("apply deletes only the eligible key and encodes each key segment separately", async () => {
  const f = fixture();
  const result = await pruneVideos({ ...f, apply: true });
  const writes = f.requests.filter(({ method }) => method === "DELETE");
  assert.equal(result.deleted, 1);
  assert.deepEqual(writes.map(({ resource }) => resource), [bucket + "/videos/older/66%25%2066.mp4"]);
});

test("apply stops if main moves after the inventory was taken", async () => {
  const f = fixture();
  let reads = 0;
  const readMain = async () => reads++ === 0 ? main : "9".repeat(40);
  await assert.rejects(pruneVideos({ ...f, apply: true, readMain }), /protection changed/);
  assert.ok(f.requests.every(({ method }) => method === "GET"));
});

test("apply stops if the candidate was replaced", async () => {
  const f = fixture();
  const request = async (resource, options) => {
    const response = await f.request(resource, options);
    if (options?.query?.prefix === paths.orphan) response.result = [
      { key: paths.orphan, size: 105, last_modified: "2026-11-16T20:00:00Z" },
    ];
    return response;
  };
  await assert.rejects(pruneVideos({ ...f, apply: true, request }), /object changed/);
  assert.ok(f.requests.every(({ method }) => method === "GET"));
});

test("apply refuses a malformed retained manifest and does not delete", async () => {
  const f = fixture();
  f.state.manifests.get(releases[2]).videos["/prompts/live/"].poster = {};
  await assert.rejects(pruneVideos({ ...f, apply: true }), /invalid video key/);
  assert.ok(f.requests.every(({ method }) => method === "GET"));
});

test("apply refuses an incomplete production history", async () => {
  const f = fixture();
  f.state.deployments[1] = [];
  await assert.rejects(pruneVideos({ ...f, apply: true }), /fewer than three/);
  assert.ok(f.requests.every(({ method }) => method === "GET"));
});

test("apply waits for an active production deploy to settle", async () => {
  const f = fixture();
  f.state.deployments[0].unshift(deployment("9".repeat(40), "active", "build"));
  await assert.rejects(pruneVideos({ ...f, apply: true }), /deployment is in progress/);
  assert.ok(f.requests.every(({ method }) => method === "GET"));
});

test("apply refuses a repeated R2 cursor", async () => {
  const f = fixture();
  const request = async (resource, options) => {
    const response = await f.request(resource, options);
    if (resource === bucket && options.query.cursor) response.result_info = { is_truncated: true, cursor: "next" };
    return response;
  };
  await assert.rejects(pruneVideos({ ...f, apply: true, request }), /invalid R2 pagination/);
  assert.ok(f.requests.every(({ method }) => method === "GET"));
});

test("R2 may omit pagination metadata on the final list page", async () => {
  const f = fixture();
  const request = async (resource, options) => {
    const response = await f.request(resource, options);
    if (resource === bucket && options.query.cursor) delete response.result_info;
    return response;
  };
  const result = await pruneVideos({ ...f, request });
  assert.equal(result.listed, 8);
  assert.deepEqual(result.candidates.map(({ key }) => key), [paths.orphan]);
});
