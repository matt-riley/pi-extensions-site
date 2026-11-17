import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["code-search", "footer", "emphasis"],
  workspace: "greet",
  files: base,
  steps: [
    { think: 800, tools: [["find_definition", { symbol: "greet", fromFile: "cli.js" }]] },
    { think: 900, text: "The CLI imports `greet` from `greet.js`. The definition is at `greet.js:1`." },
  ],
};
