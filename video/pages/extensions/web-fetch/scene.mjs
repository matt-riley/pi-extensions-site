import { base } from "../../../scenes/greet.mjs";

const release = {
  tag_name: "v1.2.0",
  published_at: "2026-11-15T10:00:00Z",
  body: "## CLI update\n\nThe greeting command now takes `--upper` in place of `--shout`.\n",
};
export default {
  extensions: ["web-fetch", "footer", "emphasis"],
  workspace: "greet",
  files: base,
  commands: {
    gh: "#!/usr/bin/env node\n" +
      "if (process.argv[2] === '--version' || (process.argv[2] === 'auth' && process.argv[3] === 'status')) process.exit(0);\n" +
      "if (process.argv[2] === 'api' && process.argv[3] === 'repos/demo/greet/releases/tags/v1.2.0') " +
      "console.log(JSON.stringify(" + JSON.stringify(release) + ")); else process.exitCode = 1;\n",
  },
  steps: [
    { think: 850, tools: [["web_fetch", { url: "https://github.com/demo/greet/releases/tag/v1.2.0", format: "markdown" }]] },
    { think: 950, text: "[[Changed]] The demo release replaces `--shout` with `--upper`." },
  ],
};
