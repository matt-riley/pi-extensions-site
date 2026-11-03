#!/usr/bin/env node
// Generate the pi-extensions documentation site into dist/ from a checkout of
// the content repository, pinned by content.lock.

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { firstHeading, parseFrontmatter, stripFrontmatter } from "./site/frontmatter.mjs";
import { escapeHtml, renderLanding, renderNotFound, renderPage } from "./site/template.mjs";

const CONTENT_REPO = "matt-riley/pi-extensions";
const CONTENT_URL = `https://github.com/${CONTENT_REPO}.git`;
const SITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMMIT = /^[0-9a-f]{40}$/;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function commitOf(dir) {
  try {
    return git(["-C", dir, "rev-parse", "HEAD"]).trim();
  } catch {
    return null;
  }
}

async function cloneContent(root) {
  const lock = (await readFile(path.join(root, "content.lock"), "utf8")).trim();
  if (!COMMIT.test(lock)) {
    throw new Error(`content.lock must hold one 40-character commit SHA, found ${JSON.stringify(lock)}`);
  }
  const dir = await mkdtemp(path.join(tmpdir(), "pi-extensions-content-"));
  git(["init", "--quiet", dir]);
  git(["-C", dir, "remote", "add", "origin", CONTENT_URL]);
  git(["-C", dir, "fetch", "--quiet", "--depth", "1", "origin", lock]);
  git(["-C", dir, "checkout", "--quiet", "--detach", "FETCH_HEAD"]);
  return { dir, sha: lock };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function listDirectories(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function listMarkdown(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
}

export async function discover(contentDir) {
  const manifest = await readJson(path.join(contentDir, "package.json"));
  const pages = [];
  const pageBySource = new Map();
  const add = (page) => {
    pages.push(page);
    pageBySource.set(page.source, page.url);
  };
  const headingOrThrow = async (source) => {
    const title = firstHeading(await readFile(path.join(contentDir, source), "utf8"));
    if (!title) throw new Error(`${source}: missing an H1 title`);
    return title;
  };

  const gettingStarted = {
    source: "README.md",
    url: "/getting-started/",
    out: "getting-started/index.html",
    title: await headingOrThrow("README.md"),
    description: "Install and run the pi-extensions collection",
  };
  add(gettingStarted);

  const extensions = [];
  for (const dir of await listDirectories(path.join(contentDir, "packages"))) {
    const source = `packages/${dir}/README.md`;
    if (!existsSync(path.join(contentDir, source))) {
      throw new Error(`${source}: every packages/ directory needs a README.md`);
    }
    const meta = await readJson(path.join(contentDir, `packages/${dir}/package.json`));
    const described = typeof meta.description === "string" && meta.description.trim() !== "";
    if (typeof meta.name !== "string" || meta.name.trim() === "" || !described) {
      throw new Error(`packages/${dir}/package.json: missing name or description`);
    }
    const page = {
      source,
      url: `/extensions/${dir}/`,
      out: `extensions/${dir}/index.html`,
      label: meta.name,
      title: await headingOrThrow(source),
      description: meta.description,
    };
    extensions.push(page);
    add(page);
  }

  const prompts = [];
  for (const file of await listMarkdown(path.join(contentDir, "prompts"))) {
    const source = `prompts/${file}`;
    const slug = file.replace(/\.md$/, "");
    const { description } = parseFrontmatter(await readFile(path.join(contentDir, source), "utf8"));
    if (!description) throw new Error(`${source}: missing a frontmatter description`);
    const page = {
      source,
      url: `/prompts/${slug}/`,
      out: `prompts/${slug}/index.html`,
      label: `/${slug}`,
      title: description,
      description,
    };
    prompts.push(page);
    add(page);
  }

  const skills = [];
  for (const dir of await listDirectories(path.join(contentDir, ".agents/skills"))) {
    const source = `.agents/skills/${dir}/SKILL.md`;
    if (!existsSync(path.join(contentDir, source))) continue;
    const { name, description } = parseFrontmatter(
      await readFile(path.join(contentDir, source), "utf8"),
    );
    const label = name || dir;
    const page = {
      source,
      url: `/skills/${label}/`,
      out: `skills/${label}/index.html`,
      label,
      title: await headingOrThrow(source),
      description,
    };
    skills.push(page);
    add(page);
  }

  const guides = [];
  for (const file of await listMarkdown(path.join(contentDir, "docs"))) {
    const source = `docs/${file}`;
    const slug = file.replace(/\.md$/, "");
    const title = await headingOrThrow(source);
    const page = {
      source,
      url: `/guides/${slug}/`,
      out: `guides/${slug}/index.html`,
      label: title,
      title,
      description: title,
    };
    guides.push(page);
    add(page);
  }

  const byLabel = (left, right) => left.label.localeCompare(right.label);
  return {
    description: typeof manifest.description === "string" ? manifest.description : "",
    gettingStarted,
    extensions: extensions.sort(byLabel),
    prompts: prompts.sort(byLabel),
    skills: skills.sort(byLabel),
    guides: guides.sort(byLabel),
    pages,
    pageBySource,
  };
}

function splitTarget(value) {
  const hash = value.indexOf("#");
  const beforeHash = hash === -1 ? value : value.slice(0, hash);
  return [beforeHash.split("?")[0], hash === -1 ? "" : value.slice(hash)];
}

export function rewriteHref(href, from, { pageBySource, contentDir, contentSha }) {
  const value = String(href ?? "").trim();
  if (value === "" || value.startsWith("#")) return value;
  if (value.startsWith("/")) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//")) return value;
  const [target, anchor] = splitTarget(value);
  if (target === "") return value;
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(from), target.replace(/\/+$/, "")),
  );
  const page = pageBySource.get(resolved);
  if (page) return `${page}${anchor}`;
  if (resolved.startsWith("..")) return value;
  const absolute = path.join(contentDir, resolved);
  const kind = existsSync(absolute) && statSync(absolute).isDirectory() ? "tree" : "blob";
  return `https://github.com/${CONTENT_REPO}/${kind}/${contentSha}/${resolved}${anchor}`;
}

