// Turns the chosen raw takes (art/audio/raw, from tools/generate-audio.mjs)
// into the files the game loads, public/assets/audio/<name>.mp3, or
// <name>-<n>.mp3 for a sound with several. Every file is brought to one
// loudness, so src/audio.js does all the mixing: beds to BED_LUFS with their
// gain alone, so the loop still meets itself; one-shots to SHOT_LUFS with
// leading silence trimmed and the tail faded. A limiter holds the peaks the
// gain would push over PEAK_DB, oversampled so it holds between samples too. A sound with `mix` is first built from its
// layers, each trimmed, filtered and brought to LAYER_LUFS before its own dB
// and delay; it keeps its lead-in, so the layers' timing holds. A layer can
// be synthesized instead (sound 'lavfi', its source in place of the take),
// and `reverb` sends the mix through a long dark convolution tail. A piece
// of music keeps its lead-in too, and is cut to its `seconds`; one made
// elsewhere (in Suno) is `file`, under art/audio, in place of takes, and
// can start `from` seconds into it, easing in over `fadeIn`.

import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SOUNDS } from './audio-sounds.mjs';

const ART = fileURLToPath(new URL('../art/audio/', import.meta.url));
const RAW = `${ART}raw/`;
const OUT = fileURLToPath(new URL('../public/assets/audio/', import.meta.url));
// Built here first, and swapped in only once every sound has been made, so
// a failure leaves the game's sounds as they were.
const NEXT = fileURLToPath(new URL('../public/assets/audio.next/', import.meta.url));
const BED_LUFS = -24;
const SHOT_LUFS = -18;
const PEAK_DB = -1.5;
const TAIL_FADE = 0.08; // seconds, unless the sound says
const LAYER_LUFS = -20;
const TRIM = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.01';

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-y', ...args], { encoding: 'utf8' });
  if (r.status) throw new Error(r.stderr);
  return r.stderr; // where ffmpeg reports
}

// Integrated loudness (LUFS) of the input (`-i` args or a file) after `filter`.
function loudness(input, filter) {
  const report = ffmpeg([...(Array.isArray(input) ? input : ['-i', input]), '-af', `${filter}loudnorm=print_format=json`, '-f', 'null', '-']);
  return Number(JSON.parse(report.slice(report.lastIndexOf('{'), report.lastIndexOf('}') + 1)).input_i);
}

const duration = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }));

// Mixes `layers` ([sound, take, dB, delay, filter]) into `file`, then runs
// `after` over it, then the reverb ({ seconds, wet }) if there is one: pink
// noise decaying over `seconds`, darkened, as the impulse response, `wet`
// of it under the dry.
function mix(layers, file, after, reverb) {
  const inputs = [];
  const chains = layers.map(([name, take, db = 0, delay = 0, filter], k) => {
    const input = name === 'lavfi' ? ['-f', 'lavfi', '-i', take] : ['-i', `${RAW}${name}-${take}.mp3`];
    inputs.push(...input);
    const shape = `${name === 'lavfi' ? '' : `${TRIM},`}${filter ? `${filter},` : ''}`;
    // Padded with silence, which the measure ignores, so a layer cut
    // shorter than its 400 ms window can be measured.
    const gain = LAYER_LUFS + db - loudness(input, `${shape}apad=pad_dur=1,`);
    return `[${k}:a]${shape}volume=${gain.toFixed(2)}dB,adelay=${Math.round(delay * 1000)}:all=1,aformat=channel_layouts=stereo[l${k}]`;
  });
  let graph = `${chains.join(';')};${layers.map((_, k) => `[l${k}]`).join('')}amix=inputs=${layers.length}:normalize=0:duration=longest${after ? `,${after}` : ''}`;
  if (reverb) {
    const d = reverb.seconds;
    inputs.push('-f', 'lavfi', '-i', `anoisesrc=d=${d}:c=pink:r=44100:a=0.5,afade=t=out:st=0:d=${d}:curve=exp,lowpass=f=2000,aformat=channel_layouts=stereo`);
    graph += `,apad=pad_dur=${d},asplit=2[dry][send];[send][${layers.length}:a]afir[wet];[dry][wet]amix=inputs=2:weights='1 ${reverb.wet}':normalize=0`;
  }
  ffmpeg([...inputs, '-filter_complex', graph, '-ar', '44100', file]);
}

