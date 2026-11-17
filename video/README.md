# Introduction video

Terminal clips are recorded with [VHS](https://github.com/charmbracelet/vhs) against a real pi and
a scripted local model, then composed with [Remotion](https://www.remotion.dev) into title cards,
captions and highlights. Only `web/` is part of the site: the build copies it to
`dist/assets/video/` for the homepage's intro section.

```sh
npm install
npm run tapes     # record tapes/*.tape into public/clips/, then write each clip's cue times
npm run studio    # preview and scrub the composition in the browser
npm run vo        # measure public/vo/*.mp3 after replacing a narration take
npm run render    # write out/intro.mp4
npm run web       # captions, WebM/MP4 encodes and poster into web/, which the site ships
```

Needs `vhs`, `pi`, `ffmpeg` and `ffprobe` on `PATH`. `PI_EXTENSIONS_DIR` names the pi-extensions checkout to
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

## On the site

### R2 upload access

Run `npm ci` here to install the pinned Wrangler CLI, then `npx wrangler login`
to authorize uploads with your Cloudflare account. Credentials stay in Wrangler's
user configuration, outside this repository. Recording and uploading run locally.

`matt-riley/infra` owns bucket `pi-extensions-media` and custom domain
`https://pi-extensions-media.mattriley.tools`. Do not create a second bucket or
DNS record from this repo. Check the deployment before uploading:

```sh
npx wrangler r2 bucket domain list pi-extensions-media
npx wrangler r2 bucket dev-url get pi-extensions-media # must stay disabled
```

Upload objects with `--remote`, their actual content type, and
`--cache-control "public, max-age=31536000, immutable"`. Each changed file must
get a new content-hashed key. For a temporary smoke-test object, verify its public
HEAD response and a `Range: bytes=0-9` GET (expect 206 and `Content-Range`), then
delete it with `npx wrangler r2 object delete <bucket>/<key> --remote`.

### Publish a rendered video

```sh
npm run publish -- /                         # out/intro.mp4
npm run publish -- / /absolute/path/intro.mp4 # explicit rendered master
npm run publish -- /extensions/guardrail/    # out/extensions/guardrail.mp4
```

The publisher encodes VP9/Opus WebM, H.264/AAC MP4 with faststart, and a title-card
JPEG; hashes each file; skips objects already present with the expected size; and
uploads missing objects with the public headers above. Encodes are cached under
`out/.publish/` by master bytes and encoder settings, with full SHA-256 checks on
cached files. A repeat publish reuses the encodes and uploads nothing.

Install the root dependencies too (`cd .. && npm ci`): the publisher reuses the
site's page discovery so it can reject page URLs absent from the pinned content.

Intro captions come from the existing narration timeline. Extension masters need
a `.en.vtt` sidecar beside the master, such as `out/extensions/guardrail.en.vtt`.
The per-page render pipeline will produce these sidecars. Captions are staged and
validated before uploads, then copied to `captions/<kind>/<slug>.en.vtt` (or
`captions/intro.en.vtt`). Prompt, skill and guide publishing awaits the later
format and source-provenance decision.

`manifest.json` is the rollout inventory. Entries use page URLs as keys (`/` for
the intro), immutable media keys, caption paths, duration, and the pinned content
commit and package tree. The publisher checks out `content.lock`; optionally set
`PI_EXTENSIONS_SOURCE` to an existing **clean checkout at that exact commit**.
`scripts/site/videos.mjs` validates the candidate before uploading. Upload errors
leave the tracked manifest and captions unchanged; successfully uploaded objects
from an interrupted batch may remain for the later prune step. The manifest is
replaced atomically only after all uploads succeed. The publisher never deletes
remote objects or intentionally replaces existing keys.

Only one publish can run in a checkout at a time. SIGINT/SIGTERM stop child
commands and release `video/.publish.lock`. After a crash, remove that directory
only after checking that the publisher has stopped. Commit the manifest and
captions, never the cached encodes. Root `npm test` covers the publisher with local
fixtures and mocked process/HTTP boundaries; live uploads are run manually.

### Current homepage encodes

The intro is uploaded to R2, but the site still embeds the committed `web/`
encodes until the build integration and migration land.

`npm run web` writes `web/intro.en.vtt` (the narration as captions, timed from `src/timeline.ts`,
the same timeline the render uses), `web/intro.webm` and `web/intro.mp4` (each under Cloudflare
Pages' 25 MiB file limit) and `web/intro-poster.jpg`. Commit `web/` after a re-render: the site
build reads it, and `scripts/build-site.test.mjs` fails if a file the landing names is missing.
The captions track is off by default, since the video already burns in its own captions.
