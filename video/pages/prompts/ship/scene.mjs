import { base, fixed } from "../../../scenes/greet.mjs";
import { bash, fixtureHead, reply } from "../../../scenes/prompt-demo.mjs";

export default {
  extensions: ["footer", "emphasis"],
  prompts: true,
  remote: "bare",
  workspace: "greet",
  files: base,
  dirty: fixed,
  commands: {
    gh: [
      "#!/usr/bin/env node",
      'const { execFileSync } = require("node:child_process");',
      'const [run, list, arg, sha] = process.argv.slice(2);',
      'const pushed = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();',
      'if (run !== "run" || list !== "list" || arg !== "--commit" || sha !== pushed) process.exit(1);',
      'console.log("[CI fixture] Tests: success for " + sha.slice(0, 12));',
      "",
    ].join("\n"),
  },
  steps: [
    bash('npm test -- --test-reporter=dot && node cli.js --shout Ada', 900),
    bash('git add greet.js cli.js greet.test.js && git commit -m "feat(cli): add --shout"', 2300),
    bash("git push origin main", 2100),
    bash('gh run list --commit "$(git rev-parse HEAD)"', 3200),
    () => reply("**Passed locally:** both tests and `node cli.js --shout Ada`.\n\n"
      + "**Pushed:** `" + fixtureHead("ship").slice(0, 12) + "` to the local demo remote.\n\n"
      + "**CI fixture:** Tests succeeded for that SHA. This is sample hosted status."),
  ],
};
