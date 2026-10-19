import { Entity, Vec3 } from 'playcanvas';
import { fbm1 } from './noise.js';
import { canvasTexture, createQuad, drawGlow, makeSprite, setOpacity, setTint, smooth, spriteMaterial } from './sprites.js';

// Life in the air of the island:
//  - fireflies drifting in a few pools of open air, blinking; they glow at
//    night and are faint sparks by day;
//  - motes of dust and pollen hanging in front of the camera, catching the
//    light;
//  - leaves carried past on the wind, and thin streaks of air,
//    both of which come with the wind's strength.
// Splats never hide sprites, so the fireflies' pools should sit in open air
// on the camera's side of things. A pool may ask for its own `count`; the
// rest share out the remaining fireflies. A pool may also ask for `lamps`:
// that many of its fireflies are bigger and burn steadier, and `lamps` below
// says where each is and how bright, for a real light to follow.

export const AMBIENCE_DEFAULTS = {
  fireflies: 44,
  fireflySizeM: [0.05, 0.1],
  fireflyWander: 0.6, // metres round each one's home
  // Fireflies fade out toward the lens: gone where half the frame's height
  // is under this many metres, fully there where it is twice that. On a long
  // lens that is well out, so a near one's wander doesn't dart across the
  // frame.
  fireflyNearM: 0.25,
  lampSizeM: 0.12,
  motes: 70,
  moteSizeM: [0.006, 0.016],
  moteRange: [0.8, 6], // metres in front of the camera
  leaves: 27,
  leafSizeM: [0.05, 0.1],
  leafRange: [1.2, 7],
  streaks: 24,
  streakRange: [1.5, 8],
};

