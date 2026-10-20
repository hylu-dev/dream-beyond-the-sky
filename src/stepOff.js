import { Vec3 } from 'playcanvas';

// Follow the authored step until the supporting foot leaves the ledge. From
// there, gravity owns height and horizontal momentum stays constant. Subtract
// the clip's pelvis descent so animation and physics never count it twice.
export function createStepOff(path, { headingDeg, gravity = 13 } = {}) {
  const duration = (path.x.length - 1) * path.dt;
  const releaseAt = path.releaseAt;
  const sample = (values, time) => {
    const f = Math.max(0, Math.min(values.length - 1, time / path.dt));
    const i = Math.min(values.length - 2, Math.floor(f));
    return values[i] + (values[i + 1] - values[i]) * (f - i);
  };
  const release = ['x', 'y', 'z'].map(axis => sample(path[axis], releaseAt));
  const velocity = ['x', 'y', 'z'].map(axis =>
    (sample(path[axis], releaseAt) - sample(path[axis], releaseAt - path.dt)) / path.dt);
  const radians = headingDeg * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  const pose = { offset: new Vec3(), clipTime: 0, airborne: false };
  return {
    duration, releaseAt,
    frame(time) {
      pose.clipTime = Math.max(0, Math.min(time, duration));
      pose.airborne = time >= releaseAt;
      const airTime = Math.max(0, time - releaseAt);
      const x = pose.airborne ? release[0] + velocity[0] * airTime : sample(path.x, time);
      const z = pose.airborne ? release[2] + velocity[2] * airTime : sample(path.z, time);
      const y = pose.airborne
        ? release[1] + velocity[1] * airTime - 0.5 * gravity * airTime * airTime - sample(path.y, pose.clipTime)
        : 0;
      pose.offset.set(c * x + s * z, y, -s * x + c * z);
      return pose;
    },
  };
}
