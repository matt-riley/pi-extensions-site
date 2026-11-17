#!/usr/bin/env node
// Contact sheet of a clip at each cue (+0.4s), in cue order, two per row (this ffmpeg has no
// drawtext, so frames are unlabelled), for checking cues against the recording:
//   node scripts/sheet.mjs <clip> <out.png>
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [clip, out] = process.argv.slice(2);
const src = path.resolve(import.meta.dirname, "../public/clips", `${clip}.mp4`);
const { cues } = JSON.parse(readFileSync(src.replace(/\.mp4$/, ".cues.json"), "utf8"));
const dir = mkdtempSync(path.join(tmpdir(), "sheet-"));
const frames = Object.values(cues).map((t, i) => {
  const file = path.join(dir, `${i}.png`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(t + 0.4), "-i", src, "-frames:v", "1",
    "-vf", "scale=800:-1", file]);
  return file;
});
while (frames.length % 2) frames.push(frames[0]);
const inputs = frames.flatMap((f) => ["-i", f]);
const rows = [];
for (let i = 0; i < frames.length; i += 2) rows.push(`[${i}][${i + 1}]hstack[r${i}]`);
const filter = rows.join(";") + ";" + rows.map((_, i) => `[r${i * 2}]`).join("") + `vstack=${rows.length}`;
execFileSync("ffmpeg", ["-v", "error", "-y", ...inputs, "-filter_complex", rows.length > 1 ? filter : rows[0].replace(/\[r0\]$/, ""), out]);
rmSync(dir, { recursive: true });
console.log(out);
