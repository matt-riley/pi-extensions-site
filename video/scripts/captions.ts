// Write the narration as WebVTT captions: web/intro.en.vtt. Timing comes from src/timeline.ts,
// the same timeline Root.tsx renders, and the words from vo/script.json (`text`, not the
// respelled `spoken`). A long line is split at sentence and clause breaks into cues of at most two
// 42-character rows, each given time in proportion to its length.
//
//   node scripts/captions.ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { narration } from "../src/timeline.ts";

const MAX = 84;
const root = path.resolve(import.meta.dirname, "..");
const script = JSON.parse(readFileSync(path.join(root, "vo/script.json"), "utf8"));
const textOf = new Map<string, string>(script.lines.map((l: any) => [l.shot, l.text]));

/** Sentences, then clauses, then words: pieces no longer than MAX, in order. */
function chunks(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.match(/[^.!?]+[.!?]+\s*/g) ?? [text]) {
    let current = "";
    for (const clause of sentence.match(/[^,:;]+[,:;]?\s*/g) ?? [sentence]) {
      if ((current + clause).trim().length > MAX && current) {
        out.push(current.trim());
        current = "";
      }
      current += clause;
    }
    if (current.trim()) out.push(current.trim());
  }
  // Join short neighbours back together, so cues are not one or two words long.
  const merged: string[] = [];
  for (const piece of out) {
    const last = merged.at(-1);
    if (last && (last + " " + piece).length <= MAX && (last.length < 30 || piece.length < 30)) {
      merged[merged.length - 1] = last + " " + piece;
    } else merged.push(piece);
  }
  return merged;
}

/** At most two rows, broken at the space nearest the middle. */
function rows(piece: string): string {
  if (piece.length <= 42) return piece;
  const mid = piece.length / 2;
  let best = -1;
  for (let i = 0; i < piece.length; i++) {
    if (piece[i] === " " && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  return best < 0 ? piece : piece.slice(0, best) + "\n" + piece.slice(best + 1);
}

const stamp = (t: number) => {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
};

const cues: string[] = [];
for (const { vo, start, end } of narration()) {
  const text = textOf.get(vo);
  if (!text) throw new Error(`no narration text for ${vo} in vo/script.json`);
  const pieces = chunks(text);
  const total = pieces.reduce((sum, p) => sum + p.length, 0);
  let t = start;
  for (const piece of pieces) {
    const next = t + ((end - start) * piece.length) / total;
    cues.push(`${stamp(t)} --> ${stamp(next)}\n${rows(piece)}`);
    t = next;
  }
}

mkdirSync(path.join(root, "web"), { recursive: true });
const file = path.join(root, "web/intro.en.vtt");
writeFileSync(file, "WEBVTT\n\n" + cues.map((cue, i) => `${i + 1}\n${cue}`).join("\n\n") + "\n");
console.log(`${path.relative(root, file)}: ${cues.length} cues`);
