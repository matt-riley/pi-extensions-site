import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { discover } from "../../scripts/build-site.mjs";
import { readVideoManifest, validateVideoManifest, videoSourcePath } from "../../scripts/site/videos.mjs";

const SITE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ORIGIN = "https://pi-extensions-media.mattriley.tools";
const BUCKET = "pi-extensions-media";
const HASH = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exec = promisify(execFile);
const executeDefault = (binary, args) => exec(binary, args, { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });

export async function publishVideo({
  root = SITE_ROOT, pageUrl, master, shareWith, contentDir = process.env.PI_EXTENSIONS_SOURCE,
  execute = executeDefault, fetch = globalThis.fetch, log = () => {},
} = {}) {
  if (pageUrl !== "/" && !/^\/(?:[a-z0-9-]+\/)+$/.test(pageUrl ?? "")) {
    throw new Error("page URL must be / or a canonical trailing-slash page path");
  }
  const name = pageUrl === "/" ? "intro" : pageUrl.slice(1, -1);
  const videoDir = path.join(root, "video");
  const masterFile = master ? path.resolve(master) : path.join(videoDir, "out", `${name}.mp4`);
  const lock = path.join(videoDir, ".publish.lock");
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("another publish is running; remove video/.publish.lock only if its process has stopped");
    throw error;
  }
  let work;
  try {
    const contentSha = (await readFile(path.join(root, "content.lock"), "utf8")).trim();
    if (!/^[0-9a-f]{40}$/.test(contentSha)) throw new Error("content.lock must hold one 40-character commit SHA");
    const manifest = await readVideoManifest(root);
    if (manifest.origin !== ORIGIN) throw new Error(`publisher origin must be ${ORIGIN}`);
    work = await mkdtemp(path.join(tmpdir(), "pi-video-publish-"));
    const git = async (args) => (await execute("git", args)).stdout.trim();
    if (!contentDir) {
      contentDir = path.join(work, "content");
      await git(["init", "--quiet", contentDir]);
      await git(["-C", contentDir, "remote", "add", "origin", "https://github.com/matt-riley/pi-extensions.git"]);
      await git(["-C", contentDir, "fetch", "--quiet", "--depth", "1", "origin", contentSha]);
      await git(["-C", contentDir, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);
    }
    const actualSha = await git(["-C", contentDir, "rev-parse", "HEAD"]);
    if (actualSha !== contentSha) throw new Error("content checkout must match content.lock");
    if (await git(["-C", contentDir, "status", "--porcelain", "--untracked-files=all"])) {
      throw new Error("content checkout must be clean before recording provenance");
    }
    const model = await discover(contentDir);
    const byUrl = new Map(model.pages.map((page) => [page.url, page]));
    const pages = ["/", ...byUrl.keys()];
    if (!pages.includes(pageUrl)) throw new Error(`unknown video page: ${pageUrl}`);
    await validateVideoManifest(manifest, pages, { root });
    if (manifest.videos[pageUrl]?.shared_from) {
      throw new Error(`publish the canonical video at ${manifest.videos[pageUrl].shared_from}`);
    }
    if (shareWith && (!pageUrl.startsWith("/prompts/") ||
        !model.skills.some((page) => page.url === shareWith) ||
        (manifest.videos[shareWith] && manifest.videos[shareWith].shared_from !== pageUrl))) {
      throw new Error("--share-with must name an unused skill page or a skill already sharing this prompt video");
    }
    const aliases = Object.entries(manifest.videos)
      .filter(([, entry]) => entry.shared_from === pageUrl).map(([url]) => url);
    if (shareWith && !aliases.includes(shareWith)) aliases.push(shareWith);

    const recorded = { content_sha: contentSha };
    if (pageUrl === "/") {
      recorded.package_tree = null;
    } else if (pageUrl.startsWith("/extensions/")) {
      recorded.package_tree = await git(["-C", contentDir, "rev-parse", `${contentSha}:${videoSourcePath(byUrl.get(pageUrl))}`]);
    } else if (pageUrl.startsWith("/prompts/") || pageUrl.startsWith("/skills/")) {
      recorded.sources = {};
      for (const url of [pageUrl, ...aliases]) {
        const source = videoSourcePath(byUrl.get(url));
        recorded.sources[source] = await git(["-C", contentDir, "rev-parse", `${contentSha}:${source}`]);
      }
    } else {
      throw new Error("guide publishing awaits its source-provenance decision");
    }
    const prefix = `videos/${name}/`;
    const probe = await execute("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "json", masterFile]);
    const seconds = Number(JSON.parse(probe.stdout).format?.duration);
    const entry = { captions: `video/captions/${name}.en.vtt`, seconds, recorded };
    const assets = [];
    const encodes = [
      ["webm", "webm", "video/webm", ["-c:v", "libvpx-vp9", "-crf", "38", "-b:v", "0", "-row-mt", "1", "-deadline", "good", "-cpu-used", "2", "-c:a", "libopus", "-b:a", "96k"]],
      ["mp4", "mp4", "video/mp4", ["-c:v", "libx264", "-preset", "slow", "-crf", "26", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"]],
      ["poster", "jpg", "image/jpeg", ["-frames:v", "1", "-q:v", "3"]],
    ];
    const posterSecond = pageUrl === "/" ? "13.2" : "1";
    const masterHash = HASH(await readFile(masterFile));
    const recipeHash = HASH(JSON.stringify({ encodes, posterSecond })).slice(0, 16);
    const cache = path.join(videoDir, "out/.publish", masterHash, recipeHash);
    for (const [field, ext, type, options] of encodes) {
      const file = path.join(cache, `encoded.${ext}`);
      let bytes;
      try {
        const cached = await readFile(file);
        const digest = await readFile(`${file}.sha256`, "utf8");
        if (HASH(cached) === digest) bytes = cached;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (!bytes) {
        log(`Encoding ${field}...`);
        const temporary = path.join(work, `encoded.${ext}`);
        const seek = field === "poster" ? ["-ss", posterSecond] : [];
        await execute("ffmpeg", ["-v", "error", "-nostdin", "-y", ...seek, "-i", masterFile, ...options, temporary]);
        bytes = await readFile(temporary);
        await mkdir(cache, { recursive: true });
        await writeFile(file, bytes);
        await writeFile(`${file}.sha256`, HASH(bytes));
      } else {
        log(`Using cached ${field} encode`);
      }
      const key = `${prefix}${HASH(bytes).slice(0, 10)}.${ext}`;
      entry[field] = { key, bytes: bytes.length };
      assets.push({ file, key, type, bytes: bytes.length });
    }
    const stagedRoot = path.join(work, "site");
    // Validate the candidate with staged captions before touching tracked files or R2.
    for (const existing of Object.values(manifest.videos)) {
      if (existing.shared_from) continue;
      const file = path.join(stagedRoot, existing.captions);
      await mkdir(path.dirname(file), { recursive: true });
      await copyFile(path.join(root, existing.captions), file);
    }
    const stagedCaptions = path.join(stagedRoot, entry.captions);
    await mkdir(path.dirname(stagedCaptions), { recursive: true });
    if (pageUrl === "/") {
      await execute(process.execPath, [path.join(videoDir, "scripts/captions.ts"), stagedCaptions]);
    } else {
      await copyFile(masterFile.replace(/\.[^.]+$/, ".en.vtt"), stagedCaptions);
    }
    const captions = await readFile(stagedCaptions);
    if (!captions.toString("utf8").startsWith("WEBVTT\n")) throw new Error("generated captions must start with WEBVTT");
    const candidate = { ...manifest, videos: { ...manifest.videos, [pageUrl]: entry } };
    for (const url of aliases) candidate.videos[url] = { shared_from: pageUrl };
    await validateVideoManifest(candidate, pages, { root: stagedRoot });
    const uploaded = [], skipped = [];
    for (const asset of assets) {
      const url = `${ORIGIN}/${asset.key}`;
      const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
      if (response.status === 200) {
        if (Number(response.headers.get("content-length")) !== asset.bytes) {
          throw new Error(`existing immutable object has a different size: ${asset.key}`);
        }
        skipped.push(asset.key);
        log(`Already uploaded: ${asset.key}`);
      } else if (response.status === 404) {
        log(`Uploading ${asset.key}...`);
        await execute(process.execPath, [path.join(videoDir, "node_modules/wrangler/bin/wrangler.js"),
          "r2", "object", "put", `${BUCKET}/${asset.key}`, "--file", asset.file,
          "--content-type", asset.type, "--cache-control", "public, max-age=31536000, immutable", "--remote"]);
        uploaded.push(asset.key);
      } else {
        throw new Error(`HEAD ${url} returned ${response.status}; refusing to overwrite`);
      }
    }
    const finalCaptions = path.join(root, entry.captions);
    await mkdir(path.dirname(finalCaptions), { recursive: true });
    await writeFile(finalCaptions, captions);
    const manifestFile = path.join(videoDir, "manifest.json");
    const temporary = `${manifestFile}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(candidate, null, 2) + "\n");
      await rename(temporary, manifestFile);
    } finally {
      await rm(temporary, { force: true });
    }
    const urls = assets.map(({ key }) => `${ORIGIN}/${key}`);
    for (const url of urls) log(url);
    return { entry, uploaded, skipped, urls };
  } finally {
    try {
      if (work) await rm(work, { recursive: true, force: true });
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    const shareIndex = args.indexOf("--share-with");
    const shareWith = shareIndex === -1 ? undefined : args.splice(shareIndex, 2)[1];
    if (args.length < 1 || args.length > 2 || (shareIndex !== -1 && !shareWith) ||
        args.some((arg) => arg.startsWith("--"))) {
      throw new Error("Usage: npm run publish -- <page-url> [master.mp4] [--share-with <skill-url>]");
    }
    const result = await publishVideo({
      pageUrl: args[0], master: args[1], shareWith, log: console.log,
      execute: (binary, argv) => exec(binary, argv, {
        encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 30 * 60 * 1000,
        signal: controller.signal,
      }),
      fetch: (url, options) => globalThis.fetch(url, {
        ...options, signal: AbortSignal.any([options.signal, controller.signal]),
      }),
    });
    console.log(`Published: ${result.uploaded.length} uploaded, ${result.skipped.length} already present`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
