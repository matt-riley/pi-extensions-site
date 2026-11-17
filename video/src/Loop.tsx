import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";

// Shots 3 and 9 share one picture: the five commands you type in a row, and a ring of guards you
// don't type around them. Shot 3 draws it; shot 9 lights the guards one at a time.

const STATIONS = [
  { cmd: "/plan", word: "decide" },
  { cmd: "/workflow", word: "build" },
  { cmd: "/review", word: "check" },
  { cmd: "/ship", word: "push" },
  { cmd: "/retro", word: "remember" },
];
const SPACING = 330;
const ROW_Y = 470;
const xOf = (i: number) => 960 + (i - 2) * SPACING;

const RING = { x: 120, y: 290, w: 1680, h: 380, r: 190 };

export const GUARDS = [
  { name: "guardrail", line: "Risky commands wait for you." },
  { name: "done-gate", line: "No “done” without a check." },
  { name: "diagnosis-nudge", line: "Same check fails twice? Edits pause until it looks again." },
  { name: "drift", line: "You edited a file? The agent re-reads it." },
  { name: "deslop", line: "Prose it writes gets checked for filler." },
  { name: "router", line: "Hard tasks go to a stronger model." },
];
// Three guards sit on the ring's top edge, three on the bottom.
const guardAt = (i: number) => ({
  x: 960 + ((i % 3) - 1) * 520,
  y: i < 3 ? RING.y : RING.y + RING.h,
});

const s = (frame: number, fps: number, at: number, damping = 200) =>
  spring({ frame: frame - Math.round(at * fps), fps, config: { damping } });

