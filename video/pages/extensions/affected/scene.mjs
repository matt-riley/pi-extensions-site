import { base, built } from "../../../scenes/greet.mjs";

export default {
  extensions: ["affected", "footer", "emphasis"],
  workspace: "greet",
  files: { ...base, "upper.test.js": 'import test from "node:test";\n' +
    'import assert from "node:assert/strict";\n' +
    'test("uppercases a name", () => assert.equal("Ada".toUpperCase(), "ADA"));\n' },
  dirty: { "greet.js": built["greet.js"] },
  steps: [],
};
