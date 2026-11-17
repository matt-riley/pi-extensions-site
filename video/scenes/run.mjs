#!/usr/bin/env node
// Run one recorded scene: a throwaway git workspace, a scripted local model and a real pi with
// the collection's extensions loaded. Nothing touches your pi config, sessions or credentials.
//
//   node scenes/run.mjs <scene>        (VHS calls this; see tapes/*.tape)
//
// PI_EXTENSIONS_DIR names the pi-extensions checkout to load (default: the installed clone).
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { appendFile, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const input = process.argv[2];
if (!input) throw new Error("usage: run.mjs <scene-name-or-page-folder>");
const pageFolder = input.includes("/") ? path.resolve(input) : null;
const name = pageFolder ? path.basename(pageFolder) : input;
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error(`invalid scene name: ${name}`);
const sceneFile = pageFolder ? path.join(pageFolder, "scene.mjs") : path.join(import.meta.dirname, `${name}.mjs`);
const scene = (await import(pathToFileURL(sceneFile).href)).default;

const root =
  process.env.PI_EXTENSIONS_DIR ?? path.join(homedir(), ".pi/agent/extensions/pi-extensions");
// A short, fixed path: guardrail prints the repository path in its dialog, on camera.
const fixture = path.join("/tmp/pi-video", name);
await rm(fixture, { recursive: true, force: true });
const cwd = path.join(fixture, scene.workspace ?? "app");
const agent = path.join(fixture, "agent");
await mkdir(cwd, { recursive: true });
await mkdir(path.join(agent, "bin"), { recursive: true });
// Offline pi warns on screen when it cannot find fd; reuse the copy your own pi downloaded.
const fd = path.join(homedir(), ".pi/agent/bin/fd");
if (existsSync(fd)) await symlink(fd, path.join(agent, "bin/fd"));
for (const [name, script] of Object.entries(scene.commands ?? {})) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) throw new Error(`invalid fixture command: ${name}`);
  await writeFile(path.join(agent, "bin", name), script, { mode: 0o755, flag: "wx" });
}

// Seed the workspace and commit it, so the scene starts from a clean tree.
for (const [file, content] of Object.entries(scene.files)) {
  await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
  await writeFile(path.join(cwd, file), content);
}
// Fixed identity and dates make every commit hash reproducible, so a scripted reply can name the
// SHA a real push produced (the ship shot does).
const GIT_ENV = {
  GIT_AUTHOR_NAME: "Demo",
  GIT_AUTHOR_EMAIL: "demo@example.invalid",
  GIT_COMMITTER_NAME: "Demo",
  GIT_COMMITTER_EMAIL: "demo@example.invalid",
  GIT_AUTHOR_DATE: "2026-11-17T09:00:00Z",
  GIT_COMMITTER_DATE: "2026-11-17T09:00:00Z",
};
const git = (...args) =>
  execFileSync("git", ["-C", cwd, "-c", "commit.gpgsign=false", ...args], { stdio: "ignore", env: { ...process.env, ...GIT_ENV } });
