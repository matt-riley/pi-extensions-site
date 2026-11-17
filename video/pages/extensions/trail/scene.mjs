import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["trail", "footer", "emphasis"],
  toolSearch: true,
  workspace: "greet",
  files: base,
  steps: [
    { think: 700, tools: [["tool_search", { query: "decision_log" }]] },
    { think: 850, tools: [["decision_log", {
      phase: "plan", decision: "Keep the default greeting",
      why: "Existing example relies on it", evidence: "cli.js:4", result: "recorded",
    }]] },
    { think: 800, text: "[[Done]] The trail now records why the default greeting stays." },
  ],
};
