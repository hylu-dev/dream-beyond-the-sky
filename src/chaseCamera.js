import { Vec3 } from 'playcanvas';
import { fbm1 } from './noise.js';

// A close, physical chase camera for on-rails flight. It rides just behind
// and above her shoulders, and everything it does is a damped spring with a
// little overshoot, so it moves like an operator on a drone rather than a rig:
//  - in a bank it swings out to the far side of the turn and a touch low,
//    showing her banked silhouette, and aims ahead into the turn;
//  - it leans with her, pushes in during a bank, and kicks its field of view
//    as a roll starts;
//  - in a climb or dive it drops in behind her on her line, below or above,
//    and looks along it, up or down - still up (or down) when she is
//    asked to climb (or dive) past the top (or bottom) of her air;
//  - it shakes with the wind, much harder inside a turbulence pocket;
//  - while she flails (flight.state.flail) it lurches with her.
// Pass `apply: false` to only compute `pose`, e.g. to blend into it from a
// cut-scene camera; applyPose() then puts any such pose on the camera.

export const CHASE_DEFAULTS = {
  distance: 3.1, // metres behind her middle, level
  bankDistance: 2.6, // pushed in at a full bank
  height: 1.05,
  bankDrop: 0.35, // lower at a full bank
  swingOut: 1.3, // metres to the outside of a full bank
  aimIntoTurn: 1.6, // metres the look point leads into a full bank
  lookAhead: 1.8,
  climbLook: 1.6, // how far up or down it looks along a climb, for its slope
  driftLead: 0.12, // seconds of her drift the camera anticipates
  fov: 55,
  fovKick: 7, // degrees added by a fast roll
  fovPocket: 3, // and by rough air
  rollShare: 0.3, // of her bank
  springs: {
    position: [9, 4.2], // [stiffness, damping]; under-damped, so it overshoots
    roll: [12, 4.5],
    fov: [10, 6],
  },
  shake: {
    position: 0.03, // metres in calm air
    rotation: 0.5, // degrees in calm air
    hz: 2.6,
    gustShare: 0.025, // extra metres per m/s^2 of gust
    pocket: 2.5, // multiplier at a pocket's peak
  },
  // Slow lurches at full flail; she is rarely past a third of that in flight.
  lurch: { position: 0.25, rotationDeg: 4, dutchDeg: 8, hz: 1.4 },
};

