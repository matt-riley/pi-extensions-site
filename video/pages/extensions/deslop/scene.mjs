import { base } from "../../../scenes/greet.mjs";

const draft = "# greet\n\nIt’s worth noting that the CLI greets you by name.\n";
const plain = "# greet\n\nThe CLI greets you by name.\n";

export default {
  extensions: ["deslop", "footer", "emphasis"],
  workspace: "greet",
  files: base,
  env: { PI_DESLOP_VERIFY: "0" },
  capture: { role: "tool", pattern: /deslop: the text this edit added[\s\S]*/ },
  steps: [
    { think: 900, tools: [["write", { path: "README.md", content: draft }]] },
    { think: 5100, tools: [["write", { path: "README.md", content: plain }]] },
    { think: 800, text: "The README now says what the command does in one sentence." },
  ],
};
