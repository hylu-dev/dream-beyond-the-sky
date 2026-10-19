import { LAYERID_WORLD, Vec3 } from 'playcanvas';
import {
  Scene,
  Environment,
  Character,
  Animation,
  LOWER_BODY_BONE_NAMES,
  UPPER_BODY_BONE_NAMES,
  resolveBoneIndices,
} from '@viggle/splat-engine';
import { createTimeOfDay } from './timeOfDay.js';
import { createCelestial } from './celestial.js';
import { createAmbience } from './ambience.js';
import { createFireflyLight } from './fireflyLight.js';
import { MagicPulse } from './magicPulse.js';
import { createFlight } from './flight.js';
import { createFlightRig } from './flightRig.js';
import { createChaseCamera } from './chaseCamera.js';
import { createLaunchShot } from './launchShot.js';
import { createWindFx } from './windFx.js';
import { fbm1 } from './noise.js';

// ── Tunables (mock values; iterate on these) ───────────────────────────────

// Metres per file unit, measured offline: the floor sits 1.5 m below each
// capture point, at 0.1809 units in the island realm and 0.3635 in the sky.
const REALM_M_PER_UNIT = 8.2915;
const SKY_M_PER_UNIT = 4.126;

// At true scale the sky reconstruction is only ~30 m across - a panorama
// flattens distant clouds onto a near shell - so blow it up to read as vast.
const SKY_SCALE = 30;

// Realm coordinates are metres with the capture point's floor at the origin.
// The ground climbs from there to a big tree whose trunk stands at about
// (-1.6, -6); east of it the hilltop ends in a brow over a drop to the sea of
// cloud. A panorama reconstruction only holds up near where it was captured,
// and up close, so the cameras keep near the origin side of the hilltop,
// look out at the far realm, frame with a long lens instead of coming close,
// and keep well back from her face - all but the one pass beside it on the
// turn to the sun (VIEW.beside), a metre off and moving.
//
// The title menu sits over the right of the screen; on the left she dozes at
// the foot of the tree, her back to it, fireflies drifting round her and
// lighting her up (doze.glb, the opening of "Head Tilt" looped back and
// forth). On Start the camera comes in to her face and holds on her, eyes
// still closed, until she wakes (wake.glb). Once she has opened her eyes and
// looked up, the camera comes in beside her face and turns away from it,
// rising over her head to see what she sees: the night gives way to one dawn, the sun climbing into
// golden hour, and at its height the world swims in a pulse of light. Then
// the camera backs slowly straight out and finds her standing at the edge,
// her back to us; it waits there, rumbling, and she jumps (vanish.glb, PINOC
// "Vanish").
const SEAT = {
  x: -1.2,
  y: 2.15, // her feet
  z: -5.12,
  headingDeg: 30, // facing out from the trunk
  wakeFade: 0.8,
  holdClosed: 1.6, // seconds on her sleeping face before she wakes
  // How far the night lifts off her while she sleeps and wakes, 0..1
  // (timeOfDay's characterGlow) - a little, so she sits in the night with
  // the island; the light itself is the lamp fireflies' (fireflyLight.js).
  // Both fade as the camera turns away.
  glow: 0.3,
};

// Night under the menu; the one dawn runs from the camera's turn into
// golden hour - the sun `goldenElevation` degrees up, on the vista's painted
// sun - over `seconds`, easing in.
const SKY = { menuPhase: 0.6, goldenElevation: 16, seconds: 10.5 };

// The sun rises just left of the middle of the view out past her and climbs
// to the middle (timeOfDay.js); see VIEW.
const SUN_RISE = { azimuth: 94, inclination: 55, turn: -1 };

// The menu camera watches her from in front and to her right, its look
// turned off her so she sits in the left third with the tree. It is never
// still: a slow wander, a slow turn to and fro, and a hand-held sway.
const MENU_CAMERA = {
  position: { x: 0.3, y: 1.85, z: -0.8 },
  offsetDeg: 17, // the look turned right of her
  lookUp: 0.8, // above her feet
  wander: { metres: [0.25, 0.07, 0.18], seconds: 27 },
  turnDeg: { amount: 2, seconds: 33 },
  sway: { position: 0.025, rotationDeg: 0.3, hz: 0.22 },
  fov: 40,
};

// On Start the camera comes in to her face on a long lens - 3 m off, so the
// splats hold up - and stays on her, hand-held and breathing, following her
// head as it comes up, until `panAt` seconds into wake.glb, as her eyes
// open. Under the move in and the hold runs one slow push - `creep` degrees
// of zoom and metres of dolly toward her face - from Start until the turn,
// so the move in never stops dead: it slows into the push, and the push
// comes to rest just as the turn takes over.
const PORTRAIT = {
  position: { x: -0.2, y: 2.45, z: -2.2 },
  seconds: 2.6,
  fov: 24,
  creep: { fovDeg: 5, metres: 0.3 },
  lookRate: 2.5, // 1/s, following her head
  drift: { metres: 0.02, hz: 0.2 },
  breath: { metres: 0.008, hz: 0.22 },
  panAt: 2.3,
};

// Then it moves in beside her face - a metre off, at her front right - still
// on her as she looks up, and from there turns away right, toward what she
// sees, rising over her head as it goes: it ends just over her and in front,
// looking out where she looks, with her below the frame. The golden sun sits
// on the middle of the frame, a little over centre, above the realm (any
// higher a look and the back-out could not take in her feet at the edge).
// It holds there for the dawn.
const VIEW = {
  beside: { x: -1.51, y: 3.2, z: -4.03 }, // by her face, a little under it, on the way
  position: { x: -0.5, y: 3.8, z: -3.6 },
  sunYawDeg: 1, // the look turned this far left of the golden sun
  pitchDeg: 11,
  fov: 46,
  turnSeconds: 9,
  // The look turns in one sweep, right and a little down, lagging the move
  // (its share of the turn is the move's to this power) so her face is
  // still in frame as the camera comes beside her, halfway.
  lookLag: 1.6,
  drift: { metres: 0.02, hz: 0.12 },
  // The hand-held sway from the portrait on, so it never changes step;
  // the menu's own, at the 0.4 the approach brings it down to.
  sway: { position: 0.01, rotationDeg: 0.12, hz: 0.22 },
};

