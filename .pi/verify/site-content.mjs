#!/usr/bin/env node
// Build a content checkout and check the actual published pages, not test fixtures.
// Usage: node .pi/verify/site-content.mjs ../pi-extensions 49
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "../../scripts/build-site.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const source = process.argv[2];
const expectedPages = Number(process.argv[3]);
assert.ok(source && Number.isInteger(expectedPages) && expectedPages > 0,
  "usage: node .pi/verify/site-content.mjs <source-checkout> <expected-content-pages>");

const out = path.join(root, "dist");
const result = await build({ source, out });
assert.equal(result.urls.length, expectedPages, "unexpected content page count");
const files = (await readdir(out, { recursive: true })).filter((file) => file.endsWith(".html"));
assert.equal(files.length, expectedPages + 2, "content pages plus homepage and 404");
const pages = new Map();
for (const file of files) {
  const html = await readFile(path.join(out, file), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `duplicate IDs in ${file}`);
  assert.ok(/<h1[ >]/.test(html), `missing title in ${file}`);
  pages.set(file, { html, ids: new Set(ids) });
}

let links = 0;
let fragments = 0;
for (const [file, { html }] of pages) {
  const pathname = "/" + file.replace(/index\.html$/, "");
  for (const [, href] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    if (!href.startsWith("/") && !href.startsWith("#")) continue;
    const url = new URL(href, "https://site.invalid" + pathname);
    if (url.origin !== "https://site.invalid") continue;
    const target = decodeURIComponent(url.pathname.slice(1)) + (url.pathname.endsWith("/") ? "index.html" : "");
    assert.ok((await stat(path.join(out, target))).isFile(), `${file} -> ${href}`);
    links += 1;
    if (url.hash.length > 1) {
      assert.ok(pages.get(target)?.ids.has(decodeURIComponent(url.hash.slice(1))),
        `missing section: ${file} -> ${href}`);
      fragments += 1;
    }
  }
}
assert.ok(links >= files.length, "did not check links across the site");
assert.ok(fragments > 0, "did not check any section links");
console.log(`Passed: ${files.length} HTML pages, ${links} internal links, ${fragments} section targets.`);
console.log(`Content base: ${result.contentSha}; preview: ${out} (local source checkout).`);
