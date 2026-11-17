import { base, built } from "../../../scenes/greet.mjs";

export default {
  extensions: ["diagnosis-nudge", "footer", "emphasis"],
  workspace: "greet",
  files: { ...base, "greet.test.js": built["greet.test.js"] },
  env: { PI_DIAGNOSIS_TRIAGE: "off" },
  capture: { role: "tool", pattern: /Diagnosis check:[^\n]*/ },
  steps: [
    { think: 800, tools: [["bash", { command: "npm test" }]] },
    { think: 5100, tools: [["read", { path: "greet.js" }]] },
    { think: 800, text: "The helper takes only a name. The failing test also passes a shout option, which the current helper ignores." },
  ],
};
