import { Quat, Vec3 } from 'playcanvas';
import { fbm1 } from './noise.js';

// On-rails flight with weight. She always travels along `headingDeg` at
// `speed`; the player banks, and climbs or dives. The bank is a spring (it
// overshoots and settles), and a bank pushes her sideways the way a banked
// turn would, with drag bleeding the drift off again and her nose swinging a
// few degrees into it. A climb or dive eases in and out, tips her nose along
// it, and slows to a stop toward the top and bottom of the air she has. Gusts nudge her about and feed the camera. Units are metres, seconds,
// degrees; `pos` is the middle of her body, not her feet. A cut-scene can
// drive `state.speed`, `state.pitchDeg` and the height directly.

export const FLIGHT_DEFAULTS = {
  speed: 9,
  headingDeg: 0,
  gravity: 9.8,
  maxBankDeg: 38,
  bankStiffness: 7,
  bankDamping: 4.2,
  lateralShare: 0.8, // of the banked-turn sideways pull
  lateralDrag: 1.6,
  yawPerLateral: 2.5, // degrees of nose swing per m/s of drift
  bodyPitchDeg: 80, // standing pose tipped forward to lie belly-down
  pelvisHeight: 0.95, // her pivot, above her feet in the standing pose
  altitudeSpring: 0.6, // pulls her back to the height she is flying at
  maxClimb: 5, // m/s, up or down
  climbRate: 2.5, // 1/s, how quickly a climb comes and goes
  climbRange: [-16, 16], // metres from where the flight started
  climbSoft: 5, // metres short of either end where she starts to level off
  turbulence: 1.2, // gust acceleration, m/s^2
  pocketRate: 0.22, // how often rough-air pockets come round
  pocketThreshold: 0.25, // higher: rarer pockets
  pocketStrength: 3, // gust multiplier at a pocket's peak
  rush: 0.6, // how hard the camera and wind effects sell speed, 0..1
  // Body wobble at full flail, degrees.
  flailYawDeg: 14,
  flailRollDeg: 30,
  flailPitchDeg: 18,
};

const UP = new Vec3(0, 1, 0);
const RIGHT = new Vec3(1, 0, 0);
const FORWARD = new Vec3(0, 0, 1);

