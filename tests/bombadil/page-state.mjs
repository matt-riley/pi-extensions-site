// This function runs inside Chromium as a Bombadil extractor. Keep it self-contained.
export function pageState({ document, window }) {
  const structure = [];
  if (!document.title.trim()) structure.push("title");
  if (document.querySelectorAll("main#main-content").length !== 1) structure.push("main");
  if (document.querySelectorAll("main h1").length !== 1 || !document.querySelector("main h1")?.textContent.trim()) {
    structure.push("heading");
  }
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href");
  if (canonical !== `https://pi-extensions.mattriley.tools${window.location.pathname}`) structure.push("canonical");
  if (document.querySelector('a.skip-link')?.getAttribute("href") !== "#main-content" || !document.getElementById("main-content")) {
    structure.push("skip link");
  }
  const anchors = [];
  const ids = new Set();
  for (const element of document.querySelectorAll("[id]")) {
    if (ids.has(element.id)) anchors.push(`duplicate #${element.id}`);
    ids.add(element.id);
  }
  const links = new Set();
  for (const anchor of document.querySelectorAll("a[href]")) {
    const url = new URL(anchor.getAttribute("href"), window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.endsWith("/")) continue;
    links.add(url.pathname + url.search + url.hash);
    if (url.pathname === window.location.pathname && url.hash) {
      let id;
      try { id = decodeURIComponent(url.hash.slice(1)); } catch { id = null; }
      if (!ids.has(id)) anchors.push(url.hash);
    }
  }
  return {
    structure, anchors, links: [...links],
    viewport: { width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth },
    fitsViewport: document.documentElement.scrollWidth <= window.innerWidth + 1,
  };
}
