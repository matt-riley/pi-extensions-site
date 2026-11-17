// The video's running order as data: each shot's length in frames and its narration line. Root.tsx
// draws from it, and scripts/captions.ts reads it to time the narration captions, so the two can
// never disagree. No JSX or Remotion imports, so Node can run it directly (type stripping).
import voDurations from "../public/vo/durations.json" with { type: "json" };
import { RING_SECONDS } from "./guards.ts";
import { build, doneGate, guardrail, plan, review, ship, type Clip } from "./scenes.ts";
import { FPS } from "./theme.ts";

export const sec = (s: number) => Math.round(s * FPS);

// Narration starts a beat after its shot does, and a shot is never shorter than its line plus a
// short tail.
export const VO_LEAD = 0.4;
const VO_TAIL = 0.6;

export type Vo = keyof typeof voDurations;
export type ShotKind = "clip" | "title" | "loop" | "ring" | "close";
export type Shot = { kind: ShotKind; frames: number; vo: Vo; clip?: Clip };

export const voiceFrames = (seconds: number) => sec(VO_LEAD + seconds + VO_TAIL);
export const clipFrames = (clip: Clip) => Math.ceil((clip.duration - (clip.start ?? 0) + 0.5) * FPS);
export const motionFrames = (seconds: number, narrationSeconds: number) =>
  Math.max(sec(seconds), narrationSeconds > 0 ? voiceFrames(narrationSeconds) : 0);

const clipShot = (clip: Clip, vo: Vo): Shot => {
  const frames = clipFrames(clip);
  if (voiceFrames(voDurations[vo]) > frames) {
    // A recorded clip cannot be stretched: shorten the line or lengthen the tape instead.
    throw new Error(`voice-over "${vo}" is longer than its clip ${clip.src}`);
  }
  return { kind: "clip", frames, vo, clip };
};
const motionShot = (kind: ShotKind, seconds: number, vo: Vo): Shot => ({
  kind,
  frames: motionFrames(seconds, voDurations[vo]),
  vo,
});

/** The storyboard's running order (STORYBOARD.md). */
export const SHOTS: Shot[] = [
  clipShot(guardrail, "cold-open"), // 1
  motionShot("title", 4.5, "title"), // 2
  motionShot("loop", 10.5, "loop"), // 3
  clipShot(plan, "plan"), // 4
  clipShot(build, "build"), // 5
  clipShot(doneGate, "done-gate"), // 6
  clipShot(review, "review"), // 7
  clipShot(ship, "ship"), // 8
  motionShot("ring", RING_SECONDS, "ring"), // 9
  motionShot("close", 5, "close"), // 10
];

export const TOTAL_FRAMES = SHOTS.reduce((sum, shot) => sum + shot.frames, 0);

/** When each narration line plays, in seconds from the start of the video. */
export function narration() {
  let frame = 0;
  return SHOTS.map((shot) => {
    const start = frame / FPS + VO_LEAD;
    frame += shot.frames;
    return { vo: shot.vo, start, end: start + voDurations[shot.vo] };
  });
}
