import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, test } from "vitest";
import sirv from "sirv";
import { build } from "../../scripts/build-site.mjs";

const run = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const cli = path.join(root, "node_modules/@antithesishq/bombadil/bin/bombadil.js");
const specification = path.join(root, "tests/bombadil/site.mjs");
let temporary, server, origin;

beforeAll(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), "pi-site-browser-"));
  await build({ out: temporary }); // Use content.lock, just like the production build.
  server = createServer(sirv(temporary));
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
}, 120_000);

afterAll(async () => {
  if (server?.listening) {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 375, 812]]) {
  test(`Bombadil explores the built site at ${name} size`, async () => {
    const output = path.join(root, "test-results/bombadil", name);
    try {
      const startPage = name === "mobile" ? "/prompts/upgrade/" : "/extensions/affected/";
      await run(process.execPath, [cli, "browser", "test", origin + startPage, specification,
        "--headless", "--exit-on-violation", "--time-limit", "30s",
        "--width", String(width), "--height", String(height),
        "--output-path", output, "--output-path-overwrite",
      ], { cwd: root, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    } catch (error) {
      throw new Error(`Bombadil ${name} failed. Inspect ${output}\n${error.stdout ?? ""}\n${error.stderr ?? ""}`, { cause: error });
    }
    // Require a recorded exploration, so a successful no-op cannot pass the suite.
    const trace = (await readFile(path.join(output, "trace.jsonl"), "utf8"))
      .trim().split("\n").map((line) => JSON.parse(line));
    expect(trace.some((record) => record.action !== null)).toBe(true);
    expect(trace.flatMap((record) => record.violations)).toEqual([]);
  }, 125_000);
}
