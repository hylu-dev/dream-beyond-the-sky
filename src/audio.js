import { assetUrl } from './assetUrl.js';
import { createStreamingMusic } from './streamingMusic.js';
// The game's sound, in Web Audio: beds that loop under the scene at levels
// the game sets every frame, and one-shots on its moments. The files are
// public/assets/audio, made by tools/process-audio.mjs (prompts in
// tools/audio-sounds.mjs) and all levelled alike, so the mix lives here:
// `gain` is each sound's base level, and the game asks for 0..1 of it.
//
// Nothing plays until the page has been clicked or a key pressed (unlock(),
// from the gesture's own handler). Long music streams through media elements;
// short sounds decode in the background and are skipped if not ready. Beds
// overlap copies with equal-power crossfades, without relying on gapless MP3.

export const SOUNDS = {
  // Beds.
  'night-bed': { loop: true, gain: 0.85 },
  'dawn-bed': { loop: true, gain: 0.45 },
  'island-wind': { loop: true, gain: 1 },
  rumble: { loop: true, gain: 1 },
  'cloth-flap': { loop: true, gain: 0.55 },
  'flight-wind': { loop: true, gain: 1 },
  'flight-whistle': { loop: true, gain: 0.45 },
  turbulence: { loop: true, gain: 0.8 },
  'sky-bed': { loop: true, gain: 0.8 },
  // One-shots; `variants` files, one chosen at random each time.
  'ui-hover': { gain: 0.3 },
  'ui-start': { gain: 0.6 },
  'ui-skip': { gain: 0.5 },
  'approach-swell': { gain: 0.35 },
  'turn-swell': { gain: 0.45 },
  pulse: { gain: 1.3 },
  launch: { gain: 0.8 },
  'cloud-pass': { gain: 0.7 },
  'bank-whoosh': { gain: 0.45, variants: 3 },
  'cliff-pass': { gain: 0.7, variants: 3 },
  'cloud-whoosh': { gain: 0.55, variants: 4 },
  'cliff-gasp': { gain: 0.8 }, // her, as the rock comes at her
  // Music: the title screen's and the ending's, kept under the night; dawn,
  // from Start until she falls; the flight's; and the storm's, ending on the
  // blow.
  'music-night': { stream: true, loop: true, gain: 0.55, crossfade: 6 },
  'music-dawn': { gain: 0.8 },
  // Approved 03J: nine seconds at -30 LUFS, with its entrance/release baked in.
  'music-ledge': { gain: 0.8 },
  // Lift the recording's quiet opening by ~6 dB, then ease back as its
  // orchestra fills out. These are track seconds, including after a skip.
  'music-flight': { stream: true, gain: 0.8, introLift: { gain: 2, hold: 10.5, end: 12 } },
  'music-storm': { gain: 1 },
  // The hardest hit in the game; it ducks everything else (see play()).
  'cliff-impact': { gain: 1.5, duck: { to: 0.2, hold: 0.5, release: 2.5 } },
  // Her fall from it: the build to the blink, and her heart.
  'fall-rise': { gain: 1.1 },
  'heart-thump': { gain: 1 },
  // Her breath as she wakes under the tree.
  'wake-gasp': { gain: 0.8 },
  'wake-pant': { gain: 0.6 },
  'wake-breath': { gain: 0.55 },
  'wake-exhale': { gain: 0.55 },
  'wake-slide': { gain: 0.35, variants: 2 }, // her back down the trunk, soft
  'wake-settle': { gain: 0.4 }, // her last breath out, sliding down
  'wake-sigh': { gain: 0.7, variants: 5 },
  'birds-distant': { gain: 0.3, variants: 2 },
};

export const AUDIO_DEFAULTS = {
  url: assetUrl('audio/'),
  master: 0.9,
  crossfade: 1.5, // seconds a bed's loop overlaps itself, unless it says
  lookahead: 1, // seconds of a bed scheduled ahead
  levelSeconds: 0.5, // how quickly a bed follows its level, unless told
};

