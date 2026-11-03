// Minimal YAML frontmatter reader for prompt and skill Markdown. Deliberately a
// small subset — plain, quoted, folded (>) and literal (|) scalars — mirroring
// packages/skill-select/library.mjs in the content repository, so this site
// never has to import code out of the checkout it renders.

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replaceAll('\\n', "\n").replaceAll('\\"', '"');
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replaceAll("''", "'");
  }
  return trimmed;
}

export function parseFrontmatter(text) {
  const result = { name: "", description: "" };
  const normalized = String(text ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return result;
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return result;
  const lines = normalized.slice(4, end).split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(name|description):\s*(.*)$/.exec(lines[index]);
    if (!match) continue;
    const [, key, rawValue] = match;
    const value = rawValue.trim();
    if (value === ">" || value === "|" || value === ">-" || value === "|-") {
      const collected = [];
      while (
        index + 1 < lines.length &&
        (lines[index + 1].trim() === "" || /^\s+\S/.test(lines[index + 1]))
      ) {
        collected.push(lines[index + 1].trim());
        index += 1;
      }
      result[key] = value.startsWith("|")
        ? collected.join("\n").trim()
        : collected.filter(Boolean).join(" ").trim();
      continue;
    }
    result[key] = unquote(value);
  }
  return result;
}

export function stripFrontmatter(markdown) {
  const normalized = String(markdown ?? "").replace(/\r\n?/g, "\n");
  if (!normalized.startsWith("---\n")) return normalized;
  const end = normalized.indexOf("\n---", 4);
  if (end === -1) return normalized;
  return normalized.slice(end + 4).replace(/^\n+/, "");
}

export function firstHeading(markdown) {
  const match = /^#\s+(.+)$/m.exec(stripFrontmatter(markdown));
  return match ? match[1].trim() : null;
}
