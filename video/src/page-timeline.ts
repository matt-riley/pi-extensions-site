import type { Aside, Beat, Clip } from "./scenes.ts";
import { clipFrames, motionFrames, voiceFrames } from "./timeline.ts";

export type PageDefinition = {
  title: string;
  line: string;
  terminalTitle: string;
  beats: Beat[];
  aside?: Omit<Aside, "body">;
  takeaway: { title: string; line: string };
};

type Voice = { src: string; seconds: number };
export type Recording = {
  duration: number;
  cues: Record<string, number>;
  hidden?: string;
  voice: Partial<Record<"title" | "scene" | "takeaway", Voice>>;
};

export type Props = {
  pagePath: string;
  page: PageDefinition;
  recording?: Recording;
};

export const SCRIPTED_NOTE =
  "Recorded in real pi with the collection loaded. The model's replies are scripted, so every take is the same.";

export function pageTimeline({ pagePath, page, recording }: Props & { recording: Recording }) {
  for (const cue of [...page.beats.map((beat) => beat.cue), ...(page.aside ? [page.aside.from, page.aside.to] : [])]) {
    if (!Object.hasOwn(recording.cues, cue)) throw new Error(`${pagePath}: missing tape cue "${cue}"`);
  }
  if (page.aside && !recording.hidden) throw new Error(`${pagePath}: the scene did not capture its aside`);
  const clip: Clip = {
    src: `pages/${pagePath}/scene.mp4`,
    width: 1600,
    height: 900,
    title: page.terminalTitle,
    duration: recording.duration,
    cues: recording.cues,
    beats: page.beats,
    aside: page.aside && recording.hidden ? { ...page.aside, body: recording.hidden } : undefined,
  };
  const scene = clipFrames(clip);
  if (recording.voice.scene && voiceFrames(recording.voice.scene.seconds) > scene) {
    throw new Error(`${pagePath}: narration is longer than its recorded scene. Shorten the line or lengthen the tape.`);
  }
  return {
    clip,
    title: motionFrames(7, recording.voice.title?.seconds ?? 0),
    scene,
    takeaway: motionFrames(7, recording.voice.takeaway?.seconds ?? 0),
  };
}