export function createAudio(options = {}) {
  const o = { ...AUDIO_DEFAULTS, ...options };
  const ctx = new AudioContext();
  // A gentle compressor over everything, so a pile-up never clips.
  const out = ctx.createDynamicsCompressor();
  out.threshold.value = -10;
  out.ratio.value = 4;
  const master = ctx.createGain();
  master.gain.value = o.master;
  master.connect(out).connect(ctx.destination);
  // Everything but a ducking one-shot goes through `rest`, for it to duck.
  const rest = ctx.createGain();
  rest.connect(master);
  const music = createStreamingMusic(ctx, rest, SOUNDS, o.url);
  music.prepare('music-night');

  const buffers = {}; // name -> [AudioBuffer, ...]
  for (const [name, sound] of Object.entries(SOUNDS)) {
    if (sound.stream) continue;
    const files = sound.variants ? Array.from({ length: sound.variants }, (_, i) => `${name}-${i + 1}`) : [name];
    Promise.all(files.map((f) => fetch(`${o.url}${f}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b))))
      .then((list) => (buffers[name] = list))
      .catch((err) => console.warn(`Sound ${name} unavailable.`, err));
  }

  // Equal-power fades for the loop's overlap.
  const N = 64;
  const fadeIn = Float32Array.from({ length: N }, (_, i) => Math.sin(((i / (N - 1)) * Math.PI) / 2));
  const fadeOut = fadeIn.slice().reverse();

  const beds = {};
  for (const [name, sound] of Object.entries(SOUNDS)) {
    if (!sound.loop || sound.stream) continue;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(rest);
    beds[name] = { name, gain, max: sound.gain, target: 0, value: 0, seconds: o.levelSeconds, next: 0, copies: new Set() };
  }

  // Keep a bed's copies queued `lookahead` ahead, each starting a crossfade
  // before the last ends.
  function schedule(bed, now) {
    const buffer = buffers[bed.name]?.[0];
    if (!buffer) return;
    const length = buffer.duration;
    const x = Math.min(SOUNDS[bed.name].crossfade ?? o.crossfade, length / 4);
    if (bed.next < now) bed.next = now + 0.02;
    while (bed.next < now + o.lookahead) {
      const t = bed.next;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const fade = ctx.createGain();
      fade.gain.setValueCurveAtTime(fadeIn, t, x);
      fade.gain.setValueCurveAtTime(fadeOut, t + length - x, x);
      src.connect(fade).connect(bed.gain);
      src.start(t);
      src.stop(t + length);
      bed.copies.add(src);
      src.onended = () => bed.copies.delete(src);
      bed.next = t + length - x;
    }
  }

  let unlocked = false;
  let held = false;
  const cuttable = new Set(); // one-shots cut() fades out
  const sounding = {}; // name -> one-shots of it still sounding, for stop()

  return {
    ctx,
    get unlocked() { return unlocked; },
    // Call from inside a click or key handler.
    // Every gesture tries again until it takes, in case the first call
    // wasn't from one.
    unlock() {
      unlocked = true;
      if (!held && ctx.state !== 'running') ctx.resume();
      music.unlock();
    },
    // Hold everything (the scene is paused) or let it go on.
    set held(v) {
      held = v;
      music.held = v;
      if (!unlocked) return;
      if (v) ctx.suspend();
      else ctx.resume();
    },
    get held() { return held; },

    // A bed's level, 0..1 of its gain, reached over about `seconds`.
    level(name, v, seconds = o.levelSeconds) {
      if (SOUNDS[name].stream) { music.level(name, v, seconds); return; }
      const bed = beds[name];
      bed.target = Math.min(Math.max(v, 0), 1);
      bed.seconds = seconds;
    },

    // A one-shot: `gain` 0..1 of its own, `pan` -1 (left) .. 1, `delay`
    // seconds, from `offset` seconds into it. `cut` ones are a cut-scene's, and go with cut(). A sound
    // with `duck` ({ to, hold, release }) drops everything else to `to` of
    // its level as it strikes, holds it `hold` seconds and lets it back over
    // about `release`.
    play(name, { gain = 1, pan = 0, delay = 0, offset = 0, cut = false } = {}) {
      if (SOUNDS[name].stream) {
        music.play(name, { gain, delay, offset, cut });
        return;
      }
      const list = buffers[name];
      if (!unlocked || held || !list) return;
      const src = ctx.createBufferSource();
      src.buffer = list[Math.floor(Math.random() * list.length)];
      const at = ctx.currentTime + delay;
      const g = ctx.createGain();
      g.gain.value = SOUNDS[name].gain * gain;
      let node = src.connect(g);
      if (pan) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.min(Math.max(pan, -1), 1);
        node = node.connect(p);
      }
      const duck = SOUNDS[name].duck;
      node.connect(duck ? master : rest);
      if (duck) {
        rest.gain.cancelScheduledValues(at);
        rest.gain.setTargetAtTime(duck.to, at, 0.01);
        rest.gain.setTargetAtTime(1, at + duck.hold, duck.release / 3);
      }
      src.start(at, offset);
      const shot = { src, g };
      (sounding[name] ??= new Set()).add(shot);
      if (cut) cuttable.add(shot);
      src.onended = () => {
        sounding[name].delete(shot);
        cuttable.delete(shot);
      };
    },

    // Fade out one sound's one-shots still sounding.
    stop(name, seconds = 0.3, { linear = false } = {}) {
      if (SOUNDS[name].stream) { music.stop(name, seconds); return; }
      const now = ctx.currentTime;
      for (const shot of sounding[name] ?? []) {
        if (linear) {
          shot.g.gain.cancelScheduledValues(now);
          shot.g.gain.setValueAtTime(shot.g.gain.value, now);
          shot.g.gain.linearRampToValueAtTime(0, now + seconds);
        } else shot.g.gain.setTargetAtTime(0, now, seconds / 3);
        shot.src.stop(now + seconds);
        // Keep fading cut-scene sounds cuttable until onended, so skip can
        // shorten a long transition that is already in progress.
      }
      sounding[name]?.clear();
    },

    // Fade out the cut-scene's one-shots still sounding.
    cut(seconds = 0.3) {
      music.cut(seconds);
      const now = ctx.currentTime;
      for (const { src, g } of cuttable) {
        const level = g.gain.value;
        g.gain.cancelScheduledValues(now);
        g.gain.setValueAtTime(level, now);
        g.gain.setTargetAtTime(0, now, seconds / 3);
        src.stop(now + seconds);
      }
      cuttable.clear();
    },

    update(dt) {
      if (!unlocked || held) return;
      music.update(dt);
      const now = ctx.currentTime;
      for (const bed of Object.values(beds)) {
        bed.value += (bed.target - bed.value) * (1 - Math.exp(-dt / Math.max(bed.seconds, 1e-3)));
        bed.gain.gain.setTargetAtTime(bed.value * bed.max, now, 0.05);
        // A silent bed stops, and starts afresh when it is wanted.
        if (bed.target > 0 || bed.value > 1e-3) schedule(bed, now);
        else if (bed.copies.size) {
          for (const src of bed.copies) src.stop();
          bed.copies.clear();
          bed.next = 0;
        }
      }
    },
    // Read-only diagnostics, also exposed through window.__demo.audio.
    stats() {
      const decoded = Object.values(buffers).flat();
      return { decodedBuffers: decoded.length,
        decodedBytes: decoded.reduce((sum, buffer) => sum + buffer.length * buffer.numberOfChannels * 4, 0),
        beds: Object.fromEntries(Object.entries(beds).map(([name, bed]) => [name, {
          ready: !!buffers[name], target: bed.target, gain: bed.value * bed.max, copies: bed.copies.size,
        }])),
        streaming: music.stats() };
    },
  };
}
