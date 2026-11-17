import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { base, built } from "../../../scenes/greet.mjs";
import { bash, reply, tool } from "../../../scenes/prompt-demo.mjs";

const sourceSkill = ".agents/skills/implementation-review/SKILL.md";
const skill = "demo-skills/implementation-review/SKILL.md";
const collection = process.env.PI_EXTENSIONS_DIR ?? path.join(homedir(), ".pi/agent/extensions/pi-extensions");

export default {
  extensions: ["skill-select", "footer", "emphasis"],
  prompts: true,
  workspace: "greet",
  files: { ...base, [skill]: readFileSync(path.join(collection, sourceSkill), "utf8") },
  env: { PI_SKILL_LIBRARY: "demo-skills", PI_SKILL_SELECT_TIEBREAK: "0" },
  dirty: built,
  staged: Object.keys(built),
  steps: [
    tool("skill_select", { query: "implementation-review", limit: 1 }, 800),
    tool("read", { path: skill }, 650),
    bash("git diff --cached -- cli.js", 2100),
    bash("node cli.js --shout Ada", 3100),
    reply("**[P2] Skip flags when choosing the name**\n\n"
      + "`cli.js:5` reads `process.argv[2]`. Running `node cli.js --shout Ada` "
      + "prints `HELLO, --SHOUT!` instead of `HELLO, ADA!`.\n\n"
      + "The staged diff is unchanged."),
  ],
};