// At the height of the dawn the world pulses (magicPulse.js), and under the
// flash of it she takes her place at the edge.
const PULSE = { seconds: 2.6, triggerBelow: 0.6 }; // degrees short of golden hour

// Then the camera backs out along its look, sinking a little and opening
// out as it goes, its look settling a few degrees lower, until she is
// revealed standing on the edge, full length; it stops there and waits with
// a slow rumble building, and she goes. The tree's canopy frames the top
// left of the shot.
const BACK_OUT = {
  after: 0.9, // seconds after the pulse peaks
  metres: 1.8,
  drop: 0.45, // metres lower at the end
  seconds: 5.5,
  fov: 62,
  pitchDeg: 6,
};

// The edge: a lip at the north-east of the brow over a drop of nearly two
// metres. vanish.glb steps her off to her right, so she stands turned that
// much left of the drop - which puts her back to the camera.
const BRINK = {
  x: 2.1,
  y: 1.47, // the lip under her feet
  z: -4.6,
  headingDeg: 92,
  waitSeconds: 3.2, // after the camera stops, rumbling
  vanishFade: 0.35,
  rumble: { metres: 0.012, rollDeg: 0.35, hz: 7, buildSeconds: 2.4 },
};

// She jumps off the edge. The engine keeps clips in place, so she moves
// along the clip's own travel (vanish.path.json); once her feet leave the lip
// (`lipAt`) that is where she went from, and when the clip ends she falls
// on, out of sight below the edge. The flight heads `headingDeg`, out over
// the drop she jumped into and toward the sun.
const EDGE = {
  headingDeg: 62,
  lipAt: 2.0, // seconds into vanish.glb
  fallGravity: 13, // a touch over g, so the drop is quick
  hiddenAfter: 0.6, // seconds of falling before she is below the edge
};

// After she drops out of sight the shot holds on the empty edge.
const HOLD_SECONDS = 1.6;

// As she goes the camera stops dead, nodding with the stop, and holds.
const STOP = { nodDeg: 1.8, hz: 2.5, decay: 5 };
const HOLD_SWAY = VIEW.sway; // carried on from the back-out

// The air: the wind's strength 0..1 at rest and on the edge, and where it
// blows (toward the tree). Fireflies hang in pools of open air: a few close
// round her as she sleeps, lighting her, and more out in front of the shots.
const WIND = { calm: 0.1, brink: 0.3, direction: { x: -0.3, y: 0.06, z: 1 }, gust: 0.3 };
const FIREFLY_POOLS = [
  { center: { x: -0.95, y: 2.55, z: -4.65 }, size: { x: 0.9, y: 0.35, z: 0.6 }, count: 9, wander: 0.22, lamps: 2 }, // round her lap
  { center: { x: -0.6, y: 2.5, z: -3.9 }, size: { x: 2.2, y: 0.5, z: 1.8 }, wander: 0.35 }, // in front of her seat, kept below her face
  { center: { x: 0.1, y: 2.2, z: -2.6 }, size: { x: 1.8, y: 0.9, z: 1.2 } }, // the slope below it
  { center: { x: 1.2, y: 3.1, z: -5.9 }, size: { x: 1.6, y: 0.8, z: 1.4 } }, // out past her shoulder
  { center: { x: 0.4, y: 2.7, z: -4.2 }, size: { x: 2.0, y: 0.8, z: 1.2 } }, // over the brow
];

// She comes back up flying a few metres past the edge, climbing hard on a
// spring that overshoots her cruising height, and the camera follows her off
// the island in one move (launchShot.js). A dense cloud bank waits on her line;
// the sanctuary becomes the sky scene while the camera is inside it.
//
// Splats never occlude the cloud sprites, and only occlude her while she is
// on the environment's layer. So on the island she is on that layer, which
// is how she drops out of sight behind the crest; and the clouds, which would
// paint over the island, fade in as the camera clears the crest. She goes
// back to her own layer once she is clear of the lip, so the clouds can't
// cover her and the tree's canopy can't ghost her as she climbs past it.
const LAUNCH = {
  ahead: 2.5, // metres past the edge where she comes up
  below: 5, // and how far under the lip
  cruiseAbove: 3, // her cruising height over the lip
  climbSpeed: 15, // m/s straight up as she appears
  climbSpring: [4, 2.6], // [stiffness, damping]; peaks about 4 m over the lip
  speedFrom: 3, // forward speed as she appears, rising to the flight's own
  speedSeconds: 3.5,
  maxPitchDeg: 70, // her nose follows the climb, up to this
  // She flails at full tilt until the first time, then calms to a slight
  // residual flail by the second. In flight that fades as she finds her
  // confidence: over confidenceSeconds, sooner while she is being steered
  // (steerConfidence times faster at full input).
  flailSeconds: [2, 5],
  residualFlail: 0.3,
  confidenceSeconds: 8,
  steerConfidence: 1.5,
  // The frantic part is a PINOC clip (flail.glb: "Skydiver Recovery"),
  // layered over the glide so both keep moving while it fades: she fights
  // out of it over these seconds down to residualClip of it, which then fades
  // with her flail in flight. flightRig's procedural flail fills in as it goes.
  recoverSeconds: [2.2, 4.6],
  residualClip: 0.2,
  wipeAhead: 33, // metres past where she comes up, the middle of the cloud bank
  flashOpacity: 0.6, // a soft white bloom at the swap, in case the bank is thin
  flashMetres: 7, // half its length along her line
  revealMetres: [-2, 4], // camera distance past the lip over which the clouds fade in
  ownLayerAbove: 1.2, // metres over the lip where she leaves the island's layer
};

