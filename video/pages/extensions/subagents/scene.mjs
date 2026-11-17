import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["subagents", "footer", "emphasis"],
  workspace: "greet",
  files: base,
  child: {
    task: "Find which file prints the greeting for this fixture.",
    steps: [
      { think: 3300, tools: [["bash", { command: "grep -n console.log cli.js" }]] },
      { think: 800, text: "The greeting is printed in cli.js. The grep check found the call on line 4." },
    ],
  },
  steps: [
    { think: 800, tools: [["subagent", {
      agent: "scout", task: "Find which file prints the greeting for this fixture.",
      description: "Trace the greeting", timeout_ms: 25000,
      acceptance: [{ criterion: "The CLI prints the greeting", command: "grep -n console.log cli.js" }],
    }]] },
    { think: 800, text: "[[Observed]] The scout points to `cli.js`. The helper is in `greet.js`." },
  ],
};
