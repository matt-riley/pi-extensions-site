import { always } from "@antithesishq/bombadil";
import { actions, extract, registerCustomAction } from "@antithesishq/bombadil/browser";
import { pageState } from "./page-state.mjs";

export * from "@antithesishq/bombadil/browser/defaults/properties";
export { back, forward, reload, scroll } from "@antithesishq/bombadil/browser/defaults/actions";

const page = extract(pageState);
export const accessiblePage = always(() => page.current.structure.length === 0);
export const validAnchors = always(() => page.current.anchors.length === 0);
export const noHorizontalOverflow = always(() => page.current.fitsViewport);

// Follow real anchors, but keep exploration on HTML pages; Markdown and llms.txt
// are agent-facing downloads, not pages with the site's navigation and landmarks.
const followLink = registerCustomAction("followSiteLink", async (document, window, href) => {
  const link = [...document.querySelectorAll("a[href]")].find((anchor) => {
    const url = new URL(anchor.getAttribute("href"), window.location.href);
    return url.origin === window.location.origin && url.pathname + url.search + url.hash === href;
  });
  link?.click();
});
export const siteLinks = actions(() => page.current.links.map((href) => followLink(href)));

const toggleMenu = registerCustomAction("toggleDocsMenu", async (document) => {
  document.querySelector("#nav-toggle")?.click();
});
const hasMenu = extract(({ document, window }) =>
  window.innerWidth <= 900 && document.querySelector("#nav-toggle") !== null,
);
export const docsMenu = actions(() => hasMenu.current ? [toggleMenu()] : []);
