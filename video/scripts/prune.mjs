import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ORIGINS = new Set([
  "git@github.com:matt-riley/pi-extensions-site.git",
  "ssh://git@github.com/matt-riley/pi-extensions-site.git",
  "https://github.com/matt-riley/pi-extensions-site.git",
]);
const PROJECT = "pages/projects/pi-extensions";
const OBJECTS = "r2/buckets/pi-extensions-media/objects";
const PREFIX = "videos/";
const SHA = /^[a-f0-9]{40}$/;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const exec = promisify(execFile);

function isVideoKey(key) {
  return typeof key === "string" && key.startsWith(PREFIX) &&
    key.split("/").every(segment => segment && segment !== "." && segment !== "..");
}

function retainManifest(keys, manifest, revision) {
  const videos = manifest?.videos;
  if (!videos || typeof videos !== "object" || Array.isArray(videos)) {
    throw new Error("invalid video manifest at " + revision);
  }
  for (const [route, entry] of Object.entries(videos)) {
    if (typeof entry?.shared_from === "string") {
      const owner = videos[entry.shared_from];
      if (Object.keys(entry).length !== 1 || !Object.hasOwn(videos, entry.shared_from) ||
          !owner || Object.hasOwn(owner, "shared_from")) {
        throw new Error("invalid shared video at " + revision + " " + route);
      }
      continue; // The canonical entry contributes its keys below.
    }
    for (const field of ["webm", "mp4", "poster"]) {
      const key = entry?.[field]?.key;
      if (!isVideoKey(key)) throw new Error("invalid video key at " + revision + " " + route + " " + field);
      keys.add(key);
    }
  }
}

function deployedRevision(deployment) {
  const revision = deployment?.deployment_trigger?.metadata?.commit_hash;
  if (deployment?.environment !== "production" || !SHA.test(revision) ||
      deployment.latest_stage?.name !== "deploy" || deployment.latest_stage?.status !== "success") {
    throw new Error("production deployment lacks a verified source revision");
  }
  return revision;
}

async function productionHistory(request, apply) {
  const deployments = new Set();
  for (let page = 1; deployments.size < 3; page++) {
    const { result, result_info: info } = await request(PROJECT + "/deployments", {
      query: { env: "production", page, per_page: 25 },
    });
    if (!Array.isArray(result)) throw new Error("invalid Pages deployment history");
    for (const deployment of result) {
      if (deployment?.environment === "preview" || deployment?.is_skipped) continue;
      const stage = deployment?.latest_stage;
      if (["failure", "canceled", "skipped"].includes(stage?.status)) continue;
      if (!stage || typeof stage.status !== "string") throw new Error("invalid Pages deployment status");
      if (stage.name === "deploy" && stage.status === "success") {
        if (deployments.size < 3) deployments.add(deployedRevision(deployment));
      } else if (apply) {
        throw new Error("production deployment is in progress");
      }
    }
    if (!result.length || page >= (info?.total_pages ?? page)) break;
  }
  if (deployments.size < 3) throw new Error("fewer than three successful production revisions found");
  return [...deployments];
}

async function protectionSnapshot(request, readMain, apply) {
  const [main, deployments, project] = await Promise.all([
    readMain(), productionHistory(request, apply), request(PROJECT),
  ]);
  if (!SHA.test(main)) throw new Error("could not resolve the upstream main revision");
  return { main, deployments, canonical: deployedRevision(project.result?.canonical_deployment) };
}

