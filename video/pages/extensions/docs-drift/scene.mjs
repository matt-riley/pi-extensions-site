import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["docs-drift", "footer", "emphasis"],
  workspace: "greet",
  files: { ...base, "docs/greeting.md": "# Greeting\n\nThe greeting helper lives in `greet.js` and prints Hello followed by the name.\n" },
  nextCommit: {
    message: "Update the greeting",
    files: { "greet.js": 'export const greet = (name) => `Welcome, ${name}!`;\n' },
  },
  steps: [],
};
