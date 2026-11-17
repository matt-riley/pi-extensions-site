import { base } from "../../../scenes/greet.mjs";

const head = "d7c83bf14b8ab29a9d897b1a6f92fc82f1dfe737";
const pr = {
  number: 7,
  url: "https://github.example.test/demo/greet/pull/7",
  headRefOid: head,
  baseRefName: "main",
  state: "OPEN",
  isDraft: false,
  mergeStateStatus: "CLEAN",
  reviewDecision: "APPROVED",
  statusCheckRollup: [{ name: "test", status: "COMPLETED", conclusion: "SUCCESS" }],
};
const reviews = [{
  data: { repository: { pullRequest: {
    headRefOid: head,
    reviewThreads: {
      nodes: [{ isResolved: false, isOutdated: false, path: "cli.js", comments: {
        nodes: [{ body: "Can we cover the missing name case?" }],
      } }],
      pageInfo: { hasNextPage: false, endCursor: null },
    },
  } } },
}];

export default {
  extensions: ["watch-pr", "footer", "emphasis"],
  toolSearch: true,
  workspace: "greet",
  files: base,
  commands: {
    gh: "#!/usr/bin/env node\n" +
      "const [command, subcommand] = process.argv.slice(2);\n" +
      "if (command === 'pr' && subcommand === 'view') console.log(JSON.stringify(" + JSON.stringify(pr) + "));\n" +
      "else if (command === 'api' && subcommand === 'graphql') console.log(JSON.stringify(" + JSON.stringify(reviews) + "));\n" +
      "else process.exitCode = 1;\n",
  },
  steps: [
    { think: 700, tools: [["tool_search", { query: "watch_pr" }]] },
    { think: 800, tools: [["watch_pr", { pr: "7" }]] },
    { think: 750, text: "[[Needs you]] The test is green. The comment on `cli.js` still needs a response." },
  ],
};
