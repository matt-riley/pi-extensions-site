import { base } from "../../../scenes/greet.mjs";
import { bash, childCall, reply, shell, worktrees } from "../../../scenes/prompt-demo.mjs";

const a = {
  task: "Seat A: write a straightforward parser for the greeting name.",
  steps: [
    bash("printf '%s\\n' " + shell('export const getName = (args) => args.find((arg) => arg !== "--shout") ?? "world";') + " > name.js", 950),
    reply("A uses one positional scan, but an empty argument stays empty."),
  ],
};
const b = {
  task: "Seat B: write a name parser that normalizes empty and padded names.",
  steps: [
    bash("printf '%s\\n' " + shell('export const normalize = (name) => name?.trim() || "world";') + " > normalize.js", 920),
    bash("printf '%s\\n' " + shell('import { normalize } from "./normalize.js";') + " "
      + shell('export const getName = (args) => normalize(args.filter((arg) => !arg.startsWith("--"))[0]);') + " > name.js"),
    reply("B trims names and defaults blanks, but introduces a separate normalization module."),
  ],
};
export default {
  extensions: ["subagents", "footer", "emphasis"],
  prompts: true,
  capture: { role: "tool", pattern: /RUBRIC \(scripted seats\)[\s\S]*?Base: A\. Carry over B’s trim and fallback\./ },
  workspace: "greet",
  files: base,
  children: [a, b],
  steps: [
    { ...reply(""), tools: [
      childCall("worker", a, "Seat A · simple parser", { isolation: "worktree", model: "demo/demo" }),
      childCall("worker", b, "Seat B · normalize blanks", { isolation: "worktree", model: "demo/demo" }),
    ] },
    (messages) => {
      const [first, second] = worktrees(messages);
      if (!first || !second) return reply("The fixture did not produce both worktrees.");
      return bash("test -f " + shell(first + "/name.js") + " && test -f " + shell(second + "/normalize.js")
        + " && printf '%s\\n' 'RUBRIC (scripted seats)' '                   A      B'"
        + " 'Small interface    yes    split' 'Blank name         no     yes'"
        + " 'Base: A. Carry over B’s trim and fallback.'", 1300);
    },
    bash("printf '%s\\n' " + shell('export const getName = (args) => args.find((arg) => arg !== "--shout")?.trim() || "world";') + " > name.js"
      + " && node --input-type=module -e "
      + shell('import assert from "node:assert/strict"; import { getName } from "./name.js"; assert.equal(getName(["--shout", " Ada "]), "Ada"); assert.equal(getName([" "]), "world"); console.log("PASS: flags, padded name, and blank fallback");'), 1600),
    reply("**Final choice:** A's small parser, with B's trim and blank-name fallback.\n\n"
       + "**Passed locally:** flags, padded names, and blank input."),
  ],
};
