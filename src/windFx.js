import { Entity, Vec3 } from 'playcanvas';
import { canvasTexture, createQuad, makeSprite as addSprite, setOpacity, smooth, spriteMaterial } from './sprites.js';

// Close-range speed cues for flight, all world-fixed so their parallax sells
// speed while the distant scenery barely moves:
//  - thick cumulus clouds she flies past, each a cluster of overlapping soft
//    sprites with a flat grey-blue base and bright billowing tops, streamed
//    along her path so a new one is always coming up;
//  - thin wind streaks right beside the camera.
// placeWipe() parks a dense bank right on her line: flying through it fills
// the frame with cloud, which is where the scene change hides.

export const WIND_DEFAULTS = {
  clouds: 12,
  spritesPerCloud: 16,
  cloudRadius: [12, 26], // metres
  cloudSpacing: [20, 34], // metres along her path between clouds; gaps let the sky show
  sideSwitch: 0.75, // chance the next cloud is on the other side, keeping a channel open
  clearingChance: 0.2, // chance of a long open stretch after a cloud
  clearingLength: [45, 80], // metres of open sky that reveals the backdrop
  cloudAhead: 130, // clouds appear this far ahead and fade in
  cloudOffset: [3, 14], // sideways from her path to the cloud's dense core
  closeCloudChance: 0.4, // a cloud that passes within a few metres
  closeOffset: [0, 2.5], // its outer wisps still brush the camera
  cloudDrop: [-14, 5], // vertical offset; mostly below, so she skims the tops
  deckChance: 0.18, // a wide bank right under her path that she skims over
  deckRadius: [20, 34],
  deckDrop: [-5, -2], // where the deck's dense tops sit below her
  cloudOpacity: 0.97,
  baseColor: [0.7, 0.76, 0.86],
  topColor: [1, 1, 1],
  streaks: 48,
  streakLength: [0.6, 1.8],
  streakWidth: [0.015, 0.04],
  streakAhead: [6, 26],
  streakOffset: [1.5, 7],
  streakAlpha: 0.12,
  wipeRadius: 16,
};

