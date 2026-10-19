import { Quat, Vec3 } from 'playcanvas';
import { fbm1 } from './noise.js';

// Procedural flying pose and banking body language, layered on the standing
// idle clip through the armature's poseModifier (it runs after the clip is
// evaluated, before skinning).
//
// She should fly like someone who has done it a thousand times: her head
// turns into a bank on the INPUT, before her body has rolled; the torso
// twists with the roll itself; the outside arm extends like a wing while the
// inside one tucks to the hip; the inside knee bends to steer while the
// outside leg stays long; and the legs, loosest of all, follow through and
// settle. Each part is its own damped spring, and the different stiffnesses
// are what make the motion overlap instead of moving as one block.
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
  kneeBendDeg: 18,
  footPointDeg: 25, // toes pointed
  breathDeg: 2.5, // slow sway of the arms while gliding
  breathHz: 0.22,
  // Banking, all at a full bank.
  headLookDeg: 28, // on the input, ahead of the roll
  torsoTwistDeg: 10, // per spine bone, shoulders leading
  sideBendDeg: 4, // per spine bone
  wingOutDeg: 18, // outside arm extends
  wingForwardDeg: 10, // and reaches a little forward
  tuckInDeg: 20, // inside arm draws in
  tuckBackDeg: 14, // and back toward the hip
  aileronDeg: 14, // hands angle against the airflow
  steerKneeDeg: 28, // inside knee bends to steer
  straightenKneeDeg: 10, // outside leg stays long
  legSwingDeg: 9, // both legs swing out of the turn
  gustArmDeg: 1.6, // arm correction per m/s^2 of sideways gust
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
    hand: { l: bone('hand_l'), r: bone('hand_r') },
    thigh: { l: bone('thigh_l'), r: bone('thigh_r') },
    calf: { l: bone('calf_l'), r: bone('calf_r') },
    foot: { l: bone('foot_l'), r: bone('foot_r') },
  };

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
  };
  const step = (c, target, dt) => {
    const [k, d] = o.springs[c.kind];
    c.w += (k * (target - c.v) - d * c.w) * dt;
    c.v += c.w * dt;
  };

  let enabled = false;
  let time = 0;
  // This frame's flailing offsets, in degrees, added straight onto the pose.
  const fl = { outL: 0, outR: 0, swingL: 0, swingR: 0, kneeL: 0, kneeR: 0, legL: 0, legR: 0, twist: 0, head: 0 };
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
      rotate(pose, i, AXES.left, o.spineArchDeg * g);
      rotate(pose, i, AXES.spine, ch.twist.v * g + fl.twist);
      rotate(pose, i, AXES.belly, -ch.bend.v * g);
    }
    rotate(pose, b.neck, AXES.left, o.headUpDeg * 0.4 * g);
    rotate(pose, b.head, AXES.left, o.headUpDeg * 0.6 * g);
    rotate(pose, b.neck, AXES.spine, (ch.headLook.v * g + fl.head) * 0.4);
    rotate(pose, b.head, AXES.spine, (ch.headLook.v * g + fl.head) * 0.6);

    // Left arm opens with +belly, right with -belly; both reach back with +left.
    rotate(pose, b.upperarm.l, AXES.belly, (o.armsOutDeg + ch.armOutL.v) * g + fl.outL);
    rotate(pose, b.upperarm.r, AXES.belly, -((o.armsOutDeg + ch.armOutR.v) * g + fl.outR));
    rotate(pose, b.upperarm.l, AXES.left, (o.armsBackDeg + ch.armBackL.v) * g + breath + fl.swingL);
    rotate(pose, b.upperarm.r, AXES.left, (o.armsBackDeg + ch.armBackR.v) * g + breath + fl.swingR);
    rotate(pose, b.hand.l, AXES.left, ch.handL.v * g);
    rotate(pose, b.hand.r, AXES.left, ch.handR.v * g);

    // Legs: swing out of the turn together, knees steer, toes pointed.
    rotate(pose, b.thigh.l, AXES.belly, -ch.legSwing.v * g);
    rotate(pose, b.thigh.r, AXES.belly, -ch.legSwing.v * g);
    rotate(pose, b.thigh.l, AXES.left, breath * 0.3 + fl.legL);
    rotate(pose, b.thigh.r, AXES.left, -breath * 0.3 + fl.legR);
    rotate(pose, b.calf.l, AXES.left, (o.kneeBendDeg + ch.kneeL.v) * g + fl.kneeL);
    rotate(pose, b.calf.r, AXES.left, (o.kneeBendDeg + ch.kneeR.v) * g + fl.kneeR);
    rotate(pose, b.foot.l, AXES.left, o.footPointDeg * g);
    rotate(pose, b.foot.r, AXES.left, o.footPointDeg * g);
  };

  return {
    set enabled(v) {
      enabled = v;
    },
    get enabled() {
      return enabled;
    },
    set clipWeight(v) {
      clipWeight = v;
    },
    update(dt, flight) {
      time += dt;
      const s = flight.state;
      const max = flight.options.maxBankDeg;
      // +1 is a full bank to her left, -1 to her right.
      const intent = -s.targetBankDeg / max;
      const roll = -s.bankDeg / max;
      const insideL = Math.max(roll, 0); // left arm and leg are on the low side
      const insideR = Math.max(-roll, 0);
      const gust = s.gust.x * o.gustArmDeg;

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

      step(ch.headLook, intent * o.headLookDeg, dt);
      step(ch.twist, roll * o.torsoTwistDeg, dt);
      step(ch.bend, roll * o.sideBendDeg, dt);
      // Inside arm tucks in and back, outside arm opens wide and reaches forward;
      // gusts get small opposite corrections, as if she is feeling the air.
      step(ch.armOutL, insideR * o.wingOutDeg - insideL * o.tuckInDeg + gust, dt);
      step(ch.armOutR, insideL * o.wingOutDeg - insideR * o.tuckInDeg - gust, dt);
      step(ch.armBackL, insideL * o.tuckBackDeg - insideR * o.wingForwardDeg, dt);
      step(ch.armBackR, insideR * o.tuckBackDeg - insideL * o.wingForwardDeg, dt);
      step(ch.handL, roll * o.aileronDeg, dt);
      step(ch.handR, -roll * o.aileronDeg, dt);
      step(ch.kneeL, insideL * o.steerKneeDeg - insideR * o.straightenKneeDeg, dt);
      step(ch.kneeR, insideR * o.steerKneeDeg - insideL * o.straightenKneeDeg, dt);
      step(ch.legSwing, roll * o.legSwingDeg, dt);
    },
  };
}