// Day/night time-lapse in the realm; see timeOfDay.js for the look, and SKY
// above for how it runs. The realm's islands and falls reach 40-160 m out,
// mixed in with its painted sky, so none of it is clipped: the grade alone
// turns it to night, and celestial.js draws the sun, moon and stars over it.
const TIME_OF_DAY = {
  cycleSeconds: 12,
  skyClipMetres: 10000,
  bounds: { min: { x: -20, y: -8, z: -20 }, max: { x: 20, y: 14, z: 20 } },
};

// Sky coordinates are metres with the capture point at the origin, where the
// reconstruction looks best. ?fly=1 starts there.
// Flight feel lives in flight.js (physics), flightRig.js (limbs),
// chaseCamera.js (camera) and windFx.js (near clouds and streaks).
const FLY_START = { x: 0, y: 0, z: 0 };

// A panorama reconstruction only holds up near its capture point, so in
// flight the sky scene travels with her like a skybox and only this share of
// her motion shows as parallax: the far world barely moves, and the near
// clouds and streaks in windFx.js carry the sense of speed. It is turned to
// her heading, so she always looks down the same view of it.
const SKY_PARALLAX = 0.03;
// The bearing in the sky capture she flies down: the low sun just right of
// ahead, with the far castle on the horizon under it.
const SKY_VIEW_DEG = 135;
// The sky capture is already in golden hour, so the island's grade is laid
// on it only this much, to match rather than to recolour it.
const SKY_GRADE_SHARE = 0.35;

// The area's title (index.html #area) comes up this long after the flight
// begins, once the cloud bank is behind her; its CSS animation runs the rest.
const AREA_TITLE = { after: 1.2 };

// ── Setup ───────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const fadeEl = document.getElementById('fade');
const hintEl = document.getElementById('hint');
const areaEl = document.getElementById('area');
const menuEl = document.getElementById('menu');
const startEl = document.getElementById('start');


const scene = await Scene.create(canvas, { fov: 50, near: 0.05, far: 5000 });
scene.start();

// Both scenes are current-era SPZ (NGSP v4): +Y up, so no rotation.
const [sanctuary, sky, character] = await Promise.all([
  Environment.load(scene, '/assets/floating-island-realm.spz', {
    scale: REALM_M_PER_UNIT,
    position: { x: 0, y: 1.5, z: 0 }, // floor at y = 0
  }),
  Environment.load(scene, '/assets/floating-sky-islands.spz', {
    scale: SKY_M_PER_UNIT * SKY_SCALE,
  }),
  Character.load(scene, '/assets/martial-artist.vsplat'),
  Animation.loadGlb(scene, '/assets/anims/idle.glb', 'idle'),
  Animation.loadGlb(scene, '/assets/anims/doze.glb', 'doze'),
  Animation.loadGlb(scene, '/assets/anims/wake.glb', 'wake'),
  Animation.loadGlb(scene, '/assets/anims/brink.glb', 'brink'),
  Animation.loadGlb(scene, '/assets/anims/vanish.glb', 'vanish'),
  Animation.loadGlb(scene, '/assets/anims/flail.glb', 'flail'),
]);
sky.entity.enabled = false;
const vanishPath = await (await fetch('/assets/anims/vanish.path.json')).json();

const timeOfDay = await createTimeOfDay(scene, {
  environment: sanctuary,
  character,
  captureOrigin: { x: 0, y: 1.5, z: 0 },
  bounds: TIME_OF_DAY.bounds,
  options: {
    cycleSeconds: TIME_OF_DAY.cycleSeconds,
    skyClipMetres: TIME_OF_DAY.skyClipMetres,
    sunRise: SUN_RISE,
    glowIntensity: 0, // lift the night off her, but lay no colour on
    ...debugOptions(),
  },
});
const celestial = createCelestial(scene, timeOfDay);
const ambience = createAmbience(scene, { fireflyPools: FIREFLY_POOLS });
const fireflyLight = await createFireflyLight(scene, character, ambience.lamps);
// Installed once and left at nothing until the dawn peaks: adding a pass
// mid-shot rebuilds the whole chain.
const pulse = scene.postfx.add(new MagicPulse());

// The whole body, for the flail clip's layer.
const BODY_MASK = {
  name: 'body',
  boneIndices: resolveBoneIndices(character.armature.rigBoneNames, [...UPPER_BODY_BONE_NAMES, ...LOWER_BODY_BONE_NAMES]),
};

const flight = createFlight({ headingDeg: EDGE.headingDeg });
const flightRig = createFlightRig(character);
const chaseCamera = createChaseCamera(scene.cameraEntity);
const launchShot = createLaunchShot(scene.cameraEntity, chaseCamera);
// The near clouds in the sky capture's golden-hour light: lavender shade
// underneath, peach where the low sun catches their tops.
const windFx = createWindFx(scene, { baseColor: [0.6, 0.62, 0.8], topColor: [1, 0.86, 0.68] });

// Debug switches for the time-lapse: ?phase=0.25 freezes it (0 noon,
// 0.25 sunset, 0.5 midnight), ?sky=0 drops the SkyDome, ?clip=40 moves the
// sky cut-off in metres. ?fly=1 skips
// straight to the flight; ?start=1 presses Start at once.
function debugOptions() {
  const q = new URLSearchParams(location.search);
  const opts = {};
  if (q.has('phase')) opts.fixedPhase = Number(q.get('phase'));
  if (q.get('sky') === '0') opts.useSkyDome = false;
  if (q.has('clip')) opts.skyClipMetres = Number(q.get('clip'));
  return opts;
}

// ── Input ─────────────────────────────────────────────────────────────────

