import { SplatRelight } from '@viggle/splat-engine';

// Real light on her from the lamp fireflies (ambience.js `lamps`): one point
// light rides on each, through SplatRelight, so the side of her turned to a
// firefly warms and the far side keeps the night - rather than a glow laid
// evenly over all of her. Only she is relit, never the capture, and there is
// no key light: the light is the fireflies' alone.
//
// `amount` (0..1) fades it all; at 0 the pass stops rendering.

export const FIREFLY_LIGHT_DEFAULTS = {
  color: '#ffc46b',
  intensity: 1.4, // at a lamp's full brightness
  range: 1.4, // metres
  strength: 0.6, // how far the light replaces her baked look
  ambient: 0.55, // the floor on her unlit side
};

export async function createFireflyLight(scene, character, lamps, options = {}) {
  const o = { ...FIREFLY_LIGHT_DEFAULTS, ...options };
  const relight = SplatRelight.create(scene, { light: null, strength: 0, shadowStrength: 0, ambient: o.ambient, referenceLuminance: 1 });
  await relight.add(character);
  const lights = lamps.map(() => relight.addPointLight({ color: o.color, intensity: 0, range: o.range }));
  let amount = 0;

  return {
    relight,
    get amount() {
      return amount;
    },
    set amount(v) {
      amount = Math.min(Math.max(v, 0), 1);
      relight.strength = o.strength * amount;
    },
    update() {
      for (let i = 0; i < lights.length; i++) {
        lights[i].setPosition(lamps[i].pos);
        lights[i].light.intensity = o.intensity * lamps[i].brightness * amount;
      }
    },
  };
}
