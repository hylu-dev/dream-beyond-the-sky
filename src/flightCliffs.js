import { Entity, Vec3 } from 'playcanvas';
import { smooth } from './sprites.js';

// The floating cliffs she flies among: the four painted formations from
// cliffAssets.js, pooled and streamed down her line like the clouds. Their
// light is painted in, so every one keeps the bearing it was painted for
// (the cliff demo's, turned with the sky) and variety comes from the
// formation, its size and height. Out in the haze a cliff keeps station on
// her, so wherever she has drifted to the next ones still come up around
// her, and it settles in place once it is near enough to read. Each wears a
// bank of the sky's own cloud round its foot, from `clouds`' reserved banks.

export const CLIFF_DEFAULTS = {
  perFormation: 3,
  spacing: [24, 42], // metres along her line between cliffs
  ahead: 330, // they appear this far ahead, lost in the haze
  settle: 150, // nearer than this they stay where they are
  // Kinds of cliff, by where they stand: `side` is metres from her line to
  // the cliff's near edge (to its middle, for one under her), `top` the
  // height of its top from hers.
  near: { side: [9, 26], scale: [0.55, 0.85], top: [-14, 8] },
  far: { side: [50, 115], scale: [1.1, 1.7], top: [-6, 28] },
  under: { side: [-6, 6], scale: [0.7, 1], top: [-30, -24] },
  farShare: 0.4,
  underShare: 0.12,
  yawJitterDeg: 10,
  haze: [0.05, 0.55], // at the near edge of the haze, and added by `ahead`
  clear: 2.5, // metres: closer than this to the lens, the rock hides
  // She is never let into a cliff: one coming up on her line within
  // `seconds` takes over her steering (dodge()), round whichever way she
  // clears soonest at about `across` and `climb` m/s, to `margin` metres
  // off it; and closer than `contact` she slides off it (keepOff()).
  avoid: { seconds: 4.5, margin: 5.5, contact: 4.5, across: 3.5, climb: 4.5, slide: 10 },
  // Past stopAt()'s mark a cliff is put away rather than put up: once it is
  // this far off, deep in the haze, where its going is not seen.
  parkBeyond: 260,
  shroud: 0.85,
  // onPass({ gap, side }) is called `passLead` seconds before she passes a
  // cliff within `passGap` metres of her line (side: 1 to her left, -1
  // right), for its whoosh.
  passGap: 16,
  passLead: 0.65,
};

const random = ([a, b]) => a + Math.random() * (b - a);

