// Shot 7: /review reads the uncommitted --shout work and finds the bug the unit test cannot see:
// the CLI still reads the name from argv[2], which is the flag. Review does not edit; you ask
// for the fix, and the agent proves it with the same command that showed the bug.
import { base, built, source } from "./greet.mjs";

export default {
  extensions: ["footer", "toasts", "emphasis"],
  prompts: true,
  workspace: "greet",
  files: base,
  dirty: built,
  steps: [
    { think: 900, tools: [["bash", { command: "git diff --stat" }]] },
    { think: 800, tools: [["bash", { command: "node cli.js --shout Ada" }]] },
    {
      think: 900,
      text:
        "[[Broken]] `cli.js:5`: `node cli.js --shout Ada` prints `HELLO, --SHOUT!`. The name is " +
        "still read from `argv[2]`, which is the flag. The new test calls `greet()` directly, so " +
        "it never reaches this.\n\nNo other defects found in the diff.",
    },
    // "Fix it."
    { think: 900, tools: [["write", { path: "cli.js", content: source.cliFixed }]] },
    { think: 700, tools: [["bash", { command: "node cli.js --shout Ada" }]] },
    {
      think: 700,
      text:
        "[[Fixed]] `cli.js` drops `--shout` before reading the name.\n\n" +
        "[[Passed]] `node cli.js --shout Ada` prints `HELLO, ADA!`.",
    },
  ],
};
