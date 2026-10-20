import { Entity, Quat, Vec3 } from 'playcanvas';
import { canvasTexture, createQuad, drawGlow, makeSprite, setOpacity, setTint, smooth, spriteMaterial } from './sprites.js';

// The sun, the moon and the stars, drawn over the capture's painted sky as
// glowing sprites far out along timeOfDay's sun direction. They follow the
// camera like a skybox. The sun is a hot core in a wide warm bloom, the moon
// a pale disc opposite it, and the stars wheel round with them, coming out
// as the sun goes down. Splats never hide sprites, so each body fades out as
// it nears the horizon (where the floating islands are) and the stars keep
// to the upper sky.

export const CELESTIAL_DEFAULTS = {
  distance: 900, // metres out from the camera
  sunCoreDeg: 3, // angular size of the sun's disc and its glows
  sunGlowDeg: 16,
  sunHaloDeg: 48,
  moonDeg: 3.6,
  moonGlowDeg: 16,
  horizonFade: [1, 7], // degrees of elevation over which a body fades in
  stars: 420,
  starMinElevation: 10,
  starSizeDeg: [0.35, 0.9],
  starsFrom: -2, // sun elevation where the stars start coming out
  starsFull: -14,
};

export function createCelestial(scene, timeOfDay, options = {}) {
  const o = { ...CELESTIAL_DEFAULTS, ...options };
  const device = scene.app.graphicsDevice;
  const root = new Entity('celestial');
  scene.app.root.addChild(root);
  const quad = createQuad(device);
  const glow = (core, falloff) => spriteMaterial(canvasTexture(device, 128, 128, (c, w, h) => drawGlow(c, w, h, { core, falloff })), { additive: true });

  const sunHalo = makeSprite(root, quad, glow(0, 2.6), 'sun-halo');
  const sunGlow = makeSprite(root, quad, glow(0.04, 2.2), 'sun-glow');
  const sunCore = makeSprite(root, quad, glow(0.55, 1.2), 'sun-core');
  const moonGlow = makeSprite(root, quad, glow(0, 2.4), 'moon-glow');
  const moon = makeSprite(root, quad, spriteMaterial(canvasTexture(device, 128, 128, drawMoon)), 'moon');
  const starMat = glow(0.15, 2);
  const starDirs = [];
  const stars = Array.from({ length: o.stars }, (_, i) => {
    const s = makeSprite(root, quad, starMat, `star-${i}`);
    // Spread evenly over the sphere; only the upper sky ever shows.
    const y = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    starDirs.push(new Vec3(Math.cos(a) * r, y, Math.sin(a) * r));
    s.size = o.starSizeDeg[0] + Math.random() ** 2 * (o.starSizeDeg[1] - o.starSizeDeg[0]);
    s.twinkle = [Math.random() * 6.28, 1.5 + Math.random() * 3];
    s.warmth = Math.random();
    return s;
  });

  const axis = timeOfDay.sunAxis.normalize();
  const turn = new Quat();
  const dir = new Vec3();
  const pos = new Vec3();
  const camPos = new Vec3();
  const deg = Math.PI / 180;
  let time = 0;
  let enabled = true;

  const sizeFor = (angleDeg) => 2 * o.distance * Math.tan((angleDeg * deg) / 2);

  function place(sprite, direction, angleDeg) {
    pos.copy(direction).mulScalar(o.distance).add(camPos);
    sprite.entity.setPosition(pos);
    sprite.entity.lookAt(camPos, Vec3.UP);
    const size = sizeFor(angleDeg);
    sprite.entity.setLocalScale(size, size, 1);
  }

  return {
    get enabled() {
      return enabled;
    },
    set enabled(v) {
      enabled = v;
      root.enabled = v;
    },
    // `visibility` scales everything, e.g. to keep them off a shot.
    update(dt, camera, { visibility = 1, sunRadiance = 1 } = {}) {
      if (!enabled) return;
      time += dt;
      camPos.copy(camera.getPosition());
      const sun = timeOfDay.sunDirection;
      const el = timeOfDay.sunElevation;
      const [f0, f1] = o.horizonFade;

      // The sun: whiter and smaller high up, a big orange bloom low down.
      const low = 1 - smooth(4, 30, el);
      const sunUp = smooth(f0 - 3, f1, el) * visibility;
      place(sunHalo, sun, o.sunHaloDeg * (1 + low * 0.4));
      place(sunGlow, sun, o.sunGlowDeg * (1 + low * 0.5));
      place(sunCore, sun, o.sunCoreDeg * (1 + low * 0.25));
      setTint(sunHalo, [1, 0.62 + 0.25 * (1 - low), 0.32 + 0.4 * (1 - low)]);
      setTint(sunGlow, [1, 0.72 + 0.2 * (1 - low), 0.45 + 0.4 * (1 - low)]);
      setTint(sunCore, [1, 0.93, 0.8 + 0.18 * (1 - low)]);
      setOpacity(sunHalo, 0.22 * sunUp * sunRadiance);
      setOpacity(sunGlow, 0.55 * sunUp * sunRadiance);
      setOpacity(sunCore, 0.95 * sunUp);

      // The moon, opposite; it pales out in daylight.
      dir.copy(sun).mulScalar(-1);
      const moonEl = -el;
      const night = smooth(o.starsFrom, o.starsFull, el);
      const moonUp = smooth(f0 - 3, f1, moonEl) * (0.35 + 0.65 * night) * visibility;
      place(moonGlow, dir, o.moonGlowDeg);
      place(moon, dir, o.moonDeg);
      setTint(moonGlow, [0.62, 0.72, 1]);
      setTint(moon, [0.92, 0.95, 1]);
      setOpacity(moonGlow, 0.45 * moonUp);
      setOpacity(moon, 0.95 * moonUp);

      // The stars wheel round the sun's axis with it.
      turn.setFromAxisAngle(axis, timeOfDay.celestialAngle / deg);
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        turn.transformVector(starDirs[i], dir);
        const starEl = Math.asin(dir.y) / deg;
        const a = night * smooth(o.starMinElevation, o.starMinElevation + 10, starEl) * visibility;
        if (a < 0.01) {
          if (s.opacity !== 0) setOpacity(s, 0);
          continue;
        }
        place(s, dir, s.size);
        const tw = 0.65 + 0.35 * Math.sin(time * s.twinkle[1] + s.twinkle[0]);
        setOpacity(s, Math.min(a * tw * 1.4, 1));
        setTint(s, s.warmth > 0.8 ? [1, 0.88, 0.72] : [0.85, 0.9, 1]);
      }
    },
  };
}

// A pale disc with soft grey maria and a bright limb, fading at the edge.
function drawMoon(ctx, w, h) {
  const g = ctx.createRadialGradient(w * 0.45, h * 0.42, w * 0.05, w / 2, h / 2, w * 0.48);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.85, 'rgba(225,230,240,1)');
  g.addColorStop(1, 'rgba(200,210,230,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, w * 0.48, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(120,130,150,0.28)';
  for (const [x, y, r] of [[0.38, 0.4, 0.12], [0.6, 0.35, 0.08], [0.55, 0.6, 0.14], [0.35, 0.65, 0.07], [0.68, 0.55, 0.06]]) {
    ctx.beginPath();
    ctx.arc(x * w, y * h, r * w, 0, Math.PI * 2);
    ctx.fill();
  }
}
