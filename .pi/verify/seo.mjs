#!/usr/bin/env node
// Independently audit built files. No generator/model imports and no rebuild.
// Usage: node .pi/verify/seo.mjs [dist-directory]
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { lexer, walkTokens } from "marked";

const out = path.resolve(process.argv[2] || "dist");
const origin = "https://pi-extensions.mattriley.tools";
const read = (file) => readFile(path.join(out, file), "utf8");
const decode = (text) => text.replace(/&(amp|quot|lt|gt|apos);/g,
  (_, name) => ({ amp: "&", quot: '"', lt: "<", gt: ">", apos: "'" })[name]);
const files = await readdir(out, { recursive: true });
const htmlFiles = files.filter((file) => file.endsWith(".html"));
assert.ok(htmlFiles.length > 2, "no content pages to audit");
const pages = new Map();
const canonicalUrls = [];
const markdownCanonicals = new Map();
const titles = [];
const nonGettingStartedTitles = [];
let gettingStartedTitle = null;
const one = (html, pattern, file) => {
  const matches = [...html.matchAll(pattern)];
  assert.equal(matches.length, 1, `${file}: expected one ${pattern}`);
  return matches[0][1];
};

for (const file of htmlFiles) {
  const html = await read(file);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => decode(m[1]));
  assert.equal(ids.length, new Set(ids).size, `${file}: duplicate IDs`);
  pages.set(file, { html, ids: new Set(ids) });
  if (file === "404.html") {
    assert.match(html, /<meta name="robots" content="noindex" \/>/);
    assert.doesNotMatch(html, /rel="canonical"|property="og:|name="twitter:/);
    continue;
  }
  const expected = origin + "/" + file.replace(/index\.html$/, "");
  const canonical = decode(one(html, /<link rel="canonical" href="([^"]+)" \/>/g, file));
  assert.equal(canonical, expected, `${file}: wrong canonical`);
  canonicalUrls.push(canonical);
  assert.doesNotMatch(html, /noindex/);
  const title = decode(one(html, /<title>(.*?)<\/title>/g, file));
  assert.ok(title.trim(), `${file}: empty title`);
  const pathname = new URL(canonical).pathname;
  titles.push(title);
  if (pathname === "/getting-started/") {
    gettingStartedTitle = title;
  } else {
    nonGettingStartedTitles.push(title);
  }
  const description = decode(one(html, /<meta name="description" content="([^"]*)" \/>/g, file));
  assert.ok(description.trim(), `${file}: empty description`);
  assert.ok(description.length <= 360, `${file}: description exceeds 360 chars (${description.length})`);
  for (const [key, value] of [
    ["og:url", canonical], ["og:title", title], ["og:description", description],
    ["og:type", "website"], ["og:site_name", "pi-extensions"],
    ["twitter:card", "summary"], ["twitter:title", title], ["twitter:description", description],
  ]) {
    const attribute = key.startsWith("og:") ? "property" : "name";
    assert.equal(decode(one(html, new RegExp(`<meta ${attribute}="${key}" content="([^"]+)" />`, "g"), file)), value);
  }
  if (file !== "index.html") {
    markdownCanonicals.set(pathname + "index.md", canonical);
  }
}

assert.equal(
  new Set(nonGettingStartedTitles).size,
  nonGettingStartedTitles.length,
  "duplicate <title> across non-/getting-started/ pages",
);
if (gettingStartedTitle !== null && gettingStartedTitle !== "pi-extensions") {
  assert.equal(new Set(titles).size, titles.length, "duplicate <title> across indexable pages");
}

const sitemap = await read("sitemap.xml");
assert.match(sitemap, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]));
assert.equal(locations.length, canonicalUrls.length, "sitemap page count");
assert.equal(new Set(locations).size, locations.length, "duplicate sitemap entries");
assert.deepEqual([...locations].sort(), [...canonicalUrls].sort(), "sitemap must cover exactly the canonical HTML pages");
assert.doesNotMatch(sitemap, /lastmod|priority|changefreq|404|index\.md/);
assert.equal(await read("robots.txt"), `User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`);
const headers = new Map((await read("_headers")).trim().split("\n\n").map((block) => {
  const match = /^(\/\S+)\n  Link: <([^>]+)>; rel="canonical"$/.exec(block);
  assert.ok(match, `invalid Cloudflare header block: ${block}`);
  return [match[1], match[2]];
}));
assert.equal(headers.size, markdownCanonicals.size, "Markdown canonical header count");
assert.deepEqual(headers, markdownCanonicals, "Markdown headers must point to their HTML counterparts");

let links = 0;
let fragments = 0;
async function checkUrl(href, from) {
  const url = new URL(href, origin + "/" + from.replace(/index\.html$/, ""));
  if (url.origin !== origin) return;
  const file = decodeURIComponent(url.pathname.slice(1)) + (url.pathname.endsWith("/") ? "index.html" : "");
  assert.ok((await stat(path.join(out, file))).isFile(), `${from} -> ${href}`);
  links += 1;
  if (url.hash.length > 1) {
    const htmlFile = file.endsWith("/index.md") ? file.replace(/index\.md$/, "index.html") : file;
    assert.ok(pages.get(htmlFile)?.ids.has(decodeURIComponent(url.hash.slice(1))),
      `missing section: ${from} -> ${href}`);
    fragments += 1;
  }
}
for (const [file, { html }] of pages) {
  for (const [, href] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) await checkUrl(decode(href), file);
}
const markdownFiles = files.filter((file) => file.endsWith(".md"));
assert.equal(markdownFiles.length, markdownCanonicals.size, "Markdown copy count");
for (const file of [...markdownFiles, "llms.txt"]) {
  const urls = [];
  walkTokens(lexer(await read(file)), (token) => {
    if (token.type === "link" || token.type === "image") urls.push(token.href);
  });
  for (const href of urls) await checkUrl(href, file);
}
const llms = await read("llms.txt");
const listed = [...llms.matchAll(/\]\((https:\/\/[^)]+)\)/g)].map((m) => m[1]);
assert.equal(listed.length, markdownCanonicals.size, "llms.txt copy count");
assert.deepEqual(listed.sort(), [...markdownCanonicals.keys()].map((url) => origin + url).sort());
for (const url of locations) await checkUrl(url, "sitemap.xml");
for (const [copy, canonical] of headers) {
  await checkUrl(copy, "_headers");
  await checkUrl(canonical, "_headers");
}
assert.ok(links > htmlFiles.length && fragments > 0, "no meaningful link/anchor coverage");
console.log(`Passed: ${canonicalUrls.length} canonical HTML pages, ${locations.length} sitemap entries, ${headers.size} Markdown canonical headers.`);
console.log(`Passed: robots, social metadata, 404 noindex, llms coverage; ${links} internal URLs, ${fragments} section targets resolve.`);
