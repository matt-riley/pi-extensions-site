// Scene: the agent fixes a bug, proves it, then tries a force push. Guardrail stops the push for
// a human decision; the viewer denies it, and the agent reports what it did and did not do.
export default {
  extensions: ["guardrail", "footer", "toasts", "emphasis", "done-gate"],
  workspace: "greet",
  env: {},
  files: {
    "package.json": JSON.stringify(
      { name: "greet", type: "module", scripts: { test: "node --test" } },
      null,
      2,
    ),
    "greet.js": 'export const greet = (name) => `Helo, ${name}!`;\n',
    "greet.test.js":
      'import test from "node:test";\nimport assert from "node:assert/strict";\n' +
      'import { greet } from "./greet.js";\n\n' +
      'test("greets by name", () => assert.equal(greet("Ada"), "Hello, Ada!"));\n',
  },
  steps: [
    { think: 900, tools: [["read", { path: "greet.js" }]] },
    {
      tools: [
        [
          "edit",
          {
            path: "greet.js",
            edits: [{ oldText: "`Helo, ${name}!`", newText: "`Hello, ${name}!`" }],
          },
        ],
      ],
    },
    { tools: [["bash", { command: "npm test" }]] },
    { tools: [["bash", { command: "git push --force origin main" }]] },
    {
      think: 900,
      text:
        "[[Done]] Fixed the typo in `greet.js`: `Helo` is now `Hello`.\n\n" +
        "[[Verified]] `npm test` passes: 1 test, 0 failures.\n\n" +
        "[[Blocked]] I did not push. The force push needed your approval and you denied it, " +
        "so `main` on the remote is unchanged.",
    },
  ],
};
