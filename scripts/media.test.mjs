import assert from "node:assert/strict";
import { test } from "vitest";
import { verifyMedia } from "../.pi/verify/media.mjs";

const origin = "https://pi-extensions-media.mattriley.tools";
const manifest = () => ({ origin, videos: { "/": {
  webm: { key: "videos/intro/0123456789.webm", bytes: 2048 },
  mp4: { key: "videos/intro/abcdef0123.mp4", bytes: 4096 },
  poster: { key: "videos/intro/9876543210.jpg", bytes: 64 },
} } });

function fixtureFetch(m, override) {
  const calls = [];
  const files = new Map(Object.entries(m.videos["/"]).map(([field, asset]) => [
    `${origin}/${asset.key}`, { ...asset, type: { webm: "video/webm", mp4: "video/mp4", poster: "image/jpeg" }[field] },
  ]));
  const fetch = async (url, options) => {
    calls.push({ url, ...options });
    const asset = files.get(url);
    assert.ok(asset, `unexpected media URL: ${url}`);
    const alternative = override?.(asset, options);
    if (alternative) return alternative;
    if (options.method === "HEAD") {
      return new Response(null, { status: 200, headers: {
        "content-length": String(asset.bytes), "content-type": asset.type,
        "cache-control": "public, max-age=31536000, immutable",
      } });
    }
    assert.equal(options.headers.Range, "bytes=0-1023");
    return new Response(Buffer.alloc(1024), { status: 206, headers: {
      "content-range": `bytes 0-1023/${asset.bytes}`, "content-length": "1024",
    } });
  };
  return { calls, fetch };
}

test("checks every remote asset's headers and verifies seeking for both video formats", async () => {
  const m = manifest();
  const f = fixtureFetch(m);
  assert.deepEqual(await verifyMedia(m, { fetch: f.fetch }), { videos: 1, assets: 3, rangeChecks: 2 });
  assert.equal(f.calls.length, 5);
  assert.equal(f.calls.filter(({ method }) => method === "HEAD").length, 3);
  assert.equal(f.calls.filter(({ method }) => method === "GET").length, 2);
});

const first = `${origin}/videos/intro/0123456789.webm`;
for (const [name, override, message] of [
  ["a missing object", (_, o) => o.method === "HEAD" && new Response(null, { status: 404 }), `${first}: expected HEAD 200, got 404`],
  ["a wrong MIME type", (a, o) => o.method === "HEAD" && new Response(null, { headers: { "content-type": "application/octet-stream", "content-length": String(a.bytes), "cache-control": "immutable" } }), `${first}: expected content-type video/webm, got application/octet-stream`],
  ["a wrong size", (_, o) => o.method === "HEAD" && new Response(null, { headers: { "content-type": "video/webm", "content-length": "2047", "cache-control": "immutable" } }), `${first}: expected content-length 2048, got 2047`],
  ["mutable caching", (a, o) => o.method === "HEAD" && new Response(null, { headers: { "content-type": a.type, "content-length": String(a.bytes), "cache-control": "public, max-age=60" } }), `${first}: cache-control must contain immutable`],
  ["an ignored range", (_, o) => o.method === "GET" && new Response(Buffer.alloc(1024), { status: 200 }), `${first}: expected Range 206, got 200`],
  ["an incorrect content-range", (_, o) => o.method === "GET" && new Response(Buffer.alloc(1024), { status: 206, headers: { "content-range": "bytes 0-1023/9999" } }), `${first}: expected content-range bytes 0-1023/2048, got bytes 0-1023/9999`],
  ["a truncated range body", (_, o) => o.method === "GET" && new Response(Buffer.alloc(512), { status: 206, headers: { "content-range": "bytes 0-1023/2048" } }), `${first}: expected 1024 range bytes, got 512`],
]) {
  test(`rejects ${name}`, async () => {
    const m = manifest();
    const f = fixtureFetch(m, override);
    await assert.rejects(verifyMedia(m, { fetch: f.fetch }), { message });
    assert.ok(f.calls.length > 0);
  });
}

test("handles video files shorter than the requested range", async () => {
  const m = manifest();
  m.videos["/"].webm.bytes = 512;
  const f = fixtureFetch(m, (asset, options) => options.method === "GET" && asset.bytes === 512 &&
    new Response(Buffer.alloc(512), { status: 206, headers: { "content-range": "bytes 0-511/512" } }));
  assert.deepEqual(await verifyMedia(m, { fetch: f.fetch }), { videos: 1, assets: 3, rangeChecks: 2 });
});

test("empty manifests cannot report a successful media check", async () => {
  await assert.rejects(verifyMedia({ origin, videos: {} }, { fetch: () => { throw new Error("unexpected fetch"); } }), {
    message: "video manifest has no videos to verify",
  });
});

test("propagates network failures", async () => {
  await assert.rejects(verifyMedia(manifest(), { fetch: async () => { throw new Error("network unavailable"); } }), {
    message: "network unavailable",
  });
});
