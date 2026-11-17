import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["decision-rows", "typesafe", "footer"],
  workspace: "greet",
  files: base,
  env: { PI_DECISION_ROWS: "all" },
  systemOne: {
    covers_shout: { type: "noul", noul: 0.18 },
  },
  steps: [
    {
      think: 850,
      tools: [["typesafe_ask", {
        state: { proposedCheck: "node cli.js Ada", changedBehavior: "Uppercase greeting with --shout" },
        questions: {
          covers_shout: { type: "noul", instructions: "Would the proposed check exercise the changed behavior?" },
        },
      }]],
    },
    { think: 800, text: "Add `--shout` to the command to exercise the changed path." },
  ],
};
