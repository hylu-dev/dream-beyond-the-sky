import { Quat, Vec3 } from 'playcanvas';
import { fbm1 } from './noise.js';
import { createFaceGuard } from './flightFaceGuard.js';

// Procedural flying pose and banking body language, layered on the standing
// idle clip through the armature's poseModifier (it runs after the clip is
// evaluated, before skinning).
//
// She is learning: her gaze leads a turn, shoulders catch her balance, and
// loose knees and feet follow later. Small uneven corrections persist after
// the launch flail settles. Nearby rock prompts a protective tuck; a cloud
// entry briefly raises one forearm. These gestures affect the pose only.
// Each part has its own damped spring so the response overlaps and settles.
//
// Offsets are rotations about her own standing-frame axes - up the spine (+Y),
// out of her belly (+Z), out of her left side (+X) - so they mean the same
// thing however flight.js has tipped and banked her. A body-space rotation D
// becomes a bone-local one through the parent's world rotation P (from the
// previous frame, which is close enough): local' = P^-1 * D_world * P * local.

const AXES = { spine: new Vec3(0, 1, 0), belly: new Vec3(0, 0, 1), left: new Vec3(1, 0, 0) };

export const RIG_DEFAULTS = {
  // The glide pose.
  spineArchDeg: -7, // per spine bone; negative arches the back
  headUpDeg: -55, // lifts the head to look along the flight
  armsOutDeg: 24, // away from the body
  armsBackDeg: 10, // toward her back
  kneeBendDeg: 24,
  footPointDeg: 14, // toes pointed
  breathDeg: 1.2, // slow sway of the arms while gliding
  breathHz: 0.22,
  // Banking, all at a full bank.
  headLookDeg: 48, // counterlook across a sustained bank
  torsoTwistDeg: 6, // per spine bone, shoulders leading
  sideBendDeg: 4, // per spine bone
  wingOutDeg: 28, // outside arm extends
  wingForwardDeg: 20, // and reaches a little forward
  tuckInDeg: 12, // inside arm draws in
  tuckBackDeg: 9, // and back toward the hip
  aileronDeg: 14, // hands angle against the airflow
  steerKneeDeg: 32, // inside knee bends to steer
  straightenKneeDeg: 6, // outside leg stays long
  legSwingDeg: 9, // both legs swing out of the turn
  gustArmDeg: 1.6, // arm correction per m/s^2 of sideways gust
  // Settling into a held turn: the extra roll is a reaction to the change,
  // not a pose she keeps. She rights herself until only this share of the
  // physical bank still shows, then wobbles about it.
  turnRollDeg: 27, // extra roll as a turn starts
  settleRate: 0.6, // 1/s, how quickly she gets used to a held turn
  releaseRate: 3, // 1/s, and to letting it go
  levelShare: 0.45, // of the physical bank she straightens out of
  settleWobbleDeg: 4, // unsteady roll while holding the turn
  // Wind buffeting, at full strength (wind 1): heavy limbs shoved by the
  // air on a loose spring, swinging past and back as she fights it. Calm
  // air has `windFloor` of it; turbulence pockets and gusts add the rest.
  windFloor: 0.4,
  buffetHz: 0.75,
  buffetArmBackDeg: 20, // arms blown back toward her hips
  buffetArmOutDeg: 14, // flung open or pinned in
  buffetElbowDeg: 16, // elbows buckle
  buffetLegDeg: 14, // thighs knocked about
  buffetKneeDeg: 18, // knees fold
  buffetRollDeg: 3, // body knocked per m/s^2 of sideways gust
  // Climbing and diving, at the flight's full climb rate.
  diveArmsBackDeg: 34, // arms sweep back toward her hips
  diveArmsInDeg: 16, // and close in to her sides
  diveHeadDeg: 16, // head drops to look down the dive
  diveKneeDeg: -14, // legs straighten and stream out behind
  climbArmsForwardDeg: 6, // arms come a little under her
  climbArmsOutDeg: 28, // and open wide, up toward her head, catching the air
  climbArchDeg: -4, // per spine bone, chest lifted
  climbKneeDeg: 16, // knees trail
  pullLegDeg: 3.5, // legs swing per m/s^2 of change in climb, lagging it
  // Soft elbows, bending more as an arm tucks in.
  elbowDeg: 20,
  tuckElbowDeg: 26,
  // Flutter in the airflow, degrees in calm air; rough air multiplies it.
  flutter: { hz: 1.15, arm: 1.6, hand: 1.8, forearm: 1, thigh: 1.2, calf: 1.5, foot: 2.5, pocket: 3, gust: 0.3 },
  // Flailing (flight.state.flail), at full flail: arms windmilling, legs
  // kicking, body and head thrashing. Noise, not springs, so it stays wild.
  // Under a flailing clip (clipWeight) only this share of it stays on top.
  flailNoiseShare: 0.3,
  flailHz: 1.7,
  flailArmOutDeg: 60,
  flailArmSwingDeg: 85, // forward and back
  flailKneeDeg: 40,
  flailLegDeg: 28,
  flailTwistDeg: 10, // per spine bone
  flailHeadDeg: 25,
  // Springs: [stiffness, damping]. Stiffer reacts sooner; less damping overshoots.
  springs: {
    head: [60, 13],
    torso: [26, 8],
    arms: [16, 5.5],
    hands: [30, 8],
    knees: [14, 5],
    legs: [8, 2.6],
    pull: [10, 2.2], // loose, so a pull-up swings the legs and they settle
    buffet: [7, 2], // heavy: shoved limbs lag, swing past and come back
  },
};

