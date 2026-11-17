import { base, built, source } from "../../../scenes/greet.mjs";
import { bash, reply, repro, tool } from "../../../scenes/prompt-demo.mjs";

const check = "sh check-cli.sh --shout Ada";
export default {
  extensions: ["footer", "emphasis"],
  prompts: true,
  workspace: "greet",
  files: { ...base, ...built, ...repro },
  steps: [
    bash(check, 850),
    bash("nl -ba cli.js", 2250),
    tool("write", { path: "cli.js", content: source.cliFixed }, 2200),
    bash(check, 3300),
    reply("**Cause:** the flag was treated as the first positional argument.\n\n"
      + "**Verified locally:** the same command now prints `HELLO, ADA!`."),
  ],
};
