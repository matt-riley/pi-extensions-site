// Manual network check. The ordinary build/SEO audit stays offline.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readVideoManifest } from "../../scripts/site/videos.mjs";

export async function verifyMedia(manifest, { fetch = globalThis.fetch, log = () => {} } = {}) {
  const entries = Object.entries(manifest.videos ?? {});
  if (entries.length === 0) throw new Error("video manifest has no videos to verify");
  const origin = new URL(manifest.origin);
  if (origin.protocol !== "https:" || origin.origin !== manifest.origin) {
    throw new Error("media origin must be an HTTPS origin without a path or credentials");
  }
  let assets = 0, rangeChecks = 0;
  for (const [page, entry] of entries) {
    for (const [field, type] of [["webm", "video/webm"], ["mp4", "video/mp4"], ["poster", "image/jpeg"]]) {
      const asset = entry[field];
      if (!asset || !/^videos\/(?:[a-z0-9-]+\/)+[0-9a-f]{10}\.(webm|mp4|jpg)$/.test(asset.key) ||
          !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0) {
        throw new Error(`invalid media asset: ${page} ${field}`);
      }
      const url = `${manifest.origin}/${asset.key}`;
      const check = (condition, message) => { if (!condition) throw new Error(`${url}: ${message}`); };
      const head = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
      check(head.status === 200, `expected HEAD 200, got ${head.status}`);
      const actualType = head.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
      check(actualType === type, `expected content-type ${type}, got ${actualType ?? "missing"}`);
      check(Number(head.headers.get("content-length")) === asset.bytes, `expected content-length ${asset.bytes}, got ${head.headers.get("content-length") ?? "missing"}`);
      check(head.headers.get("cache-control")?.toLowerCase().split(",").some((value) => value.trim() === "immutable"), "cache-control must contain immutable");
      if (field !== "poster") {
        const range = await fetch(url, { method: "GET", headers: { Range: "bytes=0-1023" }, signal: AbortSignal.timeout(15000) });
        const end = Math.min(asset.bytes - 1, 1023);
        const expected = `bytes 0-${end}/${asset.bytes}`;
        if (range.status !== 206 || range.headers.get("content-range") !== expected) {
          await range.body?.cancel();
          check(range.status === 206, `expected Range 206, got ${range.status}`);
          check(false, `expected content-range ${expected}, got ${range.headers.get("content-range") ?? "missing"}`);
        }
        const bytes = await range.arrayBuffer();
        check(bytes.byteLength === end + 1, `expected ${end + 1} range bytes, got ${bytes.byteLength}`);
        rangeChecks += 1;
      }
      assets += 1;
      log(`PASS ${url}`);
    }
  }
  return { videos: entries.length, assets, rangeChecks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL("../../", import.meta.url));
    const result = await verifyMedia(await readVideoManifest(root), { log: console.log });
    console.log(`Passed: ${result.videos} videos, ${result.assets} assets, ${result.rangeChecks} range checks.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
