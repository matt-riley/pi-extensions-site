# pi-extensions-site

The documentation site at <https://pi-extensions.mattriley.tools>, generated from
[`matt-riley/pi-extensions`](https://github.com/matt-riley/pi-extensions).

Nothing here is written by hand except the template, the stylesheet and this README. Adding a
`packages/<name>/` directory, editing a package README, a `docs/` guide, a `prompts/` file or a
skill changes the site with no index to maintain.

## What gets published

| Source in `pi-extensions` | Used for |
| --- | --- |
| Root `package.json` description | Homepage introduction and metadata |
| `packages/*/package.json` names and descriptions | Extension cards, navigation labels and metadata |
| `README.md` | `/getting-started/` |
| `packages/*/README.md` | `/extensions/<dir>/` |
| `prompts/*.md` | `/prompts/<file>/` |
| `.agents/skills/*/SKILL.md` | `/skills/<name>/` |
| `docs/*.md` H1 and first prose paragraph | Guide titles and descriptions at `/guides/<file>/` |

Relative links between those files become site links; links to anything else (source files,
directories) point at the pinned commit on GitHub; external links are left alone. The landing page
is a card grid of extensions, sorted by package name. Markdown headings get unique
anchor IDs, so links to sections work on the site too.

Every page also gets a plain-Markdown copy at `<page>/index.md` (frontmatter removed, links to
other pages pointing at their copies), and `/llms.txt` indexes those copies in the
[llmstxt.org](https://llmstxt.org/) format so agents can read the docs cheaply. Both are generated
by `scripts/site/llms.mjs` from the same model as the HTML, and the build fails if a page has no
copy or is missing from `llms.txt`.

Edit the upstream Markdown and package descriptions to change the writing; do not edit `dist/`.
Prompts and skills also guide the running agent, so their wording and frontmatter are operational
resources, not just website copy.

## Search and sharing metadata

The generator emits absolute, trailing-slash canonical URLs and Open Graph/Twitter
summary metadata for the homepage and every documentation page. They share the production
origin in `scripts/site/template.mjs` with the Markdown index and crawl artifacts.
Descriptions come from the sources above; guides use the first top-level prose paragraph
with inline formatting removed (or the title if none exists). No upstream writing is changed.

`sitemap.xml` lists the homepage and all discovered HTML pages, and `robots.txt` advertises it
without blocking access. The 404 is marked `noindex` and has no canonical. Markdown copies
remain accessible to agents: Cloudflare Pages applies the generated `_headers` file's HTTP
`Link: <HTML URL>; rel="canonical"` headers to consolidate them with their HTML counterparts.
These headers are not applied by a basic local file server.

The sitemap excludes Markdown copies and the 404. It does not invent modification dates,
crawl frequencies or priorities. All artifacts come from the same pinned content model,
with no hand-maintained URL inventory.

## Content pinning

`content.lock` holds the `pi-extensions` commit that gets published, so a build is reproducible and
a re-run of an old site revision renders the same docs. The `Sync content` workflow checks
`pi-extensions` main every six hours and bumps the lock (then dispatches `ci.yml`, because a
`GITHUB_TOKEN` push does not trigger workflows).

## Local development

```sh
npm ci
npm test                       # all tests through Vitest (including Bombadil)
npm run test:unit              # generator, publishing, style and property contract tests
npm run test:browser           # desktop + mobile Bombadil exploration
npm run build                  # writes dist/ from content.lock and runs SEO verification
PI_EXTENSIONS_SOURCE=../pi-extensions npm run build  # or build + verify from a local checkout
node .pi/verify/site-content.mjs ../pi-extensions     # preview + full-content link/anchor check (optional count)
npm run verify:seo             # audit existing dist/ metadata, sitemap, headers and URLs
npm run verify:media           # manual network check after publishing videos to R2
node .pi/verify/content-scope.mjs ../pi-extensions 69455e7  # editorial scope against its base
```

There is no dev server: `dist/` is plain HTML with one stylesheet, so `open dist/index.html` or any
static file server is enough.

## Browser properties

[Bombadil](https://antithesishq.github.io/bombadil/browser/bombadil-manual.txt)
explores a temporary build of the pinned content through a loopback-only static server.
Vitest owns setup, assertions, timeouts and cleanup; all test files use Vitest.
The first browser run downloads Chromium, so it needs network access as well as Git
access to the content repository. Use macOS on Apple Silicon or Linux (x64/arm64),
the platforms supported by the pinned Bombadil release, and a supported Node version
from `package.json`.

Desktop (1440×900) and mobile (375×812) explore concurrently for 30 seconds each.
Desktop starts on `/extensions/affected/`, and mobile starts on `/prompts/upgrade/`
to cover its long title deterministically. The specification in
`tests/bombadil/site.mjs` checks titles, the main landmark and heading, canonical URLs,
skip links, unique IDs, same-page anchors and horizontal overflow, plus Bombadil's
HTTP, console, exception and promise-rejection defaults. Actions follow real HTML
anchors, scroll, reload, traverse history and toggle the mobile docs menu. Exploration
stays on the preview origin and excludes Markdown/text downloads from page navigation.
It does not test external destinations or video playback. Random exploration complements
the deterministic contract tests; a short run does not guarantee visiting every page.

Traces and screenshots go to ignored `test-results/bombadil/{desktop,mobile}/`.
To inspect a failed run, use `npx bombadil browser inspect test-results/bombadil/mobile`.
CI runs unit tests and browser tests separately, uploads browser output even on failure,
and requires both before deployment.

## Page videos

`video/manifest.json` selects which pages embed videos. The build validates it
against the discovered page URLs, embeds R2-hosted WebM/MP4 sources and posters,
and copies same-origin captions with content-hashed URLs. Pages without an entry
get no player. The homepage intro uses the same manifest; no video binaries are
committed or copied to `dist/`. See [the video workflow](video/README.md) for
recording and publishing. `npm run verify:media` is a manual network check;
the ordinary build and SEO audit stay offline for media.

## Deployment

`matt-riley/infra` owns the Cloudflare Pages project, the custom domain and the DNS record through
its `pi-extensions` catalog entry and `stacks/prod/cloudflare/app-pi-extensions`. This repo only
builds (`npm ci && npm run build` → `dist/`) and requests a deploy through
`matt-riley-ci/.github/workflows/request-app-deploy.yml` on every push to `main`.
