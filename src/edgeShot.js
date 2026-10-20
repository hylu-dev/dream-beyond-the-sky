import { Vec3 } from 'playcanvas';

// Back away from the vista in one shallow arc, still looking toward the
// sun. She enters the view as she rises and walks; the camera never turns
// to find her. Keep the approved low ledge composition as the endpoint.
export const EDGE_SHOT_DEFAULTS = {
  viaPosition: { x: -2, y: 3.7, z: -4.4 },
  ledgePosition: { x: -0.65, y: 2.55, z: -4.95 },
  ledgeTarget: { x: 2.1, y: 2.57, z: -4.6 },
  ledgeFov: 54,
};

export function createEdgeShot(options = {}) {
  const o = { ...EDGE_SHOT_DEFAULTS, ...options };
  const via = o.viaPosition;
  const to = new Vec3(o.ledgePosition.x, o.ledgePosition.y, o.ledgePosition.z);
  const dx = o.ledgeTarget.x - to.x, dy = o.ledgeTarget.y - to.y, dz = o.ledgeTarget.z - to.z;
  const deg = Math.PI / 180;
  const yaw = Math.atan2(dx, dz) / deg;
  const pitch = Math.atan2(dy, Math.hypot(dx, dz)) / deg;
  const pose = { position: new Vec3(), target: new Vec3(), fov: o.ledgeFov };
  return {
    pose,
    frame(from, progress) {
      const t = Math.min(Math.max(progress, 0), 1);
      // Zero speed and acceleration at both ends, without an intermediate stop.
      const u = t * t * t * (t * (6 * t - 15) + 10);
      const a = (1 - u) ** 2, b = 2 * u * (1 - u), c = u * u;
      pose.position.set(
        a * from.pos.x + b * via.x + c * to.x,
        a * from.pos.y + b * via.y + c * to.y,
        a * from.pos.z + b * via.z + c * to.z,
      );
      const turn = ((yaw - from.yaw + 540) % 360) - 180;
      const heading = (from.yaw + turn * u) * deg;
      const tilt = (from.pitch + (pitch - from.pitch) * u) * deg;
      pose.target.set(
        pose.position.x + Math.sin(heading) * Math.cos(tilt) * 10,
        pose.position.y + Math.sin(tilt) * 10,
        pose.position.z + Math.cos(heading) * Math.cos(tilt) * 10,
      );
      pose.fov = from.fov + (o.ledgeFov - from.fov) * u;
      return pose;
    },
  };
}
