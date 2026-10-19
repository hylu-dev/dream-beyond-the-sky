// Smooth 1D value noise in [-1, 1]: cheap, deterministic per seed, and
// continuous, which is all camera shake and gusts need.

function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash(i + seed * 57.0);
  const b = hash(i + 1 + seed * 57.0);
  return (a + (b - a) * u) * 2 - 1;
}

// Two octaves, for motion that is not obviously periodic.
export function fbm1(x, seed = 0) {
  return noise1(x, seed) * 0.65 + noise1(x * 2.13, seed + 13) * 0.35;
}
