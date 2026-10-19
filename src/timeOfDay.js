import { Vec3 } from 'playcanvas';
import { SkyDome, SplatRelight } from '@viggle/splat-engine';

// A day/night time-lapse for one environment and the character in it:
//  - the capture's painted sky is clipped away past `skyClipMetres` and a
//    procedural SkyDome stands in for it (twilight band, stars at night);
//  - SplatRelight's key light follows a sun across the sky, warming near the
//    horizon and handing over to a dim blue moon below it, with a sky fill
//    that dims alongside;
//  - a little night tint covers what the relight cannot reach, such as the
//    patches of sky baked into the canopy.
//
// Everything is keyed on the sun's elevation in degrees, so the look of a
// moment does not depend on how fast the cycle runs.
//
// The sun runs on a great circle: it rises at `sunRise.azimuth` (degrees from
// +Z toward +X), climbing at `inclination` to the horizon off toward the
// side `turn` (+1 toward higher azimuths), peaks at noon, sets opposite and
// passes under at midnight. The moon is opposite it. `sunDirection` and
// `celestialAngle` let a sky (celestial.js) draw both and turn the stars.

const SKY_KEYS = [
  { el: -90, zenith: '#02040c', horizon: '#0a1430', ground: '#03060f', warm: '#1a1030' },
  { el: -10, zenith: '#050a1e', horizon: '#1b2350', ground: '#060a18', warm: '#3a2048' },
  { el: -3, zenith: '#1c2a5e', horizon: '#7a4a7a', ground: '#1a1a33', warm: '#ff6a3d' },
  { el: 3, zenith: '#3b5ea8', horizon: '#ff9a5a', ground: '#5a4a5a', warm: '#ffb36b' },
  { el: 15, zenith: '#4f8fd8', horizon: '#ffd9a8', ground: '#8fb0cc', warm: '#ffe0b0' },
  { el: 40, zenith: '#3d8fe0', horizon: '#cfe9ff', ground: '#9cc7e8', warm: '#fff0d0' },
  { el: 90, zenith: '#3d8fe0', horizon: '#cfe9ff', ground: '#9cc7e8', warm: '#fff0d0' },
];

const SUN_COLOR_KEYS = [
  { el: 0, color: '#ff5a2a' },
  { el: 8, color: '#ff9a4a' },
  { el: 25, color: '#ffe0b0' },
  { el: 60, color: '#fff2d9' },
];

const SKY_FILL_KEYS = [
  { el: -90, color: '#1b2a5a', intensity: 0.08 },
  { el: -6, color: '#3a3a7a', intensity: 0.12 },
  { el: 2, color: '#c08080', intensity: 0.28 },
  { el: 20, color: '#bcd8ff', intensity: 0.45 },
  { el: 90, color: '#bcd8ff', intensity: 0.45 },
];

// Grade on the island (and, at `characterShare`, on her): the capture's
// colours are mixed toward `color` by `intensity`.
const GRADE_KEYS = [
  { el: -90, color: '#03081c', intensity: 0.8 },
  { el: -8, color: '#0a1030', intensity: 0.74 },
  { el: -2, color: '#3a2050', intensity: 0.5 },
  { el: 3, color: '#ff7a3a', intensity: 0.32 },
  { el: 12, color: '#ffb070', intensity: 0.14 },
  { el: 30, color: '#ffffff', intensity: 0 },
  { el: 90, color: '#ffffff', intensity: 0 },
];

export const TIME_OF_DAY_DEFAULTS = {
  cycleSeconds: 12,
  sunRise: { azimuth: 120, inclination: 70, turn: 1 },
  sunIntensity: 1.1,
  moonIntensity: 0.25,
  moonColor: '#9fb4ff',
  relightStrength: 0.85,
  characterShare: 0.85, // how much of the island's grade she takes
  // Firefly light on her (characterGlow): her grade is drawn toward this
  // instead, lifting her out of the dark.
  glowColor: '#ffd38a',
  glowIntensity: 0.26,
  skyClipMetres: 22,
  starsBelow: -8, // sun elevation where the star field switches on
  // Debug switches, wired to URL parameters in main.js.
  useSkyDome: true,
  // Off: in splat-engine 0.2.0 a relight pass over the island stops the
  // SkyDome drawing, leaving a black sky. Kept to retest on a newer engine;
  // her firefly light (fireflyLight.js) has a relight pass of its own, so
  // turning this on needs that one folded into it first.
  useRelight: false,
  fixedPhase: null, // a number freezes the cycle there
};

