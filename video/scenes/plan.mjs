// Shot 4: /plan explores read-only, asks the one decision that is yours, writes the plan, and
// waits for /plan approve before any edit.
import { base, plan } from "./greet.mjs";

export default {
  extensions: ["plan-mode", "footer", "toasts", "emphasis"],
  workspace: "greet",
  files: base,
  steps: [
    { think: 900, tools: [["read", { path: "greet.js" }], ["read", { path: "cli.js" }]] },
    {
      think: 1000,
      tools: [
        [
          "plan_mode_question",
          {
            title: "Shout scope",
            question: "Should --shout capitalise the whole greeting, or only the name?",
            options: ["Whole greeting", "Only the name"],
            recommended: "Whole greeting",
          },
        ],
      ],
    },
    { think: 900, tools: [["plan_mode_complete", { plan }]] },
    // After /plan approve, plan-mode hands the plan back to the agent to implement.
    { think: 800, text: "Plan approved. Starting with a failing test for `--shout`." },
  ],
};
