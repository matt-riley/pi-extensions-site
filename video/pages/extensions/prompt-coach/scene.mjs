import { base, built } from "../../../scenes/greet.mjs";

export default {
  extensions: ["prompt-coach", "decision-rows", "footer"],
  workspace: "greet",
  files: { ...base, ...built },
  rewrite: "Reproduce the wrong name with `node cli.js --shout Ada`. Trace how `cli.js` chooses the name, fix that path, and rerun the same command.",
  systemOne: { intent_preserved: { type: "noul", noul: 0.96 } },
  steps: [],
};
