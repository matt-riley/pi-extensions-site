import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { build } from "./build-site.mjs";

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
  t.after(() => rm(root, { recursive: true, force: true }));
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
      const [clean] = href.split("#");
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
