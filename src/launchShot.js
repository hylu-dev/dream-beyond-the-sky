import { Vec3 } from 'playcanvas';
import { fbm1 } from './noise.js';

// The one continuous move from the island to the flight. As she bursts up
// past the edge, the camera surges after her on a loose spring - skimming the
// crest - and swings in tight under her right side, looking up at her as she
// climbs, tilted and wide. While she flails (flight.state.flail) it is as
// unsteady as she is - shaking and lurching - and it steadies as she does.
// As she levels out its goal slides round behind her to the chase camera's
// pose, the shake settles into the chase camera's own, and by the end it is
// exactly the chase camera.

export const LAUNCH_SHOT_DEFAULTS = {
  seconds: 4.8, // until the chase camera has the shot
  // The close angle while she climbs: metres behind her, out to her right,
  // and up (negative: below her, looking up).
  close: { back: 1.7, right: 1, up: -0.6 },
  spring: [8, 5.5], // [stiffness, damping]: surges, overshoots a little
  surgeFrom: [0.1, 0.6], // seconds over which the spring takes hold, as she appears
  maxSpeed: 24, // m/s
  chaseFrom: 2.8, // seconds: the goal starts sliding round behind her
  chaseBy: 4.1,
  lookRate: 6, // 1/s
  lookOnsetSeconds: 0.6, // the follow comes on over this long
  shake: { position: 0.1, rotationDeg: 2.4, hz: 6.5, from: 0.2, peak: 0.7 },
  calmShare: 0.35, // of that shake once she has stopped flailing
  // Slow lurches on top while she flails, at full flail.
  lurch: { position: 0.25, rotationDeg: 4, dutchDeg: 8, hz: 1.4, onsetSeconds: 0.8 },
  dutchDeg: 9, // tilt of the horizon at the height of the climb
  fovSurge: 8, // degrees wider at the height of the climb
  crestClearance: 0.9, // metres the camera stays above the crest as it crosses
  crestSlope: 1, // how steeply the hill falls away in front of the crest, m/m
  // Keep under the tree's canopy (which smears into green up close) until
  // this far past the crest: metres above the crest, then metres along.
  canopy: { below: 1.6, clearAfter: [2.5, 7] },
};

