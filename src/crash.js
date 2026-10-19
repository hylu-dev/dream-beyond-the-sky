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
    // She clips the corner of it that stands furthest out toward her line,
    // at the foot of its top-heavy block: bare rock, its leaves and ivy all
    // well above, and nothing of it below reaches as far, so she falls clear
    // down its face. In the formation's own units, the height it is looked
    // for about.
    hitHeight: 1,
    band: 3.5,
    edge: 0.3, // metres of her middle, toward it, its corner stands
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
      [3, 16, -21, 13], [8, 31, 5, 12], [-8, 14, -50, 13], [12, 22, -34, 12],
    ],
    clouds: [3, 7, 8, 9, 10, 11, 12, 13],
    sky: [
      [-30, 40, 10, 28], [-8, 36, 69, 30], [20, 40, -20, 30],
      [-10, 26, -45, 32], [-5, 15, -85, 36], [0, 55, 25, 28],
    ],
    skyClouds: [3, 4, 5, 6, 7, 8],
  },
  // She sees it this many seconds out, and has only that long to flail.
  react: { lead: 0.35, flail: 0.85 },
  hit: {
    stop: 0.06, // time all but stops for this long at the blow,
    stopBy: 0.16, // and is back to full speed by this
    keep: 0.2, // share of her speed along her line that she keeps
    away: 11, // m/s flung away from the rock
    up: 3,
    drag: 1.4, // 1/s, how soon the fling across dies to a fall
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
    flash: 0.8,
    flashDecay: 9,
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
  black: 0.45, // seconds of it
  camera: {
    spring: [14, 6.5], // [stiffness, damping]
    reveal: { back: 3.4, away: 1.3, up: 0.7, fov: 62, lead: 4, toRock: 0.22 },
    fall: { up: [2.4, 5], away: 3.4, back: 1, fov: 70, upSeconds: 4 },
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
  const away = new Vec3();
  const vel = new Vec3();
  const spinAxis = new Vec3();
  const spin = new Vec3(); // degrees per second about world axes, at the blow
  const body = new Quat();
  const dq = new Quat();
  const pelvis = new Vec3(0, flight.options.pelvisHeight, 0); // in her own frame
  const tmp = new Vec3();
  const tmp2 = new Vec3();

  // ── The cliff ───────────────────────────────────────────────────────────

  // Edge on her line `hitAlong` metres along it, `edge` metres toward it off
  // her middle, at her height.
  function place() {
    const c = o.cliff;
    const lateral = s.pos.dot(s.left) + c.side * c.edge + c.scale * edgeLocal[0];
    const along = hitAlong + c.scale * edgeLocal[2];
    tmp.copy(s.forward).mulScalar(along);
    tmp.x += s.left.x * lateral;
    tmp.z += s.left.z * lateral;
    tmp.y = s.pos.y - c.scale * edgeLocal[1];
    rock.entity.setPosition(tmp);
    hitPoint.copy(s.forward).mulScalar(hitAlong);
    const edgeLateral = s.pos.dot(s.left) + c.side * c.edge;
    hitPoint.x += s.left.x * edgeLateral;
    hitPoint.z += s.left.z * edgeLateral;
    hitPoint.y = s.pos.y;
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
      tmp.copy(hitPoint).add(tmp2.copy(s.forward).mulScalar(along)).add(tmp2.copy(away).mulScalar(-out));
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
    fov: 55, shakeTime: 0, lurchTime: 0, hitTime: -1,
  };
  const goal = new Vec3();
  const lookGoal = new Vec3();

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
      const f = c.fall;
      const up = f.up[0] + (f.up[1] - f.up[0]) * smooth(0, f.upSeconds, t);
      // Above her and out on the far side from the rock, a little behind
      // where she is drifting, looking down on her.
      tmp2.set(vel.x, 0, vel.z);
      if (tmp2.lengthSq() > 1e-4) tmp2.normalize();
      goal.copy(s.pos).add(tmp.copy(away).mulScalar(f.away)).sub(tmp2.mulScalar(f.back));
      goal.y += up;
      lookGoal.copy(vel).mulScalar(0.1);
    }
    // On a spring that keeps pace with her, so it doesn't trail her fall.
    const [k, d] = c.spring;
    view.vel.x += (k * (goal.x - view.pos.x) - d * (view.vel.x - s.vel.x)) * dt;
    view.vel.y += (k * (goal.y - view.pos.y) - d * (view.vel.y - s.vel.y)) * dt;
    view.vel.z += (k * (goal.z - view.pos.z) - d * (view.vel.z - s.vel.z)) * dt;
    view.pos.add(tmp.copy(view.vel).mulScalar(dt));
    view.look.lerp(view.look, lookGoal, 1 - Math.exp(-c.lookRate * dt));
    view.fov += ((falling ? c.fall.fov : c.reveal.fov) - view.fov) * (1 - Math.exp(-2 * dt));

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
    const pa = sh.position * harder, la = c.shake.lurch.position * lurch, ha = c.hit.position;
    cam.setPosition(
      view.pos.x + n(301) * pa + l(311) * la + h(321) * ha,
      view.pos.y + n(302) * pa + l(312) * la + h(322) * ha,
      view.pos.z + n(303) * pa + l(313) * la + h(323) * ha,
    );
    cam.lookAt(tmp.copy(s.pos).add(view.look));
    const ra = sh.rotationDeg * harder, lr = c.shake.lurch.rotationDeg * lurch, hr = c.hit.rotationDeg;
    cam.rotateLocal(
      n(304, 1.2) * ra + l(314) * lr + h(324) * hr,
      n(305, 1.1) * ra + l(315) * lr + h(325) * hr,
      n(306, 0.8) * ra * 0.6 + l(316, 0.4) * c.shake.dutchDeg * lurch + h(326) * c.hit.rollDeg,
    );
    cam.camera.fov = view.fov + imp * c.hit.fov;
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
    sinceHit = 0;
    deps.fadeEl.style.opacity = h.flash;
    // A puff of the cloud's dust off the rock where she struck it, and the
    // cloud she will fall into, waiting far below.
    windFx.anchorCloud(4, hitPoint, 2.6, { opacity: 0.8 });
    const depth = fallDepth(o.fall.seconds - 0.7);
    tmp.copy(s.pos).add(tmp2.copy(away).mulScalar(3)).add(tmp2.copy(s.forward).mulScalar(s.speed * h.keep * 1.2));
    tmp.y = s.pos.y - depth - o.fall.deckRadius * 0.25;
    windFx.anchorCloud(5, tmp, o.fall.deckRadius, { opacity: 1 });
    tmp.add(tmp2.copy(s.left).mulScalar(o.fall.deckRadius * 0.7));
    windFx.anchorCloud(6, tmp, o.fall.deckRadius * 0.8, { opacity: 1 });
    audio.play('cliff-impact', { cut: true });
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

  // On top of the clip, and of flightRig's own (off once she is hit).
  const rigModifier = armature.poseModifier;
  armature.poseModifier = (pose) => {
    rigModifier?.(pose);
    if (limpWeight <= 0 || (phase !== 'fall' && phase !== 'out')) return;
    const w = limpWeight;
    bodyQ.copy(armature.entity.getRotation());
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
      // She sees it: she throws herself into a bank away from it, flailing.
      reacted = true;
      reactT = t;
      character.playLayer('flail', 'flail', { mask: deps.bodyMask, loop: true, weight: 0 });
      audio.play('cliff-pass', { gain: 1, pan: -0.7 * o.cliff.side, cut: true });
    }
    const panic = reacted ? smooth(reactT, reactT + r.lead * 0.6, t) : 0;
    deps.setFlailClip(r.flail * panic);
    s.flail = 0.15 + 0.85 * panic;
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
    dread = smooth(d.build[0], d.build[1], t);
    // Lub-dub: a strong beat and a softer one close behind.
    beatPhase = (beatPhase + dt * (d.beatHz[0] + (d.beatHz[1] - d.beatHz[0]) * dread)) % 1;
    const pulse = (at, w) => Math.exp(-(((beatPhase - at) / w) ** 2));
    beat = (pulse(0.06, 0.05) + 0.6 * pulse(0.28, 0.05)) * dread;
    const clear = d.clear[0] + (d.clear[1] - d.clear[0]) * dread;
    deps.dreadEl.style.setProperty('--clear', `${clear.toFixed(1)}%`);
    deps.dreadEl.style.opacity = (d.dark * Math.min(dread * 1.4, 1) * (0.85 + 0.15 * beat)).toFixed(3);
    const blur = (d.blurPx[0] + (d.blurPx[1] - d.blurPx[0]) * beat) * dread;
    deps.canvas.style.filter = `blur(${blur.toFixed(2)}px) contrast(${(1 + d.contrast * dread + 0.25 * beat).toFixed(3)}) `
      + `saturate(${(1 - d.bleach * dread).toFixed(3)}) brightness(${(1 + 0.25 * beat).toFixed(3)})`;
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
    // Once it has been black a beat.
    get done() {
      return phase === 'out' && t >= shutT + o.black;
    },
    // Puts it all away, but the shut lids: the cliff, her limp limbs and the
    // screen's dread.
    finish() {
      phase = null;
      root.enabled = false;
      limpWeight = 0;
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
      limpWeight = 0;
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
