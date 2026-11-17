import { base, built } from "../../../scenes/greet.mjs";

export default {
  extensions: ["router", "footer", "emphasis"],
  workspace: "greet",
  files: { ...base, ...built },
  env: { PI_ROUTER: "off" },
  capture: { role: "system", pattern: /## Playbook: bug fix\n\n[^\n]+\n\n1\.[^\n]+\n2\.[^\n]+/ },
  steps: [
    { think: 4800, tools: [["bash", { command: "node cli.js --shout Ada" }]] },
    { think: 850, text: "[[Observed]] The command prints `HELLO, --SHOUT!`. That gives us a reproduction." },
  ],
};
