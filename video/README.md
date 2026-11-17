# Introduction video

Terminal clips are recorded with [VHS](https://github.com/charmbracelet/vhs) against a real pi and
a scripted local model, then composed with [Remotion](https://www.remotion.dev) into title cards,
captions and highlights. Encodes and posters are published to R2; the site build
copies only caption files from `captions/` to `dist/assets/video/`.

```sh
npm install
npm run tapes     # record tapes/*.tape into public/clips/, then write each clip's cue times
npm run studio    # preview and scrub the composition in the browser
npm run vo        # measure public/vo/*.mp3 after replacing a narration take
npm run render    # write out/intro.mp4
npm run publish -- / # encode and upload the intro, then update manifest.json and captions/
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

## Per-page shorts

From `video/`, run `npm run page -- extensions/guardrail`. The command records the
scene, writes cue times, and renders `out/extensions/guardrail.mp4`. Use a clean
pi-extensions checkout at the commit in `../content.lock` when recording for the
site. Set `PI_EXTENSIONS_DIR` to select that checkout.

Each short lives under `pages/<kind>/<slug>/`:

- `scene.mjs` exports the recording fixture. It can reuse an intro scene.
- `scene.tape` sources `tapes/common/settings.tape`, runs
  `node scenes/run.mjs pages/<kind>/<slug>`, and writes
  `public/pages/<kind>/<slug>/scene.mp4`.
- `page.json` supplies the title, subtitle, terminal title, cue-based beats,
  takeaway card, and narration text and spoken wording by shot.

Studio registers each definition as `page-<kind>-<slug>`. The title card
previews before recording. Check highlight rectangles against the freshly
recorded clip.

Set `ELEVENLABS_API_KEY` in the environment to generate the missing Maya takes
during a page render. `npm run narrate -- extensions/guardrail` runs that step on
its own. It applies the shared pronunciation map when a shot omits `spoken`,
records generation and request IDs, and caches each raw take by voice, model, and
spoken line. FFmpeg normalises the takes to −16 LUFS. Per-page MP3s and their
duration metadata live under `public/vo/pages/<kind>/<slug>/`.

A narrated render writes a matching `.en.vtt` sidecar beside the MP4. Without a
key or an existing narration cache, the page command makes a silent preview.
Pass `--silent` to force a preview without using the API. Preview renders do
not produce a publishing sidecar.

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

Intro captions come from the existing narration timeline. Per-page masters need
a `.en.vtt` sidecar beside the master, such as `out/extensions/guardrail.en.vtt`.
Narrated per-page renders produce these sidecars. Captions are staged and
validated before uploads, then copied to `captions/<kind>/<slug>.en.vtt` (or
`captions/intro.en.vtt`). To reuse a prompt short on its skill page, publish the
prompt master with `--share-with /skills/<slug>/`. For example:

```sh
npm run publish -- /prompts/review/ --share-with /skills/implementation-review/
```

Republishing the canonical prompt keeps its existing skill aliases. Guide
publishing awaits its source-provenance decision.

`manifest.json` is the rollout inventory. Entries use page URLs as keys (`/` for
the intro), immutable media keys, caption paths, duration, and the pinned content
commit. Extension videos record a package tree. Prompt and skill videos record
the Git object IDs of the prompt file and skill directory they demonstrate. A
skill page sharing a prompt short uses the same media and caption paths. Changes
to either source warn on both pages at build time. The publisher checks out
`content.lock`; optionally set
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

### Site embeds

The site build embeds a plain `<video>` for each page in `manifest.json`, with
R2 WebM/MP4 sources and poster, `preload="none"`, and native controls. Extension
videos follow the page H1; the intro stays in the homepage's existing section.
Pages absent from the manifest have no player. The scripted-model note stays
under the intro.

Captions stay on the site origin and use content-hashed `?v=` URLs. Run
`npm run captions` to regenerate `captions/intro.en.vtt` from the narration timeline;
the publisher generates the same captions in staging. Captions are off by default
because the intro also burns them into the video.

After every publish, run `npm run verify:media` **from the repo root** to check
public HTTPS responses, content types, sizes, immutable headers and seeking.
This manual check needs network access; normal builds and SEO audits check local
links and caption files without contacting R2. Commit the manifest and VTT files,
never the encodes or poster. The old `npm run web` command is replaced by the
explicit upload command `npm run publish -- /`.

### Prune old R2 objects

From `video/`, set `CLOUDFLARE_ACCOUNT_ID` to the site's Cloudflare account and
run `npm run prune`. Use the existing Wrangler login or set
`CLOUDFLARE_API_TOKEN` with Pages and R2 read access.

The dry run lists eligible keys and byte sizes under `videos/`. It protects
every key referenced by upstream `main`, the three most recent successful
production revisions, and the active production revision if it differs after a
rollback. Objects must be more than 30 days old. An unreadable manifest or
incomplete deployment history stops the run.

`npm run prune -- --apply` requires R2 write access. Run apply during a quiet
window free of simultaneous publishes, merges, deployments, or rollbacks. The
command rechecks each object and the protected revisions before deleting. GitHub,
Pages, and R2 do not share an atomic transaction.
