# Storyboard: "Shipping a feature with pi-extensions"

**Viewer:** someone who uses pi (or a similar coding agent) and is deciding whether to install the
collection. **Promise:** five commands carry a feature from idea to pushed branch, while guards
you never call catch the agent's mistakes. **Length:** about 3 minutes planned; the current cut runs 2:16, 1920x1080, 30 fps, burned-in
captions, and a voice-over (Maya, via ElevenLabs) that says each shot's point in its own words.

The whole video follows one feature in the `greet` fixture: **add a `--shout` flag that prints the
greeting in capitals.** Small enough to read on screen, real enough to need a plan, a test, a
review and a push.

Two kinds of shot:

- **Clip**: VHS recording of real pi with the scripted model (`scenes/<name>.mjs` +
  `tapes/<name>.tape`), framed by `Terminal` with cue-driven captions and highlights.
- **Motion**: Remotion-only animation, for what the terminal cannot show: the shape of the
  loop, and the guards whose messages go to the model instead of the screen.

Status column: **recorded** = a clip exists in `public/clips/` with cues; **proven** = probed
with the scripted model; **new component** = Remotion work not started. Where a recorded shot
differs from its first draft below, the section says what changed and why.

## Running order

| # | Shot | Kind | Time | Extensions on screen | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | Cold open: the force push that waits | Clip | 0:00–0:12 | guardrail, emphasis | recorded (`guardrail`, trimmed) |
| 2 | Title | Motion | 0:12–0:17 | — | proven (`TitleCard`) |
| 3 | The loop | Motion | 0:17–0:32 | — | built (`LoopIntro`) |
| 4 | Plan | Clip | 0:32–1:02 | plan-mode, footer, toasts | recorded (`plan`) |
| 5 | Build until green | Clip | 1:02–1:34 | until, toasts, footer | recorded (`build`) |
| 6 | The guard you never see: done-gate | Clip + Motion | 1:34–1:58 | done-gate, emphasis | recorded (`done-gate` + aside) |
| 7 | Review | Clip | 1:58–2:20 | review prompt, emphasis | recorded (`review`) |
| 8 | Ship | Clip | 2:20–2:44 | ship prompt, guardrail | recorded (`ship`) |
| 9 | The guard ring | Motion | 2:44–2:58 | all passive guards | built (`GuardRing`) |
| 10 | Close | Motion | 2:58–3:08 | — | proven (`TitleCard`) |

## Shots

### 1. Cold open: the force push that waits (12s)

Reuse the recorded `guardrail` clip, trimmed to start at the dialog (cue `dialog` − 1s) and run
through `summary`. No title yet: the first thing the viewer sees is the agent being stopped.

- Caption on dialog: **pi-guardrail** "A force push leaves your machine, so it waits for you."
- Caption on summary: "You said no. It says so."

### 2. Title (5s)

`TitleCard`: kicker `pi-extensions`, title "Ship a feature without babysitting the agent",
line "Five commands you type. A handful of guards you don't."

### 3. The loop (15s)

New `Loop` component on the night background. Five stations draw in left to right, each a mono
pill joined by an amber line: `/plan` → `/workflow` → `/review` → `/ship` → `/retro`. Under each,
one word fades in: *decide*, *build*, *check*, *push*, *remember*. Then a faint dashed ring draws
around the whole row, labelled "guards", and holds; it pays off in shot 9.

- Caption: "One feature, start to finish. Here's the loop."

### 4. Plan (30s)

Scene `plan`, tape types `/plan add a --shout flag that prints the greeting in capitals`.

Scripted steps:

1. `read` `greet.js`, `read` `cli.js` (the fixture gains a tiny `cli.js` that parses argv).
2. `plan_mode_question`: title "Shout scope", question "Should --shout capitalise the whole
   greeting or only the name?", options `Whole greeting`, `Only the name`, recommended
   `Whole greeting`. Tape presses Enter on the recommendation.
