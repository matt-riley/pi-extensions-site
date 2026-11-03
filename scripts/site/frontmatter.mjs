// Minimal YAML frontmatter reader for prompt and skill Markdown. Deliberately a
// small subset — plain, quoted, folded (>) and literal (|) scalars — mirroring
// packages/skill-select/library.mjs in the content repository, so this site
// never has to import code out of the checkout it renders.

function unquote(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if (trimmed.length < 2 || trimmed.at(-1) !== quote) return trimmed;
  if (quote === '"') return trimmed.slice(1, -1).replaceAll("\\n", "\n").replaceAll('\\"', '"');
  if (quote === "'") return trimmed.slice(1, -1).replaceAll("''", "'");
  return trimmed;
}

// Splits Markdown into its frontmatter block (without fences) and the body.
function splitFrontmatter(text) {
  const normalized = String(text ?? "")
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n");
  const end = normalized.startsWith("---\n") ? normalized.indexOf("\n---", 4) : -1;
  if (end === -1) return { header: "", body: normalized };
  return { header: normalized.slice(4, end), body: normalized.slice(end + 4).replace(/^\n+/, "") };
}

export function parseFrontmatter(text) {
  const result = { name: "", description: "" };
  const lines = splitFrontmatter(text).header.split("\n");
  while (lines.length > 0) {
    const match = /^(name|description):\s*(.*)$/.exec(lines.shift());
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (!/^[>|]-?$/.test(value)) {
      result[key] = unquote(value);
      continue;
    }
    const block = [];
    while (lines.length > 0 && (lines[0].trim() === "" || /^\s+\S/.test(lines[0]))) {
      block.push(lines.shift().trim());
    }
    result[key] = value.startsWith("|")
      ? block.join("\n").trim()
      : block.filter(Boolean).join(" ").trim();
  }
  return result;
}

export function stripFrontmatter(markdown) {
  return splitFrontmatter(markdown).body;
}

export function firstHeading(markdown) {
  const match = /^#\s+(.+)$/m.exec(stripFrontmatter(markdown));
  return match ? match[1].trim() : null;
}