git("init", "-q", "-b", "main");
git("add", ".");
git("commit", "-qm", "init");
// remote: "bare" gives origin a local bare repository so a push really lands, offline.
if (scene.remote === "bare") {
  const bare = path.join(fixture, "remote.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare], { stdio: "ignore" });
  git("remote", "add", "origin", bare);
  git("push", "-q", "origin", "main");
} else {
  git("remote", "add", "origin", "https://example.invalid/demo/greet.git");
}
// dirty: files written after the commit, the uncommitted work a later shot picks up.
for (const [file, content] of Object.entries(scene.dirty ?? {})) {
  await mkdir(path.dirname(path.join(cwd, file)), { recursive: true });
  await writeFile(path.join(cwd, file), content);
}

// The scripted model: each request takes the next step. A step is either a list of tool calls or
// reply text, streamed in small chunks so it reads like a live model rather than appearing whole.
const steps = [...scene.steps];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// PI_VIDEO_LOG=<file> appends each request's last message, to prove a hidden guard (done-gate,
// drift) really reached the model in a take rather than being staged by the script.
let request = 0;
let captured = false;
const server = createServer(async (req, res) => {
  let body = "";
  req.setEncoding("utf8");
  for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body);
  if (req.url === "/v1/systemone" && scene.systemOne) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ model: payload.model, answers: scene.systemOne }));
    return;
  }
  const last = payload.messages?.at(-1);
  if (process.env.PI_VIDEO_LOG) {
    const text = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content);
    await appendFile(process.env.PI_VIDEO_LOG, `#${++request} ${last?.role}: ${text}\n`);
  }
  // Capture the whole last message or the matching excerpt from a specified role.
  if (scene.capture && !captured) {
    const capture = scene.capture instanceof RegExp ? { pattern: scene.capture } : scene.capture;
    const message = capture.role
      ? payload.messages?.findLast((entry) => entry.role === capture.role)
      : last;
    const text = [message?.content].flat().map((part) => part?.text ?? part ?? "").join("");
    const match = text.match(capture.pattern);
    if (match) {
      captured = true;
      const relative = pageFolder
        ? `public/pages/${path.basename(path.dirname(pageFolder))}/${name}/scene.hidden.json`
        : `public/clips/${name}.hidden.json`;
      const output = path.resolve(import.meta.dirname, "..", relative);
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify({ role: message.role, text: capture.role ? match[0] : text }, null, 2) + "\n");
    }
  }
  const step = steps.shift() ?? { text: "…" };
  await sleep(step.think ?? 700);
  res.writeHead(200, { "content-type": "text/event-stream" });
  const send = (delta, finish_reason = null) =>
    res.write(
      "data: " +
        JSON.stringify({
          id: "video",
          object: "chat.completion.chunk",
          created: 1,
          model: "demo",
          choices: [{ index: 0, delta, finish_reason }],
        }) +
        "\n\n",
    );
  if (step.tools) {
    const tool_calls = step.tools.map(([tool, args], index) => ({
      index,
      id: `call_${Date.now()}_${index}`,
      type: "function",
      function: { name: tool, arguments: JSON.stringify(args) },
    }));
    send({ role: "assistant", content: step.say ?? "", tool_calls });
    send({}, "tool_calls");
  } else {
    send({ role: "assistant", content: "" });
    for (const piece of step.text.match(/\S+\s*/g) ?? []) {
      send({ content: piece });
      await sleep(step.pace ?? 35);
    }
    send({}, "stop");
  }
  res.end("data: [DONE]\n\n");
  if (step.afterReply) {
    // Let Pi settle the turn before simulating an edit from outside the session.
    setTimeout(() => step.afterReply(cwd).catch((error) => console.error(error)), 1800).unref();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

await writeFile(
  path.join(agent, "models.json"),
  JSON.stringify({
    providers: {
      demo: {
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        api: "openai-completions",
        apiKey: "demo",
        models: [
          {
            id: "demo",
            name: "demo",
            input: ["text"],
            contextWindow: 200000,
            maxTokens: 4000,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          },
        ],
      },
    },
  }),
);
await writeFile(
  path.join(agent, "settings.json"),
  JSON.stringify({
    quietStartup: true,
    retry: { enabled: false },
    compaction: { enabled: false },
    ...(scene.toolSearch && { defaultTools: ["+tool_search"] }),
  }),
);

const pi = spawn(
  "pi",
  [
    "--offline",
    "--no-extensions",
    "--no-mcp",
    ...(scene.toolSearch ? ["-e", "builtin:tool-search"] : []),
    "--no-context-files",
    // prompts: true loads the collection's prompt templates and skills (/review, /ship, …).
    ...(scene.prompts
      ? ["--prompt-template", path.join(root, "prompts"), "--skill", path.join(root, ".agents/skills")]
      : ["--no-skills", "--no-prompt-templates"]),
    "--no-themes",
    "--provider",
    "demo",
    "--model",
    "demo",
    "--thinking",
    "off",
    ...scene.extensions.flatMap((pkg) => ["-e", path.join(root, "packages", pkg, "index.ts")]),
  ],
  {
    cwd,
    stdio: "inherit",
    env: {
      PATH: scene.commands
        ? [path.join(agent, "bin"), process.env.PATH].join(path.delimiter)
        : process.env.PATH,
      HOME: fixture,
      XDG_CONFIG_HOME: fixture,
      TERM: process.env.TERM ?? "xterm-256color",
      COLORTERM: "truecolor",
      PI_CODING_AGENT_DIR: agent,
      PI_CODING_AGENT_SESSION_DIR: path.join(fixture, "sessions"),
      PI_OFFLINE: "1",
      PI_TELEMETRY: "0",
      ...GIT_ENV,
      // npm's update banner and "npm notice" lines bury test output on camera.
      NPM_CONFIG_UPDATE_NOTIFIER: "false",
      NPM_CONFIG_LOGLEVEL: "warn",
      NPM_CONFIG_FUND: "false",
      ...scene.env,
      ...(scene.systemOne && {
        TYPESAFE_API_KEY: "fixture",
        TYPESAFE_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`,
        TYPESAFE_MODEL: "jev-1.13.0",
      }),
    },
  },
);
const code = await new Promise((resolve) => pi.once("exit", resolve));
server.close();
await rm(fixture, { recursive: true, force: true });
process.exit(code ?? 0);
