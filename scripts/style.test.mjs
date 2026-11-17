import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";

const STYLE_PATH = new URL("./site/style.css", import.meta.url);

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Advance past a single- or double-quoted CSS string starting at `start`. */
function skipString(css, start) {
  const quote = css[start];
  let i = start + 1;
  while (i < css.length && css[i] !== quote) {
    if (css[i] === "\\") i += 1;
    i += 1;
  }
  return i + 1;
}

/** Parse top-level CSS blocks from `css` after stripping comments. */
function parseBlocks(css) {
  const clean = stripComments(css);
  const blocks = [];
  let i = 0;
  let start = 0;

  while (i < clean.length) {
    const ch = clean[i];
    if (ch === '"' || ch === "'") {
      i = skipString(clean, i);
      continue;
    }
    if (ch !== "{") {
      i += 1;
      continue;
    }
    const selector = clean.slice(start, i).trim().replace(/\s+/g, " ");
    let depth = 1;
    const bodyStart = i + 1;
    i += 1;
    while (i < clean.length && depth > 0) {
      const inner = clean[i];
      if (inner === '"' || inner === "'") {
        i = skipString(clean, i);
        continue;
      }
      if (inner === "{") depth += 1;
      else if (inner === "}") depth -= 1;
      i += 1;
    }
    blocks.push({ selector, body: clean.slice(bodyStart, i - 1).trim() });
    start = i;
  }
  return blocks;
}

function findDeclarations(blocks, selector) {
  return blocks
    .filter((block) => block.selector === selector)
    .map((block) => block.body)
    .join("\n");
}

function findMediaBlocks(blocks, mediaQuery) {
  const target = `@media ${mediaQuery}`;
  return blocks
    .filter((block) => block.selector === target)
    .flatMap((block) => parseBlocks(block.body));
}

const css = await readFile(STYLE_PATH, "utf8");
const topBlocks = parseBlocks(css);
const narrowBlocks = findMediaBlocks(topBlocks, "(max-width: 900px)");
const wideMarginBlocks = findMediaBlocks(topBlocks, "(max-width: 1380px)");

test("body and .hero clip horizontal overflow and .hero h1 fits narrow viewports", () => {
  const bodyRule = findDeclarations(topBlocks, "body");
  assert.match(bodyRule, /\boverflow-x:\s*clip\s*;/);

  const heroRule = findDeclarations(topBlocks, ".hero");
  assert.match(heroRule, /\boverflow-x:\s*clip\s*;/);

  const heroHeadingRule = findDeclarations(topBlocks, ".hero h1");
  assert.match(heroHeadingRule, /clamp\(\s*1\.85rem\s*,\s*9\.2vw\s*,\s*7\.4rem\s*\)/);

  const wideHeadingMarkerRule = findDeclarations(
    wideMarginBlocks,
    ".shell.wide .content h2[id]::before, .shell.wide .content h3[id]::before",
  );
  assert.match(wideHeadingMarkerRule, /\bdisplay:\s*none\s*;/);
});

test(".content table uses normal table layout on desktop and scrolls horizontally on narrow viewports", () => {
  const desktopTableRule = findDeclarations(topBlocks, ".content table");
  assert.match(desktopTableRule, /\bwidth:\s*100%\s*;/);
  assert.match(desktopTableRule, /\bborder-collapse:\s*collapse\s*;/);
  assert.doesNotMatch(desktopTableRule, /\bdisplay:\s*block\s*;/);
  assert.doesNotMatch(desktopTableRule, /\boverflow:\s*auto\s*;/);

  const narrowTableRule = findDeclarations(narrowBlocks, ".content table");
  assert.match(narrowTableRule, /\bdisplay:\s*block\s*;/);
  assert.match(narrowTableRule, /\boverflow-x:\s*auto\s*;/);
});

test("sidebar prose navigation supports .nav-group-prose a alongside :last-child", () => {
  const proseRule = findDeclarations(topBlocks, ".nav-group-prose a, .nav-group:last-child a");
  assert.match(proseRule, /\bfont-family:\s*var\(--sans\)\s*;/);
  assert.match(proseRule, /\bfont-size:\s*0\.86rem\s*;/);
});

test(".skip-link is hidden offscreen until :focus-visible", () => {
  const skipLinkRule = findDeclarations(topBlocks, ".skip-link");
  assert.match(skipLinkRule, /\bposition:\s*absolute\s*;/);
  assert.match(skipLinkRule, /\btop:\s*-100%\s*;/);
  assert.match(skipLinkRule, /\bleft:\s*1rem\s*;/);
  assert.match(skipLinkRule, /\bz-index:\s*10\s*;/);
  assert.match(skipLinkRule, /\bbackground:\s*var\(--accent\)\s*;/);
  assert.match(skipLinkRule, /\bcolor:\s*var\(--accent-ink\)\s*;/);

  const skipLinkFocusRule = findDeclarations(topBlocks, ".skip-link:focus-visible");
  assert.match(skipLinkFocusRule, /\btop:\s*0\.5rem\s*;/);
});

test(".nav-toggle is display: none on desktop and visually hidden block on narrow screens", () => {
  const desktopToggleRule = findDeclarations(topBlocks, ".nav-toggle");
  assert.match(desktopToggleRule, /\bdisplay:\s*none\s*;/);
  assert.doesNotMatch(desktopToggleRule, /\bposition:\s*absolute\s*;/);

  const narrowToggleRule = findDeclarations(narrowBlocks, ".nav-toggle");
  assert.match(narrowToggleRule, /\bdisplay:\s*block\s*;/);
  assert.match(narrowToggleRule, /\bposition:\s*absolute\s*;/);
  assert.match(narrowToggleRule, /\bopacity:\s*0\s*;/);
  assert.match(narrowToggleRule, /\bpointer-events:\s*none\s*;/);
});

test("decorative pseudo-element content rules include fallback content followed by empty alt text", () => {
  const expectations = [
    [topBlocks, ".repo::after", '" ↗"'],
    [topBlocks, ".content h2[id]::before, .content h3[id]::before", '"##"'],
    [topBlocks, ".content h3[id]::before", '"###"'],
    [topBlocks, ".button::after", '" →"'],
    [topBlocks, ".button.ghost::after", '" ↗"'],
    [topBlocks, ".card a::before", "counter(card, decimal-leading-zero)"],
    [topBlocks, ".card a::after", '"→"'],
    [topBlocks, ".links a::after", '"→"'],
    [narrowBlocks, ".nav-toggle-label::after", '"+"'],
    [narrowBlocks, ".nav-toggle:checked + .nav-toggle-label::after", '"−"'],
  ];

  for (const [blocks, selector, value] of expectations) {
    const body = findDeclarations(blocks, selector);
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(
      body,
      new RegExp(`content:\\s*${escaped}\\s*;\\s*content:\\s*${escaped}\\s*\\/\\s*""\\s*;`),
      `${selector} must declare fallback content followed by empty alt text`,
    );
  }
});
