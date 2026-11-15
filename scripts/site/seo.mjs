// Crawl artifacts share the same discovered pages and production origin as HTML.
import { escapeHtml, SITE_URL } from "./template.mjs";

export function renderSitemap(model) {
  const urls = ["/", ...model.pages.map((page) => page.url)];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeHtml(SITE_URL + url)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
}

export const ROBOTS_TXT = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;

// Cloudflare Pages applies these HTTP Link headers to the agent-readable copies.
// Canonical hints consolidate duplicates without blocking crawlers or agents.
export function renderMarkdownHeaders(model) {
  return model.pages.map((page) =>
    `${page.url}index.md\n  Link: <${SITE_URL}${page.url}>; rel="canonical"\n`,
  ).join("\n");
}
