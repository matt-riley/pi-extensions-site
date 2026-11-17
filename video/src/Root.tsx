import type { ReactNode } from "react";
import { Audio, Composition, Sequence, Series, staticFile } from "remotion";
import { TitleCard } from "./Cards";
import { GuardRing, LoopIntro } from "./Loop";
import { Terminal } from "./Terminal";
import { FPS } from "./theme";
import { SHOTS, TOTAL_FRAMES, VO_LEAD, sec, type Shot } from "./timeline.ts";

function draw(shot: Shot): ReactNode {
  switch (shot.kind) {
    case "clip":
      return <Terminal clip={shot.clip!} frames={shot.frames} />;
    case "title":
      return (
        <TitleCard
          kicker="pi-extensions"
          title="Ship a feature without babysitting the agent"
          line="Five commands you type. A handful of guards you don't."
          note="Recorded in real pi with the collection loaded. The model's replies are scripted, so every take is the same."
        />
      );
    case "loop":
      return <LoopIntro />;
    case "ring":
      return <GuardRing />;
    case "close":
      return (
        <TitleCard
          kicker="pi-extensions.mattriley.tools"
          title="/plan → /workflow → /review → /ship"
          mono
          line="Clone it into ~/.pi/agent/extensions and run /reload."
        />
      );
  }
}

// Each shot with its narration (vo/script.json, voiced by ElevenLabs into public/vo/<shot>.mp3).
function Intro() {
  return (
    <Series>
      {SHOTS.map((shot, i) => (
        <Series.Sequence key={i} durationInFrames={shot.frames}>
          {draw(shot)}
          <Sequence from={sec(VO_LEAD)}>
            <Audio src={staticFile(`vo/${shot.vo}.mp3`)} />
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
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
}
