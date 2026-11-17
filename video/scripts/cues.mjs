#!/usr/bin/env node
// Turn `# cue: <id>` markers in each tape into seconds of recorded video, written next to the clip
// as <clip>.cues.json. Time counts only while the tape is shown: Sleep, typing at TypingSpeed, and
// one TypingSpeed tick per key press, which is how VHS paces them.
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dir = path.resolve(import.meta.dirname, "..");
const seconds = (value) => {
  const match = /^([\d.]+)(ms|s|m)?$/.exec(value);
  if (!match) throw new Error(`cannot read duration ${value}`);
  return Number(match[1]) * { ms: 0.001, s: 1, m: 60 }[match[2] ?? "s"];
};
const KEYS = /^(Enter|Down|Up|Left|Right|Tab|Space|Backspace|Escape|Ctrl\+\w)(?:\s+(\d+))?$/;

export async function writeCues(file) {
  let output;
  let typing = 0.05;
  let shown = true;
  let t = 0;
  const cues = {};
  for (const raw of (await readFile(path.resolve(dir, file), "utf8")).split("\n")) {
    const line = raw.trim();
    const cue = /^#\s*cue:\s*(\S+)/.exec(line);
    if (cue) cues[cue[1]] = Math.round(t * 100) / 100;
    if (!line || line.startsWith("#")) continue;
    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(" ");
    if (cmd === "Output") output = arg;
    else if (cmd === "Set" && rest[0] === "TypingSpeed") typing = seconds(rest[1]);
    else if (cmd === "Hide") shown = false;
    else if (cmd === "Show") shown = true;
    else if (!shown) continue;
    else if (cmd === "Sleep") t += seconds(arg);
    else if (cmd === "Type") t += JSON.parse(arg).length * typing;
    else if (KEYS.test(line)) t += Number(KEYS.exec(line)[2] ?? 1) * typing;
  }
  if (!output) throw new Error(`${file} has no Output line`);
  const target = path.join(dir, output.replace(/\.\w+$/, ".cues.json"));
  await writeFile(target, JSON.stringify({ duration: Math.round(t * 100) / 100, cues }, null, 2) + "\n");
  console.log(`${path.relative(dir, target)}: ${Object.keys(cues).join(", ")}`);
  return { duration: Math.round(t * 100) / 100, cues };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const files = process.argv.slice(2);
  for (const file of files.length ? files : (await readdir(path.join(dir, "tapes")))
    .filter((name) => name.endsWith(".tape")).map((name) => `tapes/${name}`)) {
    await writeCues(file);
  }
}
