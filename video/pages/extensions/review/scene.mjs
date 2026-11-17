import { base, built } from "../../../scenes/greet.mjs";

export default {
  extensions: ["review", "footer", "emphasis"],
  toolSearch: true,
  workspace: "greet",
  files: base,
  dirty: { "greet.js": built["greet.js"] },
  steps: [
    { think: 750, tools: [["tool_search", { query: "blast_radius" }]] },
    { think: 850, tools: [["blast_radius", { scope: "worktree" }]] },
    {
      think: 900,
      text: "`cli.js` calls the changed `greet()` helper.\n\n" +
        "[[Unverified]] The caller needs a check.\n\n" +
        "**Next:** Run `node cli.js Ada` to exercise the CLI.",
    },
  ],
};
