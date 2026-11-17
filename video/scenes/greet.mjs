// The `greet` fixture every storyboard shot shares, in the states the feature passes through:
// base (before), the plan, built (with the argv bug review catches), and fixed (ready to ship).
const json = (value) => JSON.stringify(value, null, 2) + "\n";

const pkg = json({ name: "greet", type: "module", bin: "cli.js", scripts: { test: "node --test" } });

const readme = "# greet\n\nSay hello from the command line.\n\n```sh\nnode cli.js Ada   # Hello, Ada!\n```\n";

const greetBase = "export const greet = (name) => `Hello, ${name}!`;\n";

const greetShout =
  "export const greet = (name, { shout = false } = {}) => {\n" +
  "  const line = `Hello, ${name}!`;\n" +
  "  return shout ? line.toUpperCase() : line;\n" +
  "};\n";

const cliBase =
  "#!/usr/bin/env node\n" +
  'import { greet } from "./greet.js";\n\n' +
  'console.log(greet(process.argv[2] ?? "world"));\n';

// The bug review finds: the name is still argv[2], so `cli.js --shout Ada` greets "--SHOUT".
const cliBuggy =
  "#!/usr/bin/env node\n" +
  'import { greet } from "./greet.js";\n\n' +
  'const shout = process.argv.includes("--shout");\n' +
  'console.log(greet(process.argv[2] ?? "world", { shout }));\n';

const cliFixed =
  "#!/usr/bin/env node\n" +
  'import { greet } from "./greet.js";\n\n' +
  "const args = process.argv.slice(2);\n" +
  'const shout = args.includes("--shout");\n' +
  'const [name = "world"] = args.filter((arg) => arg !== "--shout");\n' +
  "console.log(greet(name, { shout }));\n";

const testHead =
  'import test from "node:test";\nimport assert from "node:assert/strict";\n' +
  'import { greet } from "./greet.js";\n\n' +
  'test("greets by name", () => assert.equal(greet("Ada"), "Hello, Ada!"));\n';

const testShout =
  testHead +
  '\ntest("--shout prints the greeting in capitals", () =>\n' +
  '  assert.equal(greet("Ada", { shout: true }), "HELLO, ADA!"));\n';

export const plan =
  "# Add --shout\n\n" +
  "## Steps\n\n" +
  "1. Add a failing test: `greet(\"Ada\", { shout: true })` returns `HELLO, ADA!`.\n" +
  "2. Give `greet` a `shout` option that upper-cases the whole greeting.\n" +
  "3. Parse `--shout` in `cli.js` and pass it through.\n" +
  "4. Add a `--shout` example to the README.\n\n" +
  "## Verification\n\n" +
  "- `npm test` passes, including the new test.\n" +
  "- `node cli.js --shout Ada` prints `HELLO, ADA!`.\n";

export const base = {
  "package.json": pkg,
  "README.md": readme,
  "greet.js": greetBase,
  "cli.js": cliBase,
  "greet.test.js": testHead,
};

export const built = {
  "greet.js": greetShout,
  "cli.js": cliBuggy,
  "greet.test.js": testShout,
};

export const fixed = { ...built, "cli.js": cliFixed };

export const source = { greetShout, cliBuggy, cliFixed, testShout };
