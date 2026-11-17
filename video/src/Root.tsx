import type { ReactNode } from "react";
import { Audio, Composition, Sequence, Series, staticFile } from "remotion";
import voDurations from "../public/vo/durations.json";
import { TitleCard } from "./Cards";
import { GuardRing, GUARDS, LoopIntro } from "./Loop";
import { build, doneGate, guardrail, plan, review, ship, type Clip } from "./scenes";
import { Terminal } from "./Terminal";
import { FPS } from "./theme";

const sec = (s: number) => Math.round(s * FPS);
const clipFrames = (clip: Clip) => Math.ceil((clip.duration - (clip.start ?? 0) + 0.5) * FPS);

// Narration (vo/script.json, voiced by ElevenLabs into public/vo/<shot>.mp3) starts a beat after
// its shot does, and a shot is never shorter than its line plus a short tail.
const VO_LEAD = 0.4;
const VO_TAIL = 0.6;
type Vo = keyof typeof voDurations;
type Shot = { frames: number; node: ReactNode; vo: Vo };
const fit = (frames: number, vo: Vo) =>
  Math.max(frames, sec(VO_LEAD + voDurations[vo] + VO_TAIL));

const clipShot = (clip: Clip, vo: Vo): Shot => {
  const frames = clipFrames(clip);
  if (sec(VO_LEAD + voDurations[vo] + VO_TAIL) > frames) {
    // A recorded clip cannot be stretched: shorten the line or lengthen the tape instead.
    throw new Error(`voice-over "${vo}" is longer than its clip ${clip.src}`);
  }
  return { frames, node: <Terminal clip={clip} frames={frames} />, vo };
};
const motionShot = (seconds: number, node: ReactNode, vo: Vo): Shot => ({
  frames: fit(sec(seconds), vo),
  node,
  vo,
});

// The storyboard's running order (STORYBOARD.md).
const SHOTS: Shot[] = [
  clipShot(guardrail, "cold-open"), // 1
  motionShot(
    4.5, // 2 title
    <TitleCard
      kicker="pi-extensions"
      title="Ship a feature without babysitting the agent"
      line="Five commands you type. A handful of guards you don't."
      note="Recorded in real pi with the collection loaded. The model's replies are scripted, so every take is the same."
    />,
    "title",
  ),
  motionShot(10.5, <LoopIntro />, "loop"), // 3
  clipShot(plan, "plan"), // 4
  clipShot(build, "build"), // 5
  clipShot(doneGate, "done-gate"), // 6
  clipShot(review, "review"), // 7
  clipShot(ship, "ship"), // 8
  motionShot(0.8 + GUARDS.length * 2 + 3.2, <GuardRing />, "ring"), // 9
  motionShot(
    5, // 10 close
    <TitleCard
      kicker="pi-extensions.mattriley.tools"
      title="/plan → /workflow → /review → /ship"
      mono
      line="Clone it into ~/.pi/agent/extensions and run /reload."
    />,
    "close",
  ),
];

function Intro() {
  return (
    <Series>
      {SHOTS.map((s, i) => (
        <Series.Sequence key={i} durationInFrames={s.frames}>
          {s.node}
          <Sequence from={sec(VO_LEAD)}>
            <Audio src={staticFile(`vo/${s.vo}.mp3`)} />
          </Sequence>
        </Series.Sequence>
      ))}
    </Series>
  );
}

export function Root() {
  return (
    <Composition
      id="Intro"
      component={Intro}
      durationInFrames={SHOTS.reduce((sum, s) => sum + s.frames, 0)}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
}
