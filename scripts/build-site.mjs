#!/usr/bin/env node
// Generate the pi-extensions documentation site into dist/ from a checkout of
// the content repository, pinned by content.lock.

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";
import { firstHeading, parseFrontmatter, stripFrontmatter } from "./site/frontmatter.mjs";
import { checkLlmsCoverage, markdownOut, renderLlmsTxt, renderMarkdownCopy } from "./site/llms.mjs";
import { CONTENT_REPO, escapeHtml, renderLanding, renderNotFound, renderPage } from "./site/template.mjs";

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

async function list(dir, keep) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter(keep)
    .map((entry) => entry.name)
    .sort();
}

const listDirectories = (dir) => list(dir, (entry) => entry.isDirectory());
const listMarkdown = (dir) => list(dir, (entry) => entry.isFile() && entry.name.endsWith(".md"));
const isText = (value) => typeof value === "string" && value.trim() !== "";

// Every page's output file is derived from its URL: /a/b/ -> a/b/index.html.
const makePage = (source, url, fields) => ({ source, url, out: `${url.slice(1)}index.html`, ...fields });

export async function discover(contentDir) {
  const manifest = await readJson(path.join(contentDir, "package.json"));
  const read = (source) => readFile(path.join(contentDir, source), "utf8");
  const headingOrThrow = async (source) => {
    const title = firstHeading(await read(source));
    if (!title) throw new Error(`${source}: missing an H1 title`);
    return title;
  };

  const gettingStarted = makePage("README.md", "/getting-started/", {
    title: await headingOrThrow("README.md"),
    description: "Install and run the pi-extensions collection",
  });

  const extensions = [];
  for (const dir of await listDirectories(path.join(contentDir, "packages"))) {
    const source = `packages/${dir}/README.md`;
    if (!existsSync(path.join(contentDir, source))) {
      throw new Error(`${source}: every packages/ directory needs a README.md`);
    }
    const meta = await readJson(path.join(contentDir, `packages/${dir}/package.json`));
    if (!isText(meta.name) || !isText(meta.description)) {
      throw new Error(`packages/${dir}/package.json: missing name or description`);
    }
    extensions.push(
      makePage(source, `/extensions/${dir}/`, {
        label: meta.name,
        title: await headingOrThrow(source),
        description: meta.description,
      }),
    );
  }

  const prompts = [];
  for (const file of await listMarkdown(path.join(contentDir, "prompts"))) {
    const source = `prompts/${file}`;
    const { description } = parseFrontmatter(await read(source));
    if (!description) throw new Error(`${source}: missing a frontmatter description`);
    const slug = file.replace(/\.md$/, "");
    prompts.push(
      makePage(source, `/prompts/${slug}/`, { label: `/${slug}`, title: description, description }),
    );
  }

  const skills = [];
  for (const dir of await listDirectories(path.join(contentDir, ".agents/skills"))) {
    const source = `.agents/skills/${dir}/SKILL.md`;
    if (!existsSync(path.join(contentDir, source))) continue;
    const { name, description } = parseFrontmatter(await read(source));
    const label = name || dir;
    skills.push(
      makePage(source, `/skills/${label}/`, {
        label,
        title: await headingOrThrow(source),
        description,
      }),
    );
  }

  const guides = [];
  for (const file of await listMarkdown(path.join(contentDir, "docs"))) {
    const source = `docs/${file}`;
    const title = await headingOrThrow(source);
    const slug = file.replace(/\.md$/, "");
    guides.push(makePage(source, `/guides/${slug}/`, { label: title, title, description: title }));
  }

  // Taken before sorting so pages are built in directory order.
  const pages = [gettingStarted, ...extensions, ...prompts, ...skills, ...guides];
  const byLabel = (left, right) => left.label.localeCompare(right.label);
  return {
    description: typeof manifest.description === "string" ? manifest.description : "",
    gettingStarted,
    extensions: extensions.sort(byLabel),
    prompts: prompts.sort(byLabel),
    skills: skills.sort(byLabel),
    guides: guides.sort(byLabel),
    pages,
    pageBySource: new Map(pages.map((page) => [page.source, page.url])),
  };
}

export function rewriteHref(href, from, { pageBySource, contentDir, contentSha }) {
  const value = String(href ?? "").trim();
  // Empty, fragment-only, root-relative, protocol-relative and absolute URLs stay as written.
  if (value === "" || /^([#/]|[a-z][a-z0-9+.-]*:)/i.test(value)) return value;
  const hash = value.indexOf("#");
  const anchor = hash === -1 ? "" : value.slice(hash);
  const target = (hash === -1 ? value : value.slice(0, hash)).split("?")[0];
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
  const titleAttribute = (token) => (token.title ? ` title="${escapeHtml(token.title)}"` : "");
  const headingIds = new Set();
  const marked = new Marked({
    renderer: {
      heading(token) {
        const text = this.parser.parseInline(token.tokens, this.parser.textRenderer);
        const base = text.toLowerCase()
          .replace(/<[^>]*>|[^\p{L}\p{M}\p{N}_ -]/gu, "")
          .replaceAll(" ", "-") || "section";
        let id = base;
        for (let suffix = 1; headingIds.has(id); suffix += 1) id = `${base}-${suffix}`;
        headingIds.add(id);
        return `<h${token.depth} id="${escapeHtml(id)}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
      },
      link(token) {
        const label = this.parser.parseInline(token.tokens);
        return `<a href="${escapeHtml(rewrite(token.href))}"${titleAttribute(token)}>${label}</a>`;
      },
      image(token) {
        return `<img src="${escapeHtml(rewrite(token.href))}" alt="${escapeHtml(token.text)}"${titleAttribute(token)}>`;
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
    const write = async (file, data) => {
      await mkdir(path.dirname(path.join(out, file)), { recursive: true });
      await writeFile(path.join(out, file), data);
    };
    const pageUrls = new Set(model.pages.map((page) => page.url));
    const markdownCopies = new Set();
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
      await write(markdownOut(page.url), renderMarkdownCopy(markdown, page.title, rewrite, pageUrls));
      markdownCopies.add(markdownOut(page.url));
    }
    const llmsTxt = renderLlmsTxt(model);
    checkLlmsCoverage(model, llmsTxt, markdownCopies);
    await write("llms.txt", llmsTxt);
    await write("index.html", renderLanding({ model, build: built }));
    await write("404.html", renderNotFound({ model, build: built }));
    await write("assets/style.css", await readFile(new URL("./site/style.css", import.meta.url)));
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