const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if ((e.code === 'Enter' || e.code === 'Space') && state === 'menu') {
    e.preventDefault();
    startAwakening();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
startEl.addEventListener('click', () => {
  if (state === 'menu') startAwakening();
});
const axis = (neg, pos) => (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);


// ── Sequence: menu → approach → portrait → turn → dawn → backout → brink →
//    vanish → drop → hold → launch → fly ──────────────────────────────────

let state = 'menu';
let stateTime = 0;
const pos = new Vec3();
const vel = new Vec3();
let headingDeg = 0;

const edgeDir = forward(EDGE.headingDeg);
const edge = new Vec3(); // the lip she jumps from, at her feet
const look = new Vec3();
const lookGoal = new Vec3();
const seat = new Vec3(SEAT.x, SEAT.y, SEAT.z);
const brink = new Vec3(BRINK.x, BRINK.y, BRINK.z);
const windDir = new Vec3(WIND.direction.x, WIND.direction.y, WIND.direction.z).normalize();

function placeCharacter() {
  character.setPosition(pos.x, pos.y, pos.z);
  character.setRotation(0, headingDeg, 0);
}

function forward(deg) {
  const r = (deg * Math.PI) / 180;
  return new Vec3(Math.sin(r), 0, Math.cos(r));
}

function setState(next) {
  state = next;
  stateTime = 0;
}

const smooth = (edge0, edge1, x) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};
const smoother = (t) => t * t * t * (t * (6 * t - 15) + 10);
const DEG = Math.PI / 180;
const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const lerpDeg = (a, b, u) => a + wrapDeg(b - a) * u;

// The camera's own pose, before its sway: camPos, `look` and camFov.
// applyCamera() puts it on screen with the sway (and any rumble) on top.
// Moves work in yaw and pitch (degrees; yaw like her heading, from +Z toward
// +X).
const camPos = new Vec3();
const camVel = new Vec3();
let camFov = MENU_CAMERA.fov;
let swayTime = 0;
let menuTime = 0;
let rumble = 0; // 0..1
let rumbleTime = 0;

function aim(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return { yaw: Math.atan2(dx, dz) / DEG, pitch: Math.atan2(dy, Math.hypot(dx, dz)) / DEG };
}

function lookAlong(yaw, pitch) {
  const c = Math.cos(pitch * DEG);
  look.set(camPos.x + Math.sin(yaw * DEG) * c * 10, camPos.y + Math.sin(pitch * DEG) * 10, camPos.z + Math.cos(yaw * DEG) * c * 10);
}

function applyCamera(dt, sway, amount = 1, nod = 0) {
  swayTime += dt * sway.hz;
  rumbleTime += dt * BRINK.rumble.hz;
  const a = sway.position * amount;
  const r = sway.rotationDeg * amount;
  // The rumble: a quick low tremor and a slow lean.
  const ra = BRINK.rumble.metres * rumble;
  const roll = BRINK.rumble.rollDeg * rumble * fbm1(rumbleTime * 0.06, 57);
  const cam = scene.cameraEntity;
  cam.setPosition(
    camPos.x + fbm1(swayTime, 51) * a + fbm1(rumbleTime, 58) * ra,
    camPos.y + fbm1(swayTime, 52) * a + fbm1(rumbleTime, 59) * ra,
    camPos.z + fbm1(rumbleTime, 60) * ra,
  );
  cam.lookAt(look);
  cam.rotateLocal(fbm1(swayTime * 1.2, 53) * r + nod, fbm1(swayTime * 0.9, 54) * r, fbm1(swayTime * 0.7, 55) * r * 0.6 + roll);
  cam.camera.fov = camFov;
}

// ── Menu ──────────────────────────────────────────────────────────────────

function startMenu() {
  character.setLayers([scene.envLayerId]);
  pos.copy(seat);
  headingDeg = SEAT.headingDeg;
  placeCharacter();
  character.playAnimation('doze', { loop: true });
  timeOfDay.setPhase(SKY.menuPhase);
  timeOfDay.setSpeed(0);
  setGlow(SEAT.glow);
  updateMenuCamera(0);
  hintEl.textContent = '';
  menuEl.classList.add('show');
  menuEl.setAttribute('aria-hidden', 'false');
  startEl.focus({ preventScroll: true });
  setState('menu');
}

function updateMenuCamera(dt) {
  const m = MENU_CAMERA;
  menuTime += dt;
  const w = m.wander;
  const t = menuTime / w.seconds;
  camPos.set(
    m.position.x + fbm1(t, 61) * w.metres[0],
    m.position.y + fbm1(t, 62) * w.metres[1],
    m.position.z + fbm1(t, 63) * w.metres[2],
  );
  const a = aim(camPos, tmpVec.set(seat.x, seat.y + m.lookUp, seat.z));
  const turn = m.turnDeg.amount * Math.sin((2 * Math.PI * menuTime) / m.turnDeg.seconds);
  // Turned right of her, so she sits left of the menu.
  lookAlong(a.yaw - m.offsetDeg + turn, a.pitch);
  camFov = m.fov;
  applyCamera(dt, m.sway);
}

// The fireflies' light on her, and the night lifted off her with it.
function setGlow(v) {
  timeOfDay.characterGlow = v;
  fireflyLight.amount = v / SEAT.glow;
}

// ── Awakening: in to her sleeping face, and she wakes ──────────────────────

const headBone = character.armature.rigBoneNames.indexOf('head');
const faceDir = forward(SEAT.headingDeg);
const moveFrom = { pos: new Vec3(), yaw: 0, pitch: 0, fov: 50 };
const moveVia = new Vec3(); // a move's curve control point
const portraitPos = new Vec3(PORTRAIT.position.x, PORTRAIT.position.y, PORTRAIT.position.z);
let wakeTime = -1; // seconds into wake.glb, or -1

// The middle of her face, from her head bone.
function facePoint(out) {
  const m = character.armature.getBoneWorldMatrix(headBone);
  m.getTranslation(out);
  out.x += faceDir.x * 0.08;
  out.y += 0.04;
  out.z += faceDir.z * 0.08;
  return out;
}

function snapshotCamera() {
  moveFrom.pos.copy(camPos);
  const a = aim(camPos, look);
  moveFrom.yaw = a.yaw;
  moveFrom.pitch = a.pitch;
  moveFrom.fov = camFov;
}

