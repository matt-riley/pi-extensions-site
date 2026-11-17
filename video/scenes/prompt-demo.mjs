import { execFileSync } from "node:child_process";

export const tool = (name, args, think = 700) => ({ think, tools: [[name, args]] });
export const bash = (command, think) => tool("bash", { command }, think);
export const reply = (text, think = 800) => ({ think, text });
export const toolOutputs = (messages) => messages.filter(({ role }) => role === "tool").map(({ content }) => (
  Array.isArray(content) ? content.map((part) => part.text ?? "").join("") : content
));
export const worktrees = (messages) => toolOutputs(messages).flatMap((text) => (
  [...text.matchAll(/worktree: (\S+) \(branch/g)].map((match) => match[1])
));
export const childIds = (messages) => toolOutputs(messages).flatMap((text) => (
  [...text.matchAll(/^id: (\S+)$/gm)].map((match) => match[1])
));
export const fixtureHead = (slug) => execFileSync(
  "git", ["-C", "/tmp/pi-video/" + slug + "/greet", "rev-parse", "HEAD"], { encoding: "utf8" },
).trim();
export const childCall = (type, child, description, options = {}) => [
  "subagent", { agent: type, task: child.task, description, timeout_ms: 25000, ...options },
];
export const shell = (value) => "'" + value.replaceAll("'", "'\\''") + "'";

export const repro = {
  "check-cli.sh": [
    "#!/bin/sh",
    'actual=$(node cli.js "$@")',
    'expected="HELLO, ADA!"',
    'case "$#" in 0) expected="Hello, world!" ;; esac',
    'printf "Expected: %s\\nActual:   %s\\n" "$expected" "$actual"',
    'test "$actual" = "$expected" || exit 1',
    'printf "PASS\\n"',
    "",
  ].join("\n"),
};
