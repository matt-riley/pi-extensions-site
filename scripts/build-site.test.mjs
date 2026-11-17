import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "vitest";
import { build, discover, rewriteHref } from "./build-site.mjs";
import { renderLanding, renderPage } from "./site/template.mjs";

const ALPHA = `# fixture-alpha

Alpha extension. See [beta](../beta/README.md), [playbooks](./playbooks) and
[the site](https://example.com/docs).

| Option | Meaning |
| --- | --- |
| one | First |
`;

async function write(root, file, body) {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body);
}

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "pi-extensions-site-"));
  t.onTestFinished(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "content");
  await write(source, "package.json", JSON.stringify({ name: "fixture", description: "Fixture collection." }));
  await write(source, "README.md", "# Fixture collection\n\nStart with [alpha](./packages/alpha/README.md).\n");
  await write(source, "packages/alpha/package.json", JSON.stringify({ name: "fixture-alpha", description: "Alpha does things." }));
  await write(source, "packages/alpha/README.md", ALPHA);
  await write(source, "packages/alpha/playbooks/step.md", "1. step\n");
  await write(source, "packages/beta/package.json", JSON.stringify({ name: "fixture-beta", description: "Beta does other things." }));
  await write(source, "packages/beta/README.md", "# fixture-beta\n\nBeta extension.\n");
  await write(source, "docs/guide.md", "# Guide page\n\nBack to [alpha](../packages/alpha/README.md).\n");
  await write(source, "prompts/thing.md", "---\ndescription: Do the thing\nargument-hint: \"[x]\"\n---\nRun it.\n");
  await write(source, ".agents/skills/z-skill/SKILL.md", "---\nname: z-skill\ndescription: The z skill\n---\n\n# Z skill\n\nBody.\n");
  return { root, source, out: path.join(root, "dist") };
}

async function htmlFiles(dir) {
  const entries = await readdir(dir, { recursive: true });
  return entries.filter((entry) => entry.endsWith(".html")).map((entry) => path.join(dir, entry));
}

test("every packages/ directory becomes a page and a landing card", async (t) => {
  const { source, out } = await fixture(t);
  await build({ source, out });
  const landing = await readFile(path.join(out, "index.html"), "utf8");
  assert.match(landing, /<title>pi-extensions<\/title>/);
  const alphaTitle = await readFile(path.join(out, "extensions/alpha/index.html"), "utf8");
  assert.match(alphaTitle, /<title>fixture-alpha — pi-extensions<\/title>/);
  for (const name of ["alpha", "beta"]) {
    assert.ok(existsSync(path.join(out, "extensions", name, "index.html")), `${name} page exists`);
    assert.match(landing, new RegExp(`href="/extensions/${name}/"`));
  }

  await write(source, "packages/gamma/package.json", JSON.stringify({ name: "fixture-gamma", description: "Gamma is new." }));
  await write(source, "packages/gamma/README.md", "# fixture-gamma\n\nGamma extension.\n");
  await build({ source, out });

  const rebuilt = await readFile(path.join(out, "index.html"), "utf8");
  assert.equal(rebuilt.match(/class="card"/g)?.length, 3);
  assert.match(rebuilt, /href="\/extensions\/gamma\/"/);
  assert.ok(existsSync(path.join(out, "extensions/gamma/index.html")));

  assert.ok(existsSync(path.join(out, "getting-started/index.html")));
  assert.ok(existsSync(path.join(out, "skills/z-skill/index.html")));
  assert.ok(existsSync(path.join(out, "prompts/thing/index.html")));
});

