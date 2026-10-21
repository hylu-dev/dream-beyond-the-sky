// Her hearing returning after the fall. Only the waking voice uses this bus;
// the original recordings and the surrounding ambience stay independent.
export function createWakeAudioRecovery(ctx, destination) {
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
  output.connect(destination);

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
    stats: () => ({ gain: output.gain.value, cutoff: input.frequency.value, distortion: wet.gain.value }),
  };
}
