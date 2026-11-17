import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { publishVideo } from "../video/scripts/publish.mjs";

const run = promisify(execFile);
const origin = "https://pi-extensions-media.mattriley.tools";
const media = { webm: "fixture WebM", mp4: "fixture MP4", jpg: "fixture JPEG" };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 10);
const vtt = "WEBVTT\n\n00:00.000 --> 00:02.000\nGuardrail blocks the command.\n";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-publish-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const contentDir = path.join(root, "content");
  for (const dir of ["docs", "prompts", ".agents/skills", "packages/guardrail"]) {
    await mkdir(path.join(contentDir, dir), { recursive: true });
  }
  await writeFile(path.join(contentDir, "package.json"), JSON.stringify({ description: "Example" }));
  await writeFile(path.join(contentDir, "README.md"), "# Example\n\nA fixture.\n");
  await writeFile(path.join(contentDir, "packages/guardrail/README.md"), "# Guardrail\n\nBlocks commands.\n");
  await writeFile(path.join(contentDir, "packages/guardrail/package.json"), JSON.stringify({ name: "guardrail", description: "Blocks commands" }));
  await run("git", ["init", "--quiet", contentDir]);
  await run("git", ["-C", contentDir, "add", "."]);
  await run("git", ["-C", contentDir, "-c", "commit.gpgsign=false", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"]);
  const sha = (await run("git", ["-C", contentDir, "rev-parse", "HEAD"])).stdout.trim();
  const tree = (await run("git", ["-C", contentDir, "rev-parse", "HEAD:packages/guardrail"])).stdout.trim();
  await mkdir(path.join(root, "video/out/extensions"), { recursive: true });
  await writeFile(path.join(root, "content.lock"), `${sha}\n`);
  await writeFile(path.join(root, "video/manifest.json"), JSON.stringify({ origin, videos: {} }) + "\n");
  await writeFile(path.join(root, "video/out/extensions/guardrail.mp4"), "rendered master");
  await writeFile(path.join(root, "video/out/extensions/guardrail.en.vtt"), vtt);
  const remote = new Map();
  const uploads = [];
  const commands = [];
  const execute = async (binary, args, options) => {
    commands.push({ binary, args });
    if (binary === "ffmpeg") {
      await writeFile(args.at(-1), media[path.extname(args.at(-1)).slice(1)]);
      return { stdout: "", stderr: "" };
    }
    if (binary === "ffprobe") return { stdout: JSON.stringify({ format: { duration: "41.2" } }) };
    if (args.includes("put")) {
      const key = args[args.indexOf("put") + 1].replace("pi-extensions-media/", "");
      assert.equal(remote.has(key), false, "existing immutable keys must never be overwritten");
      const body = await readFile(args[args.indexOf("--file") + 1]);
      uploads.push({ key, args, body });
      remote.set(key, body);
      return { stdout: "Upload complete" };
    }
    return run(binary, args, options);
  };
  const fetch = async (url, options) => {
    assert.equal(options.method, "HEAD");
    const bytes = remote.get(new URL(url).pathname.slice(1));
    return new Response(null, { status: bytes ? 200 : 404, headers: bytes ? { "content-length": String(bytes.length) } : {} });
  };
  return { root, contentDir, sha, tree, execute, fetch, remote, uploads, commands };
}

test("publishes hashed page assets, captions and recording provenance", async (t) => {
  const f = await fixture(t);
  const result = await publishVideo({ ...f, pageUrl: "/extensions/guardrail/" });
  const manifest = JSON.parse(await readFile(path.join(f.root, "video/manifest.json"), "utf8"));
  const entry = manifest.videos["/extensions/guardrail/"];
  assert.equal(f.uploads.length, 3);
  for (const [field, ext, type] of [["webm", "webm", "video/webm"], ["mp4", "mp4", "video/mp4"], ["poster", "jpg", "image/jpeg"]]) {
    assert.deepEqual(entry[field], { key: `videos/extensions/guardrail/${hash(media[ext])}.${ext}`, bytes: Buffer.byteLength(media[ext]) });
    const upload = f.uploads.find((u) => u.key === entry[field].key);
    assert.deepEqual(upload.body, Buffer.from(media[ext]));
    assert.equal(upload.args[upload.args.indexOf("--content-type") + 1], type);
    assert.equal(upload.args[upload.args.indexOf("--cache-control") + 1], "public, max-age=31536000, immutable");
    assert.ok(upload.args.includes("--remote"));
  }
  assert.deepEqual(entry.recorded, { content_sha: f.sha, package_tree: f.tree });
  assert.equal(entry.seconds, 41.2);
  assert.equal(entry.captions, "video/captions/extensions/guardrail.en.vtt");
  assert.equal(await readFile(path.join(f.root, entry.captions), "utf8"), vtt);
  assert.equal(result.uploaded.length, 3);
  assert.deepEqual(result.urls, [entry.webm, entry.mp4, entry.poster].map(({ key }) => `${origin}/${key}`));
});

test("a second publish skips existing immutable objects and reuses unchanged encodes", async (t) => {
  const f = await fixture(t);
  await publishVideo({ ...f, pageUrl: "/extensions/guardrail/" });
  const before = await readFile(path.join(f.root, "video/manifest.json"), "utf8");
  const encodeCount = f.commands.filter(({ binary }) => binary === "ffmpeg").length;
  const result = await publishVideo({ ...f, pageUrl: "/extensions/guardrail/" });
  assert.equal(f.uploads.length, 3, "second run must not upload anything");
  assert.deepEqual(result.uploaded, []);
  assert.equal(result.skipped.length, 3);
  assert.equal(await readFile(path.join(f.root, "video/manifest.json"), "utf8"), before);
  assert.equal(f.commands.filter(({ binary }) => binary === "ffmpeg").length, encodeCount);
});

test("rejects concurrent publishing so manifest updates cannot clobber each other", async (t) => {
  const f = await fixture(t);
  let release, entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const atHead = new Promise((resolve) => { entered = resolve; });
  const first = publishVideo({ ...f, pageUrl: "/extensions/guardrail/", fetch: async (...args) => {
    entered();
    await gate;
    return f.fetch(...args);
  } });
  try {
    await atHead;
    await assert.rejects(publishVideo({ ...f, pageUrl: "/extensions/guardrail/" }), {
      message: "another publish is running; remove video/.publish.lock only if its process has stopped",
    });
  } finally {
    release();
    await first;
  }
});

test("publisher CLI rejects missing arguments instead of silently succeeding", async () => {
  await assert.rejects(run(process.execPath, [new URL("../video/scripts/publish.mjs", import.meta.url).pathname]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Usage: npm run publish -- <page-url> \[master\.mp4\]/);
    return true;
  });
});

