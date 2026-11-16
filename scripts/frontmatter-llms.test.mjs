import assert from "node:assert/strict";
import test from "node:test";
import { firstHeading, parseFrontmatter, stripFrontmatter } from "./site/frontmatter.mjs";
import { checkLlmsCoverage, markdownOut, markdownUrl, renderLlmsTxt, renderMarkdownCopy } from "./site/llms.mjs";
import { SITE_URL } from "./site/template.mjs";

test("parseFrontmatter handles plain, quoted, block scalars, argument-hint, BOM, CRLF, and edge fences", () => {
  assert.deepEqual(parseFrontmatter(""), { name: "", description: "", argumentHint: "" });
  assert.deepEqual(parseFrontmatter(null), { name: "", description: "", argumentHint: "" });
  assert.deepEqual(parseFrontmatter("No frontmatter here.\n"), { name: "", description: "", argumentHint: "" });

  // Empty frontmatter must be stripped cleanly without error.
  assert.deepEqual(parseFrontmatter("---\n---\nBody\n"), { name: "", description: "", argumentHint: "" });

  // Plain values and argument-hint, ignoring unrelated keys and indented sub-items.
  assert.deepEqual(
    parseFrontmatter(
      [
        "---",
        "tags:",
        "  - name: nested",
        "name: skill-select",
        "description: Select relevant skills",
        "argument-hint: <task> [--all]",
        "---",
        "Body",
      ].join("\n"),
    ),
    { name: "skill-select", description: "Select relevant skills", argumentHint: "<task> [--all]" },
  );

  // Single-quoted strings unescape '' only, leaving backslashes literal.
  assert.deepEqual(
    parseFrontmatter("---\nname: 'pi''s-tool'\ndescription: 'Keep \\n and \\t literal'\n---\n"),
    { name: "pi's-tool", description: "Keep \\n and \\t literal", argumentHint: "" },
  );

  // Double-quoted strings unescape \", \n, \t, and \\ in a single pass.
  assert.deepEqual(
    parseFrontmatter(
      '---\nname: "say \\"hi\\""\ndescription: "line1\\n\\tindented\\\\literal\\n"\nargument-hint: "[a\\\\b]"\n---\n',
    ),
    { name: 'say "hi"', description: "line1\n\tindented\\literal\n", argumentHint: "[a\\b]" },
  );
  // Escaped backslash before n must not turn into a newline.
  assert.deepEqual(parseFrontmatter('---\ndescription: "path\\\\name"\n---\n'), {
    name: "",
    description: "path\\name",
    argumentHint: "",
  });

  // Folded (>) and folded-strip (>-) block scalars.
  assert.deepEqual(
    parseFrontmatter(
      [
        "---",
        "name: folded",
        "description: >",
        "  First line",
        "  second line",
        "",
        "  third line",
        "argument-hint: >-",
        "  [file]",
        "  [flag]",
        "---",
      ].join("\n"),
    ),
    { name: "folded", description: "First line second line third line", argumentHint: "[file] [flag]" },
  );

  // Literal (| and |-) block scalars strip common leading indent rather than flattening every line.
  assert.deepEqual(
    parseFrontmatter(
      [
        "---",
        "description: |",
        "  Step 1",
        "    nested detail",
        "",
        "  Step 2",
        "",
        "argument-hint: |-",
        "    indented first",
        "  less indented",
        "---",
      ].join("\n"),
    ),
    {
      name: "",
      description: "Step 1\n  nested detail\n\nStep 2",
      argumentHint: "  indented first\nless indented",
    },
  );

  // ---foo inside frontmatter values must not prematurely close frontmatter.
  assert.deepEqual(
    parseFrontmatter(
      [
        "---",
        "name: before-dash",
        "extra: |",
        "  ok",
        "---foo",
        "description: after-dash",
        "---",
        "# Body",
      ].join("\n"),
    ),
    { name: "before-dash", description: "after-dash", argumentHint: "" },
  );

  // UTF-8 BOM and CRLF line endings.
  assert.deepEqual(
    parseFrontmatter("\uFEFF---\r\nname: bom-crlf\r\ndescription: Works\r\nargument-hint: \"[x]\"\r\n---\r\nBody\r\n"),
    { name: "bom-crlf", description: "Works", argumentHint: "[x]" },
  );

  // Unclosed frontmatter yields empty fields.
  assert.deepEqual(parseFrontmatter("---\nname: unclosed\n"), { name: "", description: "", argumentHint: "" });
});