export function createLaunchShot(cameraEntity, chaseCamera, options = {}) {
  const o = {
    ...LAUNCH_SHOT_DEFAULTS,
    ...options,
    close: { ...LAUNCH_SHOT_DEFAULTS.close, ...options.close },
    shake: { ...LAUNCH_SHOT_DEFAULTS.shake, ...options.shake },
    lurch: { ...LAUNCH_SHOT_DEFAULTS.lurch, ...options.lurch },
  };
  const camPos = new Vec3();
  const camVel = new Vec3();
  const goal = new Vec3();
  const lastGoal = new Vec3();
  const goalVel = new Vec3();
  const close = new Vec3();
  const look = new Vec3();
  const lookGoal = new Vec3();
  const lastPos = new Vec3();
  const tmp = new Vec3();
  const pose = { position: new Vec3(), target: new Vec3(), pitch: 0, yaw: 0, roll: 0, fov: 50 };
  const crest = { y: 0, along: 0, startY: 0 };
  let fromFov = 50;
  let t = 0;

  return {
    pose,
    get done() {
      return t >= o.seconds;
    },

    // `velocity` is how the camera is already moving, so the move picks it
    // up; `crestY` and `crestAlong` (distance along her line) are the lip it
    // has to clear.
    start({ lookAt, velocity, crestY, crestAlong }) {
      camPos.copy(cameraEntity.getPosition());
      camVel.copy(velocity);
      look.copy(lookAt);
      crest.y = crestY;
      crest.along = crestAlong;
      crest.startY = camPos.y;
      fromFov = cameraEntity.camera.fov;
      t = 0;
    },

    // Call after the chase camera has updated its pose.
    update(dt, flight) {
      t += dt;
      const s = flight.state;
      const chase = chaseCamera.pose;
      const w = smooth(o.chaseFrom, o.chaseBy, t);

      // Low on her right, a little behind: right is minus her left.
      close.copy(s.pos).sub(tmp.copy(s.forward).mulScalar(o.close.back));
      close.sub(tmp.copy(s.left).mulScalar(o.close.right));
      close.y += o.close.up;
      goal.lerp(close, chase.position, w);
      if (t === dt) lastGoal.copy(goal);
      goalVel.copy(goal).sub(lastGoal).mulScalar(1 / dt);
      lastGoal.copy(goal);

      // Damped against her motion rather than the world's, so it closes in
      // on the goal instead of trailing it; it keeps its own momentum until
      // she shows, then takes hold.
      const hold = smooth(o.surgeFrom[0], o.surgeFrom[1], t);
      const k = o.spring[0] * hold;
      const d = o.spring[1] * hold;
      camVel.x += (k * (goal.x - camPos.x) + d * (goalVel.x - camVel.x)) * dt;
      camVel.y += (k * (goal.y - camPos.y) + d * (goalVel.y - camVel.y)) * dt;
      camVel.z += (k * (goal.z - camPos.z) + d * (goalVel.z - camVel.z)) * dt;
      if (camVel.length() > o.maxSpeed) camVel.normalize().mulScalar(o.maxSpeed);
      camPos.add(tmp.copy(camVel).mulScalar(dt));

      // Skim the hill and its crest rather than ploughing through the grass.
      const along = camPos.dot(s.forward);
      const before = Math.max(crest.along - along, 0);
      const floor = crest.y + o.crestClearance - before * o.crestSlope;
      if (along < crest.along + 3 && camPos.y < floor) {
        camPos.y = floor;
        camVel.y = Math.max(camVel.y, 0);
      }
      // (never below where it started, so it is not yanked down at the start)
      const below = Math.max(crest.y + o.canopy.below, crest.startY);
      const ceiling = below + 20 * smooth(o.canopy.clearAfter[0], o.canopy.clearAfter[1], along - crest.along);
      if (camPos.y > ceiling) {
        camPos.y = ceiling;
        camVel.y = Math.min(camVel.y, 0);
      }

      // In the last stretch, settle exactly onto the chase camera.
      const settle = smooth(o.chaseBy, o.seconds, t);
      pose.position.lerp(camPos, chase.position, settle);

      // Carried along with her, so it lags only her changes of direction
      // rather than trailing her by her speed over lookRate.
      if (t === dt) lastPos.copy(s.pos);
      const onsetLook = smooth(0, o.lookOnsetSeconds, t);
      look.add(tmp.copy(s.pos).sub(lastPos).mulScalar(onsetLook));
      lastPos.copy(s.pos);
      lookGoal.set(s.pos.x, s.pos.y + 0.2, s.pos.z);
      lookGoal.lerp(lookGoal, chase.target, w);
      // Both come on over the first moments rather than snapping to her.
      look.lerp(look, lookGoal, 1 - Math.exp(-o.lookRate * onsetLook * dt));
      pose.target.lerp(look, chase.target, settle);

      // Tilted and wide through the climb, shaking as hard as she flails,
      // easing into the chase camera's own shake and roll.
      const climb = smooth(o.shake.from, o.shake.peak, t) * (1 - smooth(o.chaseFrom, o.seconds, t));
      const flail = s.flail ?? 0;
      const rough = climb * (o.calmShare + (1 - o.calmShare) * flail);
      const st = t * o.shake.hz;
      const lt = t * o.lurch.hz;
      const a = o.shake.position * rough;
      // Its own lurches hand over to the chase camera's as it takes the shot.
      // They ease in, so the shot does not jump on its first frame.
      const onset = smooth(0, o.lurch.onsetSeconds, t);
      const la = o.lurch.position * flail * (1 - settle) * onset;
      pose.position.x += fbm1(st, 61) * a + fbm1(lt, 71) * la;
      pose.position.y += fbm1(st, 62) * a + fbm1(lt, 72) * la;
      pose.position.z += fbm1(st, 63) * a;
      const r = o.shake.rotationDeg * rough;
      const lr = o.lurch.rotationDeg * flail * (1 - w) * onset;
      pose.pitch = fbm1(st * 1.1, 64) * r + fbm1(lt, 73) * lr + chase.pitch * w;
      pose.yaw = fbm1(st * 0.9, 65) * r + fbm1(lt * 0.8, 74) * lr + chase.yaw * w;
      pose.roll =
        fbm1(st * 0.7, 66) * r * 0.6 + o.dutchDeg * climb + fbm1(lt * 0.7, 75) * o.lurch.dutchDeg * flail * (1 - w) * onset + chase.roll * w;
      pose.fov = fromFov + (chase.fov - fromFov) * smooth(0, o.chaseBy, t) + o.fovSurge * climb;
      chaseCamera.applyPose(pose);
    },
  };
}

function smooth(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}
