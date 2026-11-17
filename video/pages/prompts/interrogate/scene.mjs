import { base, built } from "../../../scenes/greet.mjs";
import { bash, childCall, reply, repro, tool, toolOutputs, worktrees } from "../../../scenes/prompt-demo.mjs";

const result = (title, command, required) => "```json\n" + JSON.stringify({ findings: [{ title, command, required }] }) + "\n```";
const a = {
  task: "Seat A: check the greeting when the shout flag comes first.",
  steps: [
    bash("sh check-cli.sh --shout Ada", 900),
    reply(result("Shout uses flag as name", "sh check-cli.sh --shout Ada", "Shout should greet Ada in capitals.")),
  ],
};
const b = {
  task: "Seat B: check the default greeting without a name.",
  steps: [
    bash("sh check-cli.sh", 1000),
    reply(result("Default greeting lost", "sh check-cli.sh", "An omitted name should greet world.")),
  ],
};

export default {
  extensions: ["subagents", "review", "footer", "emphasis"],
  toolSearch: true,
  prompts: true,
  workspace: "greet",
  files: { ...base, ...built, ...repro },
  children: [a, b],
  steps: [
    tool("tool_search", { query: "rerun_findings" }),
    { think: 850, tools: [
      childCall("adversary", a, "Seat A · shout input", { isolation: "worktree", model: "demo/demo" }),
      childCall("adversary", b, "Seat B · default input", { isolation: "worktree", model: "demo/demo" }),
    ] },
    (messages) => {
      const trees = worktrees(messages);
      const reports = toolOutputs(messages).flatMap((text) => (
        [...text.matchAll(/```json\s*\{\s*"findings"[\s\S]*?```/g)].map((match) => match[0])
      ));
      if (trees.length !== 2 || reports.length !== 2) return reply("The fixture did not produce both child reports.");
      return tool("rerun_findings", { reports: trees.map((cwd, index) => ({
        source: index === 0 ? "Scripted seat A" : "Scripted seat B", cwd, text: reports[index],
      })), timeout: 10 }, 1200);
    },
    reply("**Kept:** `sh check-cli.sh --shout Ada` produces `HELLO, --SHOUT!`. "
      + "That breaks the requirement to greet Ada in capitals.\n\n"
      + "**Dropped:** the default greeting passes on rerun."),
  ],
};
