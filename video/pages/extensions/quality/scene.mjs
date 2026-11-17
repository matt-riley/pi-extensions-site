import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["quality", "footer", "emphasis"],
  workspace: "greet",
  files: { ...base, "unused.js": "export const defaultGreeting = 'Hello, world!';\n" },
  steps: [
    {
      think: 1600,
      text: "[[Investigate]] I’ll check how the suspected unused export is reached before changing it.\n\n" +
        "**Next:** Inspect the callers and the repository’s checks.",
    },
  ],
};
