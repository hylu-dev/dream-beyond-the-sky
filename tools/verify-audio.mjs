// Checks the game's sound: every sound src/audio.js plays has its files in
// public/assets/audio, as tools/audio-sounds.mjs and process-audio.mjs make
// them, and they decode at a sensible length and loudness; and audio.js
// itself, run against a stand-in AudioContext, stays silent until unlocked,
// loops its beds with overlapping crossfades and no gaps, follows their
// levels, holds, and cuts a cut-scene's one-shots. It does not listen: what
// the sounds are like is for ears.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SOUNDS as MADE } from './audio-sounds.mjs';

const DIR = fileURLToPath(new URL('../public/assets/audio/', import.meta.url));
let failures = 0;
const check = (ok, message) => {
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
};

// ── The files ─────────────────────────────────────────────────────────────

const probe = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }));
function loudness(file) {
  const r = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const json = JSON.parse(r.stderr.slice(r.stderr.lastIndexOf('{'), r.stderr.lastIndexOf('}') + 1));
  return { lufs: Number(json.input_i), peak: Number(json.input_tp) };
}

// Stand-ins for the browser, enough for audio.js.
const durations = {};
const events = []; // [kind, ...details]
class Param {
  constructor(v = 0) { this.value = v; this.curves = []; }
  setValueCurveAtTime(curve, t, d) { this.curves.push({ curve, t, d }); }
  setTargetAtTime(v, t, c) { this.value = v; (this.targets ??= []).push({ v, t, c }); }
  setValueAtTime(v) { this.value = v; }
  cancelScheduledValues() { this.targets = []; }
}
class Node {
  constructor() { this.targets = []; }
  connect(n) { this.targets.push(n); return n; }
}
class FakeContext {
  constructor() { this.currentTime = 0; this.state = 'suspended'; this.destination = new Node(); }
  createGain() { const n = new Node(); n.gain = new Param(1); return n; }
  createStereoPanner() { const n = new Node(); n.pan = new Param(0); return n; }
  createDynamicsCompressor() { const n = new Node(); n.threshold = new Param(); n.ratio = new Param(); return n; }
  createBufferSource() {
    const n = new Node();
    n.start = (t) => events.push(['start', n.buffer.name, t, n]);
    n.stop = (t) => (n.stopAt = t);
    return n;
  }
  resume() { this.state = 'running'; events.push(['resume']); }
  suspend() { this.state = 'suspended'; events.push(['suspend']); }
  async decodeAudioData(buffer) { return { name: buffer.name, duration: durations[buffer.name] }; }
}
globalThis.AudioContext = FakeContext;
globalThis.fetch = async (url) => {
  const name = url.split('/').pop().replace(/\.mp3$/, '');
  return { arrayBuffer: async () => ({ name }) };
};

const { SOUNDS, AUDIO_DEFAULTS, createAudio } = await import('../src/audio.js');

const made = Object.fromEntries(MADE.map((s) => [s.name, s]));
for (const [name, sound] of Object.entries(SOUNDS)) {
  const spec = made[name];
  check(!!spec, `${name} is in tools/audio-sounds.mjs`);
  if (!spec) continue;
  check(!!spec.loop === !!sound.loop, `${name} loops in both or neither`);
  const files = spec.mix ? spec.mix.length : (spec.use ?? [1]).length;
  check(files === (sound.variants ?? 1), `${name}: ${files} take(s) shipped, ${sound.variants ?? 1} played`);
  for (let i = 1; i <= files; i++) {
    const base = files > 1 ? `${name}-${i}` : name;
    const file = `${DIR}${base}.mp3`;
    if (!existsSync(file)) {
      check(false, `${base}.mp3 exists`);
      continue;
    }
    const d = probe(file);
    durations[base] = d;
    const { lufs, peak } = loudness(file);
    const okLength = sound.loop ? d >= 4 * AUDIO_DEFAULTS.crossfade : d > 0.3 && d < 15;
    const target = made[name].lufs;
    check(okLength && (target ? Math.abs(lufs - target) < 2.5 : lufs > -27 && lufs < -15) && peak < -0.5, `${base}.mp3: ${d.toFixed(2)} s, ${lufs.toFixed(1)} LUFS, ${peak.toFixed(1)} dBTP`);
  }
}

