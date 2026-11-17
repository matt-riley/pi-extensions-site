import { writeFile } from "node:fs/promises";
import path from "node:path";
import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["drift", "footer", "emphasis"],
  workspace: "greet",
  files: base,
  capture: { role: "system", pattern: /# Changed outside this session\n[^\n]+\n[^\n]+/ },
  steps: [
    { think: 700, tools: [["read", { path: "greet.js" }]] },
    {
      think: 750,
      text: "The helper currently formats its greeting as Hello, followed by the name.",
      afterReply: (cwd) => writeFile(path.join(cwd, "greet.js"),
        "export const greet = (name) => `Welcome, ${name}!`;\n"),
    },
    { think: 4700, tools: [["read", { path: "greet.js" }]] },
    { think: 750, text: "It now says Welcome. I re-read the file after your edit." },
  ],
};
