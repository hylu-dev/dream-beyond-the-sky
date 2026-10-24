import assert from 'node:assert/strict';
import { createStreamingMusic } from '../src/streamingMusic.js';
import { SOUNDS } from '../src/audio.js';
import { TestMedia } from './audio-test-media.mjs';

class Param {
  intrinsic = 1;
  automated = null;
  get value() { return this.automated ?? this.intrinsic; }
  set value(v) { this.intrinsic = v; }
  // Model the important reuse rule: an intrinsic value write cannot override
  // an existing automation target. We inspect targets, not the smoothing DSP.
  setTargetAtTime(v) { this.automated = v; }
  setValueAtTime(v) { this.automated = v; }
  cancelScheduledValues() {}
}
class Node {
  gain = new Param();
  targets = [];
  connect(node) { this.targets.push(node); return node; }
  disconnect() { this.targets = []; }
}
class Context extends EventTarget {
  currentTime = 0;
  state = 'suspended';
  sources = [];
  createGain() { return new Node(); }
  createMediaElementSource(media) {
    const node = new Node();
    node.media = media;
    this.sources.push(node);
    return node;
  }
  stateTo(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}
globalThis.Audio = TestMedia;
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
function setup() {
  const ctx = new Context(), destination = new Node();
  const music = createStreamingMusic(ctx, destination, SOUNDS, '/assets/audio/');
  const media = ctx.sources.map(source => source.media);
  const flight = media.find(m => m.name === 'music-flight');
  const night = media.filter(m => m.name === 'music-night');
  const envelope = m => ctx.sources.find(source => source.media === m).targets[0];
  const fade = m => envelope(m).targets[0];
  const advance = async seconds => {
    for (let remaining = seconds; remaining > 1e-8; remaining -= 0.05) {
      const dt = Math.min(remaining, 0.05);
      if (ctx.state === 'running') ctx.currentTime += dt;
      for (const m of media) m.tick(dt);
      music.update(dt);
      await flush();
    }
  };
  const unlock = async () => { ctx.stateTo('running'); music.unlock(); await flush(); music.update(0); await flush(); };
  return { ctx, music, destination, media, flight, night, envelope, fade, advance, unlock };
}

// Loading is staged and player count stays bounded across several loop seams.
{
  const { ctx, music, media, night, flight, envelope, advance, unlock } = setup();
  assert.equal(media.length, 3);
  assert.ok(media.every(m => m.loads === 0 && m.preload === 'none'));
  music.prepare('music-night');
  assert.ok(night.every(m => m.loads === 1));
  assert.equal(flight.loads, 0);
  music.level('music-night', 1, 3);
  music.update(1);
  assert.ok(media.every(m => m.paused), 'nothing plays before a gesture');
  await unlock();
  assert.equal(flight.loads, 1);
  assert.ok(flight.paused, 'priming does not play the flight cue');
  await advance(185);
  assert.ok(night.every(m => !m.paused), 'both players overlap at the loop seam');
  const power = night.reduce((sum, m) => sum + envelope(m).gain.value ** 2, 0);
  assert.ok(Math.abs(power - 1) < 0.02, `equal-power six-second overlap: ${power}`);
  await advance(6);
  assert.equal(night.filter(m => !m.paused).length, 1, 'old copy retires after overlap');
  await advance(370);
  assert.equal(ctx.sources.length, 3, 'players and media sources are reused across loops');
  assert.ok(media.every(m => m.loads === 1), 'looping does not repeatedly reset media loading');
  music.level('music-night', 0, 0.2);
  await advance(3);
  assert.ok(night.every(m => m.paused), 'silent menu track stops');
  music.level('music-night', 1, 3);
  await advance(1);
  assert.ok(night.some(m => !m.paused && m.currentTime < 2), 'ending/menu can start again from its opening');
  music.destroy();
  assert.ok(media.every(m => m.src === '' && m.paused));
}

// Offsets and the opening lift use track time; early cuts cannot be undone by
// scheduled envelopes or a late ready/play callback.
for (const [offset, lift] of [[0, 2], [5.165, 2], [11.25, 1.5], [13, 1]]) {
  const { ctx, music, flight, envelope, fade, advance, unlock } = setup();
  await unlock();
  music.play('music-flight', { offset, delay: 0.2, cut: true });
  await advance(0.15);
  assert.ok(flight.paused, 'delayed cue stays silent until due');
  await advance(0.05);
  assert.ok(Math.abs(flight.currentTime - offset) < 0.051);
  assert.ok(Math.abs(envelope(flight).gain.value - lift) < 0.01, 'opening lift follows track offset');
  assert.equal(fade(flight).targets[0].gain.value, 0.8);
  music.cut(0.45);
  assert.equal(fade(flight).gain.value, 0);
  await advance(0.5);
  assert.ok(flight.paused);
  assert.equal(envelope(flight).gain.value, 0, 'cancellation overrides the old automated envelope');
  flight.dispatchEvent(new Event('canplay'));
  await flush();
  assert.ok(flight.paused, 'late ready event cannot restart a cancelled cue');
  music.play('music-flight', { offset: 5.165 });
  await advance(0.1);
  assert.ok(!flight.paused, 'replay works after a cut');
  assert.equal(fade(flight).gain.value, 1, 'replay overrides the previous fade automation');
  assert.ok(Math.abs(flight.currentTime - 5.265) < 0.06);
  music.stop('music-flight', 5);
  await advance(4.9);
  assert.ok(!flight.paused, 'storm fade retains its five-second duration');
  await advance(0.2);
  assert.ok(flight.paused);
  assert.ok(ctx.sources.length === 3);
  music.destroy();
}

// Late loading and a mid-track stall catch up instead of shifting the score.
{
  const { ctx, music, flight, envelope, advance, unlock } = setup();
  flight.autoReady = false;
  await unlock();
  music.play('music-flight', { offset: 5.165, cut: true });
  await advance(2);
  assert.equal(envelope(flight).gain.value, 0, 'silent until its data arrives');
  assert.equal(flight.currentTime, 0, 'no media time passes without data');
  flight.ready();
  await advance(0.1);
  assert.ok(Math.abs(flight.currentTime - 7.265) < 0.06, 'late load catches up to the original cue');
  flight.stall();
  await advance(2);
  flight.ready();
  await advance(0.1);
  assert.ok(Math.abs(flight.currentTime - 9.365) < 0.06, 'buffering does not permanently shift the score');
  music.held = true;
  ctx.stateTo('suspended');
  const position = flight.currentTime;
  await advance(10);
  assert.equal(flight.currentTime, position, 'media pauses along with Web Audio');
  music.held = false;
  ctx.stateTo('running');
  await advance(0.2);
  assert.ok(Math.abs(flight.currentTime - position - 0.2) < 0.06);
  ctx.stateTo('interrupted');
  const interrupted = flight.currentTime;
  await advance(1);
  assert.equal(flight.currentTime, interrupted, 'browser interruption pauses media too');
  ctx.stateTo('running');
  await advance(0.2);
  assert.ok(!flight.paused);
  music.destroy();
}

// Denied autoplay retries only after another gesture, with no runaway promises.
{
  const { music, flight, advance, unlock } = setup();
  flight.blockPlay = true;
  await unlock();
  music.play('music-flight', { cut: true });
  await advance(2);
  const attempts = flight.plays;
  await advance(2);
  assert.equal(flight.plays, attempts);
  flight.blockPlay = false;
  await unlock();
  await advance(0.1);
  assert.ok(!flight.paused);
  assert.ok(Math.abs(flight.currentTime - 4.1) < 0.06, 'permission retry keeps the original cue clock');
  music.destroy();
}

// Cancelling before metadata arrives must prevent playback later.
{
  const { music, flight, advance, unlock } = setup();
  flight.autoReady = false;
  await unlock();
  music.play('music-flight', { cut: true });
  music.cut(0.45);
  flight.ready();
  await advance(1);
  assert.ok(flight.paused);
  assert.equal(music.stats().find(track => track.name === 'music-flight').active, 0);
  music.destroy();
}

// A play promise can resolve late even after canplay. Reconcile the actual
// playback event, and never resurrect an obsolete cue after its promise settles.
{
  const { music, flight, advance, unlock } = setup();
  await unlock();
  flight.deferPlay = true;
  music.play('music-flight', { offset: 5.165, cut: true });
  await flush();
  // A pending browser play has not actually advanced the media yet.
  flight.paused = true;
  await advance(1);
  flight.deferPlay = false;
  flight.finishPlay();
  await flush();
  assert.ok(Math.abs(flight.currentTime - 6.165) < 0.06, 'late playback catches up at the playing event');
  music.stop('music-flight', 0);
  flight.deferPlay = true;
  music.play('music-flight', { cut: true });
  await flush();
  music.cut(0.45);
  flight.finishPlay();
  await flush();
  assert.ok(flight.paused, 'a late play promise cannot revive a cancelled cue');
  music.destroy();
}
// iOS Safari buffers only once play() is called, and can drop a paused
// element's buffer. A cue on such an element must still call play(), or it
// waits forever for data that never comes.
{
  const { music, flight, envelope, advance, unlock } = setup();
  for (const m of [flight]) m.bufferOnPlay = true;
  await unlock();
  await advance(0.1);
  assert.ok(flight.paused, 'priming leaves the flight cue paused');
  flight.purge();
  await advance(30);
  music.play('music-flight', { cut: true });
  await advance(0.5);
  assert.ok(!flight.paused, 'a cue on an unbuffered element still calls play()');
  assert.ok(Math.abs(flight.currentTime - 0.5) < 0.06, `it plays from the cue time: ${flight.currentTime}`);
  assert.ok(envelope(flight).gain.value > 0.5, 'and is audible');
  music.destroy();
}
console.log('Streaming music checks passed: staged loading, fixed players, crossfades, offsets, lift, buffering, pause, interruption, cancellation, replay and buffer-on-play.');
