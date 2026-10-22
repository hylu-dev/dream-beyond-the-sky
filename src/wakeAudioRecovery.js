// Her hearing returning after the fall. Only the waking voice uses this bus;
// the original recordings and the surrounding ambience stay independent.
// After the recovery the voice is placed where the camera hears it from
// (place()): the recordings are close-miked, so with distance it loses its
// chest and its air, drops in level and takes on a short, dark outdoor tail.
export const WAKE_VOICE_SPACE = {
  near: 1, // metres; at or inside this it sounds as recorded, all but dry
  far: 10, // and from here as distant as it gets; the first few metres count most
  level: [1, 0.32],
  lowDb: [-2, -7], // a low shelf at 220 Hz, taking out the close mic's boom
  highDb: [-2, -11], // a high shelf at 4.5 kHz, the air's loss
  wet: [0.1, 0.32], // the tail's send
  tail: 0.8, // seconds
  follow: 0.06, // seconds' smoothing, so a camera cut does not click
};

// A short stereo tail of darkening, decaying noise: open air round her, not a room.
function outdoorTail(ctx, seconds) {
  const length = Math.round(ctx.sampleRate * seconds), pre = Math.round(ctx.sampleRate * 0.012);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    let low = 0;
    for (let i = pre; i < length; i++) {
      const u = (i - pre) / (length - pre);
      low += (Math.random() * 2 - 1 - low) * (0.5 - 0.42 * u); // darker as it dies
      data[i] = low * Math.exp(-6 * u);
    }
  }
  return buffer;
}

export function createWakeAudioRecovery(ctx, destination, space = WAKE_VOICE_SPACE) {
  const input = ctx.createBiquadFilter();
  input.type = 'lowpass';
  input.frequency.value = 20000;
  input.Q.value = 0.5;
  const shaper = ctx.createWaveShaper();
  shaper.curve = Float32Array.from({ length: 1024 }, (_, i) => {
    const x = i * 2 / 1023 - 1;
    return Math.tanh(2.5 * x) / Math.tanh(2.5);
  });
  shaper.oversample = '2x';
  const dry = ctx.createGain(), wet = ctx.createGain(), output = ctx.createGain();
  wet.gain.value = 0;
  input.connect(dry).connect(output);
  input.connect(shaper).connect(wet).connect(output);
  const lowShelf = ctx.createBiquadFilter(), highShelf = ctx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 220;
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 4500;
  const level = ctx.createGain(), send = ctx.createGain(), tail = ctx.createConvolver();
  tail.buffer = outdoorTail(ctx, space.tail);
  output.connect(lowShelf).connect(highShelf).connect(level).connect(destination);
  highShelf.connect(send).connect(tail).connect(level);

  const mix = ([a, b], u) => a + (b - a) * u;
  function place(metres, seconds = space.follow) {
    const u = Math.sqrt(Math.min(Math.max((metres - space.near) / (space.far - space.near), 0), 1));
    const now = ctx.currentTime;
    for (const [param, v] of [
      [level.gain, mix(space.level, u)], [lowShelf.gain, mix(space.lowDb, u)],
      [highShelf.gain, mix(space.highDb, u)], [send.gain, mix(space.wet, u)],
    ]) {
      if (seconds > 0) param.setTargetAtTime(v, now, seconds);
      else {
        param.cancelScheduledValues(now);
        param.setValueAtTime(v, now);
      }
    }
  }
  place(space.near, 0);

  function recover(param, from, to, now, seconds, exponential = false) {
    param.cancelScheduledValues(now);
    param.setValueAtTime(from, now);
    param.setValueAtTime(from, now + 0.35);
    if (exponential) param.exponentialRampToValueAtTime(to, now + seconds);
    else param.linearRampToValueAtTime(to, now + seconds);
  }
  return {
    input,
    start(seconds = 4.5) {
      const now = ctx.currentTime;
      recover(output.gain, 0.28, 1, now, seconds);
      recover(input.frequency, 650, 20000, now, seconds, true);
      recover(dry.gain, 0.45, 1, now, seconds);
      recover(wet.gain, 0.55, 0, now, seconds);
    },
    place,
    stats: () => ({
      gain: output.gain.value, cutoff: input.frequency.value, distortion: wet.gain.value,
      space: { level: level.gain.value, lowDb: lowShelf.gain.value, highDb: highShelf.gain.value, wet: send.gain.value },
    }),
  };
}