export function createFlightCliffs(scene, assets, options = {}) {
  const o = { ...CLIFF_DEFAULTS, ...options };
  const banks = o.clouds?.reservedClouds ?? [];
  const root = new Entity('flight-cliffs');
  root.enabled = false;
  scene.app.root.addChild(root);

  // Shuffled once, so the formations don't come round in a fixed order.
  const order = assets.variants.flatMap((_, v) => Array(o.perFormation).fill(v)).sort(() => Math.random() - 0.5);
  const cliffs = order.map((v, i) => {
    const { entity, instances, variant } = assets.instantiate(v, root);
    const [min, max] = variant.bounds;
    return {
      entity, instances, min, max, bank: banks[i],
      // Round its middle, how far out it reaches.
      reach: Math.max(Math.hypot(min[0], min[2]), Math.hypot(max[0], max[2]), Math.hypot(min[0], max[2]), Math.hypot(max[0], min[2])),
      along: 0, offset: 0, top: 0, scale: 1, yaw: 0, lateral: 0, height: 0, settled: false,
    };
  });

  const ref = { lateral: 0, height: 0 }; // her, smoothed
  const pos = new Vec3();
  const foot = new Vec3();
  let lastUnder = null; // so two under her in a row don't meet
  let open = null; // [from, to] along her line kept clear of cliffs, or null
  let limit = Infinity; // along her line, no cliff stands past this
  let cursor = 0, side = 1, recycled = 0, hidden = 0, nearest = Infinity, hiddenFrames = 0, passes = 0;
  let dodgeFrames = 0, contactFrames = 0;

  // Out of the way for good, its cloud bank with it.
  function park(c, s) {
    c.parked = true;
    c.entity.enabled = false;
    if (c.bank !== undefined) o.clouds.anchorCloud(c.bank, position(c, s), c.reach * c.scale * 0.85, { opacity: 0 });
  }

  function place(c, s, along) {
    // Nothing goes up in a stretch being kept open; it goes past it.
    if (open && along > open[0] - c.reach * 2 && along < open[1]) {
      along = Math.max(cursor, open[1] + c.reach);
      cursor = along + random(o.spacing);
    }
    const roll = Math.random();
    const kind = roll < o.underShare ? o.under : roll < o.underShare + o.farShare ? o.far : o.near;
    c.scale = random(kind.scale);
    side = -side;
    c.offset = kind === o.under ? random(kind.side) : side * (random(kind.side) + c.reach * c.scale);
    c.top = random(kind.top);
    c.along = along;
    c.passed = false;
    c.way = null;
    if (kind === o.under) {
      if (lastUnder && lastUnder !== c) {
        c.along = Math.max(along, lastUnder.along + (lastUnder.reach * lastUnder.scale + c.reach * c.scale) + 4);
        cursor = Math.max(cursor, c.along);
      }
      lastUnder = c;
    }
    c.yaw = s.headingDeg - 180 + random([-1, 1]) * o.yawJitterDeg;
    c.entity.setLocalScale(c.scale, c.scale, c.scale);
    c.entity.setEulerAngles(0, c.yaw, 0);
    c.settled = false;
    if (c.along > limit) {
      park(c, s);
      return;
    }
    if (c.bank !== undefined) {
      o.clouds.anchorCloud(c.bank, position(c, s), c.reach * c.scale * 0.85, { opacity: o.shroud });
    }
  }

  // Where it stands, from her line and height now unless it has settled.
  function position(c, s) {
    if (!c.settled) {
      c.lateral = ref.lateral + c.offset;
      c.height = ref.height + c.top - c.max[1] * c.scale;
    }
    pos.copy(s.forward).mulScalar(c.along);
    pos.x += s.left.x * c.lateral;
    pos.z += s.left.z * c.lateral;
    pos.y = c.height;
    c.entity.setPosition(pos);
    foot.set(pos.x, pos.y + c.min[1] * c.scale * 0.55, pos.z);
    return foot;
  }

  // How far `p` is from the cliff's box, in metres; 0 inside.
  function gap(c, p) {
    const at = c.entity.getPosition();
    const r = (c.yaw * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    const dx = p.x - at.x, dz = p.z - at.z;
    const local = [(dx * cos - dz * sin) / c.scale, (p.y - at.y) / c.scale, (dx * sin + dz * cos) / c.scale];
    let sq = 0;
    for (let k = 0; k < 3; k++) {
      const out = Math.max(c.min[k] - local[k], local[k] - c.max[k], 0);
      sq += out * out;
    }
    return Math.sqrt(sq) * c.scale;
  }

  // Its box as she sees it from her line, however it is turned: `a` along
  // her line, `l` across it (+ to her left), `y` up; grown by `grow` metres
  // across and up.
  const box = { a0: 0, a1: 0, l0: 0, l1: 0, y0: 0, y1: 0 };
  function laneBox(c, s, grow) {
    const at = c.entity.getPosition();
    const r = (c.yaw * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    box.a0 = box.l0 = Infinity;
    box.a1 = box.l1 = -Infinity;
    for (let k = 0; k < 4; k++) {
      const lx = (k & 1 ? c.max[0] : c.min[0]) * c.scale, lz = (k & 2 ? c.max[2] : c.min[2]) * c.scale;
      const x = at.x + lx * cos + lz * sin, z = at.z + lz * cos - lx * sin;
      const a = x * s.forward.x + z * s.forward.z, l = x * s.left.x + z * s.left.z;
      box.a0 = Math.min(box.a0, a); box.a1 = Math.max(box.a1, a);
      box.l0 = Math.min(box.l0, l - grow); box.l1 = Math.max(box.l1, l + grow);
    }
    box.y0 = at.y + c.min[1] * c.scale - grow;
    box.y1 = at.y + c.max[1] * c.scale + grow;
    return box;
  }

  // Which way round she goes: across (axis 'l') or over or under ('y'),
  // `dir` +1 to her left or up, and how far she has to move.
  function wayRound(flight, b, L, Y) {
    const s = flight.state, a = o.avoid, [low, high] = flight.options.climbRange;
    const ways = [
      { axis: 'l', dir: 1, need: b.l1 - L, rate: a.across },
      { axis: 'l', dir: -1, need: L - b.l0, rate: a.across },
    ];
    if (b.y1 < s.baseAltitude + high) ways.push({ axis: 'y', dir: 1, need: b.y1 - Y, rate: a.climb });
    if (b.y0 > s.baseAltitude + low) ways.push({ axis: 'y', dir: -1, need: Y - b.y0, rate: a.climb });
    return ways.reduce((best, w) => (w.need / w.rate < best.need / best.rate ? w : best));
  }

  const dodgeInput = { turn: 0, climb: 0, weight: 0 };

  return {
    reset(flight) {
      const s = flight.state;
      root.enabled = true;
      ref.lateral = s.pos.dot(s.left);
      ref.height = s.pos.y;
      recycled = hiddenFrames = passes = dodgeFrames = contactFrames = 0;
      lastUnder = null;
      open = null;
      limit = Infinity;
      for (const c of cliffs) c.parked = false;
      cursor = s.pos.dot(s.forward) + 40;
      for (const c of cliffs) {
        place(c, s, cursor);
        cursor += random(o.spacing);
      }
    },
    update(dt, flight, camera) {
      if (!root.enabled) return;
      const s = flight.state;
      const ease = 1 - Math.exp(-dt);
      ref.lateral += (s.pos.dot(s.left) - ref.lateral) * ease;
      ref.height += (s.pos.y - ref.height) * ease;
      const along = s.pos.dot(s.forward);
      const cam = camera.getPosition();
      const camAlong = cam.dot(s.forward);
      hidden = 0;
      nearest = Infinity;
      for (const c of cliffs) {
        if (c.parked) continue;
        if (c.along > limit && c.along - along > o.parkBeyond) {
          park(c, s);
          continue;
        }
        if (c.along < camAlong - c.reach * c.scale - 20) {
          cursor = Math.max(cursor, along + o.ahead);
          place(c, s, cursor);
          cursor += random(o.spacing);
          recycled++;
          if (c.parked) continue;
        }
        if (!c.settled) {
          c.settled = c.along - along < o.settle;
          const shroud = position(c, s);
          if (c.bank !== undefined) o.clouds.moveCloud(c.bank, shroud);
        }
        const d = c.entity.getPosition().distance(cam);
        const haze = o.haze[0] + smooth(25, o.ahead, d) * o.haze[1];
        for (const instance of c.instances) instance.setParameter('cliff_haze', haze);
        // The rock is opaque and can't fade: if the lens would go into it,
        // it gives way to its cloud bank instead. She is kept off it
        // (keepOff()), so it is only ever the lens.
        const g = Math.min(gap(c, cam), gap(c, s.pos));
        nearest = Math.min(nearest, g);
        c.entity.enabled = g > o.clear;
        if (!c.entity.enabled) hidden++;
        // How near it will come: from where she will be as she draws level.
        const ahead = c.along - along;
        if (!c.passed && ahead > 0 && ahead < s.speed * o.passLead) {
          c.passed = true;
          const passGap = gap(c, pos.copy(s.forward).mulScalar(ahead).add(s.pos));
          if (passGap < o.passGap) {
            passes++;
            o.onPass?.({ gap: passGap, side: Math.sign(c.lateral - s.pos.dot(s.left)) || 1 });
          }
        }
      }
      if (hidden) hiddenFrames++;
    },
    // Steering that takes her round the most pressing cliff on her line:
    // `turn` and `climb` like the player's (null where it leaves her be),
    // and `weight`, 0..1, how much of her steering it takes over - all of
    // it well before she would reach the rock.
    dodge(flight) {
      dodgeInput.turn = dodgeInput.climb = null;
      dodgeInput.weight = 0;
      if (!root.enabled) return dodgeInput;
      const s = flight.state, a = o.avoid;
      const A = s.pos.dot(s.forward), L = s.pos.dot(s.left), Y = s.pos.y;
      const reach = Math.max(s.speed, 1) * a.seconds;
      for (const c of cliffs) {
        if (c.parked) continue;
        const b = laneBox(c, s, a.margin);
        const ahead = b.a0 - A;
        if (A > b.a1 || ahead > reach || L <= b.l0 || L >= b.l1 || Y <= b.y0 || Y >= b.y1) continue;
        const way = (c.way ??= wayRound(flight, b, L, Y));
        const weight = smooth(reach, reach * 0.4, ahead);
        if (weight <= dodgeInput.weight) continue;
        const need = way.axis === 'l' ? (way.dir > 0 ? b.l1 - L : L - b.l0) : way.dir > 0 ? b.y1 - Y : Y - b.y0;
        const push = way.dir * Math.min(0.4 + need / 6, 1);
        dodgeInput.weight = weight;
        dodgeInput.turn = way.axis === 'l' ? push : null;
        dodgeInput.climb = way.axis === 'y' ? push : null;
      }
      if (dodgeInput.weight > 0) dodgeFrames++;
      return dodgeInput;
    },
    // After the flight's step: closer than `contact` to a cliff, she slides
    // off it across or up, whichever face she is nearest, at up to `slide`
    // m/s - at once if she is closer even than `clear`.
    keepOff(flight, dt) {
      if (!root.enabled) return;
      const s = flight.state, a = o.avoid;
      let touched = false;
      for (const c of cliffs) {
        if (c.parked) continue;
        const near = gap(c, s.pos);
        if (near >= a.contact) continue;
        const b = laneBox(c, s, a.contact);
        const L = s.pos.dot(s.left), Y = s.pos.y;
        const outs = [b.l1 - L, b.l0 - L, b.y1 - Y, b.y0 - Y];
        let k = 0;
        for (let i = 1; i < 4; i++) if (Math.abs(outs[i]) < Math.abs(outs[k])) k = i;
        const step = near < o.clear ? Infinity : a.slide * dt;
        const out = Math.sign(outs[k]) * Math.min(Math.abs(outs[k]), step);
        if (k < 2) {
          s.pos.x += s.left.x * out;
          s.pos.z += s.left.z * out;
          if (s.lateralVel * out < 0) s.lateralVel = 0;
        } else {
          s.pos.y += out;
          s.altitude += out;
          if (s.climbVel * out < 0) s.climbVel = 0;
        }
        touched = true;
      }
      if (touched) contactFrames++;
    },
    // Keeps her line from `from` to `to` metres ahead clear of cliffs: any
    // standing there now move on past it, and none are put up in it.
    keepClear(flight, from, to) {
      const s = flight.state, along = s.pos.dot(s.forward);
      open = [along + from, along + to];
      for (const c of cliffs) {
        if (c.along > open[0] - c.reach * c.scale && c.along < open[1] + c.reach * c.scale) place(c, s, c.along);
      }
    },
    // No cliff stands from `ahead` metres along her line on: none go up
    // there, and any there now go once they are far enough off not to be
    // seen going.
    stopAt(flight, ahead) {
      const s = flight.state;
      limit = s.pos.dot(s.forward) + ahead;
    },
    get ahead() { return o.ahead; },
    get enabled() { return root.enabled; },
    set enabled(v) { root.enabled = v; },
    stats() {
      return {
        cliffs: cliffs.length, recycled, hidden, hiddenFrames, nearestGap: nearest, passes, dodgeFrames, contactFrames,
        parked: cliffs.filter(c => c.parked).length, limit,
        settled: cliffs.filter(c => c.settled).length,
      };
    },
    // For debugging: each cliff's formation, where it is and how close she is.
    list(flight) {
      const s = flight.state;
      return cliffs.map(c => ({
        id: c.entity.name, scale: +c.scale.toFixed(2), ahead: +(c.along - s.pos.dot(s.forward)).toFixed(1),
        offset: +(c.lateral - s.pos.dot(s.left)).toFixed(1), top: +(c.height + c.max[1] * c.scale - s.pos.y).toFixed(1),
        gap: +gap(c, s.pos).toFixed(1), enabled: c.entity.enabled, parked: !!c.parked,
      }));
    },
  };
}
