import { Quat, Vec3 } from 'playcanvas';

// The seated clips (doze.glb, wake.glb) were made on a slimmer body than
// hers, so her hands, hanging at her sides, sink into her wide trousers at
// the hips. While `seated()` says she sits, this keeps the clip's pose and
// only lifts each hand clear: a few centimetres out from her side and up,
// from wherever the clip puts it - through the armature's poseModifier,
// after the clip and after any modifier already there (flightRig's), so it
// holds on every frame of any seated clip without touching the clips.
//
// Each frame it measures the clip's pose as it stands (the skeleton's own
// forward pass) and turns the upper arm and forearm so the hand reaches its
// new spot: a two-bone reach, the elbow bending the way the clip bends it.
// The hand keeps its angle to the forearm.

export const SEAT_POSE_DEFAULTS = {
  // Metres each hand moves out from her side, and up: the least that
  // clears her fingers from every side.
  out: 0.06,
  up: 0.1,
};

const UP = new Vec3(0, 1, 0);

export function createSeatPose(character, { seated = () => true, options = {} } = {}) {
  const o = { ...SEAT_POSE_DEFAULTS, ...options };
  const armature = character.armature;
  const skeleton = armature.skeleton;
  const names = armature.rigBoneNames;
  const parents = skeleton.parents;
  const bone = (name) => {
    const i = names.indexOf(name);
    if (i < 0) console.warn(`seatPose: no bone "${name}"`);
    return i;
  };
  const sides = ['l', 'r'].map((s) => ({
    sign: s === 'l' ? 1 : -1,
    upperarm: bone(`upperarm_${s}`),
    lowerarm: bone(`lowerarm_${s}`),
    hand: bone(`hand_${s}`),
  }));
  const thighs = [bone('thigh_l'), bone('thigh_r')];
  const ok = thighs.every((i) => i >= 0) && sides.every((s) => [s.upperarm, s.lowerarm, s.hand].every((i) => i >= 0));

  const world = []; // the clip's pose, world matrices, each frame
  const at = (i, out) => world[i].getTranslation(out);
  const v = Array.from({ length: 11 }, () => new Vec3());
  const [shoulder, elbow, hand, target, left, aim, bend, upperDir, foreDir, elbowTo, foreTo] = v;
  const tmp = new Vec3();
  const turnUpper = new Quat();
  const turnFore = new Quat();
  const parentQ = new Quat();
  const parentInv = new Quat();
  const localDelta = new Quat();

  // Turn bone i by `worldTurn`, given its parent's world rotation.
  function turn(pose, i, parentWorld, worldTurn) {
    parentInv.copy(parentWorld).invert();
    localDelta.mul2(parentInv, worldTurn).mul(parentWorld);
    const r = pose.rotations[i];
    r.mul2(localDelta, r);
  }

  function reach(pose, s) {
    at(s.upperarm, shoulder);
    at(s.lowerarm, elbow);
    at(s.hand, hand);
    const a = upperDir.sub2(elbow, shoulder).length();
    const b = foreDir.sub2(hand, elbow).length();

    target.copy(hand).add(tmp.copy(left).mulScalar(s.sign * o.out)).add(tmp.copy(UP).mulScalar(o.up));
    aim.sub2(target, shoulder);
    const d = Math.min(Math.max(aim.length(), 1e-3), (a + b) * 0.999);
    aim.normalize();

    // The elbow bends the way the clip bends it (out to her side, if the
    // clip's arm is straight).
    bend.copy(upperDir).sub(tmp.copy(aim).mulScalar(upperDir.dot(aim)));
    if (bend.length() < 1e-4) bend.copy(left).mulScalar(s.sign).sub(tmp.copy(aim).mulScalar(s.sign * left.dot(aim)));
    bend.normalize();
    const cos = Math.min(Math.max((a * a + d * d - b * b) / (2 * a * d), -1), 1);
    const sin = Math.sqrt(1 - cos * cos);
    // The new elbow, from the shoulder, and the new forearm, from it.
    elbowTo.copy(aim).mulScalar(a * cos).add(bend.mulScalar(a * sin));
    foreTo.copy(aim).mulScalar(d).sub(elbowTo).normalize();
    turnUpper.setFromDirections(upperDir.normalize(), tmp.copy(elbowTo).normalize());
    turnUpper.transformVector(foreDir.normalize(), foreDir);
    turnFore.setFromDirections(foreDir, foreTo);

    parentQ.setFromMat4(world[parents[s.upperarm]]);
    turn(pose, s.upperarm, parentQ, turnUpper);
    // The forearm's parent is the upper arm, as just turned.
    parentQ.setFromMat4(world[s.upperarm]);
    parentQ.mul2(turnUpper, parentQ);
    turn(pose, s.lowerarm, parentQ, turnFore);
  }

  // The clip's own arm rotations, kept from each frame this changes them.
  const kept = sides.flatMap((s) => [s.upperarm, s.lowerarm]).map((i) => ({ i, q: new Quat() }));
  let changed = null; // the pose this last changed, until the next frame

  const before = armature.poseModifier;
  armature.poseModifier = (pose, arm) => {
    before?.(pose, arm);
    changed = null;
    if (!ok || !seated()) return;
    for (const k of kept) k.q.copy(pose.rotations[k.i]);
    changed = pose;
    skeleton.applyLocal(pose, armature.entity.getWorldTransform(), world);
    // Her left, from her right hip to her left, level.
    at(thighs[0], left).sub(at(thighs[1], tmp));
    left.y = 0;
    left.normalize();
    for (const s of sides) reach(pose, s);
  };

  // A crossfade starts from the pose as last shown, hands already lifted, and
  // they would be lifted again on top of it: so the clip's own arms go back
  // into it first, and the doze into the wake doesn't throw her hands up.
  const crossfadeTo = armature.crossfadeTo.bind(armature);
  armature.crossfadeTo = (...args) => {
    if (changed) for (const k of kept) changed.rotations[k.i].copy(k.q);
    changed = null;
    return crossfadeTo(...args);
  };

  return { options: o };
}