export function createAmbience(scene, { fireflyPools = [], options = {} } = {}) {
  const o = { ...AMBIENCE_DEFAULTS, ...options };
  const device = scene.app.graphicsDevice;
  const root = new Entity('ambience');
  scene.app.root.addChild(root);
  const quad = createQuad(device);
  const tex = (w, h, draw) => canvasTexture(device, w, h, draw);
  const fireflyMat = spriteMaterial(tex(64, 64, (c, w, h) => drawGlow(c, w, h, { core: 0.1, falloff: 2.6 })), { additive: true });
  const moteMat = spriteMaterial(tex(32, 32, (c, w, h) => drawGlow(c, w, h, { core: 0.25, falloff: 1.6 })), { additive: true });
  const leafMat = spriteMaterial(tex(64, 64, drawLeaf));
  const streakMat = spriteMaterial(tex(16, 128, drawStreak), { additive: true });

  const rand = ([a, b]) => a + Math.random() * (b - a);
  const tmp = new Vec3();
  const camPos = new Vec3();
  const camFwd = new Vec3();
  const camRight = new Vec3();
  const camUp = new Vec3();
  let nearDepth = 1; // where the fireflies have faded in by, for the lens
  const wind = new Vec3(0, 0, 1); // direction, set per frame
  let time = 0;
  let enabled = true;

  // A point in front of the camera, `d` metres out, spread over the view.
  function inView(d, out, spreadX = 0.9, spreadY = 0.55) {
    out.copy(camFwd).mulScalar(d).add(camPos);
    out.add(tmp.copy(camRight).mulScalar((Math.random() * 2 - 1) * d * spreadX));
    out.add(tmp.copy(camUp).mulScalar((Math.random() * 2 - 1) * d * spreadY));
    return out;
  }
  const viewDepth = (p) => tmp.copy(p).sub(camPos).dot(camFwd);

  // ── Fireflies ───────────────────────────────────────────────────────────

  const pools = fireflyPools.map((p) => ({ center: new Vec3(p.center.x, p.center.y, p.center.z), size: p.size, wander: p.wander, lamps: p.lamps ?? 0 }));
  const counted = fireflyPools.reduce((n, p) => n + (p.count ?? 0), 0);
  const shared = fireflyPools.filter((p) => p.count == null).length;
  const poolOf = fireflyPools.flatMap((p, k) =>
    Array(p.count ?? Math.round(Math.max(o.fireflies - counted, 0) / Math.max(shared, 1))).fill(k),
  );
  const fireflies = pools.length
    ? poolOf.map((k, i) => {
        const pool = pools[k];
        const s = makeSprite(root, quad, fireflyMat, `firefly-${i}`);
        s.home = new Vec3(
          pool.center.x + (Math.random() - 0.5) * pool.size.x,
          pool.center.y + (Math.random() - 0.5) * pool.size.y,
          pool.center.z + (Math.random() - 0.5) * pool.size.z,
        );
        s.pos = new Vec3().copy(s.home);
        s.size = rand(o.fireflySizeM);
        s.seed = i * 7.13;
        s.blink = [Math.random() * 10, 0.35 + Math.random() * 0.5];
        s.wander = pool.wander ?? o.fireflyWander;
        s.drift = new Vec3();
        if (pool.lamps > 0) {
          pool.lamps--;
          s.lamp = true;
          s.size = o.lampSizeM;
          s.blink[1] *= 0.4;
          s.brightness = 0;
        }
        return s;
      })
    : [];
  const lamps = fireflies.filter((s) => s.lamp);

  function updateFireflies(dt, night, gust) {
    const glow = 0.18 + 0.82 * night;
    for (const s of fireflies) {
      const t = time * 0.12;
      const w = s.wander;
      // The wind pushes them off a little and they find their way back.
      s.drift.add(tmp.copy(wind).mulScalar(gust * 0.5 * dt));
      s.drift.mulScalar(Math.exp(-0.6 * dt));
      s.pos.set(
        s.home.x + fbm1(t, s.seed) * w + s.drift.x,
        s.home.y + fbm1(t * 1.3, s.seed + 1) * w * 0.5 + s.drift.y,
        s.home.z + fbm1(t, s.seed + 2) * w + s.drift.z,
      );
      s.entity.setPosition(s.pos);
      s.entity.lookAt(camPos, Vec3.UP);
      // A slow swell and a quick bright pulse now and then.
      const ph = time * s.blink[1] + s.blink[0];
      // A lamp swells and dims slowly rather than flashing.
      const pulse = s.lamp ? 0.5 + 0.5 * Math.sin(ph) : Math.max(Math.sin(ph), 0) ** 6;
      const b = (s.lamp ? 0.7 + 0.3 * pulse : 0.25 + 0.75 * pulse) * glow;
      s.brightness = b;
      const size = s.size * (0.7 + 0.6 * pulse);
      s.entity.setLocalScale(size, size, 1);
      setOpacity(s, b * smooth(nearDepth / 2, nearDepth, viewDepth(s.pos)));
      setTint(s, [1, 0.86 + 0.1 * pulse, 0.36 + 0.2 * pulse]);
    }
  }

  // ── Motes ───────────────────────────────────────────────────────────────

  const motes = Array.from({ length: o.motes }, (_, i) => {
    const s = makeSprite(root, quad, moteMat, `mote-${i}`);
    s.pos = new Vec3();
    s.size = rand(o.moteSizeM);
    s.seed = i * 3.7;
    s.age = 0;
    return s;
  });
  const respawnMote = (s) => {
    inView(rand(o.moteRange), s.pos);
    s.age = 0;
  };

  function updateMotes(dt, light, gust) {
    for (const s of motes) {
      s.age += dt;
      s.pos.add(tmp.copy(wind).mulScalar((0.05 + gust * 1.6) * dt));
      s.pos.y += fbm1(time * 0.3, s.seed) * 0.03 * dt;
      const d = viewDepth(s.pos);
      const off = tmp.copy(s.pos).sub(camPos).sub(new Vec3().copy(camFwd).mulScalar(d));
      if (d < o.moteRange[0] * 0.6 || d > o.moteRange[1] * 1.2 || off.length() > d * 1.2) respawnMote(s);
      s.entity.setPosition(s.pos);
      s.entity.lookAt(camPos, Vec3.UP);
      s.entity.setLocalScale(s.size, s.size, 1);
      const glint = 0.5 + 0.5 * Math.sin(time * 2.1 + s.seed * 5);
      setOpacity(s, (0.12 + 0.3 * glint) * light * smooth(0, 1, s.age) * smooth(0.5, 1.2, d));
      setTint(s, [1, 0.92, 0.75]);
    }
  }

  // ── Leaves ──────────────────────────────────────────────────────────────

  const leaves = Array.from({ length: o.leaves }, (_, i) => {
    const s = makeSprite(root, quad, leafMat, `leaf-${i}`);
    s.pos = new Vec3();
    s.vel = new Vec3();
    s.size = rand(o.leafSizeM);
    s.seed = i * 5.3;
    s.spin = rand([-4, 4]);
    s.angle = Math.random() * 6.28;
    s.age = 0;
    s.live = false;
    return s;
  });
  // A leaf comes in from upwind, off the edge of the view.
  function launchLeaf(s) {
    const d = rand(o.leafRange);
    inView(d, s.pos, 1.0, 0.6);
    const across = tmp.copy(wind).sub(new Vec3().copy(camFwd).mulScalar(wind.dot(camFwd)));
    if (across.lengthSq() > 1e-4) s.pos.sub(across.normalize().mulScalar(d * 1.1));
    s.vel.set(0, 0, 0);
    s.age = 0;
    s.live = true;
  }

  function updateLeaves(dt, gust, light) {
    // How many are out is the wind's strength.
    const want = Math.round(leaves.length * Math.min(gust * 1.2, 1));
    let live = 0;
    for (const s of leaves) {
      if (!s.live) {
        if (live < want && Math.random() < dt * 6) launchLeaf(s);
        else {
          if (s.opacity !== 0) setOpacity(s, 0);
          continue;
        }
      }
      live++;
      s.age += dt;
      // Carried on the wind with a flutter, sinking slowly.
      const flutter = fbm1(time * 1.7, s.seed);
      s.vel.lerp(s.vel, tmp.copy(wind).mulScalar(1.5 + gust * 4.5), 1 - Math.exp(-2 * dt));
      s.pos.add(tmp.copy(s.vel).mulScalar(dt));
      s.pos.y += (flutter * 0.8 - 0.25) * dt;
      s.angle += s.spin * dt;
      const d = viewDepth(s.pos);
      if (s.age > 8 || d < 0.3 || d > o.leafRange[1] * 1.6) {
        s.live = false;
        continue;
      }
      s.entity.setPosition(s.pos);
      s.entity.lookAt(camPos, Vec3.UP);
      s.entity.rotateLocal(0, 0, (s.angle * 180) / Math.PI);
      // Tumbling: the face turns edge-on now and then.
      const face = 0.35 + 0.65 * Math.abs(Math.sin(s.angle * 0.7 + s.seed));
      s.entity.setLocalScale(s.size, s.size * face, 1);
      setOpacity(s, 0.95 * smooth(0, 0.4, s.age) * smooth(8, 6.5, s.age) * smooth(0.3, 0.9, d));
      const shade = 0.45 + 0.55 * light;
      setTint(s, [shade, shade, shade]);
    }
  }

  // ── Wind streaks ────────────────────────────────────────────────────────

  const streaks = Array.from({ length: o.streaks }, (_, i) => {
    const s = makeSprite(root, quad, streakMat, `air-${i}`);
    s.pos = new Vec3();
    s.age = 99;
    s.life = 1;
    s.len = 1;
    return s;
  });

  function updateStreaks(dt, gust, light) {
    for (const s of streaks) {
      s.age += dt;
      if (s.age > s.life) {
        if (Math.random() > gust * dt * 8) {
          if (s.opacity !== 0) setOpacity(s, 0);
          continue;
        }
        inView(rand(o.streakRange), s.pos, 1.0, 0.5);
        s.age = 0;
        s.life = rand([0.5, 1.1]);
        s.len = rand([0.8, 2.4]);
      }
      s.pos.add(tmp.copy(wind).mulScalar((3 + gust * 9) * dt));
      s.entity.setPosition(s.pos);
      s.entity.lookAt(camPos, wind);
      s.entity.setLocalScale(0.02, s.len, 1);
      const life = Math.sin((s.age / s.life) * Math.PI);
      setOpacity(s, 0.07 * gust * life * (0.5 + 0.5 * light));
    }
  }

  return {
    get enabled() {
      return enabled;
    },
    set enabled(v) {
      enabled = v;
      root.enabled = v;
    },
    // The lamp fireflies: { pos, brightness 0..1 } each, live.
    get lamps() {
      return lamps;
    },
    // night 0..1 (fireflies glow); light 0..1 (how much daylight catches the
    // motes); wind 0..1 its strength; windDir a world direction it blows.
    update(dt, camera, { night = 0, light = 1, wind: gust = 0, windDir = null } = {}) {
      if (!enabled) return;
      time += dt;
      camPos.copy(camera.getPosition());
      camFwd.copy(camera.forward);
      camRight.copy(camera.right);
      camUp.copy(camera.up);
      nearDepth = (2 * o.fireflyNearM) / Math.tan((camera.camera.fov * Math.PI) / 360);
      if (windDir) wind.copy(windDir).normalize();
      updateFireflies(dt, night, gust);
      updateMotes(dt, light, gust);
      updateLeaves(dt, gust, light);
      updateStreaks(dt, gust, light);
    },
  };
}

// A small leaf, gold-green, with a vein.
function drawLeaf(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#c9b45a');
  g.addColorStop(1, '#6f8a3a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.04);
  ctx.quadraticCurveTo(w * 0.95, h * 0.45, w * 0.5, h * 0.96);
  ctx.quadraticCurveTo(w * 0.05, h * 0.45, w * 0.5, h * 0.04);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,70,30,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.1);
  ctx.lineTo(w * 0.5, h * 0.9);
  ctx.stroke();
}

function drawStreak(ctx, w, h) {
  const along = ctx.createLinearGradient(0, 0, 0, h);
  along.addColorStop(0, 'rgba(255,255,255,0)');
  along.addColorStop(0.5, 'rgba(255,255,255,1)');
  along.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = along;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'destination-in';
  const across = ctx.createLinearGradient(0, 0, w, 0);
  across.addColorStop(0, 'rgba(0,0,0,0)');
  across.addColorStop(0.5, 'rgba(0,0,0,1)');
  across.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = across;
  ctx.fillRect(0, 0, w, h);
}
