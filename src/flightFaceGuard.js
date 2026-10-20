import { Mat4, Quat, Vec3 } from 'playcanvas';

// Solve just the shielding arm against the current head position. Keeping the
// target in her body frame makes the gesture survive banks and counterlooks.
export function createFaceGuard(armature, bones) {
  const world = armature.rigBoneNames.map(() => new Mat4());
  const shoulder = new Vec3(), elbow = new Vec3(), wrist = new Vec3();
  const target = new Vec3(), pole = new Vec3(), axis = new Vec3(), normal = new Vec3();
  const wantedElbow = new Vec3(), from = new Vec3(), to = new Vec3(), offset = new Vec3();
  const parent = new Quat(), inverse = new Quat(), delta = new Quat(), local = new Quat();
  const originalUpper = new Quat(), originalLower = new Quat();
  const addScaled = (out, v, k) => out.add(offset.copy(v).mulScalar(k));
  const refresh = (pose) => armature.skeleton.applyLocal(pose, armature.entity.getWorldTransform(), world);
  function aim(pose, bone, start, end, destination) {
    from.sub2(end, start).normalize();
    to.sub2(destination, start).normalize();
    delta.setFromDirections(from, to);
    const p = armature.skeleton.parents[bone];
    if (p >= 0) parent.setFromMat4(world[p]);
    else parent.copy(armature.entity.getRotation());
    inverse.copy(parent).invert();
    local.mul2(inverse, delta).mul(parent).mul(pose.rotations[bone]);
    pose.rotations[bone].copy(local).normalize();
  }
  return (pose, side, weight, bodyRotation) => {
    if (weight < 0.001) return;
    const key = side > 0 ? 'l' : 'r';
    const upper = bones.upperarm[key], lower = bones.lowerarm[key], hand = bones.hand[key];
    if ([upper, lower, hand, bones.head].some(i => i < 0)) return;
    refresh(pose);
    world[upper].getTranslation(shoulder);
    world[lower].getTranslation(elbow);
    world[hand].getTranslation(wrist);
    const a = from.sub2(elbow, shoulder).length(), b = from.sub2(wrist, elbow).length();
    if (a < 1e-5 || b < 1e-5) return;
    // Offsets scale with her arm length, including any entity scale.
    const size = (a + b) / 0.6;
    world[bones.head].getTranslation(target);
    bodyRotation.transformVector(offset.set(-side * 0.12, 0.12, 0.17).mulScalar(size), offset);
    target.add(offset);
    bodyRotation.transformVector(offset.set(side * 0.6, 0.35, 0.5), pole);
    axis.sub2(target, shoulder);
    const distance = Math.max(Math.abs(a - b) + 1e-5, Math.min(a + b - 1e-5, axis.length()));
    axis.normalize();
    addScaled(target.copy(shoulder), axis, distance);
    addScaled(normal.copy(pole), axis, -pole.dot(axis)).normalize();
    const along = (a * a - b * b + distance * distance) / (2 * distance);
    addScaled(wantedElbow.copy(shoulder), axis, along);
    addScaled(wantedElbow, normal, Math.sqrt(Math.max(0, a * a - along * along)));
    originalUpper.copy(pose.rotations[upper]);
    originalLower.copy(pose.rotations[lower]);
    aim(pose, upper, shoulder, elbow, wantedElbow);
    refresh(pose);
    world[lower].getTranslation(elbow);
    world[hand].getTranslation(wrist);
    aim(pose, lower, elbow, wrist, target);
    pose.rotations[upper].slerp(originalUpper, pose.rotations[upper], weight).normalize();
    pose.rotations[lower].slerp(originalLower, pose.rotations[lower], weight).normalize();
  };
}
