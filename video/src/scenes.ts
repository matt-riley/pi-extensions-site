import buildCues from "../public/clips/build.cues.json";
import doneGateCues from "../public/clips/done-gate.cues.json";
import doneGateHidden from "../public/clips/done-gate.hidden.json";
import guardrailCues from "../public/clips/guardrail.cues.json";
import planCues from "../public/clips/plan.cues.json";
import reviewCues from "../public/clips/review.cues.json";
import shipCues from "../public/clips/ship.cues.json";

// A highlight is a rectangle in the clip's own pixels (1600x900, as the tapes render it).
// Rectangles were read off each clip's contact sheet (scripts/sheet.mjs); re-check them when a
// scene's script or tape changes, since the transcript layout moves with it.
export type Rect = { x: number; y: number; w: number; h: number };
/** A running tally chip beside the window (shot 5's run counter); chips accumulate. */
export type Chip = { text: string; ok: boolean };
export type Beat = {
  cue: string;
  /** `code` in backticks renders in mono. */
  caption: string;
  label?: string;
  highlight?: Rect;
  /** Seconds the highlight stays, when its target leaves the screen before the next cue. */
  hold?: number;
  chip?: Chip;
};
/** A card beside the terminal from cue `from` to cue `to`, for a message only the model saw. */
export type Aside = {
  from: string;
  to: string;
  kicker: string;
  title: string;
  body: string;
  note: string;
};
export type Clip = {
  src: string;
  /** Seconds of the recording to skip (cues stay in recording time). */
  start?: number;
  aside?: Aside;
  width: number;
  height: number;
  title: string;
  duration: number;
  cues: Record<string, number>;
  beats: Beat[];
};
type Cues = { duration: number; cues: Record<string, number> };

const clip = (
  name: string,
  { duration, cues }: Cues,
  beats: Beat[],
  extra: Partial<Clip> = {},
): Clip => ({
  ...extra,
  src: `clips/${name}.mp4`,
  width: 1600,
  height: 900,
  title: "pi — greet",
  duration,
  cues,
  beats,
});

// Shot 1 (cold open): starts a second before the dialog, so the first thing seen is the stop.
export const guardrail = clip(
  "guardrail",
  guardrailCues,
  [
  { cue: "prompt", caption: "You ask for a fix, and a push." },
  { cue: "working", caption: "Asked to fix a typo and push, the agent gets as far as the push." },
  {
    cue: "dialog",
    label: "pi-guardrail",
    caption: "A force push leaves your machine, so it waits for you.",
    highlight: { x: 28, y: 398, w: 1112, h: 352 },
  },
  { cue: "deny", caption: "You deny it. Nothing is pushed." },
  {
    cue: "summary",
    label: "pi-emphasis",
    caption: "You said no. It says so.",
    highlight: { x: 28, y: 580, w: 1544, h: 170 },
  },
  ],
  { start: guardrailCues.cues.dialog - 1.5 },
);

// Shot 4.
export const plan = clip("plan", planCues, [
  { cue: "prompt", caption: "Start with a plan, not an edit." },
  {
    cue: "planning",
    label: "pi-plan-mode",
    caption: "Read-only until you approve. Edits are refused, not just discouraged.",
    highlight: { x: 1130, y: 840, w: 150, h: 36 },
  },
  {
    cue: "question",
    caption: "Decisions that are yours get asked, not assumed.",
    highlight: { x: 28, y: 540, w: 1544, h: 250 },
    hold: 3,
  },
  {
    cue: "plan",
    caption: "The plan says how it will be checked, or plan-mode refuses it.",
    highlight: { x: 28, y: 410, w: 1544, h: 320 },
    hold: 4.5,
  },
  {
    cue: "approve",
    caption: "You approve. Now it can edit.",
    highlight: { x: 924, y: 134, w: 640, h: 120 },
  },
]);

// Shot 5.
export const build = clip("build", buildCues, [
  { cue: "prompt", caption: "Give it a finish line it can't argue with." },
  {
    cue: "kickoff",
    label: "pi-until",
    caption: "It can't stop until `npm test` exits 0.",
  },
  {
    cue: "red",
    caption: "It said done. The test says otherwise, so it goes back.",
    highlight: { x: 28, y: 52, w: 1100, h: 180 },
    chip: { text: "run 1  npm test", ok: false },
  },
  {
    cue: "green",
    caption: "Done means the check passed, not that the agent felt finished.",
    highlight: { x: 926, y: 56, w: 636, h: 84 },
    chip: { text: "run 2  npm test", ok: true },
  },
]);

// Shot 6. The aside's body is the reminder this take really sent (scenes/done-gate.mjs `capture`).
export const doneGate = clip(
  "done-gate",
  doneGateCues,
  [
    { cue: "prompt", caption: "One more small change." },
    {
      cue: "done",
      label: "pi-done-gate",
      caption: "It said 'done' with an unchecked edit. You never see the reminder. The model does.",
      highlight: { x: 28, y: 326, w: 520, h: 44 },
    },
    {
      cue: "verified",
      caption: "So it runs the repo's own verify recipe, which reaches the new file.",
      highlight: { x: 28, y: 380, w: 1544, h: 320 },
    },
    {
      cue: "summary",
      caption: "Now 'done' comes with the check that proves it.",
      highlight: { x: 28, y: 660, w: 1544, h: 110 },
    },
  ],
  {
    aside: {
      from: "done",
      to: "verified",
      kicker: "pi-done-gate",
      title: "What the model sees",
      body: doneGateHidden.text,
      note: "Captured from this take's request to the model. It never appears in your transcript.",
    },
  },
);

// Shot 7.
export const review = clip("review", reviewCues, [
  { cue: "prompt", caption: "Review the change before it ships." },
  {
    cue: "repro",
    label: "implementation-review",
    caption: "It runs the CLI instead of trusting the unit test.",
  },
  {
    cue: "finding",
    caption: "One defect, pinned to a line, with the command that shows it.",
    highlight: { x: 28, y: 440, w: 1544, h: 330 },
    hold: 3.8,
  },
  {
    cue: "passed",
    caption: "Fixed, and proven with the same command.",
    highlight: { x: 28, y: 650, w: 1544, h: 100 },
  },
]);

// Shot 8.
export const ship = clip("ship", shipCues, [
  { cue: "prompt", caption: "Ship it." },
  { cue: "checks", caption: "Check again, commit only the named files, push once." },
  {
    cue: "dialog",
    label: "pi-guardrail",
    caption: "A normal push still asks. Once. You say yes.",
    highlight: { x: 28, y: 400, w: 1100, h: 400 },
  },
  {
    cue: "approve",
    caption: "Pushed to origin.",
    highlight: { x: 28, y: 500, w: 1544, h: 180 },
    hold: 1.2,
  },
  {
    cue: "report",
    label: "pi-emphasis",
    caption: "Passed locally is not passed on CI, and it says so.",
    highlight: { x: 28, y: 575, w: 1544, h: 180 },
  },
]);
