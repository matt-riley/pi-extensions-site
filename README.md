# pi-extensions-site

The documentation site at <https://pi-extensions.mattriley.tools>, generated from
[`matt-riley/pi-extensions`](https://github.com/matt-riley/pi-extensions).

Nothing here is written by hand except the template, the stylesheet and this README. Adding a
`packages/<name>/` directory, editing a package README, a `docs/` guide, a `prompts/` file or a
skill changes the site with no index to maintain.

## What gets published

| Source in `pi-extensions` | Page |
| --- | --- |
| `README.md` | `/getting-started/` |
| `packages/*/README.md` | `/extensions/<dir>/` |
| `prompts/*.md` | `/prompts/<file>/` |
| `.agents/skills/*/SKILL.md` | `/skills/<name>/` |
| `docs/*.md` | `/guides/<file>/` |

Relative links between those files become site links; links to anything else (source files,
directories) point at the pinned commit on GitHub; external links are left alone. The landing page
is a card grid of extensions, sorted by package name.

## Content pinning

`content.lock` holds the `pi-extensions` commit that gets published, so a build is reproducible and
a re-run of an old site revision renders the same docs. The `Sync content` workflow checks
`pi-extensions` main every six hours and bumps the lock (then dispatches `ci.yml`, because a
`GITHUB_TOKEN` push does not trigger workflows).

## Local development

```sh
npm ci
npm test                       # generator contract tests
npm run build                  # writes dist/ from the commit in content.lock
npm run build -- --source ../pi-extensions   # or from a local checkout
```

There is no dev server: `dist/` is plain HTML with one stylesheet, so `open dist/index.html` or any
static file server is enough.

## Deployment

`matt-riley/infra` owns the Cloudflare Pages project, the custom domain and the DNS record through
its `pi-extensions` catalog entry and `stacks/prod/cloudflare/app-pi-extensions`. This repo only
builds (`npm ci && npm run build` → `dist/`) and requests a deploy through
`matt-riley-ci/.github/workflows/request-app-deploy.yml` on every push to `main`.
