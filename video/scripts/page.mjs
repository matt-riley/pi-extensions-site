import { spawnSync, execFileSync } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeCues } from "./cues.mjs";
import { narratePage } from "./narrate.mjs";
import { webVtt } from "./webvtt.ts";
import { pageTimeline } from "../src/page-timeline.ts";
import { FPS } from "../src/theme.ts";
import { sec, VO_LEAD } from "../src/timeline.ts";

const videoDir = path.resolve(import.meta.dirname, "..");
const [pagePath, flag, ...extra] = process.argv.slice(2);
if (!/^(extensions|prompts|skills|guides)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pagePath ?? "") || extra.length || (flag && flag !== "--silent")) {
  throw new Error("usage: npm run page -- <kind>/<slug> [--silent]");
}
const folder = `pages/${pagePath}`;
const staticFolder = `public/${folder}`;
const tape = `${folder}/scene.tape`;
const clip = `${staticFolder}/scene.mp4`;
const output = `out/${pagePath}.mp4`;
const captions = `out/${pagePath}.en.vtt`;
const voiceFolder = `vo/pages/${pagePath}`;
process.chdir(videoDir);

const page = JSON.parse(await readFile(`${folder}/page.json`, "utf8"));
const outputs = (await readFile(tape, "utf8")).match(/^\s*Output\s+.+$/gm)?.map((line) => line.trim());
if (outputs?.length !== 1 || outputs[0] !== `Output ${clip}`) {
  throw new Error(`${tape} must output ${clip}`);
}
await mkdir(staticFolder, { recursive: true });
await mkdir(path.dirname(output), { recursive: true });

function run(program, args) {
  const result = spawnSync(program, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} failed (${result.signal ?? result.status})`);
}

const cachedVoice = await access(`public/${voiceFolder}/durations.json`).then(() => true, (error) => {
  if (error.code !== "ENOENT") throw error;
  return false;
});
const durations = flag !== "--silent" && (cachedVoice || process.env.ELEVENLABS_API_KEY)
  ? await narratePage(pagePath)
  : {};
const voice = Object.fromEntries(Object.entries(durations).map(([shot, seconds]) =>
  [shot, { src: `${voiceFolder}/${shot}.mp3`, seconds }]));

const recordingFile = `${staticFolder}/recording.json`;
const hiddenFile = `${staticFolder}/scene.hidden.json`;
await rm(recordingFile, { force: true });
await rm(hiddenFile, { force: true });
run("vhs", [tape]);
const { cues } = await writeCues(tape);

const durationOf = (file) => {
  const duration = Number(execFileSync("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file,
  ], { encoding: "utf8" }).trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Cannot read duration of ${file}`);
  return duration;
};
const duration = durationOf(clip);
if (Object.keys(voice).length === 0) console.log("Rendering a preview without narration.");

const hidden = page.aside ? JSON.parse(await readFile(hiddenFile, "utf8")).text : undefined;
const recording = { duration, cues, voice, hidden };
const timing = pageTimeline({ pagePath, page, recording });
await writeFile(recordingFile, JSON.stringify(recording, null, 2) + "\n");
const remotion = path.resolve("node_modules/@remotion/cli/remotion-cli.js");
// Clear a prior sidecar before replacing its master.
await rm(captions, { force: true });
run(process.execPath, [remotion, "render", "src/index.ts", `page-${pagePath.replace("/", "-")}`, output, "--overwrite"]);

if (Object.keys(voice).length > 0) {
  const startFrames = { title: 0, scene: timing.title, takeaway: timing.title + timing.scene };
  const lines = Object.entries(voice).map(([shot, { seconds }]) => {
    const start = (startFrames[shot] + sec(VO_LEAD)) / FPS;
    return { text: page.narration[shot].text, start, end: start + seconds };
  });
  await writeFile(captions, webVtt(lines).text);
}