test("stripFrontmatter removes standard, empty, BOM, and CRLF frontmatter without prematurely closing on ---foo", () => {
  assert.equal(stripFrontmatter("---\n---\nBody\n"), "Body\n");
  assert.equal(stripFrontmatter("---\n---"), "");
  assert.equal(stripFrontmatter("\uFEFF---\r\nname: x\r\n---\r\n\r\n# Title\r\n"), "# Title\n");
  assert.equal(stripFrontmatter("---\nnote: ok\n---foo\ndescription: kept\n---\n\nBody\n"), "Body\n");
  assert.equal(stripFrontmatter("\uFEFF# No frontmatter\r\n\r\n---\r\n"), "# No frontmatter\n\n---\n");
  assert.equal(stripFrontmatter("---\nname: unclosed\nBody"), "---\nname: unclosed\nBody");
});

test("firstHeading ignores fenced code comments and strips inline formatting, HTML, entities, and ATX markers", () => {
  assert.equal(firstHeading("```bash\n# comment\n```\n\n# Real Title\n"), "Real Title");
  assert.equal(firstHeading("~~~\n# comment\n~~~\n\n## Subheading\n\n# Main Title\n"), "Main Title");
  assert.equal(firstHeading("````md\n```\n# nested\n```\n````\n\n# After 4-backtick\n"), "After 4-backtick");
  assert.equal(firstHeading("```sh\n# only a comment\n```\n\n## Not an H1\n"), null);
  assert.equal(firstHeading("---\nname: x\n---\n```\n# code\n```\n\n# `pi-foo`\n"), "pi-foo");
  assert.equal(firstHeading("# `pi-foo` ##\n"), "pi-foo");
  assert.equal(firstHeading("# **Bold** *and* ~~old~~ [Link](https://example.com)\n"), "Bold and old Link");
  assert.equal(firstHeading("# <span>Styled</span> Heading <!-- note -->\n"), "Styled Heading");
  assert.equal(firstHeading("# Heading #   \n"), "Heading");
  assert.equal(firstHeading("# `foo #`\n"), "foo #");
  assert.equal(firstHeading("# C#\n"), "C#");
  assert.equal(
    firstHeading("# A &amp; B &lt;tag&gt; &quot;q&quot; &apos;s&apos; &#39;t&#39;&nbsp;end\n"),
    `A & B <tag> "q" 's' 't' end`,
  );
  assert.equal(firstHeading("Setext Title\n============\n"), "Setext Title");
  assert.equal(firstHeading("#   \n"), null);
  assert.equal(firstHeading("# ###\n"), null);
});

