import { test, expect } from "vitest";
import { JSDOM } from "jsdom";
import { pageState } from "./page-state.mjs";

const html = `<title>Example — pi-extensions</title>
<link rel="canonical" href="https://pi-extensions.mattriley.tools/guides/example/">
<a class="skip-link" href="#main-content">Skip to content</a>
<main id="main-content"><h1>Example</h1><h2 id="setup">Setup</h2>
<a href="#setup">Setup</a><a href="/getting-started/">Start</a>
<a href="/getting-started/index.md">Markdown</a><a href="/llms.txt">Index</a>
<a href="https://example.org/">External</a></main>`;
function state(markup = html) {
  const { window } = new JSDOM(markup, { url: "http://localhost:8000/guides/example/" });
  return { document: window.document, window };
}

test("extracts valid HTML navigation without agent copies or external destinations", () => {
  const result = pageState(state());
  expect(result.structure).toEqual([]);
  expect(result.anchors).toEqual([]);
  expect(result.links).toEqual(["/guides/example/#main-content", "/guides/example/#setup", "/getting-started/"]);
});

test.each([
  ["empty title", html.replace("Example — pi-extensions", ""), "title"],
  ["missing main", html.replace(/main/g, "section"), "main"],
  ["missing heading", html.replace(/h1/g, "p"), "heading"],
  ["duplicate heading", html.replace("</main>", "<h1>Another</h1></main>"), "heading"],
  ["wrong canonical", html.replace("tools/guides/example/", "tools/other/"), "canonical"],
  ["missing skip target", html.replace('id="main-content"', 'id="other"'), "skip link"],
])("detects %s", (_, markup, issue) => {
  expect(pageState(state(markup)).structure).toContain(issue);
});

test("detects broken same-page anchors and duplicate IDs", () => {
  const result = pageState(state(html + '<a href="#missing">Broken</a><div id="setup"></div>'));
  expect(result.anchors).toContain("#missing");
  expect(result.anchors).toContain("duplicate #setup");
});

test("decodes escaped fragments and ignores hashes belonging to other pages", () => {
  const result = pageState(state(html + '<div id="a&b"></div><a href="#a%26b">Valid</a><a href="/other/#later">Other</a>'));
  expect(result.anchors).toEqual([]);
});

test("detects horizontal document overflow", () => {
  const input = state();
  Object.defineProperty(input.window, "innerWidth", { value: 375 });
  Object.defineProperty(input.document.documentElement, "scrollWidth", { value: 600 });
  expect(pageState(input).fitsViewport).toBe(false);
});
