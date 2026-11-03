#!/usr/bin/env node
// Acceptance check for this docs-only rewrite; run against the separate source checkout.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.argv[2];
const base = process.argv[3];
assert.ok(root && base, "usage: node .pi/verify/content-scope.mjs <source-checkout> <base-ref>");
const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
const changed = git("diff", "--name-only", base).trim().split("\n");
assert.equal(changed.length, 46, "expected root docs/metadata, 20 extension pairs and four guides");
assert.equal(changed.filter((file) => /^packages\/[^/]+\/README\.md$/.test(file)).length, 20);
assert.equal(changed.filter((file) => /^docs\/[^/]+\.md$/.test(file)).length, 4);
let descriptions = 0;
for (const file of changed) {
  assert.ok(file === "README.md" || file === "package.json" ||
    /^packages\/[^/]+\/(README\.md|package\.json)$/.test(file) ||
    /^docs\/[^/]+\.md$/.test(file), `unexpected change: ${file}`);
  if (!file.endsWith("package.json")) continue;
  const before = JSON.parse(git("show", base + ":" + file));
  const after = JSON.parse(readFileSync(path.join(root, file), "utf8"));
  assert.notEqual(after.description, before.description, file);
  assert.ok(after.description.length > 0, file);
  before.description = after.description;
  assert.deepEqual(after, before, `non-description metadata changed: ${file}`);
  descriptions += 1;
}
assert.equal(descriptions, 21);
git("diff", "--exit-code", base, "--", "prompts", ".agents", "AGENTS.md", "package-lock.json");
assert.equal(git("ls-files", "--others", "--exclude-standard").trim(), "", "unexpected source files");
console.log("Passed: 20 extension READMEs, four guides and 21 descriptions updated; operational resources and other metadata unchanged.");
