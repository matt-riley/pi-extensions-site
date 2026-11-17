#!/usr/bin/env node
// Measure each voice-over line (public/vo/*.mp3) and write public/vo/durations.json, which
// Root.tsx reads so a shot is never shorter than its narration. Rerun after replacing a take.
import { execFileSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const dir = path.resolve(import.meta.dirname, "../public/vo");
const durations = {};
for (const file of readdirSync(dir).filter((f) => f.endsWith(".mp3")).sort()) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration",
    "-of", "csv=p=0", path.join(dir, file)], { encoding: "utf8" });
  durations[file.replace(/\.mp3$/, "")] = Math.round(Number(out) * 100) / 100;
}
writeFileSync(path.join(dir, "durations.json"), JSON.stringify(durations, null, 2) + "\n");
console.log(durations);