test("renderMarkdownCopy skips code blocks and multi-backtick spans while rewriting inline and reference links", () => {
  const pageUrls = new Set(["/extensions/alpha/", "/guides/guide/", "/guides/my-doc/"]);
  const rewrite = (href) => {
    const [bare, hash] = href.split("#");
    const suffix = hash === undefined ? "" : `#${hash}`;
    if (bare === "./alpha.md") return `/extensions/alpha/${suffix}`;
    if (bare === "./guide.md") return `/guides/guide/${suffix}`;
    if (bare === "./my doc.md") return `/guides/my-doc/${suffix}`;
    if (bare === "./foo(1)/bar.md") return `/guides/guide/${suffix}`;
    return href;
  };

  const md = [
    "---",
    "description: Ignored frontmatter",
    "---",
    "#\tTitle With Tab",
    "",
    "Inline [alpha](./alpha.md) and [fragment](./guide.md#install) and [local](#top).",
    "Angle [my doc](<./my doc.md#sec>) and parens [wiki](https://en.wikipedia.org/wiki/Foo_(bar)) and [nested](./foo(1)/bar.md#p(2)).",
    "Code-labeled [`pi-alpha`](./alpha.md) is rewritten, while `[skip](./alpha.md)` and ``[skip2](./alpha.md)`` and ``use `[skip3](./alpha.md)` here`` are not.",
    "`inline` [not-a-def]: ./alpha.md",
    "",
    "```md",
    "[in-fence](./alpha.md)",
    "[ref-in-fence]: ./alpha.md",
    "```",
    "",
    "- List item",
    "  ```md",
    "  [in-list-fence](./alpha.md)",
    "  ```",
    "",
    "````md",
    "```",
    "[nested-3](./alpha.md)",
    "```",
    "[still-in-4](./alpha.md)",
    "````",
    "",
    "~~~md",
    "```",
    "[inside-tilde](./alpha.md)",
    "```",
    "[also-in-tilde](./alpha.md)",
    "~~~",
    "",
    "[ref-alpha]: ./alpha.md#sec",
    '  [ref-doc]: <./my doc.md#top> "My Doc"',
    "[ref-ext]: https://example.com/path_(1)",
    "[^fn]: ./alpha.md",
    "[Note]: Read carefully",
    "",
  ].join("\n");

  const actual = renderMarkdownCopy(md, "Fallback", rewrite, pageUrls);
  const expected = [
    "#\tTitle With Tab",
    "",
    "Inline [alpha](/extensions/alpha/index.md) and [fragment](/guides/guide/index.md#install) and [local](#top).",
    "Angle [my doc](</guides/my-doc/index.md#sec>) and parens [wiki](https://en.wikipedia.org/wiki/Foo_(bar)) and [nested](/guides/guide/index.md#p(2)).",
    "Code-labeled [`pi-alpha`](/extensions/alpha/index.md) is rewritten, while `[skip](./alpha.md)` and ``[skip2](./alpha.md)`` and ``use `[skip3](./alpha.md)` here`` are not.",
    "`inline` [not-a-def]: ./alpha.md",
    "",
    "```md",
    "[in-fence](./alpha.md)",
    "[ref-in-fence]: ./alpha.md",
    "```",
    "",
    "- List item",
    "  ```md",
    "  [in-list-fence](./alpha.md)",
    "  ```",
    "",
    "````md",
    "```",
    "[nested-3](./alpha.md)",
    "```",
    "[still-in-4](./alpha.md)",
    "````",
    "",
    "~~~md",
    "```",
    "[inside-tilde](./alpha.md)",
    "```",
    "[also-in-tilde](./alpha.md)",
    "~~~",
    "",
    "[ref-alpha]: /extensions/alpha/index.md#sec",
    '  [ref-doc]: </guides/my-doc/index.md#top> "My Doc"',
    "[ref-ext]: https://example.com/path_(1)",
    "[^fn]: ./alpha.md",
    "[Note]: Read carefully",
    "",
  ].join("\n");

  assert.equal(actual, expected);

  // Prepends # title only when body does not begin with an H1 matching /^#\s+/.
  assert.equal(
    renderMarkdownCopy("## Subheading\n\nSee [a](./alpha.md).\n", "Prompt Title", rewrite, pageUrls),
    "# Prompt Title\n\n## Subheading\n\nSee [a](/extensions/alpha/index.md).\n",
  );
  assert.equal(
    renderMarkdownCopy("#hashtag start\n", "Prompt Title", rewrite, pageUrls),
    "# Prompt Title\n\n#hashtag start\n",
  );
});

test("checkLlmsCoverage passes when covered and throws descriptive errors for missing copies or entries", () => {
  const model = {
    description: "Test collection",
    gettingStarted: { url: "/getting-started/", label: "Getting started", title: "Getting started", description: "Start" },
    extensions: [{ url: "/extensions/alpha/", label: "pi-alpha", title: "pi-alpha", description: "Alpha" }],
    guides: [],
    prompts: [],
    skills: [],
    pages: [
      { url: "/getting-started/", label: "Getting started", title: "Getting started", description: "Start" },
      { url: "/extensions/alpha/", label: "pi-alpha", title: "pi-alpha", description: "Alpha" },
    ],
  };

  const llmsTxt = renderLlmsTxt(model);
  const written = new Set(model.pages.map((p) => markdownOut(p.url)));
  assert.doesNotThrow(() => checkLlmsCoverage(model, llmsTxt, written));

  assert.throws(
    () => checkLlmsCoverage(model, llmsTxt, new Set(["getting-started/index.md"])),
    /llms\.txt coverage:\n\/extensions\/alpha\/: no Markdown copy/,
  );

  const incompleteTxt = `- [Getting started](${SITE_URL}${markdownUrl("/getting-started/")})`;
  assert.throws(
    () => checkLlmsCoverage(model, incompleteTxt, written),
    /llms\.txt coverage:\n\/extensions\/alpha\/: missing from llms\.txt/,
  );

  assert.throws(
    () => checkLlmsCoverage(model, "", new Set()),
    (err) => {
      assert.match(err.message, /\/getting-started\/: no Markdown copy/);
      assert.match(err.message, /\/getting-started\/: missing from llms\.txt/);
      assert.match(err.message, /\/extensions\/alpha\/: no Markdown copy/);
      assert.match(err.message, /\/extensions\/alpha\/: missing from llms\.txt/);
      return true;
    },
  );
});