function renderMarkdown(markdown, rewrite, title) {
  const marked = new Marked({
    renderer: {
      link(token) {
        const label = this.parser.parseInline(token.tokens);
        const titleAttribute = token.title ? ` title="${escapeHtml(token.title)}"` : "";
        return `<a href="${escapeHtml(rewrite(token.href))}"${titleAttribute}>${label}</a>`;
      },
      image(token) {
        const titleAttribute = token.title ? ` title="${escapeHtml(token.title)}"` : "";
        return `<img src="${escapeHtml(rewrite(token.href))}" alt="${escapeHtml(token.text ?? "")}"${titleAttribute}>`;
      },
    },
  });
  const body = stripFrontmatter(markdown);
  const html = marked.parse(body).trimEnd();
  return body.trimStart().startsWith("# ") ? html : `<h1>${escapeHtml(title)}</h1>\n${html}`;
}

export async function build({ source, root = SITE_ROOT, out } = {}) {
  if (!out) throw new Error("build needs an output directory");
  const content = source
    ? { dir: path.resolve(source), sha: commitOf(path.resolve(source)) ?? "local" }
    : await cloneContent(root);
  try {
    const model = await discover(content.dir);
    const built = {
      contentSha: content.sha,
      siteSha: commitOf(root) ?? process.env.GITHUB_SHA ?? "local",
    };
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    const write = async (file, html) => {
      await mkdir(path.dirname(path.join(out, file)), { recursive: true });
      await writeFile(path.join(out, file), html);
    };
    for (const page of model.pages) {
      const markdown = await readFile(path.join(content.dir, page.source), "utf8");
      const rewrite = (href) =>
        rewriteHref(href, page.source, {
          pageBySource: model.pageBySource,
          contentDir: content.dir,
          contentSha: content.sha,
        });
      await write(
        page.out,
        renderPage({
          model,
          current: page.url,
          title: page.title,
          description: page.description || page.title,
          content: renderMarkdown(markdown, rewrite, page.title),
          build: built,
        }),
      );
    }
    await write("index.html", renderLanding({ model, build: built }));
    await write("404.html", renderNotFound({ model, build: built }));
    await mkdir(path.join(out, "assets"), { recursive: true });
    await copyFile(
      fileURLToPath(new URL("./site/style.css", import.meta.url)),
      path.join(out, "assets/style.css"),
    );
    return { ...built, urls: model.pages.map((page) => page.url) };
  } finally {
    if (!source) await rm(content.dir, { recursive: true, force: true });
  }
}

function cliSource(args) {
  const index = args.indexOf("--source");
  if (index === -1) return process.env.PI_EXTENSIONS_SOURCE;
  const value = args[index + 1];
  if (!value) throw new Error("--source needs a path to a pi-extensions checkout");
  return value;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await build({
    source: cliSource(process.argv.slice(2)),
    out: path.join(SITE_ROOT, "dist"),
  });
  const short = (sha) => sha.slice(0, 7);
  console.log(
    `Wrote ${result.urls.length} pages to dist from pi-extensions@${short(result.contentSha)} ` +
      `(site@${short(result.siteSha)})`,
  );
}