export async function createTimeOfDay(scene, { environment, character, captureOrigin, bounds, options = {} }) {
  const o = { ...TIME_OF_DAY_DEFAULTS, ...options };

  environment.setClipDistanceOrigin(new Vec3(captureOrigin.x, captureOrigin.y, captureOrigin.z));
  environment.setClipDistance(0, o.skyClipMetres);

  const relight = o.useRelight
    ? SplatRelight.create(scene, { strength: o.relightStrength, referenceLuminance: 1.1 })
    : null;

  const sky = o.useSkyDome ? SkyDome.create(scene) : null;
  sky?.setLook({ mode: 3 });
  if (relight) {
    await Promise.all([
      // An outdoor capture spans far more than the hilltop, so crop the proxy
      // to the island and keep the voxels coarse enough to build quickly.
      relight.add(environment, { bounds, proxy: { voxelSize: 0.15 } }),
      relight.add(character),
    ]);
  }

  let phase = o.fixedPhase ?? 0; // 0 = noon, 0.25 = sunset, 0.5 = midnight, 0.75 = sunrise
  let settle = null; // { from, to, seconds, t } while easing to a stop
  // How fast the clock runs, as a multiple of one cycle per cycleSeconds,
  // easing toward `speedGoal` with time constant `speedTau` seconds.
  let speed = 1;
  let speedGoal = 1;
  let speedTau = 0;

  // The sun's circle: it rises along `rise` and climbs along `climb`.
  const deg = Math.PI / 180;
  const r = o.sunRise;
  const rise = new Vec3(Math.sin(r.azimuth * deg), 0, Math.cos(r.azimuth * deg));
  const side = r.azimuth + 90 * Math.sign(r.turn || 1);
  const climb = new Vec3(
    Math.cos(r.inclination * deg) * Math.sin(side * deg),
    Math.sin(r.inclination * deg),
    Math.cos(r.inclination * deg) * Math.cos(side * deg),
  );
  const glowColor = toRgb(o.glowColor);
  let characterGlow = 0;
  const sunDirection = new Vec3();
  const grade = { intensity: 0, color: { r: 1, g: 1, b: 1 } };
  let sunEl = 0;

  // Radians round the sun's circle since sunrise.
  const angleAt = (p) => (p - 0.75) * Math.PI * 2;

  const directionAt = (p, out) => {
    const a = angleAt(p);
    return out.copy(rise).mulScalar(Math.cos(a)).add(new Vec3().copy(climb).mulScalar(Math.sin(a)));
  };

  function apply() {
    directionAt(phase, sunDirection);
    sunEl = Math.asin(Math.min(Math.max(sunDirection.y, -1), 1)) / deg;
    const sunAz = Math.atan2(sunDirection.x, sunDirection.z) / deg;

    if (relight) applyRelight(sunEl, sunAz);
    sky?.setLook({
      zenith: sampleHex(SKY_KEYS, sunEl, 'zenith'),
      horizon: sampleHex(SKY_KEYS, sunEl, 'horizon'),
      ground: sampleHex(SKY_KEYS, sunEl, 'ground'),
      warm: sampleHex(SKY_KEYS, sunEl, 'warm'),
      dark: sunEl < o.starsBelow,
    });

    grade.color = toRgb(sampleHex(GRADE_KEYS, sunEl, 'color'));
    grade.intensity = sampleNumber(GRADE_KEYS, sunEl, 'intensity');
    environment.setTint(grade.intensity, grade.color);
    const g = characterGlow;
    const own = grade.intensity * o.characterShare;
    character.setTint(own + (o.glowIntensity - own) * g, {
      r: grade.color.r + (glowColor.r - grade.color.r) * g,
      g: grade.color.g + (glowColor.g - grade.color.g) * g,
      b: grade.color.b + (glowColor.b - grade.color.b) * g,
    });
  }

  function applyRelight(sunEl, sunAz) {
    // Key light: the sun while it is up, otherwise the moon opposite it.
    // Both fade to nothing at the horizon, so the hand-over does not pop.
    if (sunEl > 0) {
      relight.lightElevation = sunEl;
      relight.lightAzimuth = sunAz;
      relight.setLightColor(sampleHex(SUN_COLOR_KEYS, sunEl, 'color'));
      relight.lightIntensity = o.sunIntensity * smoothstep(0, 12, sunEl);
    } else {
      relight.lightElevation = -sunEl;
      relight.lightAzimuth = sunAz + 180;
      relight.setLightColor(o.moonColor);
      relight.lightIntensity = o.moonIntensity * smoothstep(0, 12, -sunEl);
    }

    relight.setSkyColor(sampleHex(SKY_FILL_KEYS, sunEl, 'color'));
    relight.skyIntensity = sampleNumber(SKY_FILL_KEYS, sunEl, 'intensity');
  }

  apply();

  return {
    update(dt) {
      if (settle) {
        settle.t = Math.min(settle.t + dt / settle.seconds, 1);
        const ease = 1 - (1 - settle.t) ** 3;
        phase = (settle.from + (settle.to - settle.from) * ease) % 1;
      } else if (o.fixedPhase == null) {
        speed = speedTau > 0 ? speed + (speedGoal - speed) * (1 - Math.exp(-dt / speedTau)) : speedGoal;
        phase = (phase + (speed * dt) / o.cycleSeconds) % 1;
      }
      apply();
    },
    get phase() {
      return phase;
    },
    // A unit vector toward the sun, and its height in degrees.
    sunDirection,
    get sunElevation() {
      return sunEl;
    },
    // Radians round the sky since sunrise, for turning the stars with it.
    get celestialAngle() {
      return angleAt(phase);
    },
    get sunAxis() {
      return new Vec3().cross(rise, climb);
    },
    // The island's colour grade right now: { intensity, color }.
    grade,
    // 0..1: how much she is lit by the fireflies round her rather than
    // graded with the island.
    get characterGlow() {
      return characterGlow;
    },
    set characterGlow(v) {
      characterGlow = v;
    },
    // Toward the sun at phase `p`, without moving the clock.
    sunDirectionAt(p, out = new Vec3()) {
      return directionAt(p, out);
    },
    // The phase at which the sun stands `elevation` degrees up, rising
    // (or setting, with `setting`).
    phaseAtElevation(elevation, { setting = false } = {}) {
      const a = Math.asin(Math.sin(elevation * deg) / Math.sin(r.inclination * deg));
      return (((setting ? Math.PI - a : a) / (Math.PI * 2) + 0.75) % 1 + 1) % 1;
    },
    // Phase per second right now.
    get rate() {
      if (settle) return (3 * (settle.to - settle.from) * (1 - settle.t) ** 2) / settle.seconds;
      return o.fixedPhase == null ? speed / o.cycleSeconds : 0;
    },
    setPhase(p) {
      if (o.fixedPhase != null) return;
      phase = p;
      settle = null;
      apply();
    },
    // Run the clock at `multiple` times its normal speed (0 stops it), easing
    // there over about `seconds`.
    setSpeed(multiple, seconds = 0) {
      speedGoal = multiple;
      speedTau = seconds / 3;
      if (seconds <= 0) speed = multiple;
    },
    // Run the clock forward to the next time it reads `target` over
    // `seconds`, easing to a stop, and hold it there; at least `minTurns` of
    // a day go by first. Just past the target it simply stops. Without
    // `seconds` it takes as long as keeps the clock's current speed going
    // into the ease.
    settleAt(target, seconds, { minTurns = 0 } = {}) {
      let ahead = (((target - phase) % 1) + 1) % 1;
      if (ahead > 0.96 && minTurns === 0) ahead = 0;
      while (ahead < minTurns) ahead += 1;
      if (seconds == null) seconds = Math.max((3 * ahead) / Math.max(this.rate, 1e-3), 0.5);
      settle = { from: phase, to: phase + ahead, seconds, t: 0 };
    },
    settleAtNoon(seconds) {
      this.settleAt(0, seconds);
    },
    get settled() {
      return settle != null && settle.t >= 1;
    },
    // Hand the scene back untouched, e.g. when leaving for another one.
    disable() {
      if (sky) sky.enabled = false;
      if (relight) relight.enabled = false;
      environment.setTint(0);
      character.setTint(0);
    },
    // And take it up again, as it was left.
    enable() {
      if (sky) sky.enabled = true;
      if (relight) relight.enabled = true;
      apply();
    },
  };
}

// ── Keyframe helpers ──────────────────────────────────────────────────────

function smoothstep(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

function bracket(keys, el) {
  let i = 0;
  while (i < keys.length - 2 && el > keys[i + 1].el) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = Math.min(Math.max((el - a.el) / (b.el - a.el), 0), 1);
  return { a, b, t };
}

function sampleNumber(keys, el, field) {
  const { a, b, t } = bracket(keys, el);
  return a[field] + (b[field] - a[field]) * t;
}

function sampleHex(keys, el, field) {
  const { a, b, t } = bracket(keys, el);
  const ca = parseHex(a[field]);
  const cb = parseHex(b[field]);
  return toHex(ca.map((v, k) => v + (cb[k] - v) * t));
}

function parseHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toRgb(hex) {
  const [r, g, b] = parseHex(hex);
  return { r: r / 255, g: g / 255, b: b / 255 };
}

function toHex(rgb) {
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}
