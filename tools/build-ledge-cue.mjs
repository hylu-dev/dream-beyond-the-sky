// Shorter in-game edit of 03J; keep the original audition and its mix level.
import { copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = `${root}art/audio/drop-review/raw/03J.mp3`;
const master = `${root}art/audio/drop-review/audio/03J-game.mp3`;
const ffmpeg = (args) => {
  const result = spawnSync('ffmpeg', ['-nostdin', '-hide_banner', '-y', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || String(result.error));
  return result.stderr;
};
const shape = (seconds) => `treble=g=-3:f=3200:t=q:w=0.707,atrim=duration=${seconds},asetpts=PTS-STARTPTS,afade=t=in:d=5,areverse,afade=t=in:d=2.5,areverse,`;

// Derive the original nine-second master's gain, so trimming its sustain
// does not make the shorter cue louder. Re-render from the raw performance.
const report = ffmpeg(['-i', source, '-af', `${shape(9)}loudnorm=print_format=json`, '-f', 'null', '-']);
const measured = JSON.parse(report.slice(report.lastIndexOf('{'), report.lastIndexOf('}') + 1));
const gain = (-30 - Number(measured.input_i)).toFixed(2);
ffmpeg(['-i', source, '-af', `${shape(7)}volume=${gain}dB,aresample=176400,alimiter=limit=0.84:level=false,aresample=44100`, '-ar', '44100', '-b:a', '160k', master]);
copyFileSync(master, `${root}public/assets/audio/music-ledge.mp3`);
console.log('Built seven-second 03J cue with the original gain, pitch and smooth release.');