export function createFlightRig(character, options = {}) {
  const o = { ...RIG_DEFAULTS, ...options, springs: { ...RIG_DEFAULTS.springs, ...options.springs } };
  const armature = character.armature;
  const names = armature.rigBoneNames;
  const parents = armature.skeleton.parents;

  const bone = (name) => {
    const i = names.indexOf(name);
    if (i < 0) console.warn(`flightRig: no bone "${name}"`);
    return i;
  };
  const b = {
    spine: ['spine_02', 'spine_03', 'spine_04'].map(bone),
    neck: bone('neck_01'),
    head: bone('head'),
    upperarm: { l: bone('upperarm_l'), r: bone('upperarm_r') },
    lowerarm: { l: bone('lowerarm_l'), r: bone('lowerarm_r') },
    hand: { l: bone('hand_l'), r: bone('hand_r') },
    thigh: { l: bone('thigh_l'), r: bone('thigh_r') },
    calf: { l: bone('calf_l'), r: bone('calf_r') },
    foot: { l: bone('foot_l'), r: bone('foot_r') },
  };

  const faceGuard = createFaceGuard(armature, b);
  let guardSide = 1;

  // One damped spring per channel; the modifier only reads `.v`.
  const spring = (kind) => ({ v: 0, w: 0, kind });
  const ch = {
    headLook: spring('head'),
    twist: spring('torso'),
    bend: spring('torso'),
    armOutL: spring('arms'),
    armOutR: spring('arms'),
    armBackL: spring('arms'),
    armBackR: spring('arms'),
    handL: spring('hands'),
    handR: spring('hands'),
    kneeL: spring('knees'),
    kneeR: spring('knees'),
    legSwing: spring('legs'),
    climbArms: spring('arms'), // + reaches ahead, - sweeps back
    climbOut: spring('arms'),
    climbHead: spring('head'),
    climbArch: spring('torso'),
    climbKnee: spring('knees'),
    pull: spring('pull'),
    elbowL: spring('arms'),
    elbowR: spring('arms'),
    legL: spring('legs'),
    legR: spring('legs'),
    splayL: spring('legs'),
    splayR: spring('legs'),
    brace: spring('torso'),
    guard: spring('head'),
    bodyRoll: spring('torso'),
    bodyYaw: spring('torso'),
    windArmL: spring('buffet'),
    windArmR: spring('buffet'),
    windOutL: spring('buffet'),
    windOutR: spring('buffet'),
    windElbowL: spring('buffet'),
    windElbowR: spring('buffet'),
    windLegL: spring('buffet'),
    windLegR: spring('buffet'),
    windKneeL: spring('buffet'),
    windKneeR: spring('buffet'),
  };
  let lastClimb = 0;
  let climbAccel = 0;
  let heldIntent = 0; // the turn she has got used to
  const step = (c, target, dt) => {
    const [k, d] = o.springs[c.kind];
    // Integrate at a bounded step even on a slow frame; loose limbs must
    // not explode or snap when rendering briefly stalls.
    const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      c.w += (k * (target - c.v) - d * c.w) * h;
      c.v += c.w * h;
    }
  };

  let enabled = false;
  let time = 0;
  let cloudAge = Infinity, cloudSide = 1, cloudCooldown = 0;
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  // This frame's flailing offsets, in degrees, added straight onto the pose.
  const fl = { outL: 0, outR: 0, swingL: 0, swingR: 0, kneeL: 0, kneeR: 0, legL: 0, legR: 0, twist: 0, head: 0 };
  // And the airflow's flutter on each part.
  const fx = { armL: 0, armR: 0, handL: 0, handR: 0, foreL: 0, foreR: 0, thighL: 0, thighR: 0, calfL: 0, calfR: 0, footL: 0, footR: 0 };
  // How much a hand-animated clip drives her instead of the glide pose: at 1
  // the clip plays as it is, at 0 the glide pose is fully on.
  let clipWeight = 0;

  const bodyQ = new Quat();
  const parentQ = new Quat();
  const parentInv = new Quat();
  const worldDelta = new Quat();
  const localDelta = new Quat();
  const worldAxis = new Vec3();

  function rotate(pose, i, axis, deg) {
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
    const r = pose.rotations[i];
    r.mul2(localDelta, r);
  }

  armature.poseModifier = (pose) => {
    if (!enabled) return;
    bodyQ.copy(armature.entity.getRotation());
    const g = 1 - clipWeight; // share of the glide pose and banking
    const breath = Math.sin(time * Math.PI * 2 * o.breathHz) * o.breathDeg * g;

    for (const i of b.spine) {
      rotate(pose, i, AXES.left, (o.spineArchDeg + ch.climbArch.v + ch.brace.v * 5) * g);
      rotate(pose, i, AXES.spine, ch.twist.v * g + fl.twist);
      rotate(pose, i, AXES.belly, -ch.bend.v * g);
    }
    rotate(pose, b.neck, AXES.left, (o.headUpDeg + ch.climbHead.v + ch.brace.v * 14) * 0.4 * g);
    rotate(pose, b.head, AXES.left, (o.headUpDeg + ch.climbHead.v + ch.brace.v * 14) * 0.6 * g);
    rotate(pose, b.neck, AXES.belly, -(ch.headLook.v * g + fl.head) * 0.4);
    rotate(pose, b.head, AXES.belly, -(ch.headLook.v * g + fl.head) * 0.6);

    // Left arm opens with +belly, right with -belly; both reach back with +left.
    rotate(pose, b.upperarm.l, AXES.belly, (o.armsOutDeg + ch.armOutL.v + ch.climbOut.v + ch.windOutL.v) * g + fl.outL);
    rotate(pose, b.upperarm.r, AXES.belly, -((o.armsOutDeg + ch.armOutR.v + ch.climbOut.v + ch.windOutR.v) * g + fl.outR));
    rotate(pose, b.upperarm.l, AXES.left, (o.armsBackDeg + ch.armBackL.v - ch.climbArms.v + ch.windArmL.v) * g + breath + fl.swingL + fx.armL);
    rotate(pose, b.upperarm.r, AXES.left, (o.armsBackDeg + ch.armBackR.v - ch.climbArms.v + ch.windArmR.v) * g + breath + fl.swingR + fx.armR);
    // Elbows soft, the forearms toward her belly; more as the arm tucks.
    const tuckL = Math.max(-ch.armOutL.v / o.tuckInDeg, 0);
    const tuckR = Math.max(-ch.armOutR.v / o.tuckInDeg, 0);
    rotate(pose, b.lowerarm.l, AXES.left, -clamp(o.elbowDeg + tuckL * o.tuckElbowDeg + ch.elbowL.v + ch.windElbowL.v, 8, 100) * g + fx.foreL);
    rotate(pose, b.lowerarm.r, AXES.left, -clamp(o.elbowDeg + tuckR * o.tuckElbowDeg + ch.elbowR.v + ch.windElbowR.v, 8, 100) * g + fx.foreR);
    rotate(pose, b.hand.l, AXES.left, ch.handL.v * g + fx.handL);
    rotate(pose, b.hand.r, AXES.left, ch.handR.v * g + fx.handR);

    // Loose legs trail the turn with separate hip and knee corrections.
    rotate(pose, b.thigh.l, AXES.belly, (-ch.legSwing.v + ch.splayL.v) * g);
    rotate(pose, b.thigh.r, AXES.belly, (-ch.legSwing.v - ch.splayR.v) * g);
    rotate(pose, b.thigh.l, AXES.left, breath * 0.3 + (ch.pull.v + ch.legL.v + ch.windLegL.v) * g + fl.legL + fx.thighL);
    rotate(pose, b.thigh.r, AXES.left, -breath * 0.3 + ((ch.pull.v + ch.legR.v) * 0.85 + ch.windLegR.v) * g + fl.legR + fx.thighR);
    rotate(pose, b.calf.l, AXES.left, clamp(o.kneeBendDeg + ch.kneeL.v + ch.climbKnee.v + ch.windKneeL.v, 6, 80) * g + fl.kneeL + fx.calfL);
    rotate(pose, b.calf.r, AXES.left, clamp(o.kneeBendDeg + ch.kneeR.v + ch.climbKnee.v + ch.windKneeR.v, 6, 80) * g + fl.kneeR + fx.calfR);
    rotate(pose, b.foot.l, AXES.left, o.footPointDeg * g + fx.footL);
    rotate(pose, b.foot.r, AXES.left, o.footPointDeg * g + fx.footR);
    faceGuard(pose, guardSide, clamp(ch.guard.v, 0, 1) * g, bodyQ);
  };

  return {
    set enabled(v) {
      if (v && !enabled) {
        for (const c of Object.values(ch)) c.v = c.w = 0;
        for (const values of [fl, fx]) for (const key of Object.keys(values)) values[key] = 0;
        time = lastClimb = climbAccel = cloudCooldown = heldIntent = 0;
        cloudAge = Infinity;
        guardSide = 1;
      }
      enabled = v;
    },
    get enabled() {
      return enabled;
    },
    set clipWeight(v) {
      clipWeight = clamp(v, 0, 1);
    },
    reactToCloud(side) {
      if (!enabled || cloudCooldown > 0) return;
      cloudSide = side < 0 ? -1 : 1;
      cloudAge = 0;
      cloudCooldown = 4;
    },
    // Read-only snapshot for motion review and regression checks.
    stats: () => ({ channels: Object.fromEntries(Object.entries(ch).map(([k, c]) => [k, c.v])), cloudAge, clipWeight, guardSide }),
    update(dt, flight, { uncertainty = 0.5, cliff = null } = {}) {
      if (!enabled || dt <= 0) return;
      dt = Math.min(dt, 0.1);
      time += dt;
      cloudAge += dt;
      cloudCooldown = Math.max(0, cloudCooldown - dt);
      const s = flight.state;
      const max = flight.options.maxBankDeg;
      // +1 is a full bank to her left, -1 to her right.
      const intent = clamp(-s.targetBankDeg / max, -1, 1);
      const roll = clamp(-s.bankDeg / max, -1.2, 1.2);
      const insideL = Math.max(roll, 0); // left arm and leg are on the low side
      const insideR = Math.max(-roll, 0);
      const gust = s.gust.dot(s.left) * o.gustArmDeg;

      const flail = (s.flail ?? 0) * (1 - clipWeight * (1 - o.flailNoiseShare));
      const ft = time * o.flailHz;
      const n = (seed, rate = 1) => fbm1(ft * rate, seed) * flail;
      fl.outL = n(101) * o.flailArmOutDeg;
      fl.outR = n(102, 1.1) * o.flailArmOutDeg;
      fl.swingL = n(103, 1.3) * o.flailArmSwingDeg;
      fl.swingR = n(104, 1.2) * o.flailArmSwingDeg;
      fl.kneeL = Math.abs(n(105, 1.5)) * o.flailKneeDeg;
      fl.kneeR = Math.abs(n(106, 1.4)) * o.flailKneeDeg;
      fl.legL = n(107, 1.6) * o.flailLegDeg;
      fl.legR = n(108, 1.5) * o.flailLegDeg;
      fl.twist = n(109, 0.8) * o.flailTwistDeg;
      fl.head = n(110, 0.9) * o.flailHeadDeg;

      const unsure = clamp(uncertainty, 0, 1);
      // Input outruns body roll at a new turn or reversal. She catches it
      // with open arms and bent elbows; the slower legs follow through.
      const catchTurn = clamp(intent - roll, -1, 1);
      const catchAmount = Math.abs(catchTurn) * (0.4 + unsure * 0.6);
      const balanceL = fbm1(time * 0.42, 301) * (0.5 + unsure);
      const balanceR = fbm1(time * 0.37, 302) * (0.5 + unsure);
      const cloud = cloudAge < 3.5 ? Math.sin(Math.PI / 2 * Math.min(cloudAge / 0.4, 1)) * Math.exp(-Math.max(0, cloudAge - 1.0) * 1.25) : 0;
      const near = Math.sqrt(clamp(cliff?.strength ?? 0, 0, 1));
      const nearL = near * Math.max(cliff?.side ?? 0, 0);
      const nearR = near * Math.max(-(cliff?.side ?? 0), 0);
      const threat = Math.max(near, cloud);
      // She gets used to a held turn: the extra roll goes with the change in
      // intent, and once settled she rights herself out of most of the bank.
      // `lean` is the roll she still shows, for the posture that follows it.
      // Letting go of a turn is quick to get used to; leaning into one is not.
      const easing = Math.sign(intent - heldIntent) === -Math.sign(heldIntent);
      heldIntent += (intent - heldIntent) * (1 - Math.exp(-(easing ? o.releaseRate : o.settleRate) * dt));
      const settled = roll * clamp(1 - Math.abs(intent - heldIntent) * 2, 0, 1);
      const lean = roll - settled * o.levelShare;
      const wobble = fbm1(time * 0.31, 303) * o.settleWobbleDeg * Math.abs(settled) * (0.5 + unsure);
      // Wind: rough air shoves her heavy limbs about. Each limb has its own
      // gusty noise (mostly small, now and then a big shove) plus the shared
      // gust, so the sides never move together; confidence eases it.
      const lateral = s.gust.dot(s.left);
      const wind = clamp((o.windFloor + s.pocket + s.gust.length() * 0.12) * (0.5 + unsure), 0, 1.3) * (1 - clipWeight);
      const bt = time * o.buffetHz;
      const shove = (seed, rate) => {
        const x = fbm1(bt * rate, seed);
        return Math.sign(x) * x * x * 1.6;
      };
      // Latch the shielding side until the arm has lowered; simultaneous
      // opposite threats must never bring both arms across her face.
      if (ch.guard.v < 0.05) guardSide = near > cloud ? (cliff?.side < 0 ? -1 : 1) : cloudSide;
      step(ch.guard, threat, dt);
      step(ch.brace, Math.max(near, cloud), dt);
      // A large partial roll reads at chase-camera distance. She counterlooks
      // across the bank, then glances toward nearby rock as she rolls away.
      step(ch.bodyRoll, clamp(-(intent - heldIntent) * o.turnRollDeg - catchTurn * 22 + settled * o.levelShare * max + wobble - lateral * wind * o.buffetRollDeg + (nearL - nearR) * 28 + cloudSide * cloud * 20, -42, 42), dt);
      step(ch.bodyYaw, -lean * 10 + (nearL - nearR) * 7, dt);
      s.poseRollDeg = ch.bodyRoll.v * (1 - clipWeight);
      s.poseYawDeg = ch.bodyYaw.v * (1 - clipWeight);
      step(ch.headLook, clamp(intent * 10 - lean * o.headLookDeg + (nearL - nearR) * 30 - cloudSide * cloud * 18, -60, 60), dt);
      step(ch.twist, -lean * o.torsoTwistDeg + catchTurn * 8, dt);
      step(ch.bend, lean * o.sideBendDeg - (nearL - nearR) * 3, dt);
      step(ch.armOutL, insideR * o.wingOutDeg - insideL * o.tuckInDeg + gust + balanceL * 4 + catchAmount * 20, dt);
      step(ch.armOutR, insideL * o.wingOutDeg - insideR * o.tuckInDeg - gust + balanceR * 4 + catchAmount * 20, dt);
      step(ch.armBackL, insideL * o.tuckBackDeg - insideR * o.wingForwardDeg + balanceL * 5, dt);
      step(ch.armBackR, insideR * o.tuckBackDeg - insideL * o.wingForwardDeg + balanceR * 5, dt);
      step(ch.elbowL, catchAmount * 24 + balanceL * 4, dt);
      step(ch.elbowR, catchAmount * 24 + balanceR * 4, dt);
      step(ch.handL, roll * o.aileronDeg + catchTurn * 8, dt);
      step(ch.handR, -roll * o.aileronDeg - catchTurn * 8, dt);
      step(ch.kneeL, insideL * o.steerKneeDeg - insideR * o.straightenKneeDeg + balanceL * 9 + Math.max(near * 34, cloud * 30), dt);
      step(ch.kneeR, insideR * o.steerKneeDeg - insideL * o.straightenKneeDeg + balanceR * 9 + Math.max(near * 28, cloud * 23), dt);
      step(ch.legSwing, roll * o.legSwingDeg, dt);
      step(ch.legL, -balanceL * 6 - catchTurn * 12 - Math.max(near * 22, cloud * 18), dt);
      step(ch.legR, -balanceR * 6 + catchTurn * 10 - Math.max(near * 18, cloud * 14), dt);
      step(ch.splayL, 3 + Math.abs(balanceL) * 3 + catchAmount * 4, dt);
      step(ch.splayR, 3 + Math.abs(balanceR) * 3 + catchAmount * 3, dt);
      const armL = shove(401, 1), armR = shove(402, 0.87);
      step(ch.windArmL, wind * (armL * o.buffetArmBackDeg + o.buffetArmBackDeg * 0.3 - s.gust.y * 1.5), dt);
      step(ch.windArmR, wind * (armR * o.buffetArmBackDeg + o.buffetArmBackDeg * 0.3 - s.gust.y * 1.2), dt);
      step(ch.windOutL, wind * (shove(403, 1.13) * o.buffetArmOutDeg + lateral * 2.5), dt);
      step(ch.windOutR, wind * (shove(404, 0.94) * o.buffetArmOutDeg - lateral * 2.5), dt);
      step(ch.windElbowL, wind * Math.abs(armL) * o.buffetElbowDeg, dt);
      step(ch.windElbowR, wind * Math.abs(armR) * o.buffetElbowDeg, dt);
      step(ch.windLegL, wind * (shove(405, 0.81) * o.buffetLegDeg - s.gust.y * 1.5), dt);
      step(ch.windLegR, wind * (shove(406, 0.92) * o.buffetLegDeg - s.gust.y * 1.8), dt);
      step(ch.windKneeL, wind * Math.abs(shove(407, 1.21)) * o.buffetKneeDeg, dt);
      step(ch.windKneeR, wind * Math.abs(shove(408, 1.07)) * o.buffetKneeDeg, dt);

      // Climbing (+) or diving (-), as a share of the full rate; and how fast
      // that is changing, whose pull swings the legs: they lag it, toward
      // the ground (her belly) as she pulls up, toward the sky as she tips over.
      const climb = (s.climbVel ?? 0) / (flight.options.maxClimb ?? 5);
      const up = Math.max(climb, 0);
      const down = Math.max(-climb, 0);
      const accel = dt > 0 ? ((s.climbVel ?? 0) - lastClimb) / dt : 0;
      lastClimb = s.climbVel ?? 0;
      climbAccel += (accel - climbAccel) * (1 - Math.exp(-8 * dt));
      step(ch.climbArms, up * o.climbArmsForwardDeg - down * o.diveArmsBackDeg, dt);
      step(ch.climbOut, up * o.climbArmsOutDeg - down * o.diveArmsInDeg, dt);
      step(ch.climbHead, down * o.diveHeadDeg, dt);
      step(ch.climbArch, up * o.climbArchDeg, dt);
      step(ch.climbKnee, up * o.climbKneeDeg + down * o.diveKneeDeg, dt);
      step(ch.pull, clamp(-climbAccel * o.pullLegDeg, -22, 22), dt);

      // The airflow: quick small flutters, each part on its own noise, out
      // of step with the others; rough air and gusts shake them harder.
      const f = o.flutter;
      const rough = (1 + s.pocket * f.pocket + s.gust.length() * f.gust) * (1 - clipWeight);
      const ff = time * f.hz;
      const q = (seed, rate, deg) => fbm1(ff * rate, seed) * deg * rough;
      fx.armL = q(209, 0.8, f.arm);
      fx.armR = q(210, 0.75, f.arm);
      fx.thighL = q(211, 0.7, f.thigh);
      fx.thighR = q(212, 0.77, f.thigh);
      fx.handL = q(201, 1.7, f.hand);
      fx.handR = q(202, 1.6, f.hand);
      fx.foreL = q(203, 1.1, f.forearm);
      fx.foreR = q(204, 1.2, f.forearm);
      fx.calfL = q(205, 0.9, f.calf);
      fx.calfR = q(206, 1, f.calf);
      fx.footL = q(207, 1.9, f.foot);
      fx.footR = q(208, 1.8, f.foot);
    },
  };
}
