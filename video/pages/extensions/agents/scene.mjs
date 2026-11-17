import { base } from "../../../scenes/greet.mjs";

const guide = "# Project instructions\n\nRun `npm test` at the repository root.\n\n" +
  "The CLI entry point is `cli.js`. The greeting helper is `greet.js`.\n";
export default {
  extensions: ["agents", "footer", "emphasis"],
  workspace: "greet",
  files: base,
  steps: [
    { think: 900, tools: [["read", { path: "package.json" }], ["read", { path: "README.md" }]] },
    { think: 1500, tools: [["write", { path: "AGENTS.md", content: guide }]] },
    { think: 800, text: "[[Done]] Added project instructions with the test command and the two entry points." },
  ],
};
