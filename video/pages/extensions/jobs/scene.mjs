import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["jobs", "footer"],
  workspace: "greet",
  files: {
    ...base,
    "package.json": JSON.stringify({
      name: "greet",
      type: "module",
      scripts: { test: "sleep 8 && node --test" },
    }) + "\n",
  },
  steps: [],
};
