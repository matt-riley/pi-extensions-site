import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Aside, Beat, Chip, Clip } from "./scenes";
import { theme } from "./theme";

const FULL_W = 1440; // the clip's width inside the window frame
const NARROW_W = 1080; // while an aside card is on screen
const BAR = 44;

/** Seconds into the recording: the trimmed start plus the time this sequence has played. */
function useClipTime(clip: Clip) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps + (clip.start ?? 0);
}

/** 0 → 1 as the aside opens at its `from` cue, back to 0 as it closes at `to`. */
function useAside(clip: Clip) {
  const { fps } = useVideoConfig();
  const t = useClipTime(clip);
  if (!clip.aside) return 0;
  const from = clip.cues[clip.aside.from];
  const to = clip.cues[clip.aside.to];
  const open = spring({ frame: Math.round((t - from) * fps), fps, config: { damping: 200 } });
  const close = spring({ frame: Math.round((t - to) * fps), fps, config: { damping: 200 } });
  return Math.max(0, open - close);
}

/** The recorded clip in a window frame, with captions, highlights and an aside driven by cues. */
export function Terminal({ clip, frames }: { clip: Clip; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = useClipTime(clip);
  const aside = useAside(clip);
  const at = (beat: Beat) => clip.cues[beat.cue] ?? Infinity;
  const width = interpolate(aside, [0, 1], [FULL_W, NARROW_W]);
  const left = interpolate(aside, [0, 1], [(1920 - FULL_W) / 2, 60]);
  const scale = width / clip.width;
  const height = clip.height * scale;

  const enter = spring({ frame, fps, config: { damping: 200 } });
  // Fade out over the last third of a second, so shots dissolve instead of cutting.
  const exit = interpolate(frame, [frames - 10, frames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const chips = clip.beats.filter((beat) => beat.chip && at(beat) <= t);
  const current = [...clip.beats].reverse().find((beat) => at(beat) <= t);
  const cam = camera(clip, t, fps, left, scale, aside);

  return (
    <AbsoluteFill style={{ background: theme.night, fontFamily: theme.sans, opacity: exit }}>
      <AbsoluteFill style={{ transformOrigin: cam.origin, transform: cam.transform }}>
      <div
        style={{
          position: "absolute",
          left,
          top: 40,
          width,
          borderRadius: 14,
          overflow: "hidden",
          border: `1px solid ${theme.termBorder}`,
          boxShadow: "0 30px 80px -20px rgb(0 0 0 / 0.7)",
          transform: `translateY(${(1 - enter) * 60}px) scale(${0.96 + enter * 0.04})`,
          opacity: enter,
        }}
      >
        <div
          style={{
            height: BAR,
            background: "#1a1d22",
            display: "flex",
            alignItems: "center",
            padding: "0 18px",
            gap: 9,
          }}
        >
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c }} />
          ))}
          <div
            style={{
              flex: 1,
              textAlign: "center",
              color: theme.termMuted,
              font: `500 18px ${theme.mono}`,
              marginRight: 60,
            }}
          >
            {clip.title}
          </div>
        </div>
        <div style={{ position: "relative", height, background: theme.term }}>
          <OffthreadVideo
            src={staticFile(clip.src)}
            trimBefore={Math.round((clip.start ?? 0) * fps)}
            style={{ width, height, display: "block" }}
          />
          {clip.beats.map((beat) =>
            beat.highlight ? (
              <Highlight
                key={beat.cue}
                beat={beat}
                t={t}
                start={at(beat)}
                next={Math.min(nextCue(clip, beat), at(beat) + (beat.hold ?? Infinity))}
                scale={scale}
              />
            ) : null,
          )}
        </div>
      </div>
      </AbsoluteFill>
      {clip.aside ? <AsideCard aside={clip.aside} open={aside} /> : null}
      <Chips chips={chips.map((beat) => ({ chip: beat.chip!, start: at(beat) }))} t={t} />
      <Caption beat={current} start={current ? at(current) : 0} t={t} />
    </AbsoluteFill>
  );
}

const MAX_ZOOM = 1.35;

/**
 * Push in toward the active highlight, so the line being explained is readable at small sizes:
 * up to MAX_ZOOM, the region's centre panned to the middle of the frame above the caption. The
 * camera stays out while an aside card is open, since the window is narrowed for it.
 */
