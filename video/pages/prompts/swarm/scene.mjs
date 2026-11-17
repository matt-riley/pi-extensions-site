import { base, fixed } from "../../../scenes/greet.mjs";
import { bash, childCall, childIds, fixtureHead, reply, repro, tool, toolOutputs } from "../../../scenes/prompt-demo.mjs";

const child = (task, args) => ({
  task,
  steps: [
    bash("sh check-cli.sh" + args, 1200),
    (messages) => toolOutputs(messages).at(-1)?.split("\n").includes("PASS")
      ? reply("PASS\nCommit: " + fixtureHead("swarm") + "\nThe CLI output matches the expected greeting.")
      : reply("ISSUES\nCommit: " + fixtureHead("swarm") + "\nThe CLI check did not pass."),
  ],
});
const plain = child("Check the default greeting for the plain slice.", "");
const shout = child("Run the missing shout slice with Ada.", " --shout Ada");
const report = (messages, missing) => {
  const ids = childIds(messages);
  return tool("swarm_report", {
    slices: [
      { id: ids[0], slice: "Plain greeting", required: true },
      { id: missing ? "missing" : ids[1], slice: "Shout greeting", required: true },
    ],
    expect_sha: fixtureHead("swarm"),
  }, 900);
};

export default {
  extensions: ["subagents", "footer", "emphasis"],
  toolSearch: true,
  prompts: true,
  capture: { role: "tool", pattern: /overall: INCOMPLETE\n- Plain greeting: PASS\n- Shout greeting: GAP[^\n]*/ },
  workspace: "greet",
  files: { ...base, ...fixed, ...repro },
  children: [plain, shout],
  steps: [
    tool("tool_search", { query: "swarm_report" }),
    { think: 750, tools: [childCall("worker", plain, "Check plain greeting", { isolation: "worktree" })] },
    (messages) => report(messages, true),
    { think: 1750, tools: [childCall("worker", shout, "Rerun missing shout slice", { isolation: "worktree" })] },
    (messages) => report(messages, false),
    (messages) => toolOutputs(messages).at(-1)?.startsWith("overall: PASS")
      ? reply("**PASS:** both required slices reported a passing check for `" + fixtureHead("swarm").slice(0, 12) + "`.")
      : reply("The required slices did not give a complete pass."),
  ],
};