function Row({ dim, frame, fps, drawn }: { dim: number; frame: number; fps: number; drawn: boolean }) {
  return (
    <>
      {STATIONS.slice(0, -1).map((_, i) => {
        const p = drawn ? 1 : s(frame, fps, 0.7 + i * 0.55);
        const x1 = xOf(i) + 130;
        const x2 = xOf(i + 1) - 130;
        return (
          <div
            key={`arrow-${i}`}
            style={{
              position: "absolute",
              left: x1,
              top: ROW_Y - 2,
              width: (x2 - x1) * p,
              height: 4,
              background: theme.amber,
              opacity: 0.8 * (1 - dim * 0.5),
            }}
          />
        );
      })}
      {STATIONS.map((station, i) => {
        const p = drawn ? 1 : s(frame, fps, 0.4 + i * 0.55);
        const word = drawn ? 1 : s(frame, fps, 3.4 + i * 0.25);
        return (
          <div
            key={station.cmd}
            style={{
              position: "absolute",
              left: xOf(i) - 125,
              top: ROW_Y - 40,
              width: 250,
              textAlign: "center",
              opacity: p * (1 - dim * 0.55),
              transform: `translateY(${(1 - p) * 30}px)`,
            }}
          >
            <div
              style={{
                font: `600 34px ${theme.mono}`,
                color: theme.termFg,
                background: "#1a1d22",
                border: `2px solid ${theme.termBorder}`,
                borderRadius: 12,
                padding: "16px 0",
              }}
            >
              {station.cmd}
            </div>
            <div
              style={{
                marginTop: 18,
                fontSize: 28,
                color: theme.termMuted,
                opacity: word,
                fontFamily: theme.sans,
              }}
            >
              {station.word}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Ring({ draw, solid }: { draw: number; solid: boolean }) {
  return (
    <svg width={1920} height={1080} style={{ position: "absolute", inset: 0 }}>
      <rect
        x={RING.x}
        y={RING.y}
        width={RING.w}
        height={RING.h}
        rx={RING.r}
        fill="none"
        stroke={theme.amber}
        strokeOpacity={solid ? 0.55 : 0.4}
        strokeWidth={3}
        pathLength={1}
        strokeDasharray={solid ? "1 0" : `${draw} 1`}
      />
      {solid ? null : (
        // Dashes drawn over the solid reveal, so the ring reads as "around", not a box.
        <rect
          x={RING.x}
          y={RING.y}
          width={RING.w}
          height={RING.h}
          rx={RING.r}
          fill="none"
          stroke={theme.night}
          strokeWidth={5}
          strokeDasharray="10 14"
        />
      )}
    </svg>
  );
}

function Caption({ label, text, show }: { label?: string; text: string; show: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 120,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 22,
        opacity: show,
        transform: `translateY(${(1 - show) * 20}px)`,
        fontFamily: theme.sans,
      }}
    >
      {label ? (
        <div
          style={{
            font: `600 30px ${theme.mono}`,
            color: theme.night,
            background: theme.amber,
            padding: "8px 18px",
            borderRadius: 8,
          }}
        >
          pi-{label}
        </div>
      ) : null}
      <div style={{ fontSize: 44, color: theme.termFg, fontWeight: 500 }}>{text}</div>
    </div>
  );
}

/** Shot 3: draw the loop, then the dashed ring of guards around it. */
export function LoopIntro() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const ring = interpolate(t, [5.6, 7.6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const label = s(frame, fps, 7.2);
  const second = t >= 5.6;
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: theme.night, opacity: out }}>
      <Ring draw={ring} solid={false} />
      <div
        style={{
          position: "absolute",
          left: RING.x + RING.r,
          top: RING.y - 22,
          padding: "0 14px",
          background: theme.night,
          font: `600 28px ${theme.mono}`,
          color: theme.amber,
          opacity: label,
        }}
      >
        guards
      </div>
      <Row dim={0} frame={frame} fps={fps} drawn={false} />
      <Caption
        key={second ? "b" : "a"}
        text={second ? "Underneath every step: guards you never call." : "One feature, start to finish."}
        show={s(frame, fps, second ? 5.8 : 0.3)}
      />
    </AbsoluteFill>
  );
}

/** Shot 9: the same picture with the ring solid; each guard lights up with its one line. */
export function GuardRing() {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const STEP = 2;
  const FIRST = 0.8;
  const active = Math.floor((t - FIRST) / STEP);
  const finale = active >= GUARDS.length;
  const enter = s(frame, fps, 0);
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  return (
    <AbsoluteFill style={{ background: theme.night, opacity: Math.min(enter, out) }}>
      <Ring draw={1} solid />
      <Row dim={1} frame={frame} fps={fps} drawn />
      {GUARDS.map((guard, i) => {
        const { x, y } = guardAt(i);
        const lit = s(frame, fps, FIRST + i * STEP, 16);
        const isActive = i === active || finale;
        return (
          <div
            key={guard.name}
            style={{
              position: "absolute",
              left: x - 150,
              top: y - 28,
              width: 300,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                font: `600 28px ${theme.mono}`,
                padding: "10px 20px",
                borderRadius: 10,
                background: isActive ? theme.amber : theme.night,
                color: isActive ? theme.night : t >= FIRST + i * STEP ? theme.amber : theme.termMuted,
                border: `2px solid ${t >= FIRST + i * STEP ? theme.amber : theme.termBorder}`,
                transform: `scale(${1 + (isActive && !finale ? 0.08 * lit : 0)})`,
                boxShadow: isActive ? "0 0 40px rgb(255 176 0 / 0.45)" : "none",
              }}
            >
              {guard.name}
            </div>
          </div>
        );
      })}
      {finale ? (
        <Caption
          key="finale"
          text="You never call these. They're on for every step."
          show={s(frame, fps, FIRST + GUARDS.length * STEP)}
        />
      ) : active >= 0 ? (
        <Caption
          key={GUARDS[active].name}
          label={GUARDS[active].name}
          text={GUARDS[active].line}
          show={s(frame, fps, FIRST + active * STEP)}
        />
      ) : null}
    </AbsoluteFill>
  );
}