test("the landing page embeds the intro video and the build ships every file it names", async (t) => {
  const { source, out } = await fixture(t);
  await build({ source, out });
  const landing = await readFile(path.join(out, "index.html"), "utf8");
  const video = landing.match(/<video\b[^>]*>[\s\S]*?<\/video>/)?.[0];
  assert.ok(video, "the landing has a <video>");
  assert.match(video, /\bcontrols\b/);
  assert.match(video, /preload="none"/, "nothing downloads until the viewer presses play");
  assert.match(video, /<source src="\/assets\/video\/intro\.webm\?v=[0-9a-f]{10}" type="video\/webm" \/>/);
  assert.match(video, /<source src="\/assets\/video\/intro\.mp4\?v=[0-9a-f]{10}" type="video\/mp4" \/>/);
  assert.match(video, /<track kind="captions" src="\/assets\/video\/intro\.en\.vtt\?v=[0-9a-f]{10}" srclang="en"/);
  assert.ok(
    landing.indexOf('id="intro"') < landing.indexOf('id="extensions"'),
    "the video comes before the extension cards",
  );
  // The SEO audit resolves src and href, but not poster, so check every named file here.
  const named = [...video.matchAll(/\b(?:src|poster)="\/(assets\/video\/[^"?]+)\?v=/g)].map((m) => m[1]);
  assert.equal(named.length, 4);
  for (const file of named) assert.ok(existsSync(path.join(out, file)), `${file} is built`);
  const captions = await readFile(path.join(out, "assets/video/intro.en.vtt"), "utf8");
  assert.match(captions, /^WEBVTT\n/);
});

test("pages link assets by content hash, so a deploy never pairs new HTML with a cached stylesheet", async (t) => {
  // Assets are cached for hours under a fixed name. Unversioned, the intro video shipped as new
  // HTML against a browser's cached style.css and rendered at its full 1920px width.
  const { source, out } = await fixture(t);
  await build({ source, out });
  const version = async (file) =>
    createHash("sha256").update(await readFile(path.join(out, "assets", file))).digest("hex").slice(0, 10);
  const css = await version("style.css");
  for (const page of await htmlFiles(out)) {
    const html = await readFile(page, "utf8");
    assert.match(html, new RegExp(`<link rel="stylesheet" href="/assets/style\\.css\\?v=${css}" />`), page);
  }
  const landing = await readFile(path.join(out, "index.html"), "utf8");
  for (const file of ["intro.webm", "intro.mp4", "intro-poster.jpg", "intro.en.vtt"]) {
    const v = await version(`video/${file}`);
    assert.ok(landing.includes(`/assets/video/${file}?v=${v}`), `${file} is linked by its hash`);
  }
});

test("HTML pages share absolute canonical and social metadata, but errors are noindex", async (t) => {
  const { source, out } = await fixture(t);
  await write(source, "packages/alpha/package.json", JSON.stringify({
    name: "fixture-alpha", description: 'Use "alpha" & <beta> safely.',
  }));
  const result = await build({ source, out });
  const origin = "https://pi-extensions.mattriley.tools";
  for (const url of ["/", ...result.urls]) {
    const html = await readFile(path.join(out, url.slice(1), "index.html"), "utf8");
    const canonical = origin + url;
    assert.deepEqual([...html.matchAll(/<link rel="canonical" href="([^"]+)" \/>/g)].map((m) => m[1]), [canonical]);
    const title = /<title>(.*?)<\/title>/.exec(html)[1];
    const description = /<meta name="description" content="([^"]+)" \/>/.exec(html)[1];
    assert.ok(description.length > 0);
    assert.ok(html.includes(`<meta property="og:url" content="${canonical}" />`));
    assert.ok(html.includes(`<meta property="og:title" content="${title}" />`));
    assert.ok(html.includes(`<meta property="og:description" content="${description}" />`));
    assert.match(html, /<meta property="og:type" content="website" \/>/);
    assert.match(html, /<meta property="og:site_name" content="pi-extensions" \/>/);
    assert.match(html, /<meta name="twitter:card" content="summary" \/>/);
    assert.ok(html.includes(`<meta name="twitter:title" content="${title}" />`));
    assert.ok(html.includes(`<meta name="twitter:description" content="${description}" />`));
    assert.doesNotMatch(html, /noindex/);
  }
  const alpha = await readFile(path.join(out, "extensions/alpha/index.html"), "utf8");
  assert.match(alpha, /content="Use &quot;alpha&quot; &amp; &lt;beta&gt; safely\."/);
  const notFound = await readFile(path.join(out, "404.html"), "utf8");
  assert.match(notFound, /<meta name="robots" content="noindex" \/>/);
  assert.doesNotMatch(notFound, /rel="canonical"|property="og:|name="twitter:/);
});

