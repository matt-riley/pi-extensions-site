// The guard ring (shot 9): who lights up, their one line, and the timing the animation and the
// shot length (src/timeline.ts) both use.
export const GUARDS = [
  { name: "guardrail", line: "Risky commands wait for you." },
  { name: "done-gate", line: "No “done” without a check." },
  { name: "diagnosis-nudge", line: "Same check fails twice? Edits pause until it looks again." },
  { name: "drift", line: "You edited a file? The agent re-reads it." },
  { name: "deslop", line: "Prose it writes gets checked for filler." },
  { name: "router", line: "Hard tasks go to a stronger model." },
];
export const RING_FIRST = 0.8; // seconds before the first guard lights
export const RING_STEP = 2; // seconds per guard
export const RING_HOLD = 3.2; // seconds on the finale, all lit
export const RING_SECONDS = RING_FIRST + GUARDS.length * RING_STEP + RING_HOLD;