export function createFlight(options = {}) {
  const o = { ...FLIGHT_DEFAULTS, ...options };
  const s = {
    pos: new Vec3(),
    vel: new Vec3(),
    forward: new Vec3(),
    left: new Vec3(),
    altitude: 0,
    lateralVel: 0,
    climbVel: 0, // m/s, + up
    lookClimb: 0, // m/s the player is asking for, room or not; the camera looks along it
    climbPitchDeg: 0, // her nose along the climb; negative is up
    baseAltitude: 0, // where the flight started
    bankDeg: 0,
    bankVel: 0,
    targetBankDeg: 0,
    poseRollDeg: 0, // expressive body roll; never feeds steering or collision
    poseYawDeg: 0,
    pocket: 0, // 0 calm air .. 1 the roughest moment of a turbulence pocket
    headingDeg: o.headingDeg,
    yawDeg: o.headingDeg,
    speed: o.speed,
    pitchDeg: 0, // added to bodyPitchDeg; negative raises her nose
    flail: 0, // 0..1, out of control: her body wobbles and flightRig thrashes her limbs
    time: 0,
    gust: new Vec3(),
  };

  const qYaw = new Quat();
  const qRoll = new Quat();
  const qPitch = new Quat();
  const orientation = new Quat();
  const pivot = new Vec3();
  const pivotOffset = new Vec3();

  function setHeadingAxes() {
    const h = (s.headingDeg * Math.PI) / 180;
    s.forward.set(Math.sin(h), 0, Math.cos(h));
    s.left.set(Math.cos(h), 0, -Math.sin(h));
  }

  function reset({ x, y, z }, headingDeg = o.headingDeg) {
    s.headingDeg = headingDeg;
    setHeadingAxes();
    s.pos.set(x, y, z);
    s.altitude = s.baseAltitude = y;
    s.climbVel = s.lookClimb = s.climbPitchDeg = 0;
    s.lateralVel = s.bankDeg = s.bankVel = s.targetBankDeg = s.pitchDeg = s.flail = 0;
    s.poseRollDeg = s.poseYawDeg = 0;
    s.yawDeg = headingDeg;
    s.speed = o.speed;
    s.vel.copy(s.forward).mulScalar(s.speed);
  }

  function update(dt, input) {
    s.time += dt;

    // A (turn = +1) rolls her left side down: a negative roll. The target is
    // kept so the rig can react to the input before the body has rolled.
    const targetBank = -input.turn * o.maxBankDeg;
    s.targetBankDeg = targetBank;
    s.bankVel += (o.bankStiffness * (targetBank - s.bankDeg) - o.bankDamping * s.bankVel) * dt;
    s.bankDeg += s.bankVel * dt;

    // A banked turn's sideways pull, g·tan(bank), toward the low side.
    const bankRad = (-s.bankDeg * Math.PI) / 180;
    const pull = o.gravity * Math.tan(bankRad) * o.lateralShare;
    s.lateralVel += (pull - o.lateralDrag * s.lateralVel) * dt;
    s.yawDeg = s.headingDeg + s.lateralVel * o.yawPerLateral;

    // Every so often she flies through a pocket of rough air for a few
    // seconds; it multiplies the gusts, and the camera and rig feel it too.
    s.pocket = Math.max(fbm1(s.time * o.pocketRate, 9) - o.pocketThreshold, 0) / (1 - o.pocketThreshold);
    const g = o.turbulence * (1 + s.pocket * o.pocketStrength);
    s.gust.set(fbm1(s.time * 0.9, 1) * g, fbm1(s.time * 0.7, 2) * g, fbm1(s.time * 0.8, 3) * g * 0.5);

    // Up (climb = +1) or down, easing to a stop toward either end of the range.
    const climb = input.climb ?? 0;
    const above = s.altitude - s.baseAltitude;
    const room = climb > 0 ? o.climbRange[1] - above : above - o.climbRange[0];
    const ease = Math.min(Math.max(room / o.climbSoft, 0), 1);
    const goalClimb = climb * o.maxClimb * ease * ease * (3 - 2 * ease);
    const climbEase = 1 - Math.exp(-o.climbRate * dt);
    s.climbVel += (goalClimb - s.climbVel) * climbEase;
    s.lookClimb += (climb * o.maxClimb - s.lookClimb) * climbEase;
    s.altitude += s.climbVel * dt;
    s.climbPitchDeg = (-Math.atan2(s.climbVel, s.speed) * 180) / Math.PI;

    s.vel.copy(s.forward).mulScalar(s.speed);
    s.vel.x += s.left.x * s.lateralVel + s.gust.x * 0.4;
    s.vel.z += s.left.z * s.lateralVel;
    s.vel.y = s.climbVel + s.gust.y * 0.6 - (s.pos.y - s.altitude) * o.altitudeSpring;

    s.pos.x += s.vel.x * dt;
    s.pos.y += s.vel.y * dt;
    s.pos.z += s.vel.z * dt;
  }

  // Heading, then the bank about the line of flight, then the forward tip
  // that lays her standing pose flat - plus a little buffeting, and a lot of
  // tumbling while she flails.
  function getOrientation() {
    const w = (seed, rate, deg) => fbm1(s.time * rate, seed) * deg * s.flail;
    qYaw.setFromAxisAngle(UP, s.yawDeg + s.poseYawDeg + w(21, 0.9, o.flailYawDeg));
    qRoll.setFromAxisAngle(FORWARD, Math.max(-82, Math.min(82, s.bankDeg + s.poseRollDeg)) + s.gust.x * 2.5 + w(22, 1.3, o.flailRollDeg));
    qPitch.setFromAxisAngle(RIGHT, o.bodyPitchDeg + s.pitchDeg + s.climbPitchDeg + s.gust.y * 2 + w(23, 1.1, o.flailPitchDeg));
    return orientation.mul2(qYaw, qRoll).mul(qPitch);
  }

  // Where her feet (the character's origin) go so she pivots about her pelvis.
  function getFeetPosition(out) {
    getOrientation().transformVector(pivot.set(0, o.pelvisHeight, 0), pivotOffset);
    return out.copy(s.pos).sub(pivotOffset);
  }

  return {
    state: s,
    options: o,
    reset,
    update,
    getOrientation,
    getFeetPosition,
    speedNorm: () => o.rush * Math.min(Math.abs(s.speed) / Math.max(o.speed, 0.01), 1.8),
  };
}