async function listObjects(request, prefix) {
  const objects = new Map();
  const cursors = new Set();
  let cursor;
  do {
    const query = { prefix, per_page: 100, ...(cursor && { cursor }) };
    const { result, result_info: info } = await request(OBJECTS, { query });
    if (!Array.isArray(result)) throw new Error("invalid R2 object listing");
    for (const item of result) {
      const { key, size, last_modified } = item ?? {};
      if (!isVideoKey(key) || !key.startsWith(prefix) || !Number.isSafeInteger(size) || size < 0 ||
          typeof last_modified !== "string" || !Number.isFinite(Date.parse(last_modified)) || objects.has(key)) {
        throw new Error("invalid or duplicate object in R2 listing");
      }
      objects.set(key, { key, size, last_modified });
    }
    if (info === undefined) break; // R2 omits metadata on the final page.
    if (typeof info?.is_truncated !== "boolean") throw new Error("invalid R2 pagination");
    cursor = info.is_truncated ? info.cursor : undefined;
    if (info.is_truncated && (typeof cursor !== "string" || !cursor || cursors.has(cursor))) {
      throw new Error("invalid R2 pagination");
    }
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return [...objects.values()];
}

export async function pruneVideos({ request, readMain, readManifest, apply = false, now = Date.now(),
  log = () => {} }) {
  const protection = await protectionSnapshot(request, readMain, apply);
  const revisions = new Set([protection.main, ...protection.deployments, protection.canonical]);
  const keys = new Set();
  for (const revision of revisions) retainManifest(keys, await readManifest(revision), revision);
  const objects = await listObjects(request, PREFIX);
  const unreferenced = objects.filter(({ key }) => !keys.has(key));
  const candidates = unreferenced.filter(({ last_modified }) => Date.parse(last_modified) < now - RETENTION_MS)
    .sort((a, b) => a.key.localeCompare(b.key));
  log("Main: " + protection.main);
  log("Production revisions: " + protection.deployments.join(", "));
  log("Canonical production revision: " + protection.canonical);
  log("Only objects last modified before " + new Date(now - RETENTION_MS).toISOString() + " are eligible.");
  for (const { key, size, last_modified } of candidates) {
    log(size + " bytes\t" + last_modified + "\t" + JSON.stringify(key));
  }

  let deleted = 0;
  if (apply) {
    for (const candidate of candidates) {
      const current = (await listObjects(request, candidate.key)).find(({ key }) => key === candidate.key);
      if (!current || current.size !== candidate.size || current.last_modified !== candidate.last_modified) {
        throw new Error("object changed during apply: " + JSON.stringify(candidate.key));
      }
      const snapshot = await protectionSnapshot(request, readMain, apply);
      if (JSON.stringify(snapshot) !== JSON.stringify(protection)) throw new Error("protection changed during apply; rerun the dry run");
      const resource = OBJECTS + "/" + candidate.key.split("/").map(encodeURIComponent).join("/");
      const { result } = await request(resource, { method: "DELETE" });
      if (result?.key !== candidate.key) throw new Error("could not confirm deletion of " + JSON.stringify(candidate.key));
      deleted++;
      log("Deleted " + JSON.stringify(candidate.key));
    }
  }
  return { ...protection, listed: objects.length, protectedKeys: keys.size,
    referenced: objects.length - unreferenced.length, unreferenced: unreferenced.length,
    candidates, deleted };
}

async function cloudflareRequest() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!/^[a-f0-9]{32}$/.test(account)) throw new Error("set CLOUDFLARE_ACCOUNT_ID to the site’s Cloudflare account");
  let token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) {
    try {
      const wrangler = path.join(ROOT, "video/node_modules/wrangler/bin/wrangler.js");
      const { stdout } = await exec(process.execPath, [wrangler, "auth", "token", "--json"], { timeout: 30000 });
      token = JSON.parse(stdout).token;
      if (typeof token !== "string" || !token) throw new Error("missing Bearer token");
    } catch {
      throw new Error("Cloudflare authentication unavailable; run wrangler login or set CLOUDFLARE_API_TOKEN");
    }
  }
  return async (resource, { method = "GET", query = {} } = {}) => {
    const url = new URL("https://api.cloudflare.com/client/v4/accounts/" + account + "/" + resource);
    url.search = new URLSearchParams(query).toString();
    const response = await fetch(url, {
      method, headers: { Authorization: "Bearer " + token }, redirect: "error", signal: AbortSignal.timeout(20000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || body?.success !== true) {
      throw new Error("Cloudflare " + method + " " + resource + " failed (HTTP " + response.status + ")");
    }
    return body;
  };
}

async function run() {
  const flags = process.argv.slice(2);
  if (flags.length && (flags.length !== 1 || flags[0] !== "--apply")) {
    throw new Error("Usage: npm run prune -- [--apply]");
  }
  const apply = flags[0] === "--apply";
  const git = async (...args) => (await exec("git", ["-C", ROOT, ...args], { timeout: 30000 })).stdout.trim();
  if (!ORIGINS.has(await git("remote", "get-url", "origin"))) {
    throw new Error("origin must point to matt-riley/pi-extensions-site");
  }
  const request = await cloudflareRequest();
  const readMain = async () => (await git("ls-remote", "--exit-code", "origin", "refs/heads/main")).split(/\s+/)[0];
  const readManifest = async revision => {
    try {
      await git("cat-file", "-e", revision + "^{commit}");
    } catch {
      await git("fetch", "--quiet", "--no-tags", "origin", revision);
    }
    try {
      return JSON.parse(await git("show", revision + ":video/manifest.json"));
    } catch {
      throw new Error("cannot read video manifest at " + revision);
    }
  };
  const report = await pruneVideos({ request, readMain, readManifest, apply, log: console.log });
  const bytes = report.candidates.reduce((sum, item) => sum + item.size, 0);
  console.log((apply ? "Apply" : "Dry run") + " scanned " + report.listed + " objects; " + report.referenced +
    " referenced in " + report.protectedKeys + " protected keys, " + report.unreferenced + " unreferenced.");
  console.log(report.candidates.length + " eligible (" + bytes + " bytes), " + report.deleted + " deleted.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
