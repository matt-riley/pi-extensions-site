import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readVideoManifest, validateVideoManifest } from "./site/videos.mjs";

const origin = "https://pi-extensions-media.mattriley.tools";
const page = "/extensions/guardrail/";
const pages = new Set(["/", page]);
const validManifest = () => ({
  origin,
  videos: {
    [page]: {
      webm: { key: "videos/extensions/guardrail/0123456789.webm", bytes: 100 },
      mp4: { key: "videos/extensions/guardrail/abcdef0123.mp4", bytes: 120 },
      poster: { key: "videos/extensions/guardrail/9876543210.jpg", bytes: 30 },
      captions: "video/captions/extensions/guardrail.en.vtt",
      seconds: 41.2,
      recorded: { content_sha: "a".repeat(40), package_tree: "b".repeat(40) },
    },
  },
});

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-video-manifest-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "video/captions/extensions"), { recursive: true });
  await writeFile(path.join(root, "video/captions/extensions/guardrail.en.vtt"), "WEBVTT\n\n");
  return root;
}

test("reads and validates the empty rollout manifest", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "video/manifest.json"), JSON.stringify({ origin, videos: {} }));
  const manifest = await readVideoManifest(root);
  await validateVideoManifest(manifest, pages, { root });
  assert.deepEqual(manifest, { origin, videos: {} });
});

test("validates an extension video and an intro with no package tree", async (t) => {
  const root = await fixture(t);
  const manifest = validManifest();
  await validateVideoManifest(manifest, pages, { root });
  const entry = manifest.videos[page];
  for (const field of ["webm", "mp4", "poster"]) {
    entry[field].key = entry[field].key.replace("extensions/guardrail", "intro");
  }
  entry.recorded.package_tree = null;
  manifest.videos = { "/": entry };
  await validateVideoManifest(manifest, pages, { root });
});

const cases = [
  ["insecure origin", (m) => { m.origin = "http://media.example.com"; }, "origin must be an HTTPS origin without credentials, path, query or fragment"],
  ["origin path", (m) => { m.origin += "/videos"; }, "origin must be an HTTPS origin without credentials, path, query or fragment"],
  ["missing videos", (m) => { delete m.videos; }, "videos must be an object"],
  ["unknown page", (m) => { m.videos["/missing/"] = m.videos[page]; }, "unknown video page: /missing/"],
  ["missing format", (m) => { delete m.videos[page].webm; }, `${page}: webm must contain a key and positive integer bytes`],
  ["invalid size", (m) => { m.videos[page].mp4.bytes = 0; }, `${page}: mp4 must contain a key and positive integer bytes`],
  ["unhashed key", (m) => { m.videos[page].mp4.key = "videos/extensions/guardrail/current.mp4"; }, `${page}: mp4 key must be videos/extensions/guardrail/<sha256-10>.mp4`],
  ["wrong page prefix", (m) => { m.videos[page].poster.key = "videos/extensions/other/9876543210.jpg"; }, `${page}: poster key must be videos/extensions/guardrail/<sha256-10>.jpg`],
  ["traversal key", (m) => { m.videos[page].webm.key = "videos/../extensions/guardrail/0123456789.webm"; }, `${page}: webm key must be videos/extensions/guardrail/<sha256-10>.webm`],
  ["missing captions", (m) => { m.videos[page].captions = "video/captions/missing.vtt"; }, `${page}: captions file does not exist: video/captions/missing.vtt`],
  ["captions traversal", (m) => { m.videos[page].captions = "video/captions/../outside.vtt"; }, `${page}: captions must be a .vtt file under video/captions/`],
  ["invalid duration", (m) => { m.videos[page].seconds = -1; }, `${page}: seconds must be a positive finite number`],
  ["missing provenance", (m) => { delete m.videos[page].recorded; }, `${page}: recorded.content_sha must be a 40-character git SHA`],
  ["invalid package tree", (m) => { m.videos[page].recorded.package_tree = null; }, `${page}: recorded.package_tree must be a 40-character git tree SHA`],
];

for (const [name, mutate, message] of cases) {
  test(`rejects ${name}`, async (t) => {
    const root = await fixture(t);
    const manifest = validManifest();
    mutate(manifest);
    await assert.rejects(validateVideoManifest(manifest, pages, { root }), { message });
  });
}

test("reports an unreadable manifest with its path", async (t) => {
  const root = await fixture(t);
  await assert.rejects(readVideoManifest(root), /video\/manifest\.json/);
});

test("rejects a caption symlink that points outside the captions directory", async (t) => {
  const root = await fixture(t);
  await writeFile(path.join(root, "outside.vtt"), "WEBVTT\n\n");
  await symlink(path.join(root, "outside.vtt"), path.join(root, "video/captions/escape.vtt"));
  const manifest = validManifest();
  manifest.videos[page].captions = "video/captions/escape.vtt";
  await assert.rejects(validateVideoManifest(manifest, pages, { root }), {
    message: `${page}: captions must be a .vtt file under video/captions/`,
  });
});