3. `plan_mode_complete` with a five-line plan (test first, flag in `cli.js`, `shout` option in
   `greet`, README line, run `npm test`).
4. Reply: "Plan written to `.pi/PLAN.md`. Approve with `/plan approve`."
5. Tape types `/plan approve`; footer flips `planning` → `working`.

Overlays:

- Cue `planning`: highlight the footer's `planning` state. **pi-plan-mode** "Read-only until you
  approve. Edits are refused, not just discouraged."
- Cue `question`: highlight the dialog. "Decisions that are yours get asked, not assumed."
- Cue `approve`: "You approve the plan. Now it can edit."

As recorded: `plan_mode_complete` ends the turn and only shows its arguments truncated, so the
tape opens `/plan edit` (real plan file in the editor dialog), escapes, then approves. A plan
without a Verification section is rejected by `plan-shape.mjs`, which the caption now says.

### 5. Build until green (32s)

Scene `build`, starting from the approved-plan state (fixture seeds `.pi/PLAN.md`). Tape types
`/until npm test -- implement .pi/PLAN.md`.

Scripted steps:

1. `write` `greet.test.js` adding the `--shout` test.
2. `bash` `npm test`: fails (red), on camera.
3. `edit` `greet.js` and `cli.js`.
4. Reply "Implemented `--shout`." → until runs `npm test` at settle: passes, loop ends, toast.

Overlays:

- Cue `red`: highlight the failing test. **test-driven-development** "Test first. It fails for
  the right reason."
- Cue `green`: highlight the toast. **pi-until** "It can't stop until `npm test` exits 0. Not
  when it feels done."
- A small counter in the corner, `check 1 ✗ → check 2 ✓`, driven by the same cues.

As recorded, the script was changed so until has to do its job: the agent writes the test and
the CLI flag, forgets `greet.js`, and says "Done". until reruns `npm test`, posts "iteration
1/20: `npm test` exited 1. Not done." with the failing assertion, the agent fixes `greet.js`, and
the toast reads "until: `npm test` passed after 2 run(s)". The counter is two chips under the
window (`Beat.chip`): ✗ run 1 at cue `red`, ✓ run 2 at cue `green`.

### 6. The guard you never see: done-gate (24s)

The point of the Remotion half. Scene `done-gate`: the agent makes one more edit (README example
code moved into `examples/shout.js`) and says "Done." with no check run.

Scripted steps (proven by probe; see `PI_VIDEO_LOG` in `scenes/run.mjs`):

1. `edit` `examples/shout.js`.
2. Reply "Done." → done-gate injects its reminder as a hidden user message.
3. `bash` `npm test`.
4. Reply with `[[Verified]] npm test passes after the example change.`

Motion: at cue `done`, the terminal slides left to two-thirds width and a paper card titled
**What the model sees** slides in on the right, showing the reminder text **captured from the
take's request log**, not retyped:

> Done check: 1 file(s) changed after the last verification run (examples/shout.js). Before
> reporting done, run the repo's checks …

The card fades as the terminal runs the check.

As recorded, the check is the fixture's `.pi/verify` recipe (tests, then every example), run as
`sh .pi/verify`. The first take ran `npm test`, and done-gate was right not to accept it: no test
imports `examples/shout.js`, so the run never reached the change, and emphasis drew the closing
claim as "Passed · unchecked". With a `.pi/verify` present, done-gate's reminder names it, and
the card shows that captured text (`public/clips/done-gate.hidden.json`, written by the runner's
`capture` option).

- Caption on card: **pi-done-gate** "It said 'done' with an unchecked edit. You never see this
  reminder. The model does."
- Caption on summary: "Now 'done' comes with the check that proves it."

### 7. Review (22s)

Scene `review`, tape types `/review`. Needs the scene runner to load `prompts/` and
`.agents/skills/` (replace `--no-prompt-templates`/`--no-skills` with `--prompt-template` and
`--skill` for this scene).

