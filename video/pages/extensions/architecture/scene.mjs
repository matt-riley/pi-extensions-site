import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["architecture", "footer", "emphasis"],
  workspace: "greet",
  files: {
    ...base,
    "core/greeting.js": 'import { prefix } from "../cli/flags.js";\nexport const greeting = (name) => prefix + name;\n',
    "cli/flags.js": 'export const prefix = "Hello, ";\n',
    ".pi/architecture.json": JSON.stringify({
      version: 1,
      rules: [{ name: "core-is-independent", from: "core/**", forbid: ["cli/**"],
        reason: "The command-line layer can depend on the core." }],
    }, null, 2) + "\n",
  },
  steps: [],
};
