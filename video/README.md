# Introduction video

Terminal clips are recorded with [VHS](https://github.com/charmbracelet/vhs) against a real pi and
a scripted local model, then composed with [Remotion](https://www.remotion.dev) into title cards,
captions and highlights. Nothing here is part of the site build.

```sh
npm install
npm run tapes     # record tapes/*.tape into public/clips/, then write each clip's cue times
npm run studio    # preview and scrub the composition in the browser
npm run vo        # measure public/vo/*.mp3 after replacing a narration take
npm run render    # write out/intro.mp4
```

Needs `vhs`, `pi` and `ffmpeg` on `PATH`. `PI_EXTENSIONS_DIR` names the pi-extensions checkout to
load (default `~/.pi/agent/extensions/pi-extensions`).

## How a scene fits together

- `scenes/<name>.mjs` is the fixture: the files in a throwaway git repo, the extensions to load,
  and the model's scripted steps (tool calls or streamed reply text). `scenes/run.mjs` builds it
  under `/tmp/pi-video/<name>`, serves the script as an OpenAI-compatible endpoint, and runs pi
  with your own config, sessions and credentials left alone.
- `tapes/<name>.tape` types the prompt and presses keys. A `# cue: <id>` line marks a moment;
  `scripts/cues.mjs` adds up the visible Sleep and typing time to turn it into seconds.
  Model timing comes from the scene's `think` delays, not the tape, so check cues against the
  clip after changing either (measured on the guardrail clip: within about 0.5s).
- `src/scenes.ts` attaches a caption, an optional extension label and an optional highlight
  rectangle (in the clip's 1600x900 pixels) to each cue.

## Narration

`vo/script.json` holds one line per shot, the ElevenLabs voice (Maya, a workspace voice), the
flow the takes were generated in, and each take's generation id. The takes are loudness-normalised
to -16 LUFS into `public/vo/<shot>.mp3`; the unprocessed downloads stay in `vo/raw/`. `Root.tsx`
starts each line 0.4s into its shot and lengthens a motion shot to fit its line; a line longer
than its recorded clip fails the render rather than being cut off.