Scripted steps: `bash` `git diff`, then a reply with one finding:
`[[Broken]] greet("") --shout prints "HELLO, !"` with a file:line, then `edit` to guard it, `bash`
`npm test`, `[[Fixed]]`. (Pill words must come from emphasis's `VOCABULARY` in
`packages/emphasis/emphasis.mjs`; other words draw as plain text.)

- Caption: **implementation-review** "Defects first, each one pinned to a line. No style essay."

As recorded, review does not edit: the template says "Do not edit files", so the finding comes
first (`[[Broken]] cli.js:5` with the `HELLO, --SHOUT!` repro from the real CLI), then the tape
types "Fix it" and the agent fixes and reruns the same command (`[[Fixed]]`, `[[Passed]]`).

### 8. Ship (24s)

Scene `ship`; the fixture's `origin` becomes a local bare repo (`/tmp/pi-video/ship/remote.git`) so
the push really succeeds offline. Tape types `/ship`.

Scripted steps: `bash` `npm test`, `bash` `node cli.js --shout Ada`, `bash`
`git add greet.js cli.js greet.test.js && git commit -m "feat(cli): add --shout flag"`, `bash` `git push origin main` → guardrail dialog → tape
**approves** this time → push succeeds. Reply: `[[Shipped]] main → origin`,
`[[Passed locally]] npm test`, `[[Unverified]] on CI: no hosted CI is configured` (honest, true of
the fixture, and the local-versus-CI distinction emphasis teaches the agent).

- Caption on dialog: **pi-guardrail** "A normal push still asks. Once. You say yes."
- Caption on summary: "Pushed, and it tells you what was not verified."

Contrast with shot 1 is deliberate: same dialog, different answer.

As recorded: guardrail does ask for a push to a local bare remote. `/ship` says "Never use
`git add -A`", so the commit stages named paths. The commit hash (`9ebb23a`) is reproducible
because `scenes/run.mjs` pins git's identity and dates, so the reply names the SHA the real push
produced.

### 9. The guard ring (14s)

Back to the `Loop` row from shot 3, now with the ring solid. Six labels sit on the ring and light
up in turn, one line each:

| Guard | Line |
| --- | --- |
| guardrail | Risky commands wait for you. |
| done-gate | No "done" without a check. |
| diagnosis-nudge | Same check fails twice? Edits pause until it looks again. |
| drift | You edited a file? The agent re-reads it. |
| deslop | Prose it writes gets checked for filler. |
| router | Hard tasks go to a stronger model. |

- Caption: "You never call these. They're on for every step."

### 10. Close (10s)

`TitleCard` (mono variant): title `/plan → /workflow → /review → /ship`, line with the install
command `git clone … ~/.pi/agent/extensions/pi-extensions`, kicker
`pi-extensions.mattriley.tools`.

## Build order

1. ~~Shots 4, 5, 7, 8: write each scene and tape, run the probe it lists, record.~~ Done; the
   current cut (`npm run render`) plays shots 1, 2, 4, 5, 7, 8 and 10 in order.
2. ~~`Loop` component (shots 3 and 9 share it).~~ Done (`src/Loop.tsx`).
3. ~~`WhatTheModelSees` card for shot 6.~~ Done as `Terminal`'s `aside`, fed by `capture`.
4. ~~Assemble in `Root.tsx`, render, and check each cue against the frames.~~ Done; all ten
   shots play in storyboard order.
5. Embed on the site (homepage hero or `/getting-started/`): webm + mp4, poster frame, `.vtt`
   captions generated from the same `scenes.ts` beats.

## Open decisions

- ~~**Voiceover:**~~ Done: ElevenLabs, Maya, one line per shot (`vo/script.json`); captions stay.
- **Placement on the site:** homepage above the card grid, or `/getting-started/` only?
- **Shot 1 cold open:** keep starting on the guardrail dialog, or open on the title as the
  current cut does?
