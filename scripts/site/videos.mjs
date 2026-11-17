import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SITE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SHA = /^[0-9a-f]{40}$/;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const fail = (message) => { throw new Error(message); };

export function captionAsset(entry) {
  return entry.captions.replace(/^video\/captions\//, "video/");
}

export function videoEntry(manifest, url) {
  const entry = manifest.videos[url];
  return entry?.shared_from ? manifest.videos[entry.shared_from] : entry;
}

export function videoSourcePath(page) {
  return page.url.startsWith("/prompts/") ? page.source : path.posix.dirname(page.source);
}

export async function readVideoManifest(root = SITE_ROOT) {
  const file = path.join(root, "video/manifest.json");
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read video manifest ${file}: ${error.message}`, { cause: error });
  }
}

export async function validateVideoManifest(manifest, pageUrls, { root = SITE_ROOT } = {}) {
  let url;
  try { url = new URL(manifest?.origin); } catch { /* Report the same origin contract below. */ }
  if (!url || url.protocol !== "https:" || url.origin !== manifest.origin) {
    fail("origin must be an HTTPS origin without credentials, path, query or fragment");
  }
  if (!object(manifest.videos)) fail("videos must be an object");
  const pages = new Set(pageUrls);
  for (const [page, entry] of Object.entries(manifest.videos)) {
    if (!pages.has(page)) fail(`unknown video page: ${page}`);
    if (!object(entry)) fail(`${page}: video entry must be an object`);
    if (Object.hasOwn(entry, "shared_from")) {
      const owner = manifest.videos[entry.shared_from];
      if (!page.startsWith("/skills/") || typeof entry.shared_from !== "string" ||
          !entry.shared_from.startsWith("/prompts/") || !Object.hasOwn(manifest.videos, entry.shared_from) ||
          !object(owner) || Object.hasOwn(owner, "shared_from") || Object.keys(entry).length !== 1) {
        fail(`${page}: shared_from must reference a canonical prompt video`);
      }
      continue;
    }
    const prefix = page === "/" ? "videos/intro/" : `videos${page}`;
    for (const [field, ext] of [["webm", "webm"], ["mp4", "mp4"], ["poster", "jpg"]]) {
      const asset = entry[field];
      if (!object(asset) || typeof asset.key !== "string" || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) {
        fail(`${page}: ${field} must contain a key and positive integer bytes`);
      }
      const suffix = asset.key.slice(prefix.length);
      if (!asset.key.startsWith(prefix) || !new RegExp(`^[0-9a-f]{10}\\.${ext}$`).test(suffix)) {
        fail(`${page}: ${field} key must be ${prefix}<sha256-10>.${ext}`);
      }
    }
    if (typeof entry.captions !== "string" ||
        !/^video\/captions\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.vtt$/.test(entry.captions)) {
      fail(`${page}: captions must be a .vtt file under video/captions/`);
    }
    const captionPath = path.join(root, entry.captions);
    let captionReal, captionRoot;
    try {
      captionReal = await realpath(captionPath);
      captionRoot = await realpath(path.join(root, "video/captions"));
      if (!(await stat(captionReal)).isFile()) throw new Error("Not a file");
    } catch {
      fail(`${page}: captions file does not exist: ${entry.captions}`);
    }
    if (!captionReal.startsWith(`${captionRoot}${path.sep}`)) {
      fail(`${page}: captions must be a .vtt file under video/captions/`);
    }
    if (typeof entry.seconds !== "number" || !Number.isFinite(entry.seconds) || entry.seconds <= 0) {
      fail(`${page}: seconds must be a positive finite number`);
    }
    if (!object(entry.recorded) || typeof entry.recorded.content_sha !== "string" || !SHA.test(entry.recorded.content_sha)) {
      fail(`${page}: recorded.content_sha must be a 40-character git SHA`);
    }
    if (page.startsWith("/prompts/") || page.startsWith("/skills/")) {
      const sources = entry.recorded.sources;
      if (!object(sources) || Object.keys(sources).length === 0 ||
          Object.entries(sources).some(([file, sha]) => (
            !/^(?:prompts\/[a-z0-9-]+\.md|\.agents\/skills\/[a-z0-9-]+)$/.test(file) ||
            typeof sha !== "string" || !SHA.test(sha)
          ))) {
        fail(`${page}: recorded.sources must map prompt files and skill directories to git object IDs`);
      }
      continue;
    }
    const tree = entry.recorded.package_tree;
    if (!(typeof tree === "string" && SHA.test(tree)) && !(page === "/" && tree === null)) {
      fail(`${page}: recorded.package_tree must be a 40-character git tree SHA`);
    }
  }
  return manifest;
}