export function createWindFx(scene, options = {}) {
  const o = { ...WIND_DEFAULTS, ...options };
  const app = scene.app;
  const device = app.graphicsDevice;
  const root = new Entity('wind-fx');
  app.root.addChild(root);

  const quad = createQuad(device);
  const cloudMaterials = [0, 1, 2].map((seed) =>
    spriteMaterial(canvasTexture(device, 128, 128, (c, w, h) => drawCloud(c, w, h, seed))),
  );
  const streakMaterial = spriteMaterial(canvasTexture(device, 16, 128, drawStreak));

  const rand = ([a, b]) => a + Math.random() * (b - a);
  const tmp = new Vec3();
  const spawn = new Vec3();
  const side = new Vec3();
  const lift = new Vec3();
  const dir = new Vec3();
  const camPos = new Vec3();
  const camFwd = new Vec3();

  const makeSprite = (name, material) => addSprite(root, quad, material, name);

  // ── Clouds ──────────────────────────────────────────────────────────────

  const clouds = Array.from({ length: o.clouds }, (_, c) => ({
    center: new Vec3(),
    radius: 1,
    age: 0,
    sprites: Array.from({ length: o.spritesPerCloud }, (_, i) => ({
      ...makeSprite(`cloud-${c}-${i}`, cloudMaterials[(c + i) % cloudMaterials.length]),
      offset: new Vec3(),
      size: 1,
    })),
  }));
  let cursor = 0; // distance along her path where the next cloud goes
  let cloudSide = 1; // which side of her path the last cloud went
  const nextSpacing = () =>
    rand(o.cloudSpacing) + (Math.random() < o.clearingChance ? rand(o.clearingLength) : 0);

  // The point `along` metres down her line of flight, level with her.
  function pathPoint(s, along, out) {
    return out.copy(s.forward).mulScalar(along - s.pos.dot(s.forward)).add(s.pos);
  }

  function placeCloud(cloud, s, along) {
    const deck = Math.random() < o.deckChance;
    const close = Math.random() < o.closeCloudChance;
    const offset = rand(close ? o.closeOffset : o.cloudOffset);
    const r = rand(deck ? o.deckRadius : o.cloudRadius);
    // Mostly alternate sides, so there is a channel through them to fly down.
    if (Math.random() < o.sideSwitch) cloudSide = -cloudSide;
    const sideSign = cloudSide;
    pathPoint(s, along, cloud.center);
    if (deck) {
      // Under her line, nudged a little to one side, its top a few metres down.
      const nudge = sideSign * rand([0, r * 0.3]);
      cloud.center.x += s.left.x * nudge;
      cloud.center.z += s.left.z * nudge;
      cloud.center.y = s.altitude + rand(o.deckDrop) - r * 0.9;
    } else {
      // Out to one side, and mostly below her line so she skims over the tops.
      // Sprites spread about 1.7 r from the centre; keeping the dense part
      // off her line makes the cloud a wall sliding past, not a fog she is in.
      cloud.center.x += s.left.x * sideSign * (offset + r * 1.2);
      cloud.center.z += s.left.z * sideSign * (offset + r * 1.2);
      cloud.center.y = s.altitude + rand(o.cloudDrop) - (close ? r * 0.3 : 0);
    }
    fillCloud(cloud, r);
  }

  function fillCloud(cloud, r) {
    cloud.radius = r;
    cloud.age = 0;
    // A cumulus: wide and deep, a flat base, the billows piled on top.
    for (const sp of cloud.sprites) {
      const a = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * r;
      sp.offset.set(Math.cos(a) * rr, Math.pow(Math.random(), 0.7) * r * 0.55, Math.sin(a) * rr * 0.8);
      sp.size = r * rand([0.75, 1.35]) * (1 - (sp.offset.y / r) * 0.4);
      const t = Math.min(sp.offset.y / (r * 0.55), 1);
      const shade = [0, 1, 2].map((k) => o.baseColor[k] + (o.topColor[k] - o.baseColor[k]) * t);
      sp.meshInstance.setParameter('material_emissive', shade);
      sp.entity.setPosition(tmp.copy(cloud.center).add(sp.offset));
      sp.entity.setLocalScale(sp.size, sp.size, 1);
    }
  }

  function seedClouds(s, clearAhead) {
    cursor = s.pos.dot(s.forward) + clearAhead;
    for (const cloud of clouds) {
      placeCloud(cloud, s, cursor);
      cloud.age = 10; // already faded in
      cursor += nextSpacing();
    }
  }

  function updateClouds(dt, s) {
    const along = s.pos.dot(s.forward);
    for (const cloud of clouds) {
      // Recycle a cloud once the camera is past it, out to the front of the stream.
      tmp.copy(cloud.center).sub(camPos);
      if (tmp.dot(camFwd) < -cloud.radius - 6) {
        cursor = Math.max(cursor, along + o.cloudAhead * 0.8);
        placeCloud(cloud, s, cursor);
        cursor += nextSpacing();
      }
      cloud.age += dt;
      const dist = tmp.copy(cloud.center).sub(camPos).length();
      const fade = smooth(o.cloudAhead + 20, o.cloudAhead - 20, dist) * smooth(0, 1.5, cloud.age);
      for (const sp of cloud.sprites) {
        const d = tmp.copy(sp.entity.getPosition()).sub(camPos).length();
        // Thin out the sprites right at the lens so passing close reads as
        // flying through wisps, not a card hitting the camera.
        setOpacity(sp, o.cloudOpacity * visibility * fade * smooth(0.8, 4, d));
        sp.entity.lookAt(camPos, Vec3.UP);
      }
    }
  }

  // ── Streaks ─────────────────────────────────────────────────────────────

  const streaks = Array.from({ length: o.streaks }, (_, i) => ({
    ...makeSprite(`streak-${i}`, streakMaterial),
    size: 1,
    width: 1,
    age: 0,
  }));
  for (const st of streaks) st.meshInstance.setParameter('material_emissive', [0.82, 0.87, 0.95]);

  // A point `ahead` metres along her path and `offset` metres off it, in a
  // random direction around the path.
  function spawnPoint(s, ahead, offset, out) {
    side.cross(dir, Vec3.UP);
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize();
    lift.cross(side, dir).normalize();
    const a = Math.random() * Math.PI * 2;
    out.copy(s.pos).add(tmp.copy(dir).mulScalar(ahead));
    out.add(tmp.copy(side).mulScalar(Math.cos(a) * offset));
    out.add(tmp.copy(lift).mulScalar(Math.sin(a) * offset * 0.6));
    return out;
  }

  function respawnStreak(st, s, first) {
    const ahead = first ? rand([0, o.streakAhead[1]]) : rand(o.streakAhead);
    st.entity.setPosition(spawnPoint(s, ahead, rand(o.streakOffset), spawn));
    st.size = rand(o.streakLength);
    st.width = rand(o.streakWidth);
    st.age = 0;
  }

  function updateStreaks(dt, s, rush) {
    const alpha = o.streakAlpha * visibility * (0.5 + rush) * (1 + s.pocket);
    for (const st of streaks) {
      tmp.copy(st.entity.getPosition()).sub(camPos);
      if (tmp.dot(camFwd) < -2 || tmp.length() > o.streakAhead[1] + 10) respawnStreak(st, s, false);
      st.age += dt;
      const d = tmp.copy(st.entity.getPosition()).sub(camPos).length();
      setOpacity(st, alpha * smooth(0, 0.3, st.age) * smooth(1.5, 5, d));
      // Long axis along her velocity, broad side to the camera.
      st.entity.lookAt(camPos, dir);
      st.entity.setLocalScale(st.width, st.size * (0.6 + rush), 1);
    }
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  let enabled = false;
  root.enabled = false;
  let visibility = 1;

  return {
    get enabled() {
      return enabled;
    },
    set enabled(v) {
      enabled = v;
      root.enabled = v;
    },
    // Scales every sprite's opacity, 0..1, e.g. to hold the clouds back while
    // scenery they would paint over is still in view.
    get visibility() {
      return visibility;
    },
    set visibility(v) {
      visibility = v;
    },

    // Scatter everything around her at once, e.g. when the flight starts.
    // `clearAhead` is where along her line the first cloud goes; a positive
    // value keeps the clouds off scenery she is just leaving.
    reset(flight, camera, { clearAhead = -20 } = {}) {
      const s = flight.state;
      dir.copy(s.vel).normalize();
      camPos.copy(camera.getPosition());
      seedClouds(s, clearAhead);
      streaks.forEach((st) => respawnStreak(st, s, true));
    },

    // Three of the clouds become one dense bank centred on her line, `ahead`
    // metres in front of her. Returns the distance along her line of its middle.
    placeWipe(flight, ahead, radius = o.wipeRadius) {
      const s = flight.state;
      const along = s.pos.dot(s.forward) + ahead;
      clouds.slice(0, 3).forEach((cloud, i) => {
        pathPoint(s, along + (i - 1) * radius * 0.4, cloud.center);
        cloud.center.y = s.altitude - radius * 0.15;
        fillCloud(cloud, radius);
        cloud.age = 10;
      });
      cursor = Math.max(cursor, along + radius * 2);
      return along;
    },

    update(dt, flight, camera) {
      if (!enabled) return;
      const s = flight.state;
      dir.copy(s.vel);
      if (dir.lengthSq() < 1e-4) return;
      dir.normalize();
      camPos.copy(camera.getPosition());
      camFwd.copy(camera.forward);
      updateClouds(dt, s);
      updateStreaks(dt, s, flight.speedNorm());
    },

    // For debugging: how many sprites are currently visible.
    stats() {
      const visible = (list) => list.filter((x) => x.opacity > 0.02).length;
      return { cloudSprites: visible(clouds.flatMap((c) => c.sprites)), streaks: visible(streaks) };
    },
  };
}

// A billowy cloud puff: a soft round mass eroded by fractal noise, denser in
// the middle and lit from above (each sprite's tint adds the base-to-top shade).
function drawCloud(ctx, w, h, seed) {
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x / w) * 2 - 1;
      const v = (y / h) * 2 - 1;
      const r = Math.hypot(u, v * 1.05);
      const n = fbm2(u * 2.2 + seed * 7.3, v * 2.2 - seed * 3.1);
      const density = Math.min(Math.max((1 - r) * 2.1 + (n - 0.5) * 1.1 - 0.2, 0), 1);
      const alpha = density * density * (3 - 2 * density);
      const light = 0.82 + 0.18 * (1 - (v + 1) / 2) + (n - 0.5) * 0.12;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, light * 255);
      img.data[i + 3] = alpha * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Bright down the middle, fading to nothing at both ends and both edges.
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

// 2D value noise, four octaves, in [0, 1].
function fbm2(x, y) {
  let sum = 0;
  let amp = 0.5;
  for (let i = 0; i < 4; i++) {
    sum += amp * valueNoise2(x, y);
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / 0.9375;
}

function valueNoise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const h = (i, j) => {
    const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