// ── audio.js ──────────────────────────────────────────────────────────────

const audio = createAudio();
await new Promise((r) => setTimeout(r, 10)); // let the loads settle
const ctx = audio.ctx;
const step = (seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) {
    if (ctx.state === 'running') ctx.currentTime += dt;
    audio.update(dt);
  }
};
const starts = () => events.filter((e) => e[0] === 'start');

audio.level('night-bed', 1);
audio.play('ui-start');
step(2);
check(starts().length === 0, 'nothing plays before unlock');

audio.unlock();
check(ctx.state === 'running', 'unlock resumes the context');
audio.level('night-bed', 1);
step(70);
const night = starts().filter((e) => e[1] === 'night-bed');
const length = durations['night-bed'];
const x = Math.min(AUDIO_DEFAULTS.crossfade, length / 4);
const spacing = night.slice(1).map((e, i) => e[2] - night[i][2]);
check(night.length >= 3, `the night bed loops (${night.length} copies over 70 s)`);
check(spacing.every((g) => Math.abs(g - (length - x)) < 1e-6), `each copy starts ${x} s before the last ends`);
const fades = night.map((e) => e[3].targets[0].gain.curves);
check(fades.every((c) => c.length === 2 && c[0].d === x && Math.abs(c[1].t - (c[0].t + length - x)) < 1e-6), 'each copy fades in and out over the overlap');
check(night.every((e) => Math.abs(e[3].stopAt - (e[2] + length)) < 1e-6), 'each copy stops at its end');
const bedGain = night[0][3].targets[0].targets[0].gain;
check(Math.abs(bedGain.value - SOUNDS['night-bed'].gain) < 0.01, `the bed reaches its level (${bedGain.value.toFixed(3)})`);
check(starts().every((e) => e[1] === 'night-bed'), 'beds at no level stay silent');

audio.level('night-bed', 0, 0.2);
step(5);
const before = night.length;
step(60);
check(starts().filter((e) => e[1] === 'night-bed').length - before <= 1, 'a bed that falls silent stops queueing');
check(bedGain.value < 0.01, 'and its gain is down');

audio.play('pulse', { cut: true });
audio.play('ui-hover', { pan: -0.5 });
const pulse = starts().find((e) => e[1] === 'pulse')[3];
check(!!starts().find((e) => e[1] === 'ui-hover'), 'one-shots play once unlocked');
audio.cut(0.3);
check(Math.abs(pulse.stopAt - (ctx.currentTime + 0.3)) < 1e-6, 'cut() stops a cut-scene one-shot');
audio.play('cliff-impact');
const impact = starts().find((e) => e[1] === 'cliff-impact')[3];
const duck = SOUNDS['cliff-impact'].duck;
// A bed copy runs src -> fade -> the bed's gain -> rest -> master; a
// one-shot src -> its gain -> rest, or straight to master if it ducks.
const rest = night[0][3].targets[0].targets[0].targets[0];
const [down, up] = rest.gain.targets ?? [];
check(impact.targets[0].targets[0] === rest.targets[0], 'the cliff impact goes round the duck');
check(down?.v === duck.to && up?.v === 1 && Math.abs(up.t - down.t - duck.hold) < 1e-6, 'and ducks the rest, holds and lets it back');
audio.play('launch');
const launch = starts().at(-1)[3];
audio.stop('launch', 0.2);
check(Math.abs(launch.stopAt - (ctx.currentTime + 0.2)) < 1e-6, 'stop() stops one sound by name');
audio.play('bank-whoosh');
check(/^bank-whoosh-[123]$/.test(starts().at(-1)[1]), 'a sound with variants plays one of them');

audio.held = true;
check(ctx.state === 'suspended', 'holding suspends the context');
const count = starts().length;
audio.play('launch');
check(starts().length === count, 'nothing new plays while held');
audio.held = false;
check(ctx.state === 'running', 'letting go resumes it');

console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