test("crawl artifacts cover only canonical HTML pages and consolidate Markdown copies", async (t) => {
  const { source, out } = await fixture(t);
  await write(source, "docs/a&b.md", "# A and B\n\nA guide with an ampersand in its URL.\n");
  await build({ source, out });
  const expected = [
    "/", "/getting-started/", "/extensions/alpha/", "/extensions/beta/",
    "/prompts/thing/", "/skills/z-skill/", "/guides/a&b/", "/guides/guide/",
  ].map((url) => "https://pi-extensions.mattriley.tools" + url);
  const sitemap = await readFile(path.join(out, "sitemap.xml"), "utf8");
  assert.match(sitemap, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.deepEqual([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]), expected.map((url) => url.replaceAll("&", "&amp;")));
  assert.doesNotMatch(sitemap, /404|index\.md|lastmod|priority|changefreq/);
  assert.equal(await readFile(path.join(out, "robots.txt"), "utf8"),
    "User-agent: *\nAllow: /\n\nSitemap: https://pi-extensions.mattriley.tools/sitemap.xml\n");
  const headers = await readFile(path.join(out, "_headers"), "utf8");
  const blocks = headers.trim().split("\n\n");
  assert.equal(blocks.length, 7);
  for (const url of expected.slice(1)) {
    const pathname = new URL(url).pathname;
    assert.ok(blocks.includes(`${pathname}index.md\n  Link: <${url}>; rel="canonical"`), url);
  }
  assert.doesNotMatch(headers, /Disallow|noindex/);
  await build({ source, out });
  assert.equal(await readFile(path.join(out, "sitemap.xml"), "utf8"), sitemap, "rebuild is deterministic");
  assert.equal(await readFile(path.join(out, "_headers"), "utf8"), headers);
  await rm(path.join(source, "packages/beta"), { recursive: true });
  await build({ source, out });
  assert.doesNotMatch(await readFile(path.join(out, "sitemap.xml"), "utf8"), /extensions\/beta/);
  assert.doesNotMatch(await readFile(path.join(out, "_headers"), "utf8"), /extensions\/beta/);
  assert.ok(!existsSync(path.join(out, "extensions/beta/index.html")));
});

test("guide descriptions use the first prose paragraph, not headings or operational frontmatter", async (t) => {
  const { source, out } = await fixture(t);
  await write(source, "docs/guide.md", [
    "---", "description: Not the public introduction", "---",
    "# Guide page", "", "## Overview", "",
    "```js", '"not a summary"', "```", "",
    "> A quotation, not the introduction.", "",
    'Learn **safe** [setup](../README.md) with `/plan` &amp; &#x50;i.  ',
    'Keep <em>control</em> of "changes".', "",
    "A later paragraph should not enter the description.", "",
  ].join("\n"));
  await write(source, "docs/empty.md", "# Empty guide\n\n## No prose yet\n");
  await build({ source, out });
  const guide = await readFile(path.join(out, "guides/guide/index.html"), "utf8");
  assert.match(guide, /<meta name="description" content="Learn safe setup with \/plan &amp; Pi\. Keep control of &quot;changes&quot;\." \/>/);
  assert.doesNotMatch(guide, /<meta[^>]+content="[^"]*(?:Not the public|not a summary|A quotation|A later)/);
  const empty = await readFile(path.join(out, "guides/empty/index.html"), "utf8");
  assert.match(empty, /<meta name="description" content="Empty guide" \/>/);
  const llms = await readFile(path.join(out, "llms.txt"), "utf8");
  assert.match(llms, /: Learn safe setup with \/plan & Pi\. Keep control of "changes"\./);
  const alpha = await readFile(path.join(out, "extensions/alpha/index.html"), "utf8");
  assert.match(alpha, /name="description" content="Alpha does things\."/);
  const prompt = await readFile(path.join(out, "prompts/thing/index.html"), "utf8");
  assert.match(prompt, /name="description" content="Do the thing"/);
  const skill = await readFile(path.join(out, "skills/z-skill/index.html"), "utf8");
  assert.match(skill, /name="description" content="The z skill"/);
});

