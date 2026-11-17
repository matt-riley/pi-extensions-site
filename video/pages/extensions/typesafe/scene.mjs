import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["typesafe", "footer", "emphasis"],
  workspace: "greet",
  files: base,
  systemOne: {
    covers_flag: { type: "noul", noul: 0.93 },
    covers_default: { type: "noul", noul: 0.14 },
  },
  steps: [
    { think: 850, tools: [["typesafe_ask", {
      state: { command: "node cli.js --shout Ada" },
      questions: {
        covers_flag: { type: "noul", instructions: "Does the command pass the shout flag?" },
        covers_default: { type: "noul", instructions: "Does the command exercise the default greeting without arguments?" },
      },
    }]] },
    { think: 800, text: "[[Unverified]] Try running both command variants before claiming the greeting works." },
  ],
};