function camera(clip: Clip, t: number, fps: number, left: number, scale: number, aside: number) {
  const win = { left, right: left + clip.width * scale, top: 40, bottom: 40 + BAR + clip.height * scale };
  const still = { origin: "50% 50%", transform: "none" };
  for (const beat of clip.beats) {
    const r = beat.highlight;
    const start = clip.cues[beat.cue];
    if (!r || start === undefined) continue;
    const end = Math.min(nextCue(clip, beat), start + (beat.hold ?? Infinity));
    if (t < start || t > end) continue;
    const push = spring({ frame: Math.round((t - start) * fps), fps, config: { damping: 200 } });
    const pull = interpolate(t, [end - 0.5, end], [1, 0], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const p = Math.min(push, pull) * (1 - aside);
    const zoom = Math.max(1, Math.min(MAX_ZOOM, 1500 / (r.w * scale), 700 / (r.h * scale)));
    const cx = left + (r.x + r.w / 2) * scale;
    const cy = 40 + BAR + (r.y + r.h / 2) * scale;
    // Pan toward the centre, but never so far that the zoomed window uncovers background it
    // covered at rest: a target near an edge zooms in place instead of dragging the window off.
    const grow = zoom - 1;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const dx = clamp(960 - cx, -(win.right - cx) * grow, (cx - win.left) * grow);
    const dy = clamp(470 - cy, -(win.bottom - cy) * grow, (cy - win.top) * grow);
    return {
      origin: `${cx}px ${cy}px`,
      transform: `translate(${dx * p}px, ${dy * p}px) scale(${1 + grow * p})`,
    };
  }
  return still;
}

function nextCue(clip: Clip, beat: Beat) {
  const i = clip.beats.indexOf(beat);
  const next = clip.beats[i + 1];
  return next ? (clip.cues[next.cue] ?? clip.duration) : clip.duration + 10;
}

/** An amber box that draws around the region for the length of its beat, dimming the rest. */
function Highlight({
  beat,
  t,
  start,
  next,
  scale,
}: {
  beat: Beat;
  t: number;
  start: number;
  next: number;
  scale: number;
}) {
  const { fps } = useVideoConfig();
  if (t < start || t > next) return null;
  const grow = spring({
    frame: Math.round((t - start) * fps),
    fps,
    config: { damping: 18, stiffness: 140 },
  });
  const fade = interpolate(t, [next - 0.3, next], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const r = beat.highlight!;
  const pad = 8;
  return (
    <div
      style={{
        position: "absolute",
        left: r.x * scale - pad,
        top: r.y * scale - pad,
        width: r.w * scale + pad * 2,
        height: r.h * scale + pad * 2,
        border: `3px solid ${theme.amber}`,
        borderRadius: 10,
        boxShadow: `0 0 0 4000px rgb(12 13 15 / ${0.45 * grow * fade}), 0 0 30px rgb(255 176 0 / 0.35)`,
        transform: `scale(${1.04 - grow * 0.04})`,
        opacity: Math.min(grow, fade),
      }}
    />
  );
}

/**
 * A paper card beside the terminal for what the terminal cannot show: a message that went to
 * the model only. Its text comes from the take itself (scenes/run.mjs `capture`).
 */
function AsideCard({ aside, open }: { aside: Aside; open: number }) {
  if (open <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 1180,
        top: 70,
        width: 680,
        padding: "34px 38px",
        borderRadius: 14,
        background: theme.paper,
        color: theme.ink,
        boxShadow: "0 30px 80px -20px rgb(0 0 0 / 0.8)",
        opacity: open,
        transform: `translateX(${(1 - open) * 120}px)`,
      }}
    >
      <div style={{ font: `600 22px ${theme.mono}`, color: theme.rust, letterSpacing: 1 }}>
        {aside.kicker}
      </div>
      <div style={{ height: 3, width: 90, background: theme.rust, margin: "16px 0 22px" }} />
      <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1, marginBottom: 22 }}>
        {aside.title}
      </div>
      <div
        style={{
          font: `400 21px/1.5 ${theme.mono}`,
          color: theme.ink,
          background: theme.paperSoft,
          borderLeft: `4px solid ${theme.rust}`,
          padding: "18px 20px",
          borderRadius: 6,
        }}
      >
        {aside.body}
      </div>
      <div style={{ fontSize: 20, color: theme.muted, marginTop: 18 }}>{aside.note}</div>
    </div>
  );
}

/** The caption strip under the window; each beat slides its line in. */
function Caption({ beat, start, t }: { beat?: Beat; start: number; t: number }) {
  const { fps } = useVideoConfig();
  if (!beat) return null;
  const show = spring({ frame: Math.round((t - start) * fps), fps, config: { damping: 200 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 34,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 22,
        opacity: show,
        transform: `translateY(${(1 - show) * 20}px)`,
      }}
    >
      {beat.label ? (
        <div
          style={{
            font: `600 26px ${theme.mono}`,
            color: theme.night,
            background: theme.amber,
            padding: "8px 16px",
            borderRadius: 8,
          }}
        >
          {beat.label}
        </div>
      ) : null}
      <div
        style={{
          fontSize: 38,
          color: theme.termFg,
          fontWeight: 500,
          // A backdrop, since a zoomed window can run under the caption.
          background: "rgb(12 13 15 / 0.88)",
          padding: "6px 18px",
          borderRadius: 10,
        }}
      >
        <Text text={beat.caption} />
      </div>
    </div>
  );
}

/** Caption text with `code` spans drawn in mono, the way the transcript draws them. */
function Text({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, i) =>
        i % 2 ? (
          <span
            key={i}
            style={{
              fontFamily: theme.mono,
              fontSize: "0.9em",
              color: theme.amber,
              background: "rgb(255 176 0 / 0.1)",
              padding: "2px 10px",
              borderRadius: 6,
            }}
          >
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** Run-counter chips under the window's right edge; each pops in at its cue and stays. */
function Chips({ chips, t }: { chips: { chip: Chip; start: number }[]; t: number }) {
  const { fps } = useVideoConfig();
  if (chips.length === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: (1920 - FULL_W) / 2,
        top: 40 + BAR + (FULL_W / 1600) * 900 + 18,
        display: "flex",
        gap: 14,
      }}
    >
      {chips.map(({ chip, start }) => {
        const pop = spring({
          frame: Math.round((t - start) * fps),
          fps,
          config: { damping: 14, stiffness: 160 },
        });
        const tone = chip.ok ? "#9bd17a" : "#ff6b5b";
        return (
          <div
            key={chip.text}
            style={{
              font: `600 24px ${theme.mono}`,
              color: tone,
              border: `2px solid ${tone}`,
              background: "rgb(16 18 22 / 0.9)",
              borderRadius: 999,
              padding: "6px 18px",
              transform: `scale(${pop})`,
              whiteSpace: "pre",
            }}
          >
            {chip.ok ? "✓ " : "✗ "}
            {chip.text}
          </div>
        );
      })}
    </div>
  );
}