// A point on the Catmull-Rom curve from `a` through `b` (at u = 0.5) to `c`;
// the caller's easing brings it to rest at either end.
function spline(u, a, b, c, out) {
  const seg = u < 0.5;
  const t = seg ? u * 2 : u * 2 - 1;
  const [p0, p1, p2, p3] = seg ? [a, a, b, c] : [a, b, c, c];
  const t2 = t * t;
  const t3 = t2 * t;
  const k = (q0, q1, q2, q3) =>
    0.5 * (2 * q1 + (q2 - q0) * t + (2 * q0 - 5 * q1 + 4 * q2 - q3) * t2 + (3 * q1 - q0 - 3 * q2 + q3) * t3);
  return out.set(k(p0.x, p1.x, p2.x, p3.x), k(p0.y, p1.y, p2.y, p3.y), k(p0.z, p1.z, p2.z, p3.z));
}

// A point on the quadratic curve from moveFrom.pos through moveVia to `to`.
function curve(u, to, out) {
  const a = (1 - u) * (1 - u);
  const b = 2 * u * (1 - u);
  const c = u * u;
  return out.set(
    a * moveFrom.pos.x + b * moveVia.x + c * to.x,
    a * moveFrom.pos.y + b * moveVia.y + c * to.y,
    a * moveFrom.pos.z + b * moveVia.z + c * to.z,
  );
}

function startAwakening() {
  menuEl.classList.remove('show');
  menuEl.classList.add('leaving');
  menuEl.setAttribute('aria-hidden', 'true');
  startEl.blur();
  document.body.classList.add('cinema');

  snapshotCamera();
  // A curve that rises a little on the way in, so it does not skim the slope.
  moveVia.lerp(moveFrom.pos, portraitPos, 0.5);
  moveVia.y += 0.25;
  creepDir.copy(facePoint(lookGoal)).sub(portraitPos).normalize();
  closeTime = 0;
  setState('approach');
}

// The slow push on her, from Start to the turn: how far along it is (0..1),
// with the dolly part added to `out`.
const creepDir = new Vec3();
const creepSeconds = PORTRAIT.seconds + SEAT.holdClosed + PORTRAIT.panAt;
let closeTime = 0;
function creep(dt, out) {
  closeTime += dt;
  const c = smooth(0, creepSeconds, closeTime);
  out.add(tmpPos.copy(creepDir).mulScalar(PORTRAIT.creep.metres * c));
  return c;
}

function updateApproach(dt) {
  const u = smoother(Math.min(stateTime / PORTRAIT.seconds, 1));
  curve(u, portraitPos, camPos).add(breathe(dt).mulScalar(u));
  const c = creep(dt, camPos);
  // The look comes onto her face a little ahead of the camera arriving.
  const f = aim(camPos, facePoint(lookGoal));
  const v = smooth(0, PORTRAIT.seconds * 0.85, stateTime);
  lookAlong(lerpDeg(moveFrom.yaw, f.yaw, v), moveFrom.pitch + (f.pitch - moveFrom.pitch) * v);
  camFov = moveFrom.fov + (PORTRAIT.fov - moveFrom.fov) * u - PORTRAIT.creep.fovDeg * c;
  applyCamera(dt, MENU_CAMERA.sway, 1 - 0.6 * u);
  if (stateTime >= PORTRAIT.seconds) {
    faceLook.copy(look);
    setState('portrait');
  }
}

// The hand-held camera breathing on her: a slow wander, and a slower rise
// and fall. Carried on, fading, into the turn so nothing stops dead.
let driftTime = 0;
let breathTime = 0;
const breath = new Vec3();
function breathe(dt) {
  const d = PORTRAIT.drift;
  driftTime += dt * d.hz;
  breathTime += dt * PORTRAIT.breath.hz;
  const rise = Math.sin(2 * Math.PI * breathTime) * PORTRAIT.breath.metres;
  return breath.set(fbm1(driftTime, 91) * d.metres, fbm1(driftTime, 92) * d.metres + rise, fbm1(driftTime, 93) * d.metres);
}

// Where the camera is looking on her face, lagging her head a little.
const faceLook = new Vec3();
function followFace(dt) {
  faceLook.lerp(faceLook, facePoint(lookGoal), 1 - Math.exp(-PORTRAIT.lookRate * dt));
}

function updatePortrait(dt) {
  camPos.copy(portraitPos).add(breathe(dt));
  const c = creep(dt, camPos);
  followFace(dt);
  const f = aim(camPos, faceLook);
  lookAlong(f.yaw, f.pitch);
  camFov = PORTRAIT.fov - PORTRAIT.creep.fovDeg * c;
  applyCamera(dt, VIEW.sway);
  // A beat on her sleeping face, then she wakes.
  if (wakeTime < 0 && stateTime >= SEAT.holdClosed) {
    character.crossfadeTo('wake', { duration: SEAT.wakeFade, loop: false });
    wakeTime = 0;
  }
  if (wakeTime >= PORTRAIT.panAt) startTurn();
}

// ── Her view: the turn to the sun, the dawn, the pulse ────────────────────

const goldenPhase = timeOfDay.phaseAtElevation(SKY.goldenElevation);
const goldenSun = timeOfDay.sunDirectionAt(goldenPhase);
const viewYaw = Math.atan2(goldenSun.x, goldenSun.z) / DEG + VIEW.sunYawDeg;
const viewPos = new Vec3(VIEW.position.x, VIEW.position.y, VIEW.position.z);
const viewDir = new Vec3(
  Math.sin(viewYaw * DEG) * Math.cos(VIEW.pitchDeg * DEG),
  Math.sin(VIEW.pitchDeg * DEG),
  Math.cos(viewYaw * DEG) * Math.cos(VIEW.pitchDeg * DEG),
);
const backPos = new Vec3().copy(viewDir).mulScalar(-BACK_OUT.metres).add(viewPos);
backPos.y -= BACK_OUT.drop;
const besidePos = new Vec3(VIEW.beside.x, VIEW.beside.y, VIEW.beside.z);
let moved = false; // whether she has gone from the tree to the edge
let pulseTime = -1; // seconds into the pulse, or -1