export function createChaseCamera(cameraEntity, options = {}) {
  const o = {
    ...CHASE_DEFAULTS,
    ...options,
    springs: { ...CHASE_DEFAULTS.springs, ...options.springs },
    shake: { ...CHASE_DEFAULTS.shake, ...options.shake },
    lurch: { ...CHASE_DEFAULTS.lurch, ...options.lurch },
  };
  const camPos = new Vec3();
  const camVel = new Vec3();
  const goal = new Vec3();
  const target = new Vec3();
  const roll = { v: 0, w: 0 };
  const fov = { v: o.fov, w: 0 };
  let shakeTime = 0;
  let lurchTime = 0;
  // Where the camera is this frame: position, look point, then the shake
  // (pitch, yaw) and roll on top in degrees, and the field of view.
  const pose = { position: new Vec3(), target: new Vec3(), pitch: 0, yaw: 0, roll: 0, fov: o.fov };

  const step = (c, goalValue, [k, d], dt) => {
    c.w += (k * (goalValue - c.v) - d * c.w) * dt;
    c.v += c.w * dt;
  };

  function computeGoal(flight) {
    const s = flight.state;
    // +1 is a full bank to her left. The camera swings to the high side.
    const roll = -s.bankDeg / flight.options.maxBankDeg;
    const lateral = -roll * o.swingOut + s.lateralVel * o.driftLead;
    const dist = o.distance + (o.bankDistance - o.distance) * Math.abs(roll);
    goal.copy(s.forward).mulScalar(-dist).add(s.pos);
    goal.x += s.left.x * lateral;
    goal.z += s.left.z * lateral;
    // On her line: as far below her (or above) as the climb's slope over
    // its distance behind. The line is the one she is asked to fly, so held
    // at the top (or bottom) of her air it still drops in below her and looks
    // up (or down).
    const slope = (s.lookClimb ?? s.climbVel ?? 0) / s.speed;
    goal.y += o.height - o.bankDrop * Math.abs(roll) - slope * dist;
    target.copy(s.forward).mulScalar(o.lookAhead).add(s.pos);
    target.y += slope * o.lookAhead * o.climbLook;
    target.x += s.left.x * roll * o.aimIntoTurn;
    target.z += s.left.z * roll * o.aimIntoTurn;
  }

  function applyPose(p) {
    cameraEntity.setPosition(p.position);
    cameraEntity.lookAt(p.target);
    cameraEntity.rotateLocal(p.pitch, p.yaw, p.roll);
    cameraEntity.camera.fov = p.fov;
  }

  return {
    pose,
    applyPose,

    snap(flight, { apply = true } = {}) {
      computeGoal(flight);
      camPos.copy(goal);
      camVel.set(0, 0, 0);
      roll.v = roll.w = fov.w = 0;
      fov.v = o.fov;
      Object.assign(pose, { pitch: 0, yaw: 0, roll: 0, fov: o.fov });
      pose.position.copy(camPos);
      pose.target.copy(target);
      if (apply) applyPose(pose);
    },

    update(dt, flight, { apply = true } = {}) {
      const s = flight.state;
      computeGoal(flight);

      // Spring toward the goal on the sideways and vertical axes. Along the
      // flight it keeps pace exactly, so it never falls behind or overtakes.
      const [k, d] = o.springs.position;
      camVel.x += (k * (goal.x - camPos.x) - d * camVel.x) * dt;
      // Vertically it damps toward her own climb, so a long climb or dive
      // doesn't leave it trailing below or above her line.
      camVel.y += (k * (goal.y - camPos.y) - d * (camVel.y - (s.climbVel ?? 0))) * dt;
      camVel.z += (k * (goal.z - camPos.z) - d * camVel.z) * dt;
      const alongV = camVel.x * s.forward.x + camVel.z * s.forward.z;
      camVel.x -= s.forward.x * alongV;
      camVel.z -= s.forward.z * alongV;
      camPos.x += camVel.x * dt;
      camPos.y += camVel.y * dt;
      camPos.z += camVel.z * dt;
      const along = (goal.x - camPos.x) * s.forward.x + (goal.z - camPos.z) * s.forward.z;
      camPos.x += s.forward.x * along;
      camPos.z += s.forward.z * along;

      const rough = 1 + s.pocket * o.shake.pocket;
      shakeTime += dt * o.shake.hz * (1 + s.pocket * 0.6);
      const amp = (o.shake.position + s.gust.length() * o.shake.gustShare) * rough;
      const sx = fbm1(shakeTime, 41) * amp;
      const sy = fbm1(shakeTime, 42) * amp;
      lurchTime += dt * o.lurch.hz;
      const flail = s.flail ?? 0;
      const la = o.lurch.position * flail;
      pose.position.set(
        camPos.x + s.left.x * sx + fbm1(lurchTime, 81) * la,
        camPos.y + sy + fbm1(lurchTime, 82) * la,
        camPos.z + s.left.z * sx,
      );
      pose.target.copy(target);

      step(roll, s.bankDeg * o.rollShare, o.springs.roll, dt);
      const rot = o.shake.rotation * rough;
      const lr = o.lurch.rotationDeg * flail;
      pose.pitch = fbm1(shakeTime * 1.3, 43) * rot + fbm1(lurchTime, 83) * lr;
      pose.yaw = fbm1(shakeTime * 1.1, 44) * rot + fbm1(lurchTime * 0.8, 84) * lr;
      pose.roll = roll.v + fbm1(lurchTime * 0.7, 85) * o.lurch.dutchDeg * flail;

      const kick = Math.min(Math.abs(s.bankVel) / 120, 1) * o.fovKick + s.pocket * o.fovPocket;
      step(fov, o.fov + kick, o.springs.fov, dt);
      pose.fov = fov.v;
      if (apply) applyPose(pose);
    },
  };
}
