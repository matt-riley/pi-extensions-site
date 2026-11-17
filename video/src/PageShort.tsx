import { Audio, Sequence, Series, getStaticFiles, staticFile, useVideoConfig } from "remotion";
import { TitleCard } from "./Cards";
import { Terminal } from "./Terminal";
import { sec, VO_LEAD } from "./timeline";
import { pageTimeline, SCRIPTED_NOTE, type Props, type Recording } from "./page-timeline";

export async function pageShortMetadata({ props, abortSignal }: { props: Props; abortSignal: AbortSignal }) {
  const source = `pages/${props.pagePath}/recording.json`;
  if (!getStaticFiles().some((file) => file.name === source)) return { durationInFrames: sec(7) };
  const response = await fetch(staticFile(source), { signal: abortSignal });
  if (!response.ok) throw new Error(`Cannot load ${source}: HTTP ${response.status}`);
  const recording: Recording = await response.json();
  const { title, scene, takeaway } = pageTimeline({ ...props, recording });
  return { durationInFrames: title + scene + takeaway, props: { ...props, recording } };
}

function Narration({ voice }: { voice?: Recording["voice"]["title"] }) {
  const { fps } = useVideoConfig();
  return voice ? (
    <Sequence from={Math.round(VO_LEAD * fps)} premountFor={fps}>
      <Audio src={staticFile(voice.src)} />
    </Sequence>
  ) : null;
}

export function PageShort({ pagePath, page, recording }: Props) {
  const { fps } = useVideoConfig();
  if (!recording) {
    return <TitleCard kicker="pi-extensions" title={page.title} line={`Run npm run page -- ${pagePath} to record this scene.`} />;
  }
  const { clip, title, scene, takeaway } = pageTimeline({ pagePath, page, recording });
  return (
    <Series>
      <Series.Sequence name="Title" durationInFrames={title} premountFor={fps}>
        <TitleCard kicker="pi-extensions" title={page.title} line={page.line} note={SCRIPTED_NOTE} />
        <Narration voice={recording.voice.title} />
      </Series.Sequence>
      <Series.Sequence name="Terminal demo" durationInFrames={scene} premountFor={fps}>
        <Terminal clip={clip} frames={scene} />
        <Narration voice={recording.voice.scene} />
      </Series.Sequence>
      <Series.Sequence name="Takeaway" durationInFrames={takeaway} premountFor={fps}>
        <TitleCard kicker="pi-extensions.mattriley.tools" title={page.takeaway.title} line={page.takeaway.line} />
        <Narration voice={recording.voice.takeaway} />
      </Series.Sequence>
    </Series>
  );
}