function startTurn() {
  // From the shot's own pose: the breathing and the look on her face carry
  // on into the move and fade out along it.
  moveFrom.pos.copy(creepDir).mulScalar(PORTRAIT.creep.metres).add(portraitPos);
  moveFrom.fov = camFov;
  const f = aim(camPos, faceLook);
  moveFrom.yaw = f.yaw;
  moveFrom.pitch = f.pitch;
  timeOfDay.settleAt(goldenPhase, SKY.seconds);
  setState('turn');
}

function updateTurn(dt) {
  const t = Math.min(stateTime / VIEW.turnSeconds, 1);
  const u = smoother(t);
  spline(u, moveFrom.pos, besidePos, viewPos, camPos).add(breathe(dt).mulScalar(1 - u));
  // One sweep right - always right, past her face - to the sun. For its
  // first moments it still follows her face, so it leaves the hold without
  // a kink.
  followFace(dt);
  const f = aim(camPos, faceLook);
  const hold = 1 - smooth(0, 0.3, u);
  const w = u ** VIEW.lookLag;
  const right = -((((moveFrom.yaw - viewYaw) % 360) + 360) % 360);
  const yaw = moveFrom.yaw + wrapDeg(f.yaw - moveFrom.yaw) * hold + right * w;
  const pitch = moveFrom.pitch + (f.pitch - moveFrom.pitch) * hold + (VIEW.pitchDeg - moveFrom.pitch) * w;
  lookAlong(yaw, pitch);
  camFov = moveFrom.fov + (VIEW.fov - moveFrom.fov) * u;
  setGlow(SEAT.glow * (1 - u));
  applyCamera(dt, VIEW.sway);
  if (t >= 1) setState('dawn');
}

// Holding on her view while the sun comes up; the pulse at its height.
function updateDawn(dt) {
  const d = VIEW.drift;
  driftTime += dt * d.hz;
  const m = d.metres * smooth(0, 1.5, stateTime);
  camPos.set(viewPos.x + fbm1(driftTime, 94) * m, viewPos.y + fbm1(driftTime, 95) * m, viewPos.z);
  lookAlong(viewYaw, VIEW.pitchDeg);
  applyCamera(dt, VIEW.sway);
  if (pulseTime < 0 && timeOfDay.sunElevation >= SKY.goldenElevation - PULSE.triggerBelow) pulseTime = 0;
  if (pulseTime >= 0 && pulseTime >= PULSE.seconds / 2 + BACK_OUT.after) {
    snapshotCamera();
    setState('backout');
  }
}

// The pulse runs on its own clock once it has started.
function updatePulse(dt) {
  if (pulseTime < 0) return;
  pulseTime += dt;
  const p = Math.min(pulseTime / PULSE.seconds, 1);
  pulse.progress = p;
  pulse.amount = Math.sin(Math.PI * p) ** 2;
  pulse.time += dt;
  // Centred on the sun.
  const cam = scene.cameraEntity;
  tmpVec.copy(timeOfDay.sunDirection).mulScalar(500).add(cam.getPosition());
  cam.camera.worldToScreen(tmpVec, screenTmp);
  pulse.center = [screenTmp.x / canvas.clientWidth, screenTmp.y / canvas.clientHeight];
  // Under its flash she takes her place on the edge.
  if (!moved && p >= 0.5) moveToBrink();
  if (p >= 1) {
    pulse.amount = 0;
    pulseTime = -1;
  }
}
const screenTmp = new Vec3();

function moveToBrink() {
  pos.copy(brink);
  headingDeg = BRINK.headingDeg;
  character.playAnimation('brink', { loop: true });
  moved = true;
}

// Straight back along the look, opening out: she comes into view.
function updateBackOut(dt) {
  const t = Math.min(stateTime / BACK_OUT.seconds, 1);
  const u = smoother(t);
  camPos.lerp(moveFrom.pos, backPos, u);
  lookAlong(viewYaw, VIEW.pitchDeg + (BACK_OUT.pitchDeg - VIEW.pitchDeg) * u);
  camFov = VIEW.fov + (BACK_OUT.fov - VIEW.fov) * u;
  applyCamera(dt, VIEW.sway);
  if (t >= 1) setState('brink');
}

// From the moment the camera stops, it holds where it is, looking the same
// way; it stops dead as she goes, nodding with the stop.
let stopTime = -1; // seconds since it stopped, or -1
function updateHoldCamera(dt, { sway = 1 } = {}) {
  let nod = 0;
  if (stopTime >= 0) {
    stopTime += dt;
    nod = STOP.nodDeg * Math.exp(-STOP.decay * stopTime) * Math.sin(2 * Math.PI * STOP.hz * stopTime);
  }
  camPos.copy(backPos);
  lookAlong(viewYaw, BACK_OUT.pitchDeg);
  applyCamera(dt, HOLD_SWAY, sway, nod);
}

// How far vanish.glb has carried her from where it started, in the world.
const vanishSeconds = (vanishPath.x.length - 1) * vanishPath.dt;
function vanishOffset(t, out) {
  const f = Math.min(Math.max(t / vanishPath.dt, 0), vanishPath.x.length - 1);
  const i = Math.min(Math.floor(f), vanishPath.x.length - 2);
  const u = f - i;
  const x = vanishPath.x[i] + (vanishPath.x[i + 1] - vanishPath.x[i]) * u;
  const z = vanishPath.z[i] + (vanishPath.z[i + 1] - vanishPath.z[i]) * u;
  const r = BRINK.headingDeg * DEG;
  return out.set(Math.cos(r) * x + Math.sin(r) * z, 0, -Math.sin(r) * x + Math.cos(r) * z);
}

// ── The air: wind, fireflies, sun and moon ───────────────────────────────

let wind = WIND.calm;
let airTime = 0;
function updateAir(dt) {
  airTime += dt;
  const goal = ['brink', 'vanish', 'drop', 'hold'].includes(state) ? WIND.brink : WIND.calm;
  wind += (goal - wind) * (1 - Math.exp(-1.5 * dt));
  const gusty = wind * (1 + WIND.gust * fbm1(airTime * 0.45, 71));
  const el = timeOfDay.sunElevation;
  const camera = scene.cameraEntity;
  celestial.update(dt, camera);
  ambience.update(dt, camera, { night: smooth(3, -10, el), light: smooth(-6, 10, el), wind: gusty, windDir });
  fireflyLight.update();
}