const scratch = mkdtempSync(`${tmpdir()}/audio-mix-`);
rmSync(NEXT, { recursive: true, force: true });
mkdirSync(NEXT, { recursive: true });
for (const sound of SOUNDS) {
  if (sound.layer) continue;
  const sources = sound.mix
    ? sound.mix.map((layers, i) => {
        const file = `${scratch}/${sound.name}-${i + 1}.wav`;
        mix(layers, file, sound.mixFilter, sound.reverb);
        return file;
      })
    : sound.file
      ? [`${ART}${sound.file}`]
      : (sound.use ?? [1]).map((take) => `${RAW}${sound.name}-${take}.mp3`);
  sources.forEach((src, i) => {
    const dst = `${NEXT}${sound.name}${sources.length > 1 ? `-${i + 1}` : ''}.mp3`;
    // Approved masters retain their exact mix and envelopes on every rebuild.
    if (sound.prepared) {
      copyFileSync(src, dst);
      console.log(`${dst.slice(NEXT.length).padEnd(22)} prepared master copied unchanged`);
      return;
    }
    // One-shots start on their first sound (a mix or a piece of music on its
    // own lead-in, cut to its `seconds`) and fade out at the end.
    const from = sound.from ?? 0;
    const cut = `${sound.seconds ? `atrim=start=${from}:end=${from + sound.seconds},asetpts=PTS-STARTPTS,` : ''}${sound.fadeIn ? `afade=t=in:d=${sound.fadeIn},` : ''}`;
    const start = sound.mix || sound.music ? cut : `${TRIM},`;
    // A loop of music is only cut: its crossfade (src/audio.js) makes the seam.
    const shape = sound.loop ? (sound.music ? cut : '') : `${start}areverse,afade=t=in:d=${sound.fade ?? TAIL_FADE},areverse,`;
    const lufs = loudness(src, shape);
    const gain = (sound.lufs ?? (sound.loop ? BED_LUFS : SHOT_LUFS)) - lufs;
    const limit = `alimiter=limit=${10 ** (PEAK_DB / 20)}:attack=5:release=60:level=false`;
    // Limited at four times the rate, to catch the peaks between samples.
    ffmpeg(['-i', src, '-vn', '-af', `${shape}volume=${gain.toFixed(2)}dB,aresample=176400,${limit},aresample=44100`, '-ar', '44100', '-b:a', sound.loop ? '128k' : '160k', dst]);
    console.log(`${dst.slice(NEXT.length).padEnd(22)} ${duration(dst).toFixed(2)}s  ${lufs.toFixed(1)} LUFS ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB`);
  });
}
rmSync(scratch, { recursive: true, force: true });
rmSync(OUT, { recursive: true, force: true });
renameSync(NEXT, OUT);

// art/audio/audition.html: every sound as it ships, beside every raw take
// (green where one ships, itself or in a mix), to choose by ear (`npm run
// dev`, then /art/audio/audition.html). Change a sound's `use` or `mix` and
// run this again to swap.
const raw = new Set(readdirSync(RAW));
const shipped = new Set(readdirSync(OUT));
const used = new Set(
  SOUNDS.flatMap((s) =>
    s.mix ? s.mix.flat().map(([name, take]) => `${name}-${take}`) : s.layer ? [] : (s.use ?? [1]).map((t) => `${s.name}-${t}`),
  ),
);
const player = (src, loop) => `<audio controls ${loop ? 'loop' : ''} preload="none" src="${src}"></audio>`;
const rows = SOUNDS.map((sound) => {
  const files = [...shipped].filter((f) => f === `${sound.name}.mp3` || new RegExp(`^${sound.name}-\\d+\\.mp3$`).test(f)).sort();
  const out = sound.layer ? '<td><div>layer</div></td>' : `<td class="out"><div>shipped</div>${files.map((f) => player(`/assets/audio/${f}`, sound.loop)).join('<br>')}</td>`;
  const takes = Array.from({ length: sound.takes ?? 0 }, (_, i) => i + 1).filter((t) => raw.has(`${sound.name}-${t}.mp3`));
  const cells = takes.map((t) => {
    const on = used.has(`${sound.name}-${t}`);
    return `<td class="${on ? 'used' : ''}"><div>take ${t}${on ? ' · used' : ''}</div>${player(`raw/${sound.name}-${t}.mp3`, sound.loop)}</td>`;
  });
  const about =
    sound.text ??
    (sound.file ? `From art/audio/${sound.file}` : sound.plan
      ? sound.plan.map((p) => `${p.text ?? ''} ${p.seconds} s: ${p.styles.join(', ')}`).join('<br>')
      : `Mixed from ${[...new Set(sound.mix.flat().map(([n]) => n))].join(', ')}`);
  return `<tr><th>${sound.name}${sound.loop ? ' <small>loop</small>' : ''}<p>${about}</p></th>${out}${cells.join('')}</tr>`;
});
writeFileSync(
  fileURLToPath(new URL('../art/audio/audition.html', import.meta.url)),
  `<!doctype html>
<meta charset="utf-8">
<title>Sound takes</title>
<style>
  body { font: 14px system-ui, sans-serif; margin: 24px; background: #111; color: #ddd; }
  table { border-collapse: collapse; }
  th, td { border-top: 1px solid #333; padding: 10px; vertical-align: top; text-align: left; }
  th { width: 360px; } th p { font-weight: normal; color: #888; font-size: 12px; margin: 6px 0 0; }
  td.used { background: #1d2a1d; } td.out { background: #1d2230; } td div { margin-bottom: 6px; color: #aaa; }
</style>
<h1>Sound takes</h1>
<p>Blue is what the game plays; green marks the raw takes it is made from. To swap one, change the sound's <code>use</code> or <code>mix</code> in tools/audio-sounds.mjs and run <code>node tools/process-audio.mjs</code>.</p>
<table>${rows.join('\n')}</table>
`,
);
