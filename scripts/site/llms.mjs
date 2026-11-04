// Plain-Markdown output for agents: one index.md beside each page's index.html,
// and an llms.txt index at the site root (https://llmstxt.org/).

import { stripFrontmatter } from "./frontmatter.mjs";

export const SITE_URL = "https://pi-extensions.mattriley.tools";

// Every page's Markdown copy is derived from its URL: /a/b/ -> a/b/index.md.
export const markdownOut = (url) => `${url.slice(1)}index.md`;
export const markdownUrl = (url) => `${url}index.md`;

// Rewrite inline link and image targets, skipping fenced and inline code.
// `rewrite` maps a source-relative href to a site URL; links to pages then
// point at their Markdown copy so an agent can keep reading Markdown.
export function renderMarkdownCopy(markdown, title, rewrite, pageUrls) {
  const toMarkdown = (href) => {
    const target = rewrite(href);
    const hash = target.indexOf("#");
    const bare = hash === -1 ? target : target.slice(0, hash);
    return pageUrls.has(bare) ? markdownUrl(bare) + (hash === -1 ? "" : target.slice(hash)) : target;
  };
  const body = stripFrontmatter(markdown).trimStart();
  const parts = body.split(/(^```[\s\S]*?^```[^\n]*$|`[^`\n]*`)/m);
  const text = parts
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(/(\]\()(<[^>]*>|[^)\s]+)/g, (_, open, href) =>
            href.startsWith("<") ? `${open}<${toMarkdown(href.slice(1, -1))}>` : `${open}${toMarkdown(href)}`,
          ),
    )
    .join("");
  const titled = text.startsWith("# ") ? text : `# ${title}\n\n${text}`;
  return `${titled.trimEnd()}\n`;
}

export function renderLlmsTxt(model) {
  const line = (page) =>
    `- [${page.label ?? page.title}](${SITE_URL}${markdownUrl(page.url)})` +
    (page.description && page.description !== (page.label ?? page.title) ? `: ${page.description}` : "");
  const section = (name, pages) => (pages.length ? [`## ${name}`, "", ...pages.map(line), ""] : []);
  return [
    "# pi-extensions",
    "",
    `> ${model.description || "Documentation for the pi-extensions collection."}`,
    "",
    "Each link is a plain-Markdown copy of a page on this site; the HTML page is the same URL without `index.md`.",
    "",
    ...section("Getting started", [model.gettingStarted]),
    ...section("Extensions", model.extensions),
    ...section("Guides", model.guides),
    ...section("Prompts", model.prompts),
    ...section("Skills", model.skills),
  ].join("\n");
}

// Fails the build if any page lacks a Markdown copy or an llms.txt entry.
export function checkLlmsCoverage(model, llmsTxt, written) {
  const problems = [];
  for (const page of model.pages) {
    if (!written.has(markdownOut(page.url))) problems.push(`${page.url}: no Markdown copy`);
    if (!llmsTxt.includes(`(${SITE_URL}${markdownUrl(page.url)})`)) problems.push(`${page.url}: missing from llms.txt`);
  }
  if (problems.length) throw new Error(`llms.txt coverage:\n${problems.join("\n")}`);
}
