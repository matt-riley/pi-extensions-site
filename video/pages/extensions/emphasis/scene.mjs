import { base } from "../../../scenes/greet.mjs";

export default {
  extensions: ["emphasis", "footer"],
  workspace: "greet",
  files: base,
  steps: [
    { think: 850, tools: [["bash", { command: "npm test" }]] },
    {
      think: 800,
      text: "[[Passed locally]] The greeting test passes.\n\n" +
        "[[Unverified]] No hosted checks ran.\n\n" +
        "**Next:** Run the hosted checks before release.",
    },
  ],
};
