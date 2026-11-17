import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["skill-select", "footer"],
  workspace: "greet",
  env: { PI_SKILL_LIBRARY: "demo-skills" },
  files: {
    ...base,
    "demo-skills/greeting-check/SKILL.md": "---\nname: greeting-check\ndescription: Check greeting CLI output and flags against the README example.\n---\n\nCompare the README with the command line output.\n",
  },
  steps: [],
};
