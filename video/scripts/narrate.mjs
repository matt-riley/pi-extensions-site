import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

const root = path.resolve(import.meta.dirname, "..");
const shots = ["title", "scene", "takeaway"];
const outputFormat = "mp3_44100_128";

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}

export async function narratePage(pagePath, { apiKey = process.env.ELEVENLABS_API_KEY, client, videoRoot = root } = {}) {
  if (!/^(extensions|prompts|skills|guides)\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pagePath ?? "")) {
    throw new Error("usage: npm run narrate -- <kind>/<slug>");
  }
  const definition = path.join(videoRoot, "pages", pagePath, "page.json");
  const page = await readJson(definition);
  const { voice, pronunciation } = await readJson(path.join(videoRoot, "vo/script.json"));
  const lines = shots.map((shot) => {
    const line = page.narration?.[shot];
    if (typeof line?.text !== "string" || !line.text.trim()) throw new Error(`${pagePath}: missing ${shot} narration`);
    let text = line.spoken?.trim() || line.text;
    if (!line.spoken?.trim()) {
      for (const [word, spoken] of Object.entries(pronunciation)) {
        // Older maps included an explanation after the replacement in parentheses.
        text = text.replace(new RegExp(`\\b${RegExp.escape(word)}\\b`, "gi"), spoken.split(" (")[0]);
      }
    }
    return { shot, text, line };
  });

  const rawDir = path.join(videoRoot, "vo/raw/pages", pagePath);
  const voiceDir = path.join(videoRoot, "public/vo/pages", pagePath);
  await mkdir(rawDir, { recursive: true });
  await mkdir(voiceDir, { recursive: true });
  const lock = path.join(rawDir, ".narrate.lock");
  try {
    await mkdir(lock);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`${pagePath}: narration is already running`);
    throw error;
  }

  try {
    const durations = {};
    const oldDefinition = JSON.stringify(page);
    for (const { shot, text, line } of lines) {
      const request = { modelId: voice.model_id, outputFormat, text };
      const hash = createHash("sha256").update(JSON.stringify([voice.voice_id, request])).digest("hex");
      const raw = path.join(rawDir, `${shot}-${hash}.mp3`);
      const metadata = `${raw}.json`;
      let take = await readJson(metadata, null);
      const hasAudio = take && await stat(raw).then((file) => file.isFile() && file.size > 0, (error) => {
        if (error.code !== "ENOENT") throw error;
        return false;
      });
      if (!hasAudio) {
        if (!client && !apiKey) throw new Error("Set ELEVENLABS_API_KEY to generate missing narration takes.");
        client ??= new ElevenLabsClient({ apiKey });
        const { data, rawResponse } = await client.textToSpeech.convert(voice.voice_id, request, {
          maxRetries: 0,
          timeoutInSeconds: 90,
        }).withRawResponse();
        const bytes = Buffer.from(await new Response(data).arrayBuffer());
        if (!bytes.length) throw new Error(`${pagePath}/${shot}: ElevenLabs returned empty audio`);
        take = {
          generation_id: rawResponse.headers.get("history-item-id"),
          request_id: rawResponse.headers.get("request-id"),
        };
        await writeFile(raw, bytes);
        await writeFile(metadata, JSON.stringify(take) + "\n");
      }
      Object.assign(line, take);
      const file = path.join(voiceDir, `${shot}.mp3`);
      const temporary = path.join(lock, `${shot}.mp3`);
      execFileSync("ffmpeg", ["-v", "error", "-nostdin", "-y", "-i", raw,
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=7", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", temporary]);
      const duration = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries",
        "format=duration", "-of", "csv=p=0", temporary], { encoding: "utf8" }).trim());
      if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Cannot measure ${file}`);
      await rename(temporary, file);
      durations[shot] = duration;
    }
    await writeFile(path.join(voiceDir, "durations.json"), JSON.stringify(durations, null, 2) + "\n");
    if (JSON.stringify(page) !== oldDefinition) {
      await writeFile(definition, JSON.stringify(page, null, 2) + "\n");
    }
    return durations;
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const durations = await narratePage(process.argv[2]);
    console.log(durations);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
