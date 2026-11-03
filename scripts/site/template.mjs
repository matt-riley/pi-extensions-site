// HTML shell and fragments for the generated documentation site.

const SITE_REPO = "matt-riley/pi-extensions-site";
export const CONTENT_REPO = "matt-riley/pi-extensions";
const SITE_NAME = "pi-extensions";
const FAVICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#129513;</text></svg>";

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
  return `    <nav class="sidebar" aria-label="Documentation">
      <p class="nav-home">${link(model.gettingStarted.url, "Getting started", current)}</p>
${groups}
    </nav>`;
}

function footer({ contentSha, siteSha }) {
  const commit = (repo, sha, label) =>
    sha === "local"
      ? `${label}@local`
      : `<a href="https://github.com/${repo}/commit/${escapeHtml(sha)}">${label}@${escapeHtml(sha.slice(0, 7))}</a>`;
  return `      Content from ${commit(CONTENT_REPO, contentSha, "pi-extensions")} · built by
      ${commit(SITE_REPO, siteSha, "site")}`;
}

export function renderPage({ model, current, title, description, content, build }) {
  const pageTitle = title === SITE_NAME ? SITE_NAME : `${title} — ${SITE_NAME}`;
  // The landing page and 404 already link everywhere, so they skip the sidebar.
  const sidebar = current === "/" || current === "/404" ? "" : `${renderSidebar(model, current)}\n`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="icon" href="${FAVICON}" />
    <link rel="stylesheet" href="/assets/style.css" />
  </head>
  <body>
    <header class="topbar">
      <a class="brand" href="/">pi-extensions</a>
      <a class="repo" href="https://github.com/${CONTENT_REPO}">GitHub</a>
    </header>
    <div class="shell${sidebar ? "" : " wide"}">
${sidebar}      <main class="content">
${content}
      </main>
    </div>
    <footer class="footer">
${footer(build)}
    </footer>
  </body>
</html>
`;
}

export function renderLanding({ model, build }) {
  const cards = model.extensions
    .map(
      (extension) => `        <li class="card">
          <a href="${escapeHtml(extension.url)}">
            <h3>${escapeHtml(extension.label)}</h3>
            <p>${escapeHtml(extension.description)}</p>
          </a>
        </li>`,
    )
    .join("\n");
  const guides = model.guides
    .map((guide) => `        <li>${link(guide.url, guide.title)}</li>`)
    .join("\n");
  const content = `      <section class="hero">
        <h1>${SITE_NAME}</h1>
        <p>${escapeHtml(model.description)}</p>
        <pre><code>git clone https://github.com/${CONTENT_REPO} ~/.pi/agent/extensions/pi-extensions</code></pre>
        <p class="hero-links">
          <a class="button" href="/getting-started/">Getting started</a>
          <a class="button ghost" href="https://github.com/${CONTENT_REPO}">Source</a>
        </p>
      </section>
      <section>
        <h2>Extensions</h2>
        <ul class="cards">
${cards}
        </ul>
      </section>
      <section>
        <h2>Guides</h2>
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
  const content = `      <h1>Page not found</h1>
      <p>That page does not exist. Start from the <a href="/">extension index</a>.</p>`;
  return renderPage({
    model,
    current: "/404",
    title: "Page not found",
    description: "That page does not exist.",
    content,
    build,
  });
}
