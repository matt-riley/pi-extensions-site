// HTML shell and fragments for the generated documentation site.

const SITE_REPO = "matt-riley/pi-extensions-site";
export const CONTENT_REPO = "matt-riley/pi-extensions";
export const SITE_URL = "https://pi-extensions.mattriley.tools";
const SITE_NAME = "pi-extensions";
// One π drawn as three strokes: the brand mark, the favicon and the hero watermark.
const PI_PATHS =
  "<path d='M16 40c5-11 11-14 21-14h47'/><path d='M42 26v34c0 10-4 16-13 18'/><path d='M66 26v37c0 11 6 16 17 12'/>";
const piMark = (className) =>
  `<svg class="${className}" viewBox="0 0 100 100" aria-hidden="true" focusable="false">${PI_PATHS}</svg>`;
const FAVICON =
  "data:image/svg+xml," +
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%230c0d0f'/>" +
  `<g fill='none' stroke='%23ffb000' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'>${PI_PATHS}</g></svg>`;

// "3" followed by `count` decimals of π (Machin's formula), the texture behind the hero and footer.
function piDigits(count) {
  const scale = 10n ** BigInt(count + 10);
  const arctanInverse = (x) => {
    let term = scale / x;
    let sum = term;
    let sign = -1n;
    for (let k = 3n; term > 0n; k += 2n, sign = -sign) {
      term /= x * x;
      sum += sign * (term / k);
    }
    return sum;
  };
  return (16n * arctanInverse(5n) - 4n * arctanInverse(239n)).toString().slice(0, count + 1);
}
const PI_DECIMALS = piDigits(1400).slice(1);

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function link(url, label, current) {
  const active = url === current ? ' aria-current="page"' : "";
  return `<a href="${escapeHtml(url)}"${active}>${escapeHtml(label)}</a>`;
}

function navGroup(title, items, current) {
  if (items.length === 0) return "";
  const entries = items
    .map((item) => `        <li>${link(item.url, item.label, current)}</li>`)
    .join("\n");
  return `      <section class="nav-group">
        <h2>${escapeHtml(title)}</h2>
        <ul>
${entries}
        </ul>
      </section>`;
}

function renderSidebar(model, current) {
  const groups = [
    ["Extensions", model.extensions],
    ["Prompts", model.prompts],
    ["Skills", model.skills],
    ["Guides", model.guides],
  ]
    .map(([title, items]) => navGroup(title, items, current))
    .filter(Boolean)
    .join("\n");
  // The checkbox opens the navigation on narrow screens without any script.
  return `    <div class="sidebar">
      <input class="nav-toggle" type="checkbox" id="nav-toggle" aria-label="Show documentation navigation" />
      <label class="nav-toggle-label" for="nav-toggle" aria-hidden="true">Browse the docs</label>
      <nav class="nav" aria-label="Documentation">
        <p class="nav-home">${link(model.gettingStarted.url, "Getting started", current)}</p>
${groups}
      </nav>
    </div>`;
}

function footer({ contentSha, siteSha }) {
  const commit = (repo, sha, label) =>
    sha === "local"
      ? `${label}@local`
      : `<a href="https://github.com/${repo}/commit/${escapeHtml(sha)}">${label}@${escapeHtml(sha.slice(0, 7))}</a>`;
  return `      Content from ${commit(CONTENT_REPO, contentSha, "pi-extensions")} · built by
      ${commit(SITE_REPO, siteSha, "site")}`;
}