test("intro captions can be generated into a staging path without changing homepage assets", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "pi-intro-captions-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const destination = path.join(dir, "captions/intro.en.vtt");
  const homepage = new URL("../video/web/intro.en.vtt", import.meta.url);
  const before = await readFile(homepage);
  await run(process.execPath, [new URL("../video/scripts/captions.ts", import.meta.url).pathname, destination]);
  const text = await readFile(destination, "utf8");
  assert.match(text, /^WEBVTT\n/);
  assert.match(text, / --> /);
  assert.deepEqual(await readFile(homepage), before);
});

test("a partial upload failure preserves the published manifest and captions and releases the lock", async (t) => {
  const f = await fixture(t);
  await publishVideo({ ...f, pageUrl: "/extensions/guardrail/" });
  const manifestFile = path.join(f.root, "video/manifest.json");
  const captionFile = path.join(f.root, "video/captions/extensions/guardrail.en.vtt");
  const before = await readFile(manifestFile);
  await writeFile(path.join(f.root, "video/out/extensions/guardrail.mp4"), "changed master");
  await writeFile(path.join(f.root, "video/out/extensions/guardrail.en.vtt"), vtt.replace("blocks", "rejects"));
  let uploads = 0;
  const execute = async (binary, args, options) => {
    if (binary === "ffmpeg") {
      await writeFile(args.at(-1), `changed ${path.extname(args.at(-1))}`);
      return { stdout: "" };
    }
    if (args.includes("put") && ++uploads === 2) throw new Error("upload interrupted");
    return f.execute(binary, args, options);
  };
  await assert.rejects(publishVideo({ ...f, execute, pageUrl: "/extensions/guardrail/" }), { message: "upload interrupted" });
  assert.deepEqual(await readFile(manifestFile), before);
  assert.equal(await readFile(captionFile, "utf8"), vtt);
  assert.equal(f.uploads.length, 4, "only the first new object may remain after the failed attempt");
  await publishVideo({ ...f, pageUrl: "/extensions/guardrail/" });
});

for (const [name, fetch, message] of [
  ["a failed HEAD", async () => new Response(null, { status: 503 }), /returned 503; refusing to overwrite/],
  ["a network error", async () => { throw new Error("network unavailable"); }, /network unavailable/],
  ["an existing key with different bytes", async () => new Response(null, { status: 200, headers: { "content-length": "999" } }), /existing immutable object has a different size/],
]) {
  test(`rejects ${name} without uploading or changing the manifest`, async (t) => {
    const f = await fixture(t);
    const before = await readFile(path.join(f.root, "video/manifest.json"));
    await assert.rejects(publishVideo({ ...f, fetch, pageUrl: "/extensions/guardrail/" }), message);
    assert.deepEqual(await readFile(path.join(f.root, "video/manifest.json")), before);
    assert.equal(f.uploads.length, 0);
    await publishVideo({ ...f, pageUrl: "/extensions/guardrail/" });
  });
}

