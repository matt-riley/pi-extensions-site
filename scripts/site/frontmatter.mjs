// Minimal YAML frontmatter reader for prompt and skill Markdown. Deliberately a
// small subset — plain, quoted, folded (>) and literal (|) scalars — mirroring
// packages/skill-select/library.mjs in the content repository, so this site
// never has to import code out of the checkout it renders.

import { lexer, Parser, TextRenderer } from "marked";

const DOUBLE_ESCAPES = { "\\": "\\", n: "\n", t: "\t", '"': '"' };
const FIELDS = { name: "name", description: "description", "argument-hint": "argumentHint" };
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " };

function unquote(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (trimmed.length < 2 || trimmed.at(-1) !== quote) return trimmed;
  if (quote === '"') return trimmed.slice(1, -1).replace(/\\([\\nt"])/g, (_, ch) => DOUBLE_ESCAPES[ch]);
  if (quote === "'") return trimmed.slice(1, -1).replaceAll("''", "'");
  return trimmed;
}

// Splits Markdown into its frontmatter block (without fences) and the body.
function splitFrontmatter(text) {
  const normalized = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  const close = normalized.startsWith("---\n") ? /\n---(?=\n|$)/.exec(normalized.slice(3)) : null;
  if (!close) return { header: "", body: normalized };
  const end = close.index + 3;
  return { header: normalized.slice(4, end), body: normalized.slice(end + 4).replace(/^\n+/, "") };
}

function dedentBlock(block) {
  while (block.length > 0 && block[0].trim() === "") block.shift();
  while (block.length > 0 && block.at(-1).trim() === "") block.pop();
  const indents = block.filter((line) => line.trim() !== "").map((line) => line.match(/^\s*/)[0].length);
  const indent = indents.length > 0 ? Math.min(...indents) : 0;
  return block.map((line) => (line.trim() === "" ? "" : line.slice(indent))).join("\n");
}

export function parseFrontmatter(text) {
  const result = { name: "", description: "", argumentHint: "" };
  const lines = splitFrontmatter(text).header.split("\n");
  while (lines.length > 0) {
    const match = /^(name|description|argument-hint):\s*(.*)$/.exec(lines.shift());
    if (!match) continue;
    const [, key, rawValue] = match;
    const field = FIELDS[key];
    const value = rawValue.trim();
    if (!/^[>|]-?$/.test(value)) {
      result[field] = unquote(value);
      continue;
    }
    const block = [];
    while (lines.length > 0 && (lines[0].trim() === "" || /^\s+\S/.test(lines[0]))) {
      block.push(lines.shift());
    }
    result[field] = value.startsWith("|")
      ? dedentBlock(block)
      : block.map((line) => line.trim()).filter(Boolean).join(" ");
  }
  return result;
}

export function stripFrontmatter(markdown) {
  return splitFrontmatter(markdown).body;
}

export function firstHeading(markdown) {
  const heading = lexer(stripFrontmatter(markdown)).find((token) => token.type === "heading" && token.depth === 1);
  if (!heading) return null;
  const renderer = new TextRenderer();
  renderer.html = () => "";
  const text = Parser.parseInline(heading.tokens, { renderer })
    .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, name) => ENTITIES[name])
    .trim();
  return text || null;
}
