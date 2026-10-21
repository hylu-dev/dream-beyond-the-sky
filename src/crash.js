import { Entity, Quat, Vec3 } from 'playcanvas';
import { fbm1 } from './noise.js';
import { smooth } from './sprites.js';

// The end of the flight. The air turns rough and a wind hurries her into a
// wall of cloud. Hidden in it, shrouded in its own banks all the way up and
// down, stands a great cliff; only its corner on her line shows, out of the
// mist a split second before it clips her. The blow is instant: a jolt
// that stops time for a beat, and she is flung off it already limp
// (impact.glb, PINOC "Mid-Air Knockout", then limpfall.glb, "Ragdoll
// Freefall", looped, her limbs thrown about by the air on top) and falls, tumbling, down the face of it,
// and the camera falls with her, shaking hard, until she drops into the
// cloud below, the screen closing in on her heartbeat, and it all cuts to
// black.
//
// Phases: storm -> reveal -> fall -> out. Through the storm and reveal she
// still flies (flight.js) and only her input is taken; from the blow on she
// is a body falling, her pose the clip's and her place and spin this file's.
// flight.state.pos/vel/speed carry on being where she is and how she moves,
// so the sky, clouds, cliffs, streaks and sound follow her down as they
// followed her flying.

export const CRASH_DEFAULTS = {
  storm: {
    speed: 12, // m/s, the wind hurrying her on
    speedSeconds: 2.5,
    turbulence: 3.4, // flight.js's gust strength, up from its own
    inputSeconds: 0.8, // her steering fades out over this
    bankAhead: 70, // metres ahead the cloud wall goes, fading in
    bankRadius: 14,
    // The big sky clouds' share of it, on the near side so it looks a wall
    // from far off but is gone before the cliff.
    skyBankBefore: 16,
    skyBankRadius: 28,
    whiteout: 0.88, // the white's peak, as the camera crosses the wall's middle
    whiteMetres: 10, // half its length along her line
  },
  cliff: {
    formation: 'tall-spire',
    scale: 3,
    side: 1, // 1: it stands to her left, -1: to her right
    beyond: 16, // metres past the wall's middle where she meets it, still in it
    // It stands right across her way: the corner of it that stands furthest
    // out toward her line, at the foot of its top-heavy block, is `across`
    // metres past her middle on her far side, and she flies into the bare
    // face before it, its leaves and ivy all well above and nothing of it
    // below standing out, so she falls clear down it. At 8 m that face runs
    // on 18 m to the corner, 42 degrees off square to her: no getting round
    // it. In the formation's own units, the height the corner is looked for
    // about, and hers over the corner's.
    hitHeight: 1,
    band: 3.5,
    across: 8,
    lift: 0.25,
    // Her, flying at it: metres either side of her line, below and above her
    // height, and how far her head is ahead of her, as the blow comes.
    body: [0.5, -0.3, 0.5],
    reach: 0.6,
    // Turned this far off the bearing its light is painted for (negative:
    // the other way), so that bare corner is the one out toward her line and
    // the face she comes along falls away from it instead of running beside
    // her.
    turnDeg: -50,
    // Its shroud: banks of cloud wrapped round it, top to bottom, on the
    // sides she and the camera see, framing the corner and held off her line
    // and the way she falls so the corner stands clear. Each is [along past
    // the corner, out from her line toward the rock, height from hers,
    // radius], in metres, for the tall spire at scale 3 turned -50 degrees:
    // round the corner its block runs 25 m back toward her and 17 m on, 42 m
    // out and from 8 m below her to 60 m above, its leaves all up top, and
    // its stem tapers away under it, its top 20 m down, to its foot 115 m
    // down. The near ones go in the near clouds `clouds`, the big `sky` ones
    // in the sky clouds `skyClouds`.
    shroud: [
      [11, 18, 21, 10], [-4, 1, 31, 12], [7, 9, 37, 9], [15, 26, 50, 10],
      [3, 16, -21, 13], [-14, 12, -36, 12], [-8, 14, -50, 13], [12, 22, -34, 12],
    ],
    clouds: [3, 7, 8, 9, 10, 11, 12, 13],
    sky: [
      [-30, 40, 10, 28], [-8, 36, 69, 30], [20, 40, -20, 30],
      [-10, 26, -45, 32], [-5, 15, -85, 36], [0, 55, 25, 28],
      // Past the corner, beyond her (out negative), closing the sky there.
      [14, -18, 4, 14],
    ],
    skyClouds: [3, 4, 5, 6, 7, 8, 9],
  },
  // She sees it this many seconds out, and has only that long: she banks
  // away from it and starts to brace, her arms coming up past her head, her
  // and out in front of her head, her chin tucking, her back curling and her
  // knees drawing up, over `seconds` - too late, it hits before she is all
  // the way there. (`armIn` - out to her sides.) Degrees about
  // her own axes (as the limp's below), braced full; it lets go over
  // `release` after the blow, to the blow's own clip.
  react: {
    lead: 0.45, seconds: 0.55, release: 0.12,
    brace: { arm: -150, armIn: -15, elbow: -45, hand: 20, head: -20, spine: -6, thigh: -20, knee: 35 },
  },
  hit: {
    stop: 0.06, // time all but stops for this long at the blow,
    stopBy: 0.16, // and is back to full speed by this
    keep: 0, // share of her speed along her line that she keeps
    away: 7, // m/s: a short recoil, staying close to the cliff
    up: 3,
    drag: 1.8, // 1/s, how soon the fling across dies to a fall
    // Her pose: the glide gives way to the blow (impact.glb) and that to
    // the limp tumble (limpfall.glb, looped). Seconds, as the blow has
    // them, slowed with it.
    glideOff: 0.12, // the glide fades out over this
    impactFade: 0.1,
    impactFrom: 0, // frame of impact.glb she goes into it at
    limpAt: 1.6, // into the tumble from this far into the blow
    limpFade: 0.6,
    spinDeg: { roll: 640, tumble: 240, yaw: 110 }, // per second, at the blow
    spinFloor: 0.12, // share of that spin she keeps falling
    spinSeconds: 0.45,
    flash: 0.9,
    flashDecay: 18,
    screen: { hold: 0.06, seconds: 0.65, blurPx: 7, contrast: 1.2, bleach: 0.9, brightness: 0.3, vignette: 0.85, clear: 40 },
  },
  // Out cold, her limbs go where the air throws them: each trails the wind
  // past her as she tumbles, on a loose spring so it overshoots and flops
  // as the tumble turns it, with the flutter of the air on top, over the
  // clips. Degrees at `fullSpeed` m/s of wind, at `weight`.
  limp: {
    fullSpeed: 22,
    weight: 0.4,
    fadeIn: [0.1, 0.6], // seconds after the blow
    armOut: 55, armSpread: 40, armSwing: 70, elbow: 22,
    legSwing: 40, legOut: 22, knee: 30,
    head: 30, spine: 6,
    springs: { arms: [20, 3.2], legs: [14, 2.6], head: [30, 4.5] },
    flop: { hz: 0.8, arm: 22, leg: 14, head: 14 }, // slow, heavy swings
    flutter: { hz: 6, forearm: 7, hand: 12, calf: 6, foot: 10 },
  },
  fall: {
    gravity: 9.8,
    terminal: 34, // m/s
    seconds: 5.2, // from the blow until her eyes shut
    deckRadius: 34, // the cloud she falls into
  },
  // The screen as she falls, building from the blow to the black: tunnel
  // vision closing in, red-black, throbbing on a quickening heartbeat; the
  // image throbbing with it, blurred, harder and bleached; white flickers
  // at the end; and the shake building. Then it cuts to black (index.html
  // #lids, shut) for a beat, and it is over.
  dread: {
    build: [0.3, 5], // seconds after the blow, from nothing to full
    beatHz: [1.2, 2.7],
    clear: [60, 34], // % out to the frame's corners left clear of the dark
    dark: 0.8,
    blurPx: [0.6, 3.5], // between beats, and on one
    contrast: 0.4,
    bleach: 0.6, // saturation taken out at full
    flicker: { from: 0.55, perSecond: 6, opacity: 0.6 }, // from this share of the build
    shake: 1.4, // the fall's shake grows by this share at full
  },
  black: 2.45, // a silent beat before she wakes, two seconds longer
  camera: {
    spring: [14, 6.5], // [stiffness, damping]
    reveal: { back: 3.4, away: 1.3, up: 0.7, fov: 62, lead: 4, toRock: 0.22 },
    fall: { up: [2.4, 5], away: 3.4, back: 1, fov: 70, upSeconds: 4 },
    // On the blow it cuts in right on her and the rock, and it has run into
    // the wall with her: `wall` stops it dead there (metres back along her
    // line from her, out on the open side and up, clear of the rock's crags,
    // so she is flung past it), bouncing back off it `bounce` m/s. Its look
    // is knocked off her (`knock` metres on into the rock, out from it and
    // up: out over the open side, as the spire overhangs her and fills any
    // look up) over `knockIn` seconds from `knockAt`, once the blow has
    // landed. It holds there `hold` seconds as she is flung off and drops
    // away, then comes down after her over `catch`, its look coming round to
    // her at `aimRate` per second, to sit close on her from the open side
    // (metres off her as `fall` has them, and the look `toRock` metres past
    // her toward the rock); until she is falling `speed` m/s, by when it is
    // out in the fall's framing. The jolts are `jolt` of theirs while close,
    // and the near clouds `clouds` of theirs, their flat puffs cutting hard
    // lines so near the lens.
    close: {
      away: 1.1, up: 0.25, back: 0.1, fov: 45, toRock: 0.3, aimRate: 4, speed: [5, 13], jolt: 0.8, clouds: 0.2,
      wall: { back: 1.2, out: 1.1, up: 0.3, bounce: 2.5, knock: [-1, 2, -0.3], knockAt: 0.12, knockIn: 0.07, hold: 0.2, catch: 0.8 },
    },
    // Toss the view upward, let it drop, then recover the underlying fall.
    impactKick: { skyElevationDeg: 24, outwardDeg: 55, rollDeg: 8, velocity: 3, gravity: 9.8, recover: [0.28, 1.35], release: [0.55, 1.35] },
    recovery: { engage: [0.65, 0.95], release: [1.6, 2], distance: 1.8 },
    lookRate: 7,
    shake: {
      reveal: { position: 0.06, rotationDeg: 1.4, hz: 5 },
      fall: { position: 0.24, rotationDeg: 4.5, hz: 7.5 },
      lurch: { position: 0.5, rotationDeg: 3, hz: 1.1 },
      dutchDeg: 16, // the horizon swinging as she falls
    },
    hit: { position: 1.1, rotationDeg: 16, rollDeg: 22, fov: 18, hz: 16, decay: 5.5 },
  },
};