const tmpVec = new Vec3();
const tmpPos = new Vec3();
function updateIslandSequence(dt) {
  timeOfDay.update(dt);
  if (wakeTime >= 0) wakeTime += dt;
  updatePulse(dt);

  switch (state) {
    case 'menu':
      updateMenuCamera(dt);
      break;

    case 'approach':
      updateApproach(dt);
      break;

    case 'portrait':
      updatePortrait(dt);
      break;

    case 'turn':
      updateTurn(dt);
      break;

    case 'dawn':
      updateDawn(dt);
      break;

    case 'backout':
      updateBackOut(dt);
      break;

    // On the edge, her back to us; the rumble builds, and she goes.
    case 'brink':
      rumble = smooth(0, BRINK.rumble.buildSeconds, stateTime);
      updateHoldCamera(dt);
      if (stateTime >= BRINK.waitSeconds) {
        character.crossfadeTo('vanish', { duration: BRINK.vanishFade, loop: false });
        setState('vanish');
      }
      break;

    // Off the edge, carried along the clip's own travel; the clip drops her.
    case 'vanish': {
      const t = Math.min(stateTime, vanishSeconds);
      pos.copy(brink).add(vanishOffset(t, tmpPos));
      updateHoldCamera(dt);
      if (stateTime >= EDGE.lipAt && stopTime < 0) {
        edge.copy(brink).add(vanishOffset(EDGE.lipAt, tmpPos));
        stopTime = 0;
      }
      if (stateTime >= vanishSeconds) {
        // Falling on as the clip left her: its last tenth of a second.
        vel.copy(vanishOffset(vanishSeconds, tmpVec)).sub(vanishOffset(vanishSeconds - 0.1, tmpPos)).mulScalar(10);
        vel.y = -3;
        setState('drop');
      }
      break;
    }

    // She falls out of sight below the edge; the rumble dies away.
    case 'drop':
    case 'hold': {
      rumble *= Math.exp(-2.5 * dt);
      vel.y -= EDGE.fallGravity * dt;
      pos.add(tmpVec.copy(vel).mulScalar(dt));
      pos.y = Math.max(pos.y, edge.y - 15);
      if (state === 'drop') {
        updateHoldCamera(dt);
        if (stateTime >= EDGE.hiddenAfter) setState('hold');
      } else {
        // Fade the sway out so the launch move picks up a steady camera.
        const sway = 1 - smooth(HOLD_SECONDS - 0.6, HOLD_SECONDS, stateTime);
        updateHoldCamera(dt, { sway });
        if (stateTime >= HOLD_SECONDS) {
          rumble = 0;
          startLaunch();
        }
      }
      break;
    }
  }
  if (state !== 'launch') placeCharacter();
  updateAir(dt);
}

// ── Launch: she comes up flying and the camera follows her off the island ──

let climbVel = 0;
let cruiseY = 0;
let wipeAlong = 0;
let swapped = false;
let lipAlong = 0; // the crest she stepped off, as a distance along her line
let onOwnLayer = false;
let flailClip = 0; // weight of the flail clip's layer over the glide
let flailAtFly = 0; // her residual flail when the controls came on
let flailClipAtFly = 0; // and the flail clip's weight
let confidence = 0; // seconds of feel for it since, sooner while steering
const skyAnchor = new Vec3(); // her position when the sky scene took over

function startLaunch() {
  lipAlong = edge.dot(edgeDir);
  const start = new Vec3().copy(edgeDir).mulScalar(LAUNCH.ahead).add(edge);
  start.y = edge.y - LAUNCH.below;
  cruiseY = edge.y + LAUNCH.cruiseAbove;
  flight.reset(start, EDGE.headingDeg);
  flight.state.altitude = cruiseY;
  flight.state.speed = LAUNCH.speedFrom;
  climbVel = LAUNCH.climbSpeed;

  // The glide pose is the standing idle laid flat and reshaped by flightRig;
  // the idle's slow breathing keeps her from looking frozen. She comes up
  // flailing on the clip's layer over it (see updateLaunch).
  character.playAnimation('idle', { loop: true });
  character.playbackSpeed = 0.6;
  character.playLayer('flail', 'flail', { mask: BODY_MASK, loop: true, weight: 1 });
  setFlailClip(1);
  flightRig.enabled = true;
  placeFlyer();

  chaseCamera.snap(flight, { apply: false });
  launchShot.start({
    lookAt: look,
    velocity: camVel,
    crestY: edge.y,
    crestAlong: lipAlong,
  });
  windFx.enabled = true;
  windFx.visibility = 0;
  windFx.reset(flight, scene.cameraEntity, { clearAhead: LAUNCH.ahead + 12 });
  wipeAlong = windFx.placeWipe(flight, LAUNCH.wipeAhead);
  swapped = false;
  onOwnLayer = false;
  setState('launch');
}

