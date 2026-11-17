// Shot 8: /ship verifies, commits named paths, and pushes to a real (local, bare) origin.
// Guardrail asks before the push, as it did for the force push in shot 1; this time you approve.
import { base, fixed } from "./greet.mjs";

// The commit hash is reproducible because scenes/run.mjs pins git's identity and dates.
// If the fixture or message changes, rerun the scene and update it from `git log`.
const SHA = "9ebb23a";

export default {
  extensions: ["guardrail", "footer", "toasts", "emphasis"],
  prompts: true,
  remote: "bare",
  workspace: "greet",
  files: base,
  dirty: fixed,
  steps: [
    { think: 900, tools: [["bash", { command: "npm test" }]] },
    { think: 600, tools: [["bash", { command: "node cli.js --shout Ada" }]] },
    {
      think: 800,
      tools: [
        [
          "bash",
          {
            command:
              'git add greet.js cli.js greet.test.js && git commit -m "feat(cli): add --shout flag"',
          },
        ],
      ],
    },
    { think: 700, tools: [["bash", { command: "git push origin main" }]] },
    {
      think: 900,
      text:
        "[[Passed locally]] `npm test`: 2 tests, 0 failures. `node cli.js --shout Ada` prints " +
        "`HELLO, ADA!`.\n\n" +
        `[[Shipped]] \`${SHA} feat(cli): add --shout flag\` pushed to \`origin/main\`.\n\n` +
        "[[Unverified]] Hosted CI: none is configured for this repository, so nothing remote " +
        "has checked this commit.",
    },
  ],
};
