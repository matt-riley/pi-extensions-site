// Plain-Markdown output for agents: one index.md beside each page's index.html,
// and an llms.txt index at the site root (https://llmstxt.org/).

import { stripFrontmatter } from "./frontmatter.mjs";

import { SITE_URL } from "./template.mjs";

// Every page's Markdown copy is derived from its URL: /a/b/ -> a/b/index.md.
export const markdownOut = (url) => `${url.slice(1)}index.md`;
export const markdownUrl = (url) => `${url}index.md`;

const CODE_SPAN_OR_FENCE =
  /^[ \t]{0,3}(?<bf>`{3,})[^`\n]*(?:\n[\s\S]*?(?:^[ \t]{0,3}\k<bf>`*[ \t]*$|(?![\s\S]))|(?![\s\S]))|^[ \t]{0,3}(?<tf>~{3,})[^\n]*(?:\n[\s\S]*?(?:^[ \t]{0,3}\k<tf>~*[ \t]*$|(?![\s\S]))|(?![\s\S]))|(?<!`)(?<ticks>`+)(?!`)[^\n]*?(?<!`)\k<ticks>(?!`)/gm;

const INLINE_LINK = /(\]\()(<[^>\n]*>|(?:[^()\s]+|\([^()\s]*\))+)/g;
const REF_DEF =
  /^([ \t]{0,3}\[[^\]^][^\]]*\]:[ \t]*)(<[^>\n]*>|\S+)(?=[ \t]*(?:$|(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|\((?:\\[\s\S]|[^)\\])*\))[ \t]*$))/gm;

// Transform non-code segments of Markdown while skipping fenced blocks and inline code spans.
function mapOutsideCode(text, transform) {
  let out = "";
  let last = 0;
  for (const match of text.matchAll(CODE_SPAN_OR_FENCE)) {
    out += transform(text.slice(last, match.index), last);
    out += match[0];
    last = match.index + match[0].length;
  }
  return out + transform(text.slice(last), last);
}

// Rewrite inline link, image, and reference-style link targets, skipping fenced and inline code.
// `rewrite` maps a source-relative href to a site URL; links to pages then
// point at their Markdown copy so an agent can keep reading Markdown.
export function renderMarkdownCopy(markdown, title, rewrite, pageUrls) {
  const toMarkdown = (href) => {
    const target = rewrite(href);
    const hash = target.indexOf("#");
    const bare = hash === -1 ? target : target.slice(0, hash);
    return pageUrls.has(bare) ? markdownUrl(bare) + (hash === -1 ? "" : target.slice(hash)) : target;
  };
  const rewriteDestination = (href) =>
    href.startsWith("<") ? `<${toMarkdown(href.slice(1, -1))}>` : toMarkdown(href);

  const body = stripFrontmatter(markdown).trimStart();
  const text = mapOutsideCode(body, (segment, baseOffset) => {
    const atLineStart = baseOffset === 0 || body[baseOffset - 1] === "\n";
    return segment
      .replace(INLINE_LINK, (_, open, href) => `${open}${rewriteDestination(href)}`)
      .replace(REF_DEF, (full, prefix, href, offset) =>
        offset === 0 && !atLineStart ? full : `${prefix}${rewriteDestination(href)}`,
      );
  });
  const titled = /^#\s+/.test(text) ? text : `# ${title}\n\n${text}`;
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