test("relative links become site pages or content repository URLs", async (t) => {
  const { source, out } = await fixture(t);
  const result = await build({ source, out });
  assert.equal(result.urls.length, 6);

  const alpha = await readFile(path.join(out, "extensions/alpha/index.html"), "utf8");
  assert.match(alpha, /href="\/extensions\/beta\/"/);
  assert.match(alpha, /href="https:\/\/example\.com\/docs"/);
  assert.match(alpha, /https:\/\/github\.com\/matt-riley\/pi-extensions\/tree\/[^"]+\/packages\/alpha\/playbooks/);
  assert.doesNotMatch(alpha, /href="\.{1,2}\//);

  const guide = await readFile(path.join(out, "guides/guide/index.html"), "utf8");
  assert.match(guide, /href="\/extensions\/alpha\/"/);

  const gettingStarted = await readFile(path.join(out, "getting-started/index.html"), "utf8");
  assert.match(gettingStarted, /href="\/extensions\/alpha\/"/);
});

test("every internal link points at a generated file", async (t) => {
  const { source, out } = await fixture(t);
  await build({ source, out });
  let checked = 0;
  for (const file of await htmlFiles(out)) {
    const html = await readFile(file, "utf8");
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (!href.startsWith("/")) continue;
      checked += 1;
      // A static server ignores the query (assets carry a `?v=` content hash) and the fragment.
      const [clean] = href.split(/[?#]/);
      const relative = clean === "/" ? "index.html" : path.join(clean.slice(1), clean.endsWith("/") ? "index.html" : "");
      assert.ok(existsSync(path.join(out, relative)), `${path.relative(out, file)} links to missing ${href}`);
    }
  }
  assert.ok(checked > 20, `checked ${checked} internal links`);
});

test("frontmatter is stripped, tables render and prompts get a heading", async (t) => {
  const { source, out } = await fixture(t);
  await build({ source, out });
  const alpha = await readFile(path.join(out, "extensions/alpha/index.html"), "utf8");
  assert.match(alpha, /<table>/);

  const prompt = await readFile(path.join(out, "prompts/thing/index.html"), "utf8");
  assert.match(prompt, /<h1>Do the thing<\/h1>/);
  assert.doesNotMatch(prompt, /argument-hint|description:/);

  const skill = await readFile(path.join(out, "skills/z-skill/index.html"), "utf8");
  assert.doesNotMatch(skill, /description: The z skill/);
  assert.match(skill, /href="\/skills\/z-skill\/" aria-current="page"/);
});

test("section links have unique heading targets, including formatted headings", async (t) => {
  const { source, out } = await fixture(t);
  await write(source, "packages/alpha/README.md", ALPHA + `
## Install

[Jump to install](#install).

## Find \`retry\` in [Café](../../README.md)

## Install

## Install-1
`);
  await build({ source, out });
  const alpha = await readFile(path.join(out, "extensions/alpha/index.html"), "utf8");
  assert.match(alpha, /href="#install"/);
  assert.match(alpha, /<h2 id="install">Install<\/h2>/);
  assert.match(alpha, /<h2 id="find-retry-in-café">/);
  assert.match(alpha, /<h2 id="install-1">Install<\/h2>/);
  assert.match(alpha, /<h2 id="install-1-1">Install-1<\/h2>/);
  const ids = [...alpha.matchAll(/<h[1-6] id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, ids.length);
});

test("homepage shows the full install steps before reload", async (t) => {
  const { source, out } = await fixture(t);
  await build({ source, out });
  const landing = await readFile(path.join(out, "index.html"), "utf8");
  assert.match(landing, /git clone https:\/\/github.com\/matt-riley\/pi-extensions/);
  assert.match(landing, /cd ~\/\.pi\/agent\/extensions\/pi-extensions &amp;&amp; npm install/);
  assert.match(landing, /<code>\/reload<\/code>/);
});

test("a package directory without a README fails the build", async (t) => {
  const { source, out } = await fixture(t);
  await write(source, "packages/delta/package.json", JSON.stringify({ name: "fixture-delta", description: "Delta." }));
  await assert.rejects(build({ source, out }), /packages\/delta\/README\.md/);
});

test("an unpinned content.lock fails before any clone", async (t) => {
  const { root } = await fixture(t);
  await write(root, "content.lock", "not-a-sha\n");
  await assert.rejects(build({ root, out: path.join(root, "dist") }), /content\.lock/);
});

test("every page has a Markdown copy listed in llms.txt", async (t) => {
  const { source, out } = await fixture(t);
  const result = await build({ source, out });
  const llms = await readFile(path.join(out, "llms.txt"), "utf8");
  assert.match(llms, /^# pi-extensions\n\n> Fixture collection\.\n/);
  assert.match(llms, /^## Extensions$/m);
  for (const url of result.urls) {
    const copy = path.join(out, url.slice(1), "index.md");
    assert.ok(existsSync(copy), `${url} has a Markdown copy`);
    assert.match(await readFile(copy, "utf8"), /^# /, `${url} copy starts with a title`);
    assert.ok(llms.includes(`(https://pi-extensions.mattriley.tools${url}index.md)`), `llms.txt lists ${url}`);
  }
  assert.match(llms, /- \[fixture-alpha\]\(https:\/\/pi-extensions\.mattriley\.tools\/extensions\/alpha\/index\.md\): Alpha does things\./);
});

test("Markdown copies drop frontmatter and point links at other copies", async (t) => {
  const { source, out } = await fixture(t);
  await build({ source, out });
  const alpha = await readFile(path.join(out, "extensions/alpha/index.md"), "utf8");
  assert.match(alpha, /\[beta\]\(\/extensions\/beta\/index\.md\)/);
  assert.match(alpha, /\(https:\/\/github\.com\/matt-riley\/pi-extensions\/tree\/[^)]+\/packages\/alpha\/playbooks\)/);
  assert.match(alpha, /\(https:\/\/example\.com\/docs\)/);
  const prompt = await readFile(path.join(out, "prompts/thing/index.md"), "utf8");
  assert.equal(prompt, "# Do the thing\n\nRun it.\n");
  const skill = await readFile(path.join(out, "skills/z-skill/index.md"), "utf8");
  assert.doesNotMatch(skill, /description:/);
});

test("page titles remain unique when README.md uses # pi-extensions and llms.txt labels Getting started", async (t) => {
  const { source, out } = await fixture(t);
  await write(source, "README.md", "# pi-extensions\n\nStart with [alpha](./packages/alpha/README.md).\n");
  const result = await build({ source, out });
  const titles = [];
  for (const url of ["/", ...result.urls]) {
    const html = await readFile(path.join(out, url.slice(1), "index.html"), "utf8");
    titles.push(/<title>(.*?)<\/title>/.exec(html)[1]);
  }
  assert.equal(new Set(titles).size, titles.length, "all HTML page titles are unique");
  const gettingStarted = await readFile(path.join(out, "getting-started/index.html"), "utf8");
  assert.match(gettingStarted, /<title>Getting started — pi-extensions<\/title>/);
  const llms = await readFile(path.join(out, "llms.txt"), "utf8");
  assert.match(
    llms,
    /- \[Getting started\]\(https:\/\/pi-extensions\.mattriley\.tools\/getting-started\/index\.md\): Install and run the pi-extensions collection/,
  );
});

test("landing page, 404, sidebar accessibility, and alternate markdown metadata are complete", async (t) => {
  const { source, out } = await fixture(t);
  await write(source, ".agents/skills/no-desc/SKILL.md", "---\nname: no-desc\n---\n\n# Fallback Skill Title\n\nBody.\n");
  const result = await build({ source, out });

  const landing = await readFile(path.join(out, "index.html"), "utf8");
  for (const id of ["extensions", "prompts", "skills", "guides"]) {
    assert.match(landing, new RegExp(`<section class="index" id="${id}">`));
    assert.match(landing, new RegExp(`href="#${id}"`));
  }
  assert.match(landing, /href="\/prompts\/thing\/"/);
  assert.match(landing, /href="\/skills\/z-skill\/"/);
  assert.doesNotMatch(landing, /rel="alternate" type="text\/markdown"/);

  const notFound = await readFile(path.join(out, "404.html"), "utf8");
  for (const href of ["/", "/getting-started/", "/#extensions", "/#prompts", "/#skills", "/#guides"]) {
    assert.ok(notFound.includes(`href="${href}"`), `404 links to ${href}`);
  }
  assert.doesNotMatch(notFound, /rel="alternate" type="text\/markdown"/);

  for (const file of await htmlFiles(out)) {
    const html = await readFile(file, "utf8");
    assert.match(html, /<body>\s*<a class="skip-link" href="#main-content">Skip to content<\/a>/);
    assert.match(html, /<main class="content" id="main-content">/);
    assert.match(html, /<a href="\/llms\.txt">llms\.txt<\/a>/);
  }

  for (const url of result.urls) {
    const html = await readFile(path.join(out, url.slice(1), "index.html"), "utf8");
    assert.ok(
      html.includes(`<link rel="alternate" type="text/markdown" href="https://pi-extensions.mattriley.tools${url}index.md" />`),
      `${url} advertises its markdown alternate`,
    );
    assert.match(html, /<input class="nav-toggle" type="checkbox" id="nav-toggle" \/>/);
    assert.match(html, /<label class="nav-toggle-label" for="nav-toggle">Browse the docs<\/label>/);
    assert.match(html, /<section class="nav-group nav-group-prose">/);
  }

  const noDescSkill = await readFile(path.join(out, "skills/no-desc/index.html"), "utf8");
  assert.match(noDescSkill, /<meta name="description" content="Fallback Skill Title" \/>/);
  const llms = await readFile(path.join(out, "llms.txt"), "utf8");
  assert.match(llms, /- \[no-desc\]\(https:\/\/pi-extensions\.mattriley\.tools\/skills\/no-desc\/index\.md\): Fallback Skill Title/);
});

test("relative images rewrite to raw.githubusercontent.com, directory links to pages, and unsafe schemes are blocked", async (t) => {
  const { source, out } = await fixture(t);
  await write(
    source,
    "packages/alpha/README.md",
    ALPHA + [
      "",
      "![Architecture](./assets/diagram.png)",
      "See [beta dir](../beta) and [beta slash](../beta/) and [skill dir](../../.agents/skills/z-skill).",
      "Unsafe: [js](javascript:alert(1)), [vb](vbscript:msgbox(1)), [data](data:text/html,<script>).",
    ].join("\n"),
  );
  await build({ source, out });

  const alphaHtml = await readFile(path.join(out, "extensions/alpha/index.html"), "utf8");
  assert.match(
    alphaHtml,
    /<img src="https:\/\/raw\.githubusercontent\.com\/matt-riley\/pi-extensions\/local\/packages\/alpha\/assets\/diagram\.png" alt="Architecture">/,
  );
  assert.match(alphaHtml, /<a href="\/extensions\/beta\/">beta dir<\/a>/);
  assert.match(alphaHtml, /<a href="\/extensions\/beta\/">beta slash<\/a>/);
  assert.match(alphaHtml, /<a href="\/skills\/z-skill\/">skill dir<\/a>/);
  assert.match(alphaHtml, /<a href="#">js<\/a>, <a href="#">vb<\/a>, <a href="#">data<\/a>/);
  assert.doesNotMatch(alphaHtml, /<a [^>]*href="(?:javascript|vbscript|data):/i);

  const alphaMd = await readFile(path.join(out, "extensions/alpha/index.md"), "utf8");
  assert.match(alphaMd, /\[beta dir\]\(\/extensions\/beta\/index\.md\)/);
  assert.match(alphaMd, /\[skill dir\]\(\/skills\/z-skill\/index\.md\)/);

  const model = await discover(source);
  const ctx = { pageBySource: model.pageBySource, contentDir: source, contentSha: "abc1234" };
  assert.equal(
    rewriteHref("./assets/diagram.png", "packages/alpha/README.md", { ...ctx, image: true }),
    "https://raw.githubusercontent.com/matt-riley/pi-extensions/abc1234/packages/alpha/assets/diagram.png",
  );
  assert.equal(
    rewriteHref("./assets/diagram.png", "packages/alpha/README.md", ctx),
    "https://github.com/matt-riley/pi-extensions/blob/abc1234/packages/alpha/assets/diagram.png",
  );
  assert.equal(rewriteHref("../beta#options", "packages/alpha/README.md", ctx), "/extensions/beta/#options");
  assert.equal(rewriteHref("JavaScript:alert(1)", "packages/alpha/README.md", ctx), "#");
  assert.equal(rewriteHref("vbscript:foo", "packages/alpha/README.md", ctx), "#");
  assert.equal(rewriteHref("data:image/svg+xml,<svg/>", "packages/alpha/README.md", ctx), "#");
});

test("heading slugs preserve code-span placeholders, strip inline HTML, and avoid template ID collisions", async (t) => {
  const { source, out } = await fixture(t);
  await write(
    source,
    "packages/alpha/README.md",
    ALPHA + [
      "",
      "## Run `/skill-search <task>`",
      "",
      "## Hello <span>world</span>",
      "",
      "## nav-toggle",
      "",
      "## main-content",
      "",
      "## extensions",
    ].join("\n"),
  );
  await build({ source, out });
  const alpha = await readFile(path.join(out, "extensions/alpha/index.html"), "utf8");
  assert.match(alpha, /<h2 id="run-skill-search-task">Run <code>\/skill-search &lt;task&gt;<\/code><\/h2>/);
  assert.match(alpha, /<h2 id="hello-world">Hello <span>world<\/span><\/h2>/);
  assert.match(alpha, /<h2 id="nav-toggle-1">nav-toggle<\/h2>/);
  assert.match(alpha, /<h2 id="main-content-1">main-content<\/h2>/);
  assert.match(alpha, /<h2 id="extensions-1">extensions<\/h2>/);

  const ids = [...alpha.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, "all id attributes on the page are unique");
});

test("every internal #anchor link resolves to an actual id in the target HTML", async (t) => {
  const { source, out } = await fixture(t);
  await write(
    source,
    "packages/alpha/README.md",
    ALPHA + "\n## Install\n\n[Local](#install) and [Beta usage](../beta/README.md#usage).\n",
  );
  await write(source, "packages/beta/README.md", "# fixture-beta\n\n## Usage\n\nUse it.\n");
  await build({ source, out });

  for (const file of await htmlFiles(out)) {
    const html = await readFile(file, "utf8");
    for (const [, rawHref] of html.matchAll(/href="([^"]+)"/g)) {
      const href = rawHref.replaceAll("&amp;", "&");
      if (!href.includes("#")) continue;
      if (!href.startsWith("/") && !href.startsWith("#")) continue;
      const [clean, fragment] = href.split("#");
      if (!fragment) continue;
      const targetFile = clean === ""
        ? file
        : path.join(out, clean === "/" ? "index.html" : path.join(clean.slice(1), clean.endsWith("/") ? "index.html" : ""));
      const targetHtml = await readFile(targetFile, "utf8");
      const targetIds = new Set([...targetHtml.matchAll(/ id="([^"]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&")));
      assert.ok(targetIds.has(fragment), `${path.relative(out, file)} link ${href} targets missing #${fragment}`);
    }
  }
});

test("guideDescription decodes &#39; and caps paragraphs exceeding 160 characters", async (t) => {
  const { source, out } = await fixture(t);
  const firstSentence = "First concise sentence about extensions.";
  const longSecond = "Second sentence pushes the paragraph well beyond the one hundred and sixty character meta description budget to force sentence selection.";
  await write(source, "docs/sentence.md", `# Sentence guide\n\nIt&#39;s great. ${firstSentence} ${longSecond}\n`);

  const unbroken = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
  await write(source, "docs/truncated.md", `# Truncated guide\n\n${unbroken}\n`);

  await build({ source, out });

  const sentenceHtml = await readFile(path.join(out, "guides/sentence/index.html"), "utf8");
  assert.match(sentenceHtml, /<meta name="description" content="It's great\." \/>/);

  const truncatedHtml = await readFile(path.join(out, "guides/truncated/index.html"), "utf8");
  const desc = /<meta name="description" content="([^"]+)" \/>/.exec(truncatedHtml)[1];
  assert.ok(desc.length <= 160, `expected <= 160 chars, got ${desc.length}`);
  assert.match(desc, /^word0 .*word\d+…$/);
});

test("footer renders commit links when SHAs are not local", async (t) => {
  const { source } = await fixture(t);
  const model = await discover(source);
  const buildInfo = {
    contentSha: "0123456789abcdef0123456789abcdef01234567",
    siteSha: "fedcba9876543210fedcba9876543210fedcba98",
  };
  const pageHtml = renderPage({
    model,
    current: "/getting-started/",
    title: "Getting started",
    description: "Desc",
    content: "<p>Hello</p>",
    build: buildInfo,
  });
  const landingHtml = renderLanding({ model, build: buildInfo });
  for (const html of [pageHtml, landingHtml]) {
    assert.match(
      html,
      /<a href="https:\/\/github\.com\/matt-riley\/pi-extensions\/commit\/0123456789abcdef0123456789abcdef01234567">pi-extensions@0123456<\/a>/,
    );
    assert.match(
      html,
      /<a href="https:\/\/github\.com\/matt-riley\/pi-extensions-site\/commit\/fedcba9876543210fedcba9876543210fedcba98">site@fedcba9<\/a>/,
    );
  }
});

test("discover and build report clear errors for invalid inputs and clean up failed clones", async (t) => {
  const missingOut = await fixture(t);
  await assert.rejects(build({ source: missingOut.source }), /output directory/);

  const missingH1 = await fixture(t);
  await write(missingH1.source, "docs/guide.md", "No H1 heading here.\n");
  await assert.rejects(discover(missingH1.source), /docs\/guide\.md: missing an H1 title/);

  const missingReadmeH1 = await fixture(t);
  await write(missingReadmeH1.source, "README.md", "Plain intro without H1.\n");
  await assert.rejects(discover(missingReadmeH1.source), /README\.md: missing an H1 title/);

  const missingPkgMeta = await fixture(t);
  await write(missingPkgMeta.source, "packages/alpha/package.json", JSON.stringify({ name: "fixture-alpha", description: "  " }));
  await assert.rejects(discover(missingPkgMeta.source), /packages\/alpha\/package\.json: missing name or description/);

  const missingPkgName = await fixture(t);
  await write(missingPkgName.source, "packages/alpha/package.json", JSON.stringify({ description: "Valid" }));
  await assert.rejects(discover(missingPkgName.source), /packages\/alpha\/package\.json: missing name or description/);

  const missingPromptDesc = await fixture(t);
  await write(missingPromptDesc.source, "prompts/thing.md", "---\nargument-hint: \"[x]\"\n---\nRun it.\n");
  await assert.rejects(discover(missingPromptDesc.source), /prompts\/thing\.md: missing a frontmatter description/);

  const duplicateUrl = await fixture(t);
  await write(duplicateUrl.source, ".agents/skills/other-skill/SKILL.md", "---\nname: z-skill\ndescription: Duplicate\n---\n\n# Dup\n");
  await assert.rejects(discover(duplicateUrl.source), /Duplicate page URL \/skills\/z-skill\//);

  const failedClone = await fixture(t);
  await write(failedClone.root, "content.lock", `${"0".repeat(40)}\n`);
  const beforeTmp = new Set((await readdir(tmpdir())).filter((name) => name.startsWith("pi-extensions-content-")));
  await assert.rejects(build({ root: failedClone.root, out: failedClone.out }));
  const afterTmp = (await readdir(tmpdir())).filter((name) => name.startsWith("pi-extensions-content-") && !beforeTmp.has(name));
  assert.deepEqual(afterTmp, [], "failed cloneContent cleans up temp directory");
});
