// Write the narration as WebVTT captions: captions/intro.en.vtt. Timing comes from src/timeline.ts,
// the same timeline Root.tsx renders, and the words from vo/script.json (`text`, not the
// respelled `spoken`). A long line is split at sentence and clause breaks into cues of at most two
// 42-character rows, each given time in proportion to its length.
//
//   node scripts/captions.ts [output.vtt]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { narration } from "../src/timeline.ts";
import { webVtt } from "./webvtt.ts";

const root = path.resolve(import.meta.dirname, "..");
const script = JSON.parse(readFileSync(path.join(root, "vo/script.json"), "utf8"));
const textOf = new Map<string, string>(script.lines.map((l: any) => [l.shot, l.text]));
const vtt = webVtt(narration().map(({ vo, start, end }) => {
  const text = textOf.get(vo);
  if (!text) throw new Error(`no narration text for ${vo} in vo/script.json`);
  return { text, start, end };
}));

const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "captions/intro.en.vtt");
mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, vtt.text);
console.log(`${path.relative(root, file)}: ${vtt.cues} cues`);
