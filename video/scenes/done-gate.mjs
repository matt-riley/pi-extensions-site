// Shot 6: the agent adds a code example and says "Done." without running anything. done-gate's
// reminder goes to the model, not the screen; the runner captures it for the video's aside card.
import { base, fixed } from "./greet.mjs";

// The repo's own verification recipe. done-gate names it in its reminder, and a passing
// `sh .pi/verify` covers the new example, which no unit test imports (a bare `npm test` did not:
// emphasis then drew the closing claim as "Passed · unchecked").
const verify =
  "#!/bin/sh\n# Tests, then every runnable example.\nset -e\nnpm test\n" +
  'for example in examples/*.js; do node "$example"; done\n';

const example =
  'import { greet } from "../greet.js";\n\n' + 'console.log(greet("Ada", { shout: true }));\n';

export default {
  extensions: ["done-gate", "footer", "toasts", "emphasis"],
  workspace: "greet",
  files: { ...base, ...fixed, ".pi/verify": verify },
  capture: /^Done check:/,
  steps: [
    { think: 900, tools: [["write", { path: "examples/shout.js", content: example }]] },
    { think: 700, text: "Done. Added `examples/shout.js`." },
    // done-gate's reminder arrives here as a hidden user message.
    { think: 5000, tools: [["bash", { command: "sh .pi/verify" }]] },
    {
      think: 700,
      text:
        "Added `examples/shout.js`, a runnable `--shout` example.\n\n" +
        "[[Passed]] `sh .pi/verify`: 2 tests pass, and `examples/shout.js` prints `HELLO, ADA!`.",
    },
  ],
};