test("invalid captions and unknown pages fail before any upload", async (t) => {
  const f = await fixture(t);
  await assert.rejects(publishVideo({ ...f, pageUrl: "/extensions/missing/" }), { message: "unknown video page: /extensions/missing/" });
  await assert.rejects(publishVideo({ ...f, pageUrl: "/../outside/" }), /canonical trailing-slash page path/);
  await writeFile(path.join(f.root, "video/out/extensions/guardrail.en.vtt"), "not VTT");
  await assert.rejects(publishVideo({ ...f, pageUrl: "/extensions/guardrail/" }), { message: "generated captions must start with WEBVTT" });
  assert.equal(f.uploads.length, 0);
  assert.deepEqual(JSON.parse(await readFile(path.join(f.root, "video/manifest.json"))).videos, {});
});

test("a corrupt cached encode is regenerated", async (t) => {
  const f = await fixture(t);
  await publishVideo({ ...f, pageUrl: "/extensions/guardrail/" });
  const webm = f.uploads.find(({ key }) => key.endsWith(".webm"));
  const cached = webm.args[webm.args.indexOf("--file") + 1];
  await writeFile(cached, "corrupt");
  const before = f.commands.filter(({ binary }) => binary === "ffmpeg").length;
  const result = await publishVideo({ ...f, pageUrl: "/extensions/guardrail/" });
  assert.equal(f.commands.filter(({ binary }) => binary === "ffmpeg").length, before + 1);
  assert.deepEqual(result.uploaded, []);
  assert.equal(await readFile(cached, "utf8"), media.webm);
});

test("preserves other pages already in the manifest", async (t) => {
  const f = await fixture(t);
  const intro = {
    webm: { key: "videos/intro/0123456789.webm", bytes: 10 },
    mp4: { key: "videos/intro/abcdef0123.mp4", bytes: 11 },
    poster: { key: "videos/intro/9876543210.jpg", bytes: 12 },
    captions: "video/captions/intro.en.vtt", seconds: 3,
    recorded: { content_sha: f.sha, package_tree: null },
  };
  await mkdir(path.join(f.root, "video/captions"), { recursive: true });
  await writeFile(path.join(f.root, intro.captions), vtt);
  await writeFile(path.join(f.root, "video/manifest.json"), JSON.stringify({ origin, videos: { "/": intro } }));
  await publishVideo({ ...f, pageUrl: "/extensions/guardrail/" });
  const manifest = JSON.parse(await readFile(path.join(f.root, "video/manifest.json")));
  assert.equal(Object.keys(manifest.videos).length, 2);
  assert.deepEqual(manifest.videos["/"], intro);
  assert.equal(await readFile(path.join(f.root, intro.captions), "utf8"), vtt);
});

test("refuses a dirty content checkout rather than recording misleading provenance", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.contentDir, "packages/guardrail/README.md"), "# Changed behavior\n");
  await assert.rejects(publishVideo({ ...f, pageUrl: "/extensions/guardrail/" }), {
    message: "content checkout must be clean before recording provenance",
  });
  assert.equal(f.uploads.length, 0);
  assert.equal(f.commands.filter(({ binary }) => binary === "ffmpeg").length, 0);
});

test("publishes the intro under its own namespace with no package tree", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, "video/out/intro.mp4"), "intro master");
  const execute = async (binary, args, options) => {
    if (args[0]?.endsWith("scripts/captions.ts")) {
      await writeFile(args[1], vtt);
      return { stdout: "captions generated" };
    }
    return f.execute(binary, args, options);
  };
  const result = await publishVideo({ ...f, execute, pageUrl: "/" });
  assert.equal(f.uploads.length, 3);
  assert.equal(result.entry.recorded.package_tree, null);
  assert.equal(result.entry.captions, "video/captions/intro.en.vtt");
  for (const { key } of f.uploads) assert.match(key, /^videos\/intro\/[0-9a-f]{10}\.(webm|mp4|jpg)$/);
  assert.equal(await readFile(path.join(f.root, result.entry.captions), "utf8"), vtt);
});

test("refuses a content checkout at a different commit before encoding", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, "content.lock"), "a".repeat(40));
  await assert.rejects(publishVideo({ ...f, pageUrl: "/extensions/guardrail/" }), { message: "content checkout must match content.lock" });
  assert.equal(f.uploads.length, 0);
  assert.equal(f.commands.filter(({ binary }) => binary === "ffmpeg").length, 0);
});
