// Generates the raw takes for every sound in tools/audio-sounds.mjs with
// ElevenLabs' sound-effects API, into art/audio/raw/<name>-<take>.mp3. Takes
// already there are kept, so a rerun only fills gaps; delete one to redo it.
// `node tools/generate-audio.mjs [name ...]` limits it to those sounds.
//
// The API key is the ElevenLabs MCP server's, from ~/.claude.json, unless
// ELEVENLABS_API_KEY is set.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { SOUNDS } from './audio-sounds.mjs';

const OUT = new URL('../art/audio/raw/', import.meta.url);
const FORMAT = 'mp3_44100_192';
const PARALLEL = 3;

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const config = JSON.parse(readFileSync(`${homedir()}/.claude.json`, 'utf8'));
  const key = config.mcpServers?.elevenlabs?.env?.ELEVENLABS_API_KEY;
  if (!key) throw new Error('No ElevenLabs key: set ELEVENLABS_API_KEY');
  return key;
}

async function generate(key, sound, take) {
  const file = new URL(`${sound.name}-${take}.mp3`, OUT);
  if (existsSync(file)) return;
  const res = await fetch(`https://api.elevenlabs.io/v1/sound-generation?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: sound.text,
      duration_seconds: sound.seconds,
      prompt_influence: sound.influence ?? 0.35,
      loop: !!sound.loop,
      model_id: 'eleven_text_to_sound_v2',
    }),
  });
  if (!res.ok) throw new Error(`${sound.name}-${take}: ${res.status} ${await res.text()}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`${sound.name}-${take}`);
}

const only = process.argv.slice(2);
const jobs = SOUNDS.filter((s) => !only.length || only.includes(s.name)).flatMap((s) =>
  Array.from({ length: s.takes }, (_, i) => [s, i + 1]),
);
mkdirSync(OUT, { recursive: true });
const key = apiKey();
let failed = 0;
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    for (let job; (job = jobs.shift()); ) {
      await generate(key, ...job).catch((e) => {
        failed++;
        console.error(e.message);
      });
    }
  }),
);
process.exit(failed ? 1 : 0);
