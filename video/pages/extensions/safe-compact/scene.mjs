import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["plan-mode", "safe-compact", "footer", "emphasis"],
  workspace: "greet",
  files: base,
  steps: [
    { think: 850, tools: [["read", { path: "greet.js" }]] },
    { think: 850, text: "The exported helper formats the greeting with the name it is given." },
  ],
};