const UP = new Vec3(0, 1, 0);

export function createCrash(deps, options = {}) {
  const o = { ...CRASH_DEFAULTS };
  for (const k of Object.keys(options)) o[k] = { ...CRASH_DEFAULTS[k], ...options[k] };
  const { scene, flight, character, flightRig, chaseCamera, windFx, skyClouds, flightCliffs, cliffAssets, audio } = deps;
  const cam = scene.cameraEntity;
  const s = flight.state;
  const armature = character.armature;

  // The cliff she hits: its own, outside the pooled ones (which give way
  // when she comes close) and hidden until the white.
  const root = new Entity('crash-cliff');
  root.enabled = false;
  scene.app.root.addChild(root);
  const formation = Math.max(cliffAssets.variants.findIndex(v => v.id === o.cliff.formation), 0);
  const rock = cliffAssets.instantiate(formation, root);
  // Without its loose block, which would hang bare beside her as she falls.
  for (const instance of rock.instances) if (instance.mesh === rock.variant.fragmentsMesh) instance.visible = false;
  // Its turn off the painted bearing, falling away from her line toward her.
  const turn = -o.cliff.side * o.cliff.turnDeg;
  // The corner she clips: of its shell's points in the band about that
  // height, the one furthest out toward her line, the nearer to her as she
  // comes of any that far. As it is turned (see spawnCliff), before its own
  // turn its local +x points to her right and +z back toward her, so on her
  // left that is the most +x, then +z. In that frame, with the turn.
  const edgeLocal = (() => {
    const { positions } = rock.variant;
    const c = o.cliff;
    const r = (turn * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    const turned = (i) => [positions[i] * cos + positions[i + 2] * sin, positions[i + 1], -positions[i] * sin + positions[i + 2] * cos];
    const reach = ([x, , z]) => x * c.side + z * 0.01;
    let best = null;
    for (let i = 0; i < positions.length; i += 3) {
      if (Math.abs(positions[i + 1] - c.hitHeight) > c.band) continue;
      const p = turned(i);
      if (!best || reach(p) > reach(best)) best = p;
    }
    return best ?? [0, c.hitHeight, 0];
  })();
  // Where her line meets its face: of its rock (the shell and the crags on
  // it) straight ahead of any of her, the nearest to her, in the same frame.
  const contactZ = (() => {
    const c = o.cliff;
    const r = (turn * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    const x0 = edgeLocal[0] - (c.side * c.across) / c.scale, y0 = edgeLocal[1] + c.lift;
    const [wide, low, high] = c.body;
    let best = -Infinity;
    for (const positions of [rock.variant.positions, rock.variant.details.positions]) {
      for (let i = 0; i < positions.length; i += 9) {
        const [ax, ay, az] = [positions[i] * cos + positions[i + 2] * sin, positions[i + 1], -positions[i] * sin + positions[i + 2] * cos];
        const [bx, by, bz] = [positions[i + 3] * cos + positions[i + 5] * sin, positions[i + 4], -positions[i + 3] * sin + positions[i + 5] * cos];
        const [ex, ey, ez] = [positions[i + 6] * cos + positions[i + 8] * sin, positions[i + 7], -positions[i + 6] * sin + positions[i + 8] * cos];
        const den = (by - ey) * (ax - ex) + (ex - bx) * (ay - ey);
        if (Math.abs(den) < 1e-9) continue;
        for (let u = -1; u <= 1; u += 0.25) for (let v = 0; v <= 1; v += 0.25) {
          const x = x0 + (u * wide) / c.scale, y = y0 + (low + v * (high - low)) / c.scale;
          const wa = ((by - ey) * (x - ex) + (ex - bx) * (y - ey)) / den;
          const wb = ((ey - ay) * (x - ex) + (ax - ex) * (y - ey)) / den;
          if (wa < 0 || wb < 0 || wa + wb > 1) continue;
          best = Math.max(best, wa * az + wb * bz + (1 - wa - wb) * ez);
        }
      }
    }
    return best > -Infinity ? best : edgeLocal[2];
  })();

  let phase = null; // null until start(), then storm, reveal, fall, out
  let t = 0; // seconds into the phase, slowed with the blow
  let bankAlong = 0;
  let hitAlong = 0;
  let sounded = false;
  let reacted = false;
  let reactT = 0; // t when she saw it
  let sinceHit = 0; // real seconds since the blow
  let slow = 1;
  let turbulence = 0;
  const input = { turn: 0, climb: 0, from: { turn: 0, climb: 0 } };
  const hitPoint = new Vec3();
  const cornerPoint = new Vec3(); // the corner, at her height
  const away = new Vec3();
  const vel = new Vec3();
  const spinAxis = new Vec3();
  const spin = new Vec3(); // degrees per second about world axes, at the blow
  const body = new Quat();
  const dq = new Quat();
  const pelvis = new Vec3(0, flight.options.pelvisHeight, 0); // in her own frame
  const tmp = new Vec3();
  const tmp2 = new Vec3();
  const tmp3 = new Vec3();

  // ── The cliff ───────────────────────────────────────────────────────────

  // Its face on her line `hitAlong` metres along it, at her height, and its
  // corner `across` metres past her middle.
  function place() {
    const c = o.cliff;
    const herLateral = s.pos.dot(s.left);
    const cornerLateral = herLateral - c.side * c.across;
    const lateral = cornerLateral + c.scale * edgeLocal[0];
    const along = hitAlong + c.reach + c.scale * contactZ;
    tmp.copy(s.forward).mulScalar(along);
    tmp.x += s.left.x * lateral;
    tmp.z += s.left.z * lateral;
    tmp.y = s.pos.y - c.scale * (edgeLocal[1] + c.lift);
    rock.entity.setPosition(tmp);
    hitPoint.copy(s.forward).mulScalar(hitAlong + c.reach);
    hitPoint.x += s.left.x * herLateral;
    hitPoint.z += s.left.z * herLateral;
    hitPoint.y = s.pos.y;
    cornerPoint.copy(s.forward).mulScalar(along - c.scale * edgeLocal[2]);
    cornerPoint.x += s.left.x * cornerLateral;
    cornerPoint.z += s.left.z * cornerLateral;
    cornerPoint.y = s.pos.y - c.scale * c.lift;
  }

  function spawnCliff() {
    hitAlong = bankAlong + o.cliff.beyond;
    root.enabled = true;
    rock.entity.setLocalScale(o.cliff.scale, o.cliff.scale, o.cliff.scale);
    rock.entity.setEulerAngles(0, yaw(), 0);
    place();
    // Its shroud, so only the corner in her way shows.
    const c = o.cliff;
    const shroud = (layer, banks, indices) => banks.forEach(([along, out, height, radius], i) => {
      tmp.copy(cornerPoint).add(tmp2.copy(s.forward).mulScalar(along)).add(tmp2.copy(away).mulScalar(-out));
      tmp.y += height;
      layer.anchorCloud(indices[i], tmp, radius, { opacity: 1 });
    });
    shroud(windFx, c.shroud, c.clouds);
    shroud(skyClouds, c.sky, c.skyClouds);
  }

  // Turned with the other cliffs, so the light painted on it all but agrees.
  const yaw = () => s.headingDeg - 180 + turn;

  function hazeCliff() {
    const d = rock.entity.getPosition().distance(cam.getPosition());
    for (const instance of rock.instances) instance.setParameter('cliff_haze', 0.04 + smooth(25, 220, d) * 0.4);
  }

  // How far `p` is from the rock's box, in metres; 0 inside.
  function rockGap(p) {
    const at = rock.entity.getPosition(), sc = o.cliff.scale;
    const r = (yaw() * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
    const dx = p.x - at.x, dz = p.z - at.z;
    const local = [(dx * cos - dz * sin) / sc, (p.y - at.y) / sc, (dx * sin + dz * cos) / sc];
    const [min, max] = rock.variant.bounds;
    let sq = 0;
    for (let k = 0; k < 3; k++) {
      const out = Math.max(min[k] - local[k], local[k] - max[k], 0);
      sq += out * out;
    }
    return Math.sqrt(sq) * sc;
  }

  // ── The camera ──────────────────────────────────────────────────────────

  const view = {
    pos: new Vec3(), vel: new Vec3(), look: new Vec3(), // look: off her, smoothed
    aim: new Vec3(), // where it looks, lagging her while close
    fov: 55, shakeTime: 0, lurchTime: 0, hitTime: -1, cut: false,
  };
  const goal = new Vec3();
  const lookGoal = new Vec3();
  const stuck = new Vec3(); // where it ran into the wall
  const knock = new Vec3();
  let fallOut = 1; // how far out of the close framing, falling
  let follow = 1; // how far it has come off the wall after her

  const impactCameraRotation = new Quat(), fallingCameraRotation = new Quat();
  const recoveryRotation = new Quat(), recoveryTarget = new Quat(), recoveryUp = new Vec3();

  function takeCamera() {
    const pose = chaseCamera.pose;
    view.pos.copy(pose.position);
    view.vel.copy(s.vel);
    view.look.copy(pose.target).sub(s.pos);
    view.fov = pose.fov;
  }

  function updateCamera(dt) {
    const c = o.camera;
    const falling = phase === 'fall' || phase === 'out';
    if (!falling) {
      const r = c.reveal;
      goal.copy(s.forward).mulScalar(-r.back).add(s.pos);
      goal.add(tmp.copy(away).mulScalar(r.away));
      goal.y += r.up;
      // Ahead of her, and turned toward the rock as it comes up.
      lookGoal.copy(s.forward).mulScalar(r.lead).add(tmp.copy(hitPoint).sub(s.pos).mulScalar(r.toRock));
    } else {
      const f = c.fall, cl = c.close;
      const up = f.up[0] + (f.up[1] - f.up[0]) * smooth(0, f.upSeconds, t);
      // Above her and out on the far side from the rock, a little behind
      // where she is drifting, looking down on her; close at first.
      tmp2.set(vel.x, 0, vel.z);
      if (tmp2.lengthSq() > 1e-4) tmp2.normalize();
      const u = smooth(cl.speed[0], cl.speed[1], -vel.y);
      goal.copy(s.pos)
        .add(tmp.copy(away).mulScalar(cl.away + (f.away - cl.away) * u))
        .sub(tmp2.mulScalar(cl.back + (f.back - cl.back) * u));
      goal.y += cl.up + (up - cl.up) * u;
      lookGoal.copy(away).mulScalar(-cl.toRock * (1 - u)).add(tmp.copy(vel).mulScalar(0.1 * u));
      fallOut = u;
      windFx.visibility = cl.clouds + (1 - cl.clouds) * u;
      const w = cl.wall;
      if (view.cut) {
        view.cut = false;
        stuck.copy(s.pos).sub(tmp.copy(s.forward).mulScalar(w.back)).add(tmp.copy(away).mulScalar(w.out));
        stuck.y += w.up;
        view.pos.copy(stuck);
        view.vel.copy(s.forward).mulScalar(-w.bounce);
        view.look.copy(lookGoal);
        view.aim.copy(s.pos).add(lookGoal);
        view.fov = cl.fov;
        knock.copy(s.forward).mulScalar(w.knock[0]).add(tmp.copy(away).mulScalar(w.knock[1]));
        knock.y += w.knock[2];
      }
      follow = smooth(w.hold, w.hold + w.catch, t);
      goal.lerp(stuck, goal, follow);
    }
    // On a spring that keeps pace with her, so it doesn't trail her fall.
    const [k, d] = c.spring;
    const pace = falling ? follow : 1; // none stuck on the wall
    view.vel.x += (k * (goal.x - view.pos.x) - d * (view.vel.x - s.vel.x * pace)) * dt;
    view.vel.y += (k * (goal.y - view.pos.y) - d * (view.vel.y - s.vel.y * pace)) * dt;
    view.vel.z += (k * (goal.z - view.pos.z) - d * (view.vel.z - s.vel.z * pace)) * dt;
    view.pos.add(tmp.copy(view.vel).mulScalar(dt));
    view.look.lerp(view.look, lookGoal, 1 - Math.exp(-c.lookRate * dt));
    const lookAt = tmp3.copy(s.pos).add(view.look);
    if (falling) {
      const w = c.close.wall;
      view.aim.lerp(view.aim, lookAt, 1 - Math.exp(-c.close.aimRate * follow * dt));
      lookAt.lerp(view.aim, lookAt, fallOut);
      // Knocked off her as it hits the wall (in real time, as the jolt), and
      // coming back round as it comes after her.
      lookAt.add(tmp.copy(knock).mulScalar(smooth(w.knockAt, w.knockAt + w.knockIn, sinceHit) * (1 - follow)));
    } else view.aim.copy(lookAt);
    const fov = falling ? c.close.fov + (c.fall.fov - c.close.fov) * fallOut : c.reveal.fov;
    view.fov += (fov - view.fov) * (1 - Math.exp(-(falling ? 6 : 2) * dt));

    // Shaking: the air's, much harder falling, slow lurches and a swinging
    // horizon on top as she falls, and the blow's jolt dying away.
    const sh = falling ? c.shake.fall : c.shake.reveal;
    const harder = 1 + o.dread.shake * dread;
    view.shakeTime += dt * sh.hz;
    view.lurchTime += dt * c.shake.lurch.hz;
    const lurch = falling ? 1 : 0;
    let imp = 0, hitTime = 0;
    if (view.hitTime >= 0) {
      view.hitTime = sinceHit; // real time: the jolt lands while time stands still
      hitTime = view.hitTime * c.hit.hz;
      imp = Math.exp(-c.hit.decay * view.hitTime);
    }
    const n = (seed, rate = 1) => fbm1(view.shakeTime * rate, seed);
    const l = (seed, rate = 1) => fbm1(view.lurchTime * rate, seed);
    const h = (seed) => fbm1(hitTime, seed) * imp;
    const jolt = falling ? c.close.jolt + (1 - c.close.jolt) * fallOut : 1;
    const pa = sh.position * harder * jolt, la = c.shake.lurch.position * lurch * jolt, ha = c.hit.position * jolt;
    cam.setPosition(
      view.pos.x + n(301) * pa + l(311) * la + h(321) * ha,
      view.pos.y + n(302) * pa + l(312) * la + h(322) * ha,
      view.pos.z + n(303) * pa + l(313) * la + h(323) * ha,
    );
    cam.lookAt(lookAt);
    const ra = sh.rotationDeg * harder, lr = c.shake.lurch.rotationDeg * lurch, hr = c.hit.rotationDeg;
    cam.rotateLocal(
      n(304, 1.2) * ra + l(314) * lr + h(324) * hr,
      n(305, 1.1) * ra + l(315) * lr + h(325) * hr,
      n(306, 0.8) * ra * 0.6 + l(316, 0.4) * c.shake.dutchDeg * lurch + h(326) * c.hit.rollDeg,
    );
    cam.camera.fov = view.fov + imp * c.hit.fov;
    const kick = c.impactKick;
    if (falling && kick && sinceHit < kick.recover[1]) {
      // Capture the thrown angle once: do not track her during the toss.
      // The ordinary fall camera keeps running underneath for the recovery.
      fallingCameraRotation.copy(cam.getRotation());
      if (sinceHit === 0) {
        // Turn only partway toward the open side, leaving the cliff face
        // along the left of the sky shot as a reference for the impact.
        const elevation = kick.skyElevationDeg * Math.PI / 180;
        const outward = kick.outwardDeg * Math.PI / 180;
        tmp.copy(s.forward).mulScalar(Math.cos(outward))
          .add(tmp2.copy(away).mulScalar(Math.sin(outward))).mulScalar(Math.cos(elevation));
        tmp.y = Math.sin(elevation);
        cam.lookAt(tmp.add(cam.getPosition()));
        cam.rotateLocal(0, 0, -o.cliff.side * kick.rollDeg);
        impactCameraRotation.copy(cam.getRotation());
      }
      const recover = smooth(...kick.recover, sinceHit);
      cam.setRotation(dq.slerp(impactCameraRotation, fallingCameraRotation, recover));
      // A small ballistic rise and drop gives the lens its own weight.
      // Use real time so the toss continues through the character's hit stop.
      const lift = (kick.velocity * sinceHit - 0.5 * kick.gravity * sinceHit * sinceHit)
        * (1 - smooth(...kick.release, sinceHit));
      cam.setPosition(tmp.copy(cam.getPosition()).add(tmp2.set(0, lift, 0)));
    }
    const recovery = c.recovery;
    if (falling && recovery && sinceHit > recovery.engage[0] && sinceHit < recovery.release[1]) {
      // The short recoil leaves her closer to the wall-held camera. Keep
      // the returning lens outside her tumble and catch up to her position
      // instead of looking at the old impact point as she drops below it.
      const weight = smooth(...recovery.engage, sinceHit) * (1 - smooth(...recovery.release, sinceHit));
      tmp.copy(cam.getPosition()).sub(s.pos);
      const distance = tmp.length();
      if (distance > 1e-4 && distance < recovery.distance) {
        tmp.mulScalar((distance + (recovery.distance - distance) * weight) / distance);
        cam.setPosition(tmp.add(s.pos));
      }
      recoveryRotation.copy(cam.getRotation());
      recoveryRotation.transformVector(UP, recoveryUp);
      cam.lookAt(s.pos, recoveryUp);
      recoveryTarget.copy(cam.getRotation());
      cam.setRotation(dq.slerp(recoveryRotation, recoveryTarget, weight));
    }
  }

  // ── Her, falling ────────────────────────────────────────────────────────

  function hit() {
    const h = o.hit;
    phase = 'fall';
    t = 0;
    // Her pose is the clips' from here: the flail and its layer go, the
    // glide fades (updateFall), and in comes the blow.
    character.stopLayer('flail', 0.1);
    s.flail = 0;
    braceAtHit = braceWeight;
    character.crossfadeTo('impact', { duration: h.impactFade, loop: false });
    character.animationTime = h.impactFrom;
    limped = false;
    armature.lockPelvisY = true;
    character.playbackSpeed = 1;
    // Where her middle is in her own frame, as the pose now has it.
    body.copy(flight.getOrientation());
    // Thrown off the rock, stopped short along her line, and spun.
    vel.copy(s.forward).mulScalar(s.speed * h.keep).add(tmp.copy(away).mulScalar(h.away));
    vel.y = h.up;
    const side = o.cliff.side;
    spin.copy(s.forward).mulScalar(-side * h.spinDeg.roll)
      .add(tmp.copy(s.left).mulScalar(-h.spinDeg.tumble))
      .add(tmp.copy(UP).mulScalar(side * h.spinDeg.yaw));
    view.hitTime = 0;
    view.cut = true;
    sinceHit = 0;
    updateDread(0);
    updateCamera(0); // the camera cut and screen pulse land with the sound
    // A puff of the cloud's dust off the rock where she struck it, and the
    // cloud she will fall into, waiting far below.
    windFx.anchorCloud(4, hitPoint, 2.6, { opacity: 0.8 });
    const depth = fallDepth(o.fall.seconds - 0.7);
    tmp.copy(s.pos).add(tmp2.copy(away).mulScalar(3)).add(tmp2.copy(s.forward).mulScalar(s.speed * h.keep * 1.2));
    tmp.y = s.pos.y - depth - o.fall.deckRadius * 0.25;
    windFx.anchorCloud(5, tmp, o.fall.deckRadius, { opacity: 1 });
    tmp.add(tmp2.copy(s.left).mulScalar(o.fall.deckRadius * 0.7));
    windFx.anchorCloud(6, tmp, o.fall.deckRadius * 0.8, { opacity: 1 });
    audio.play('cliff-impact', { pan: -0.45 * o.cliff.side, cut: true });
    audio.play('fall-rise', { pan: 0.2 * o.cliff.side, cut: true }); // the fall's build, cut at the black
  }

  // How far she falls in `seconds` from the blow, with drag.
  function fallDepth(seconds) {
    const f = o.fall, k = f.gravity / (f.terminal * f.terminal), dt = 1 / 60;
    let y = 0, v = o.hit.up;
    for (let i = 0; i < seconds / dt; i++) {
      v = (v - f.gravity * dt) * Math.max(1 - k * Math.abs(v) * dt, 0);
      y += v * dt;
    }
    return -y;
  }

  function fall(dt) {
    const f = o.fall, k = f.gravity / (f.terminal * f.terminal);
    vel.y -= f.gravity * dt;
    // The fling off the rock dies quickly to a plain fall.
    const across = Math.exp(-o.hit.drag * dt);
    vel.x *= across;
    vel.z *= across;
    // Air drag, against her motion, square of her speed.
    const speed = vel.length();
    vel.mulScalar(Math.max(1 - k * speed * dt, 0));
    s.pos.add(tmp.copy(vel).mulScalar(dt));
    s.vel.copy(vel);
    s.speed = vel.length();
    s.altitude = s.pos.y;
    // Spinning down to a slow tumble.
    const h = o.hit;
    const left = h.spinFloor + (1 - h.spinFloor) * Math.exp(-t / h.spinSeconds);
    const rate = spin.length() * left;
    if (rate > 1e-3) {
      spinAxis.copy(spin).normalize();
      dq.setFromAxisAngle(spinAxis, rate * dt);
      body.mul2(dq, body);
    }
  }

  // Her middle on her line, and her feet (the character's origin) placed
  // from it. The engine holds the pelvis's X/Z to its rest place, and its
  // height is locked there too from the blow (the clip would drop it to a
  // floor), so her middle is always the same point in her own frame.
  function placeBody() {
    deps.placeFlyer(); // the sky with her
    body.transformVector(pelvis, tmp);
    tmp2.copy(s.pos).sub(tmp);
    character.setPosition(tmp2.x, tmp2.y, tmp2.z);
    const e = body.getEulerAngles();
    character.setRotation(e.x, e.y, e.z);
  }

  // ── Her limbs, limp in the air ──────────────────────────────────────────

  // Rotations about her own axes, as flightRig.js has them: up her spine,
  // out of her belly, out of her left side. +left takes a hanging limb
  // toward her back, +belly toward her left.
  const AXES = { spine: new Vec3(0, 1, 0), belly: new Vec3(0, 0, 1), left: new Vec3(1, 0, 0) };
  const names = armature.rigBoneNames;
  const parents = armature.skeleton.parents;
  const bone = (name) => names.indexOf(name);
  const bones = {
    spine: ['spine_02', 'spine_03', 'spine_04'].map(bone), neck: bone('neck_01'), head: bone('head'),
    upperarm: [bone('upperarm_l'), bone('upperarm_r')], lowerarm: [bone('lowerarm_l'), bone('lowerarm_r')],
    hand: [bone('hand_l'), bone('hand_r')], thigh: [bone('thigh_l'), bone('thigh_r')],
    calf: [bone('calf_l'), bone('calf_r')], foot: [bone('foot_l'), bone('foot_r')],
  };
  const limbSpring = (kind) => ({ v: 0, w: 0, kind });
  const limb = {
    armOut: [limbSpring('arms'), limbSpring('arms')], armSwing: [limbSpring('arms'), limbSpring('arms')],
    legSwing: [limbSpring('legs'), limbSpring('legs')], legOut: [limbSpring('legs'), limbSpring('legs')],
    head: limbSpring('head'), spine: limbSpring('head'),
  };
  const flutter = { fore: [0, 0], hand: [0, 0], calf: [0, 0], foot: [0, 0], elbow: [0, 0], knee: [0, 0], twist: 0 };
  const flow = new Vec3();
  const inv = new Quat();
  const bodyQ = new Quat(), parentQ = new Quat(), parentInv = new Quat(), worldDelta = new Quat(), localDelta = new Quat();
  const worldAxis = new Vec3();
  let limpWeight = 0, limpTime = 0, limped = false;
  let braceWeight = 0, braceAtHit = 0;

  function bend(pose, i, axis, deg) {
    if (i < 0 || Math.abs(deg) < 1e-3) return;
    const p = parents[i];
    if (p >= 0) {
      const m = armature.getBoneWorldMatrix(p);
      if (!m) return;
      parentQ.setFromMat4(m);
    } else {
      parentQ.copy(bodyQ);
    }
    bodyQ.transformVector(axis, worldAxis);
    worldDelta.setFromAxisAngle(worldAxis, deg);
    parentInv.copy(parentQ).invert();
    localDelta.mul2(parentInv, worldDelta).mul(parentQ);
    pose.rotations[i].mul2(localDelta, pose.rotations[i]);
  }

  function updateLimp(dt) {
    const l = o.limp;
    limpTime += dt;
    limpWeight = l.weight * smooth(l.fadeIn[0], l.fadeIn[1], t);
    // The wind past her, in her own frame, as a share of the full.
    inv.copy(body).invert();
    inv.transformVector(tmp.copy(vel).mulScalar(-1 / l.fullSpeed), flow);
    const q = Math.min(flow.length(), 1.4);
    const step = (c, target) => {
      const [k, d] = l.springs[c.kind];
      c.w += (k * (target - c.v) - d * c.w) * dt;
      c.v += c.w * dt;
    };
    const swing = (seed, rate = 1) => fbm1(limpTime * l.flop.hz * rate, seed);
    const fast = (seed, rate = 1) => fbm1(limpTime * l.flutter.hz * rate, seed) * q;
    for (const k of [0, 1]) {
      const sign = k ? -1 : 1; // spreading is +belly on her left, -belly on her right
      step(limb.armOut[k], flow.x * l.armOut + sign * flow.y * l.armSpread + sign * swing(401 + k) * l.flop.arm);
      step(limb.armSwing[k], -flow.z * l.armSwing + swing(403 + k, 1.2) * l.flop.arm);
      step(limb.legSwing[k], -flow.z * l.legSwing + swing(405 + k, 0.9) * l.flop.leg);
      step(limb.legOut[k], flow.x * l.legOut + sign * swing(407 + k, 1.1) * l.flop.leg * 0.5);
      flutter.fore[k] = fast(411 + k) * l.flutter.forearm;
      flutter.hand[k] = fast(413 + k, 1.6) * l.flutter.hand;
      flutter.calf[k] = fast(415 + k, 0.9) * l.flutter.calf;
      flutter.foot[k] = fast(417 + k, 1.7) * l.flutter.foot;
      flutter.elbow[k] = -(0.5 + 0.5 * Math.abs(swing(421 + k, 1.3))) * l.elbow;
      flutter.knee[k] = (0.4 + 0.6 * Math.abs(swing(423 + k, 1.1))) * l.knee;
    }
    step(limb.head, -flow.z * l.head + swing(431) * l.flop.head);
    step(limb.spine, -flow.z * l.spine);
    flutter.twist = swing(433, 0.7) * l.spine;
  }

  // Bracing against the rock, as far as `w` of the way.
  function brace(pose, w) {
    const b = o.react.brace;
    for (const i of bones.spine) bend(pose, i, AXES.left, b.spine * w);
    bend(pose, bones.neck, AXES.left, b.head * 0.4 * w);
    bend(pose, bones.head, AXES.left, b.head * 0.6 * w);
    for (const k of [0, 1]) {
      const sign = k ? -1 : 1; // in toward her middle is -belly on her left, +belly on her right
      bend(pose, bones.upperarm[k], AXES.left, b.arm * w);
      bend(pose, bones.upperarm[k], AXES.belly, -sign * b.armIn * w);
      bend(pose, bones.lowerarm[k], AXES.left, b.elbow * w);
      bend(pose, bones.hand[k], AXES.left, b.hand * w);
      bend(pose, bones.thigh[k], AXES.left, b.thigh * w);
      bend(pose, bones.calf[k], AXES.left, b.knee * w);
    }
  }

  // On top of the clip, and of flightRig's own (off once she is hit).
  const rigModifier = armature.poseModifier;
  armature.poseModifier = (pose) => {
    rigModifier?.(pose);
    bodyQ.copy(armature.entity.getRotation());
    if (braceWeight > 0 && (phase === 'reveal' || phase === 'fall')) brace(pose, braceWeight);
    if (limpWeight <= 0 || (phase !== 'fall' && phase !== 'out')) return;
    const w = limpWeight;
    for (const i of bones.spine) {
      bend(pose, i, AXES.left, limb.spine.v * w);
      bend(pose, i, AXES.spine, flutter.twist * w);
    }
    bend(pose, bones.neck, AXES.left, limb.head.v * 0.4 * w);
    bend(pose, bones.head, AXES.left, limb.head.v * 0.6 * w);
    for (const k of [0, 1]) {
      bend(pose, bones.upperarm[k], AXES.belly, limb.armOut[k].v * w);
      bend(pose, bones.upperarm[k], AXES.left, limb.armSwing[k].v * w);
      bend(pose, bones.lowerarm[k], AXES.left, (flutter.elbow[k] + flutter.fore[k]) * w);
      bend(pose, bones.hand[k], AXES.left, flutter.hand[k] * w);
      bend(pose, bones.thigh[k], AXES.left, limb.legSwing[k].v * w);
      bend(pose, bones.thigh[k], AXES.belly, limb.legOut[k].v * w);
      bend(pose, bones.calf[k], AXES.left, (flutter.knee[k] + flutter.calf[k]) * w);
      bend(pose, bones.foot[k], AXES.left, flutter.foot[k] * w);
    }
  };

  // ── Running it ──────────────────────────────────────────────────────────

  function updateStorm(dt) {
    const st = o.storm;
    const ease = smooth(0, st.inputSeconds, t);
    input.turn = input.from.turn * (1 - ease);
    input.climb = input.from.climb * (1 - ease);
    s.speed += (st.speed - s.speed) * (1 - Math.exp(-dt / st.speedSeconds * 3));
    flight.options.turbulence = turbulence + (st.turbulence - turbulence) * smooth(0, 4, t);
    s.flail = 0.15 * smooth(2, 6, t);
    flight.update(dt, input);
    deps.placeFlyer();
    flightRig.update(dt, flight);
    chaseCamera.update(dt, flight);
    const camAlong = cam.getPosition().dot(s.forward);
    if (!sounded && camAlong >= bankAlong - s.speed * 1.25) {
      sounded = true;
      audio.play('cloud-pass', { cut: true });
    }
    // In the white, the cliff takes shape.
    if (camAlong >= bankAlong - 1) {
      spawnCliff();
      takeCamera();
      phase = 'reveal';
      t = 0;
    }
  }

  function updateReveal(dt) {
    const r = o.react;
    if (!reacted && hitAlong - s.pos.dot(s.forward) < s.speed * r.lead) {
      // She sees it: she throws herself into a bank away from it, bracing.
      reacted = true;
      reactT = t;
      audio.play('cliff-pass', { gain: 1, pan: -0.7 * o.cliff.side, cut: true });
    }
    const panic = reacted ? smooth(reactT, reactT + r.lead * 0.6, t) : 0;
    braceWeight = reacted ? smooth(reactT, reactT + r.seconds, t) : 0;
    s.flail = 0.15 * (1 - braceWeight); // the storm's flutter, stilled as she braces
    flight.update(dt, { turn: -o.cliff.side * panic, climb: 0 });
    // Too late to get out of its way: wherever the bank and the air push her,
    // the rock's edge stays on her line.
    place();
    deps.placeFlyer();
    flightRig.update(dt, flight);
    updateCamera(dt);
    if (s.pos.dot(s.forward) >= hitAlong) hit();
  }

  function updateFall(dt) {
    const f = o.fall, h = o.hit;
    braceWeight = braceAtHit * (1 - smooth(0, o.react.release, t));
    fall(dt);
    placeBody();
    if (flightRig.enabled) {
      flightRig.clipWeight = smooth(0, h.glideOff, t);
      flightRig.update(dt, flight);
      if (t >= h.glideOff) flightRig.enabled = false;
    }
    if (!limped && t >= h.limpAt) {
      limped = true;
      character.crossfadeTo('limpfall', { duration: h.limpFade, loop: true });
    }
    updateLimp(dt);
    updateDread(dt);
    updateCamera(dt);
    if (phase === 'fall' && t >= f.seconds) {
      for (const name of ['flight-wind', 'flight-whistle', 'turbulence', 'cloth-flap', 'sky-bed']) audio.level(name, 0, 0.05);
      audio.cut(0.03); // her eyes shut on silence
      phase = 'out';
      shutT = t;
    }
    deps.setLids(phase === 'out' ? 1 : 0);
  }

  const clearFrom = () => o.storm.bankAhead - o.storm.skyBankBefore - o.storm.skyBankRadius;

  // ── The screen, as she falls ────────────────────────────────────────────

  let dread = 0, beat = 0, beatPhase = 0, flicker = 0, shutT = 0;
  function updateDread(dt) {
    const d = o.dread;
    const screen = o.hit.screen;
    const impact = 1 - smooth(screen.hold, screen.seconds, sinceHit);
    dread = smooth(d.build[0], d.build[1], t);
    // Lub-dub: a strong beat and a softer one close behind.
    const was = beatPhase;
    beatPhase = (beatPhase + dt * (d.beatHz[0] + (d.beatHz[1] - d.beatHz[0]) * dread)) % 1;
    // And her heart, heard on each, louder as it quickens, until the black.
    const crossed = (at) => (was < beatPhase ? was < at && beatPhase >= at : was < at || beatPhase >= at);
    if (phase === 'fall' && dread > 0.02) {
      if (crossed(0.06)) audio.play('heart-thump', { gain: 0.35 + 0.65 * dread, cut: true });
      if (crossed(0.28)) audio.play('heart-thump', { gain: 0.6 * (0.35 + 0.65 * dread), cut: true });
    }
    const pulse = (at, w) => Math.exp(-(((beatPhase - at) / w) ** 2));
    beat = (pulse(0.06, 0.05) + 0.6 * pulse(0.28, 0.05)) * dread;
    const clear = Math.min(d.clear[0] + (d.clear[1] - d.clear[0]) * dread, d.clear[0] + (screen.clear - d.clear[0]) * impact);
    deps.dreadEl.style.setProperty('--clear', `${clear.toFixed(1)}%`);
    deps.dreadEl.style.opacity = Math.max(screen.vignette * impact, d.dark * Math.min(dread * 1.4, 1) * (0.85 + 0.15 * beat)).toFixed(3);
    const blur = (d.blurPx[0] + (d.blurPx[1] - d.blurPx[0]) * beat) * dread + screen.blurPx * impact;
    deps.canvas.style.filter = `blur(${blur.toFixed(2)}px) contrast(${(1 + d.contrast * dread + 0.25 * beat + screen.contrast * impact).toFixed(3)}) `
      + `saturate(${Math.max(0, 1 - d.bleach * dread - screen.bleach * impact).toFixed(3)}) brightness(${(1 + 0.25 * beat + screen.brightness * impact).toFixed(3)})`;
    // The flash of the blow dying, and white flickers late in the fall.
    const late = smooth(d.flicker.from, 1, dread);
    if (late > 0 && Math.random() < d.flicker.perSecond * late * dt) flicker = d.flicker.opacity * (0.4 + 0.6 * Math.random());
    flicker *= Math.exp(-22 * dt);
    deps.fadeEl.style.opacity = Math.max(o.hit.flash * Math.exp(-o.hit.flashDecay * sinceHit), flicker);
  }

  return {
    get phase() {
      return phase;
    },
    // 0..1, how far the fall's dread has built.
    get dread() {
      return dread;
    },
    // Once it has been black a beat.
    get done() {
      return phase === 'out' && t >= shutT + o.black;
    },
    // Puts it all away, but the shut lids: the cliff, her limp limbs and the
    // screen's dread.
    finish() {
      phase = null;
      root.enabled = false;
      windFx.visibility = 1;
      limpWeight = braceWeight = 0;
      armature.lockPelvisY = false;
      character.playbackSpeed = 1;
      deps.canvas.style.filter = '';
      deps.dreadEl.style.opacity = 0;
      deps.fadeEl.style.opacity = 0;
    },

    // `steer` is her eased steering input as it stands, faded out from there.
    start(steer) {
      phase = 'storm';
      t = 0;
      sounded = reacted = false;
      slow = 1;
      limpWeight = braceWeight = 0;
      dread = beat = flicker = 0;
      input.from.turn = steer.turn;
      input.from.climb = steer.climb;
      turbulence = flight.options.turbulence;
      flight.options.pocketThreshold = 0.05; // rough nearly all the way
      away.copy(s.left).mulScalar(-o.cliff.side);
      const st = o.storm;
      bankAlong = windFx.placeWipe(flight, st.bankAhead, st.bankRadius, { fade: true });
      skyClouds.placeWipe(flight, st.bankAhead - st.skyBankBefore, st.skyBankRadius, { fade: true });
      // No cliffs of the pool in the way, from the wall to well past the one
      // she hits.
      flightCliffs.keepClear(flight, clearFrom(), st.bankAhead + o.cliff.beyond + 90);
    },
    // Metres ahead of her, as it starts, from where it needs her line clear.
    get clearFrom() {
      return clearFrom();
    },

    // Runs a frame of it; returns the frame's time as the sequence has it,
    // all but stopped for the beat of the blow, for everything else that
    // moves with her.
    update(rawDt) {
      if (phase === 'fall' || phase === 'out') {
        const h = o.hit;
        sinceHit += rawDt;
        slow = 0.02 + 0.98 * smooth(h.stop, h.stopBy, sinceHit);
        character.playbackSpeed = slow;
      }
      const dt = rawDt * slow;
      t += dt;
      if (phase === 'storm') updateStorm(dt);
      else if (phase === 'reveal') updateReveal(dt);
      else if (phase === 'fall' || phase === 'out') updateFall(dt);
      if (phase !== 'storm' && phase !== 'out') hazeCliff();
      if (phase === 'storm' || phase === 'reveal') {
        const camAlong = cam.getPosition().dot(s.forward);
        deps.fadeEl.style.opacity = o.storm.whiteout * Math.max(1 - Math.abs(camAlong - bankAlong) / o.storm.whiteMetres, 0);
      }
      return dt;
    },

    // For debugging.
    stats() {
      const c = cam.getPosition();
      return {
        phase, t: +t.toFixed(2), sinceHit: +sinceHit.toFixed(2), slow: +slow.toFixed(2), speed: +s.speed.toFixed(1), y: +s.pos.y.toFixed(1),
        toHit: +(hitAlong - s.pos.dot(s.forward)).toFixed(1), herRockGap: +rockGap(s.pos).toFixed(2),
        camRockGap: +rockGap(c).toFixed(2), camToHer: +c.distance(s.pos).toFixed(2),
        hitPoint: [hitPoint.x, hitPoint.y, hitPoint.z].map(v => +v.toFixed(1)),
      };
    },
  };
}