export function renderPage({ model, current, title, description, content, build, indexable = true }) {
  const pageTitle = title === SITE_NAME ? SITE_NAME : `${title} — ${SITE_NAME}`;
  const canonical = escapeHtml(SITE_URL + current);
  const metadata = indexable
    ? `<link rel="canonical" href="${canonical}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:title" content="${escapeHtml(pageTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />`
    : '<meta name="robots" content="noindex" />';
  // The landing page and 404 already link everywhere, so they skip the sidebar.
  const sidebar = current === "/" || current === "/404" ? "" : `${renderSidebar(model, current)}\n`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    ${metadata}
    <link rel="icon" href="${FAVICON}" />
    <link rel="stylesheet" href="/assets/style.css" />
  </head>
  <body>
    <header class="topbar">
      <a class="brand" href="/">${piMark("brand-mark")}<span><b>pi</b>-extensions</span></a>
      <a class="repo" href="https://github.com/${CONTENT_REPO}">GitHub</a>
    </header>
    <div class="shell${sidebar ? "" : " wide"}">
${sidebar}      <main class="content">
${content}
      </main>
    </div>
    <footer class="footer">
      <p class="footer-digits" aria-hidden="true">3.${PI_DECIMALS.slice(0, 320)}</p>
      <p class="footer-meta">
${footer(build)}
      </p>
    </footer>
  </body>
</html>
`;
}

// Dim the shared "pi-" prefix so the distinguishing part of each name leads.
function cardName(label) {
  return label.startsWith("pi-") ? `<span>pi-</span>${escapeHtml(label.slice(3))}` : escapeHtml(label);
}

export function renderLanding({ model, build }) {
  const cards = model.extensions
    .map(
      (extension) => `        <li class="card">
          <a href="${escapeHtml(extension.url)}">
            <h3>${cardName(extension.label)}</h3>
            <p>${escapeHtml(extension.description)}</p>
          </a>
        </li>`,
    )
    .join("\n");
  const guides = model.guides
    .map((guide) => `        <li>${link(guide.url, guide.title)}</li>`)
    .join("\n");
  const count = (items, noun) => `<li><b>${items.length}</b> ${noun}${items.length === 1 ? "" : "s"}</li>`;
  const content = `      <section class="hero">
        <p class="hero-digits" aria-hidden="true"><b>3.14159</b>${PI_DECIMALS.slice(5)}</p>
        ${piMark("hero-mark")}
        <h1><b>pi</b>-extensions</h1>
        <div class="hero-body">
          <div class="hero-intro">
            <p class="lede">${escapeHtml(model.description)}</p>
            <p class="hero-links">
              <a class="button" href="/getting-started/">Getting started</a>
              <a class="button ghost" href="https://github.com/${CONTENT_REPO}">Source</a>
            </p>
            <ul class="stats">
              ${count(model.extensions, "extension")}
              ${count(model.prompts, "prompt")}
              ${count(model.skills, "skill")}
              ${count(model.guides, "guide")}
            </ul>
          </div>
          <div class="terminal">
            <p class="terminal-bar" aria-hidden="true"><i></i><i></i><i></i><span>install</span></p>
            <pre><code><span class="line">git clone https://github.com/${CONTENT_REPO} \\
    ~/.pi/agent/extensions/pi-extensions</span>
<span class="line">cd ~/.pi/agent/extensions/pi-extensions &amp;&amp; npm install</span></code></pre>
            <p class="terminal-note">Then run <code>/reload</code> in pi. See Getting started for prompt and skill setup.</p>
          </div>
        </div>
      </section>
      <section class="index">
        <h2>Extensions <span class="tally">${model.extensions.length}</span></h2>
        <ul class="cards">
${cards}
        </ul>
      </section>
      <section class="index">
        <h2>Guides <span class="tally">${model.guides.length}</span></h2>
        <ul class="links">
${guides}
        </ul>
      </section>`;
  return renderPage({
    model,
    current: "/",
    title: SITE_NAME,
    description: model.description,
    content,
    build,
  });
}

export function renderNotFound({ model, build }) {
  const content = `      <section class="notfound">
        <p class="notfound-code" aria-hidden="true">4${piMark("notfound-mark")}4</p>
        <h1>Page not found</h1>
        <p>That page does not exist. Start from the <a href="/">extension index</a>.</p>
      </section>`;
  return renderPage({
    model,
    current: "/404",
    title: "Page not found",
    indexable: false,
    description: "That page does not exist.",
    content,
    build,
  });
}
