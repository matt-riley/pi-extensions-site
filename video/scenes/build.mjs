// Shot 5: /until npm test drives the approved plan. The agent claims done with greet.js still
// untouched; until reruns npm test, it fails, and the agent is sent back until it exits 0.
import { base, plan, source } from "./greet.mjs";

export default {
  extensions: ["until", "footer", "toasts", "emphasis"],
  workspace: "greet",
  files: { ...base, ".pi/PLAN.md": plan },
  steps: [
    { think: 800, tools: [["read", { path: ".pi/PLAN.md" }]] },
    {
      think: 1000,
      tools: [
        ["write", { path: "greet.test.js", content: source.testShout }],
        ["write", { path: "cli.js", content: source.cliBuggy }],
      ],
    },
    { think: 700, text: "[[Done]] Added the `--shout` test and flag." },
    // until's check failed and its output came back as a message; now the real fix.
    { think: 2600, tools: [["write", { path: "greet.js", content: source.greetShout }]] },
    { think: 700, text: "[[Fixed]] `greet` now takes the `shout` option." },
  ],
};
