import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { theme } from "./theme";

/** Paper title card: a rust rule draws in, then the title and line rise into place. */
export function TitleCard({
  kicker,
  title,
  line,
  mono = false,
  note,
}: {
  kicker: string;
  title: string;
  line: string;
  mono?: boolean;
  /** A small line at the foot of the card. */
  note?: string;
}) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const rise = spring({ frame, fps, config: { damping: 200 } });
  const rule = interpolate(frame, [0, 18], [0, 160], { extrapolateRight: "clamp" });
  const out = interpolate(frame, [durationInFrames - 10, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        background: theme.paper,
        justifyContent: "center",
        padding: "0 200px",
        fontFamily: theme.sans,
        opacity: out,
      }}
    >
      <div
        style={{
          font: `600 30px ${theme.mono}`,
          color: theme.rust,
          letterSpacing: 1,
          opacity: rise,
        }}
      >
        {kicker}
      </div>
      <div style={{ height: 4, width: rule, background: theme.rust, margin: "28px 0 36px" }} />
      <div
        style={{
          fontFamily: mono ? theme.mono : theme.sans,
          fontSize: mono ? 66 : 92,
          fontWeight: 700,
          whiteSpace: mono ? "nowrap" : "normal",
          maxWidth: 1520,
          textWrap: "balance",
          color: theme.ink,
          letterSpacing: mono ? -1 : -2,
          transform: `translateY(${(1 - rise) * 40}px)`,
          opacity: rise,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 44,
          color: theme.muted,
          marginTop: 24,
          maxWidth: 1300,
          lineHeight: 1.3,
          transform: `translateY(${(1 - rise) * 60}px)`,
          opacity: rise,
        }}
      >
        {line}
      </div>
      {note ? (
        <div
          style={{
            position: "absolute",
            left: 200,
            bottom: 90,
            fontSize: 26,
            color: theme.muted,
            opacity: rise,
          }}
        >
          {note}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