function updateLaunch(dt) {
  const s = flight.state;
  flight.update(dt, { turn: 0 });
  // Climb on a spring that overshoots, nose following the climb.
  const [k, d] = LAUNCH.climbSpring;
  climbVel += (k * (cruiseY - s.pos.y) - d * climbVel) * dt;
  s.pos.y += climbVel * dt - s.vel.y * dt; // replaces the flight's own height hold
  s.speed = LAUNCH.speedFrom + (flight.options.speed - LAUNCH.speedFrom) * smooth(0, LAUNCH.speedSeconds, stateTime);
  const climbDeg = (Math.atan2(climbVel, s.speed) * 180) / Math.PI;
  s.pitchDeg = -Math.min(climbDeg, LAUNCH.maxPitchDeg);
  s.vel.y = climbVel; // so the wind streaks follow the climb
  // She comes up out of control and gets it back.
  const calm = smooth(LAUNCH.flailSeconds[0], LAUNCH.flailSeconds[1], stateTime);
  s.flail = 1 - (1 - LAUNCH.residualFlail) * calm;
  const recovered = smooth(LAUNCH.recoverSeconds[0], LAUNCH.recoverSeconds[1], stateTime);
  setFlailClip(1 - (1 - LAUNCH.residualClip) * recovered);

  placeFlyer();
  flightRig.update(dt, flight);
  chaseCamera.update(dt, flight, { apply: false });
  launchShot.update(dt, flight);
  windFx.update(dt, flight, scene.cameraEntity);
  if (!swapped) {
    timeOfDay.update(dt);
    updateAir(dt);
  }

  const camAlong = scene.cameraEntity.getPosition().dot(s.forward);
  const [r0, r1] = LAUNCH.revealMetres;
  windFx.visibility = smooth(lipAlong + r0, lipAlong + r1, camAlong);
  if (!onOwnLayer && (camAlong > lipAlong + r0 || s.pos.y > edge.y + LAUNCH.ownLayerAbove)) {
    character.setLayers([LAYERID_WORLD]);
    onOwnLayer = true;
  }

  // Inside the cloud bank, the island becomes the sky.
  updateFlash();
  if (!swapped && camAlong >= wipeAlong) swapToSky();

  if (launchShot.done && swapped && Math.abs(climbVel) < 0.3) {
    s.pitchDeg = 0;
    flailAtFly = s.flail;
    flailClipAtFly = flailClip;
    confidence = 0;
    s.altitude = s.pos.y;
    hintEl.textContent = 'A/D bank';
    document.body.classList.remove('cinema');
    setState('fly');
  }
}

// A soft white bloom peaking where the camera crosses the middle of the bank.
let flashing = false;
function updateFlash() {
  const camAlong = scene.cameraEntity.getPosition().dot(flight.state.forward);
  const flash = LAUNCH.flashOpacity * Math.max(1 - Math.abs(camAlong - wipeAlong) / LAUNCH.flashMetres, 0);
  fadeEl.style.opacity = flash;
  flashing = flash > 0 || camAlong < wipeAlong;
}

function swapToSky() {
  // The sky scene keeps the golden hour she left in.
  const { intensity, color } = timeOfDay.grade;
  timeOfDay.disable();
  sky.setTint(intensity * SKY_GRADE_SHARE, color);
  character.setTint(intensity * 0.85, color);
  celestial.enabled = false;
  ambience.enabled = false;
  sanctuary.entity.enabled = false;
  sky.entity.enabled = true;
  sky.entity.setLocalEulerAngles(0, flight.state.headingDeg - SKY_VIEW_DEG, 0);
  skyAnchor.copy(flight.state.pos);
  swapped = true;
  placeFlyer();
}

// ?fly=1: straight into the flight, already in the sky.
function startFlyDirect() {
  flight.reset(FLY_START, EDGE.headingDeg);
  character.playAnimation('idle', { loop: true });
  character.playbackSpeed = 0.6;
  flightRig.enabled = true;
  swapToSky();
  chaseCamera.snap(flight);
  windFx.enabled = true;
  windFx.reset(flight, scene.cameraEntity);
  hintEl.textContent = 'A/D bank';
  setState('fly');
}

scene.app.on('update', (dt) => {
  stateTime += dt;
  if (state === 'launch') updateLaunch(dt);
  else if (state === 'fly') updateFlight(dt);
  else updateIslandSequence(dt);
});

// ── Flight ────────────────────────────────────────────────────────────────

let areaShown = false;
function showAreaTitle() {
  areaShown = true;
  areaEl.classList.remove('play');
  void areaEl.offsetWidth; // so the animation runs from the start
  areaEl.classList.add('play');
}

function updateFlight(dt) {
  if (!areaShown && stateTime >= AREA_TITLE.after) showAreaTitle();
  const turn = axis('KeyD', 'KeyA'); // A banks left
  confidence += dt * (1 + LAUNCH.steerConfidence * Math.abs(turn));
  const shaky = 1 - smooth(0, LAUNCH.confidenceSeconds, confidence);
  flight.state.flail = flailAtFly * shaky;
  if (flailClip > 0) setFlailClip(flailClipAtFly * shaky);
  flight.update(dt, { turn });
  placeFlyer();
  flightRig.update(dt, flight);
  chaseCamera.update(dt, flight);
  windFx.update(dt, flight, scene.cameraEntity);
  if (flashing) updateFlash();
}

// How much the flail clip drives her over the glide pose, 0..1.
function setFlailClip(w) {
  flailClip = w;
  flightRig.clipWeight = w;
  if (w > 0) character.setLayerWeight('flail', w);
  else character.stopLayer('flail');
}

const feet = new Vec3();
function placeFlyer() {
  const p = flight.state.pos;
  flight.getFeetPosition(feet);
  character.setPosition(feet.x, feet.y, feet.z);
  if (swapped) {
    sky.entity.setLocalPosition(
      p.x - (p.x - skyAnchor.x) * SKY_PARALLAX,
      p.y - (p.y - skyAnchor.y) * SKY_PARALLAX,
      p.z - (p.z - skyAnchor.z) * SKY_PARALLAX,
    );
  }
  const e = flight.getOrientation().getEulerAngles();
  character.setRotation(e.x, e.y, e.z);
}

// ?debug=1 exposes the flight to the console and to test scripts.
if (new URLSearchParams(location.search).get('debug') === '1') {
  window.__demo = {
    flight,
    character,
    windFx,
    timeOfDay,
    celestial,
    ambience,
    fireflyLight,
    pulse,
    face: () => facePoint(new Vec3()),
    seat,
    state: () => state,
    camera: scene.cameraEntity,
    app: scene.app,
    start: () => state === 'menu' && startAwakening(),
    wind: () => wind,
  };
}

const query = new URLSearchParams(location.search);
if (query.get('fly') === '1') startFlyDirect();
else {
  startMenu();
  if (query.get('start') === '1') startAwakening();
}
