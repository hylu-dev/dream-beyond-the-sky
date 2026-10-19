import { assetUrl } from './assetUrl.js';
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
import { createSeatPose } from './seatPose.js';
import { createChaseCamera } from './chaseCamera.js';
import { createLaunchShot } from './launchShot.js';
import { createWindFx } from './windFx.js';
import { createFlightScenery } from './flightScenery.js';
import { loadCliffAssets } from './cliffAssets.js';
import { createFlightCliffs } from './flightCliffs.js';
import { createCrash } from './crash.js';
import { createFlightAir } from './flightAir.js';
import { createAudio } from './audio.js';
import { fbm1 } from './noise.js';

// ── Tunables (mock values; iterate on these) ───────────────────────────────

// Metres per file unit, measured offline: the floor sits 1.5 m below each
// capture point, at 0.1809 units in the island realm and 0.2473 in the sky.
const REALM_M_PER_UNIT = 8.2915;
const SKY_M_PER_UNIT = 6.065;

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
// "Leap Off Cliff").
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

// Then it sweeps in one arc - in toward her front right, and on up over her
// head - to just over her and in front, looking out where she looks, with
// her below the frame. Behind the move the look turns away from her face,
// right, toward what she sees, in one sweep. The golden sun sits
// on the middle of the frame, a little over centre, above the realm (any
// higher a look and the back-out could not take in her feet at the edge).
// It holds there for the dawn.
const VIEW = {
  beside: { x: -1.51, y: 3.2, z: -4.03 }, // the arc bends toward here, by her face
  position: { x: -0.5, y: 3.8, z: -3.6 },
  sunYawDeg: 1, // the look turned this far left of the golden sun
  pitchDeg: 11,
  fov: 46,
  turnSeconds: 9,
  // The look turns in one sweep, right and a little down, starting this
  // share of the way into the move, so it leaves her face as the move gets
  // going.
  lookLag: 0.2,
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
// metres. She waits on it quite still, in vanish.glb's first frame, and
// then the clip runs on from there: it takes her off some 38 degrees to
// her right, so she stands turned that much left of the drop - which puts
// her back to the camera.
const BRINK = {
  x: 2.1,
  y: 1.47, // the lip under her feet
  z: -4.6,
  headingDeg: 83,
  waitSeconds: 3.2, // after the camera stops, rumbling
  rumble: { metres: 0.012, rollDeg: 0.35, hz: 7, buildSeconds: 2.4 },
};

// She jumps off the edge. The engine keeps clips in place, so she moves
// along the clip's own travel (vanish.path.json); once her feet leave the lip
// (`lipAt`) that is where she went from, and the clip drops her off it. For
// its last moments (`settleSeconds`) the clip slows to a stop, so her limbs
// come to rest in its fall pose rather than freezing mid-move, while she
// falls on the line and at the pace it left her, gathering to `fallGravity`
// over `gatherSeconds`, out of sight below the edge. (The clip was authored on a
// 1.17 m ledge; vanish.glb has it baked down to the lip, its pelvis
// smoothed, and is cut before she draws back in to land.)
// The flight heads `headingDeg`, out over the drop she jumped into and
// toward the sun.
const EDGE = {
  headingDeg: 62,
  lipAt: 1.7, // seconds into vanish.glb, as her feet leave it
  fallGravity: 13, // a touch over g, so the drop is quick
  gatherSeconds: 0.4,
  settleSeconds: 0.6,
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
// As she wakes the fireflies scatter, and the motes and leaves go with them,
// over `seconds`, gone `before` seconds ahead of the turn: the camera's arc
// round her would swing them all about her together. The motes and leaves
// drift back in over `returnSeconds` once it has settled on the dawn.
const SCATTER = { seconds: 1.2, before: 0.2, returnSeconds: 2 };
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
// The bearing in the sky capture she flies down: out over the sea of cloud
// to the far realm of spires, under the bright of the horizon.
const SKY_VIEW_DEG = 120;
// The island's golden grade comes with her into the sky, laid on it at
// `share` (on her at `herShare`) so the swap does not show; then, `after`
// seconds on, it eases down over `seconds` to `settle` of that, and the sky
// capture's own softer light takes over.
const SKY_GRADE = { share: 0.35, herShare: 0.85, settle: 0.3, after: 1, seconds: 6 };

// The area's title (index.html #area) comes up this long after the flight
// begins, once the cloud bank is behind her; its CSS animation runs the rest,
// for `seconds` (as in index.html), and the controls come up as it goes.
const AREA_TITLE = { after: 1.2, seconds: 6.5, controlsBefore: 0.8 };
// The flight's music (from the launch) bursts `titleAt` seconds in, which
// comes `titleIn` seconds after the area's title starts, as it shows.
const FLIGHT_MUSIC = { titleAt: 7.165, titleIn: 0.8 };

// After this long flying free she is caught by the storm and the crash runs
// (crash.js) to the end; ?crash=N for N seconds instead. For testing,
// ?impact=1 goes straight to it, and so does I, in flight or on the title.
// The flight's cliffs stop `clearMargin` metres short of where the storm
// will meet her, so none stand in its way to be moved. 58.9 s brings the
// storm in at 1:04.0 of the flight's music, as its phrase turns dark.
const CRASH_AFTER = Number(new URLSearchParams(location.search).get('crash')) || 58.9;
const CRASH = { clearMargin: 40 };
let crashNow = new URLSearchParams(location.search).get('impact') === '1';

// The fall was a dream. It cuts to black and she is back under the tree,
// where she dozed, in the golden hour she left it in. The black opens from the middle, fluttering open as
// eyes do, on a world all blur that slowly clears, on her face, close on a
// long lens, as she breathes deep (breathe.glb, PINOC "Deep Breathing": down
// in a low wide stance, rising, gathering her breath to her belly and letting
// it go). The camera starts tight on her face and dollies slowly back; then
// it cuts high and far off, looking down on her whole as she feels herself
// over; and for the deep breath at the end, in low on her, from her side,
// looking up. Then she sighs with relief and sinks back to sit against the
// tree (sigh.glb, PINOC "Sigh Relief"), and stays there, as in one move the
// camera backs out and round her, keeping her whole in it as she settles,
// turns off her to look out as the golden hour sinks back into the night -
// she is back in the doze she started in meanwhile - and comes on round
// into the menu's frame of her; and the menu is back, to start again.
const WAKE_UP = {
  // [seconds, shut], eased between: opening, falling half shut, opening
  // further, a last flicker, and open.
  lids: [[0.15, 1], [0.5, 0.55], [0.75, 0.9], [1.15, 0.3], [1.4, 0.6], [2.1, 0]],
  blur: { px: 10, seconds: 4.5 },
  // The world without colour as her eyes open, the colour coming back into
  // it from `from` to `to` seconds in.
  gray: { from: 1.4, to: 4.6 },
  // On so long a lens the clip played in place - her head sinking and rising
  // 6 cm a breath, and 9 cm in a fifth of a second as she straightens at
  // 4.6 s, where it has her hips lunge forward - would carry her face up to
  // a third of the frame up and down: so the camera rises and sinks with her
  // face, and looks level at it. Her head as her bones last left it is a
  // frame behind, so it goes `lead` frames on at its own pace. Across, the
  // camera keeps to the slow average of her head, `steady` per second. It is
  // held `handheld` as unsteadily as the portrait.
  close: { metres: 1.9, side: 0.12, up: -0.02, fov: 8, steady: 0.6, lead: 1, handheld: 0.4 },
  faceHeight: 1.4, // over her feet, as the clip starts
  backOut: { from: 0.3, seconds: 4.9, metres: 1.1, rise: 0.06, fov: 12 },
  wideAt: 5.2, // seconds in, cut to high and far
  // Metres ahead of her and to her right (- left) of where she stands, its
  // height over her feet, and how high on her it looks; drifting in `drift`
  // metres over the shot.
  wide: { ahead: 7, side: 2.2, height: 4.2, lookUp: 0.8, fov: 30, drift: 0.5 },
  endAt: 9.2, // seconds in, cut in for the deep breath
  // As `wide`, and how far under her face it looks; pushing in `push`
  // metres until it backs out.
  end: { ahead: 2.3, side: -1.2, height: 1.15, lookDown: 0.3, fov: 30, push: 0.25 },
  // Seconds in; she holds its last frame. Her back slides down the trunk
  // `slide` seconds into it.
  sigh: { at: 11.2, fade: 0.8, slide: 2.7 },
  // Out from her and round into the menu's frame, in one move that never
  // stops: from `at` seconds in, over `seconds`, easing in over `accel` and
  // out over `decel`, it curves back and round her toward `via` - degrees
  // round from straight ahead of her (to her right), metres out and up,
  // and its fov - and on into the menu's shot. Its look goes from under her
  // face onto her whole as she sinks, `frame` seconds in; turns `away.deg`
  // off her (- right) to look out `away.pitchDeg` up over `away.turn`; and
  // comes round onto the menu's over `back`. She is back in the doze at
  // `dozeAt`, out of frame; the bars go at `bars`. Over `night` the golden
  // hour sinks back to the menu's night: the sun down to `downTo` degrees
  // over `sinking` of it, the night deepening after. The menu comes up
  // `menuAt` of the way.
  home: {
    at: 10.6, seconds: 18, accel: 2, decel: 4.5,
    via: { angle: 0, radius: 3.6, height: 0.6, fov: 46 },
    frame: [2.6, 4.4], away: { deg: -65, pitchDeg: 6, turn: [5, 9.5] }, back: [8.5, 18],
    dozeAt: 9, bars: 9.5, night: [9.5, 15.5], downTo: -12, sinking: 0.65, menuAt: 0.8,
  },
};

// ── Setup ───────────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const fadeEl = document.getElementById('fade');
const curtainEl = document.getElementById('curtain');
const dreadEl = document.getElementById('dread');
const lidsEl = document.getElementById('lids');
// The black over the screen, opening from the middle: 0 open, 1 shut.
const setLids = (v) => lidsEl.style.setProperty('--shut', v.toFixed(3));
const skipEl = document.getElementById('skip');
const hintEl = document.getElementById('hint');
const areaEl = document.getElementById('area');
const menuEl = document.getElementById('menu');
const controlsEl = document.getElementById('controls');
const startEl = document.getElementById('start');

// The sound (audio.js). Browsers allow none until the page is clicked or a
// key pressed, so it starts with the first of those, whatever it was for.
const audio = createAudio();
for (const type of ['pointerdown', 'pointerup', 'keydown']) window.addEventListener(type, () => audio.unlock());

const scene = await Scene.create(canvas, { fov: 50, near: 0.05, far: 5000 });
scene.start();

// Both scenes are current-era SPZ (NGSP v4): +Y up, so no rotation.
const [sanctuary, sky, character, cliffAssets] = await Promise.all([
  Environment.load(scene, assetUrl('floating-island-realm.spz'), {
    scale: REALM_M_PER_UNIT,
    position: { x: 0, y: 1.5, z: 0 }, // floor at y = 0
  }),
  Environment.load(scene, assetUrl('cloud-realm.spz'), {
    scale: SKY_M_PER_UNIT * SKY_SCALE,
  }),
  Character.load(scene, assetUrl('martial-artist.vsplat')),
  loadCliffAssets(scene),
  Animation.loadGlb(scene, assetUrl('anims/idle.glb'), 'idle'),
  Animation.loadGlb(scene, assetUrl('anims/doze.glb'), 'doze'),
  Animation.loadGlb(scene, assetUrl('anims/wake.glb'), 'wake'),
  Animation.loadGlb(scene, assetUrl('anims/vanish.glb'), 'vanish'),
  Animation.loadGlb(scene, assetUrl('anims/flail.glb'), 'flail'),
  Animation.loadGlb(scene, assetUrl('anims/impact.glb'), 'impact'),
  Animation.loadGlb(scene, assetUrl('anims/limpfall.glb'), 'limpfall'),
  Animation.loadGlb(scene, assetUrl('anims/breathe.glb'), 'breathe'),
  Animation.loadGlb(scene, assetUrl('anims/sigh.glb'), 'sigh'),
]);
sky.entity.enabled = false;
const vanishPath = await (await fetch(assetUrl('anims/vanish.path.json'))).json();

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
// The near clouds in the golden hour she leaves the island in: a dusky rose
// underneath, orange where the low sun catches their tops.
// The clouds' tints, foot and top: warm off the island, in the golden light,
// and white over lavender shadow in the sky scene, like its own clouds -
// they cool as its grade settles (SKY_GRADE).
const CLOUD_COLORS = {
  warm: { base: [0.7, 0.62, 0.72], top: [1, 0.8, 0.58] },
  sky: { base: [0.7, 0.72, 0.85], top: [1, 0.98, 0.97] },
};
const windFx = createWindFx(scene, { baseColor: CLOUD_COLORS.warm.base, topColor: CLOUD_COLORS.warm.top });
// Big slow banks out across the whole sky, beyond the ones she flies past;
// its reserved banks wrap the cliffs' feet.
const skyClouds = createWindFx(scene, {
  clouds: 24,
  reserved: 12,
  spritesPerCloud: 10,
  cloudRadius: [20, 42],
  cloudSpacing: [11, 20],
  sideSwitch: 0.5,
  clearingChance: 0,
  cloudAhead: 340,
  cloudOffset: [16, 90],
  closeCloudChance: 0,
  cloudDrop: [-42, 26],
  deckChance: 0.15,
  deckRadius: [40, 60],
  deckDrop: [-36, -24],
  streaks: 0,
  baseColor: CLOUD_COLORS.warm.base,
  topColor: CLOUD_COLORS.warm.top,
});
// The painted billboard islands are retired for the modelled cliffs; the
// birds stay.
const flightScenery = createFlightScenery(scene, { islands: 0 });
// A cliff she passes close by goes past with a whoosh, on its side.
const flightCliffs = createFlightCliffs(scene, cliffAssets, {
  clouds: skyClouds,
  onPass: ({ gap, side }) => audio.play('cliff-pass', { gain: 0.35 + 0.65 * smooth(16, 3, gap), pan: -0.7 * side }),
});
const flightAir = createFlightAir(scene);
const crash = createCrash({
  scene, flight, character, flightRig, chaseCamera, windFx, skyClouds, flightCliffs, cliffAssets, audio,
  fadeEl, dreadEl, canvas, setLids, bodyMask: BODY_MASK, setFlailClip, placeFlyer,
});

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
  if (e.code === 'KeyI' && (state === 'fly' || state === 'menu')) {
    crashNow = true;
    if (state === 'menu') {
      menuEl.classList.remove('show');
      menuEl.setAttribute('aria-hidden', 'true');
      startFlyDirect();
    }
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
startEl.addEventListener('click', () => {
  if (state === 'menu') startAwakening();
});
startEl.addEventListener('pointerenter', () => {
  if (state === 'menu') audio.play('ui-hover');
});
const axis = (neg, pos) => (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);

// Steering in flight: she turns and climbs toward the mouse - how far it is
// from the middle of the screen, across it and up or down it - or, on a
// touch screen, toward where it is held, so holding a side steers that way.
// The mouse counts only once it has moved in the flight, so wherever it was
// left (on Start, say) does not throw her into a turn; a touch only while it
// is down. A/D and W/S steer too.
const STEER = { deadZone: 0.08, full: 0.7, rate: 5 }; // shares of half the screen; 1/s
let pointerX = null; // -1 (left edge) .. 1 (right edge), or null
let pointerY = 0; // -1 (top) .. 1 (bottom)
const steerInput = { turn: 0, climb: 0 }; // eased; + is left, and up
const pointAt = (e) => {
  pointerX = (2 * e.clientX) / window.innerWidth - 1;
  pointerY = (2 * e.clientY) / window.innerHeight - 1;
};
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' ? state === 'fly' : e.buttons) pointAt(e);
});
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'mouse' && state === 'fly') pointAt(e);
});
for (const type of ['pointerup', 'pointercancel']) {
  window.addEventListener(type, (e) => {
    if (e.pointerType !== 'mouse') pointerX = null;
  });
}
document.documentElement.addEventListener('pointerleave', () => (pointerX = null));
window.addEventListener('blur', () => (pointerX = null));

// How hard to steer for a pointer `v` (-1..1) from the middle.
function toward(v) {
  const m = Math.min(Math.max((Math.abs(v) - STEER.deadZone) / (STEER.full - STEER.deadZone), 0), 1);
  return Math.sign(v) * m * m * (3 - 2 * m);
}

function steering(dt) {
  let turn = axis('KeyD', 'KeyA'); // A steers left
  let climb = axis('KeyS', 'KeyW'); // W climbs
  if (pointerX !== null) {
    turn = -toward(pointerX);
    climb = -toward(pointerY);
  }
  const k = 1 - Math.exp(-STEER.rate * dt);
  steerInput.turn += (turn - steerInput.turn) * k;
  steerInput.climb += (climb - steerInput.climb) * k;
  // The controls show until she is first steered.
  if (!steered && Math.max(Math.abs(turn), Math.abs(climb)) > 0.25) {
    steered = true;
    controlsEl.classList.remove('show');
  }
  return steerInput;
}


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
  showMenu();
  setState('menu');
}

function showMenu() {
  hintEl.textContent = '';
  menuEl.classList.remove('leaving');
  menuEl.classList.add('show');
  menuEl.setAttribute('aria-hidden', 'false');
  startEl.focus({ preventScroll: true, focusVisible: false });
}

// Where the menu camera stands (menuCam) and looks, `menuTime` in.
const menuCam = new Vec3();
function menuPose() {
  const m = MENU_CAMERA;
  const w = m.wander;
  const t = menuTime / w.seconds;
  menuCam.set(
    m.position.x + fbm1(t, 61) * w.metres[0],
    m.position.y + fbm1(t, 62) * w.metres[1],
    m.position.z + fbm1(t, 63) * w.metres[2],
  );
  const a = aim(menuCam, tmpVec.set(seat.x, seat.y + m.lookUp, seat.z));
  const turn = m.turnDeg.amount * Math.sin((2 * Math.PI * menuTime) / m.turnDeg.seconds);
  // Turned right of her, so she sits left of the menu.
  return { yaw: a.yaw - m.offsetDeg + turn, pitch: a.pitch };
}

function updateMenuCamera(dt) {
  menuTime += dt;
  const p = menuPose();
  camPos.copy(menuCam);
  lookAlong(p.yaw, p.pitch);
  camFov = MENU_CAMERA.fov;
  applyCamera(dt, MENU_CAMERA.sway);
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
  audio.unlock();
  audio.play('ui-start');
  audio.play('approach-swell', { delay: 0.15, cut: true });
  audio.play('music-dawn', { cut: true }); // its swell peaks on the gong
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
// Her hands lifted clear of her trousers while she sits under the tree,
// until she is moved to the edge under the pulse's flash. Made here, once
// what it reads is declared.
const SEATED = new Set(['menu', 'approach', 'portrait', 'turn', 'dawn']);
const seatPose = createSeatPose(character, { seated: () => !moved && (SEATED.has(state) || dozing) });
let pulseTime = -1; // seconds into the pulse, or -1

// The turn's arc: the quadratic curve from the shot's pose, bent toward
// besidePos, to viewPos, and how far along it each of
// `turnArc.length` even steps of distance comes, so the camera travels it at
// one easing - no slowing as it passes her.
const turnArc = new Float32Array(65);
function measureTurnArc() {
  moveVia.copy(besidePos);
  const n = turnArc.length - 1;
  const lengths = [0];
  const prev = new Vec3().copy(moveFrom.pos);
  for (let i = 1; i <= 4 * n; i++) {
    curve(i / (4 * n), viewPos, tmpPos);
    lengths.push(lengths[i - 1] + tmpPos.distance(prev));
    prev.copy(tmpPos);
  }
  const total = lengths[4 * n];
  for (let k = 0, i = 0; k <= n; k++) {
    const want = (total * k) / n;
    while (i < 4 * n && lengths[i + 1] < want) i++;
    const seg = lengths[i + 1] - lengths[i];
    turnArc[k] = (i + (seg > 0 ? (want - lengths[i]) / seg : 0)) / (4 * n);
  }
}
// The curve's own parameter `share` of the way along the arc.
function alongTurnArc(share) {
  const f = Math.min(Math.max(share, 0), 1) * (turnArc.length - 1);
  const k = Math.min(Math.floor(f), turnArc.length - 2);
  return turnArc[k] + (turnArc[k + 1] - turnArc[k]) * (f - k);
}
function startTurn() {
  // From the shot's own pose: the breathing carries on into the move and
  // fades out along it, and the look starts where it was, on her face.
  moveFrom.pos.copy(creepDir).mulScalar(PORTRAIT.creep.metres).add(portraitPos);
  moveFrom.fov = camFov;
  const f = aim(camPos, faceLook);
  moveFrom.yaw = f.yaw;
  moveFrom.pitch = f.pitch;
  measureTurnArc();
  timeOfDay.settleAt(goldenPhase, SKY.seconds);
  audio.play('turn-swell', { cut: true });
  setState('turn');
}

function updateTurn(dt) {
  const t = Math.min(stateTime / VIEW.turnSeconds, 1);
  const u = smoother(t);
  curve(alongTurnArc(u), viewPos, camPos).add(breathe(dt).mulScalar(1 - u));
  // One sweep right - always right, past her face - to the sun.
  const w = smoother(Math.min(Math.max((t - VIEW.lookLag) / (1 - VIEW.lookLag), 0), 1));
  const right = -((((moveFrom.yaw - viewYaw) % 360) + 360) % 360);
  const yaw = moveFrom.yaw + right * w;
  const pitch = moveFrom.pitch + (VIEW.pitchDeg - moveFrom.pitch) * w;
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
  if (pulseTime < 0 && timeOfDay.sunElevation >= SKY.goldenElevation - PULSE.triggerBelow) {
    pulseTime = 0;
    audio.play('pulse', { cut: true }); // the gong, struck as the ring leaves the sun
  }
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
  // Quite still: vanish.glb held on its first frame until she goes.
  character.playAnimation('vanish', { loop: false });
  character.playbackSpeed = 0;
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
  if (t >= 1) {
    setState('brink');
  }
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
// How fast the clip has her falling as it ends, and gathering pace.
// The clip slows from `settleFrom` and comes to rest on its last frame
// (a smoothstep's worth of time is half its length).
const settleFrom = vanishSeconds - EDGE.settleSeconds / 2;
// How fast the clip has her falling there, and gathering pace.
const clipFall = (() => {
  const y = vanishPath.y, i = Math.round(settleFrom / vanishPath.dt), h = 3 * vanishPath.dt;
  return { speed: (y[i + 3] - y[i - 3]) / (2 * h), gravity: -(y[i + 3] - 2 * y[i] + y[i - 3]) / (h * h) };
})();
let clipTime = 0; // seconds into vanish.glb
let fallTime = -1; // seconds since the clip began to slow, or -1
let fallY = 0; // how far she has fallen since
const fallAcross = new Vec3(); // her pace across the ground as the clip slows

// Falling on: the pull gathers from the clip's own to fallGravity, and she
// keeps to the line the clip had her on, going out as much faster as down.
function fall(dt) {
  const gather = smooth(0, EDGE.gatherSeconds, fallTime);
  vel.y -= (clipFall.gravity + (EDGE.fallGravity - clipFall.gravity) * gather) * dt;
  const k = vel.y / clipFall.speed;
  vel.x = fallAcross.x * k;
  vel.z = fallAcross.z * k;
  fallTime += dt;
}
// How far the clip has brought her pelvis down by `t`.
function vanishHeight(t) {
  const f = Math.min(Math.max(t / vanishPath.dt, 0), vanishPath.y.length - 1);
  const i = Math.min(Math.floor(f), vanishPath.y.length - 2);
  return vanishPath.y[i] + (vanishPath.y[i + 1] - vanishPath.y[i]) * (f - i);
}

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
  // Back under the tree after the fall, they come out with the night.
  const woken = ['woken', 'wokenWide', 'wokenEnd', 'homeward'].includes(state);
  const early = ['menu', 'approach', 'portrait'].includes(state) || woken;
  const goneBy = PORTRAIT.panAt - SCATTER.before;
  const going = state === 'portrait' && wakeTime >= 0 ? smooth(goneBy - SCATTER.seconds, goneBy, wakeTime) : 0;
  const fireflies = woken ? smooth(3, -10, el) : early ? 1 - going : 0;
  const drift = early ? 1 - going : state === 'turn' ? 0 : state === 'dawn' ? smooth(0, SCATTER.returnSeconds, stateTime) : 1;
  ambience.update(dt, camera, { night: smooth(3, -10, el), light: smooth(-6, 10, el), wind: gusty, windDir, fireflies, drift });
  fireflyLight.update();
  // Its sound: the night wind, giving way to the dawn birds; the wind, which
  // never drops below a strong breeze; the rumble on the edge.
  audio.level('night-bed', smooth(3, -10, el));
  audio.level('dawn-bed', smooth(-6, 10, el), 2);
  audio.level('island-wind', Math.min(0.5 + 1.5 * gusty, 1));
  audio.level('rumble', rumble, 0.1);
  // The night's music, on the title screen and from her waking.
  audio.level('music-night', state === 'menu' || woken ? 1 : 0, 3);
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

    case 'woken':
      updateWoken(dt);
      break;

    case 'wokenWide':
      updateWokenWide(dt);
      break;

    case 'wokenEnd':
      updateWokenEnd(dt);
      break;

    case 'homeward':
      updateHomeward(dt);
      break;

    // On the edge, her back to us; the rumble builds, and she goes.
    case 'brink':
      rumble = smooth(0, BRINK.rumble.buildSeconds, stateTime);
      updateHoldCamera(dt);
      if (stateTime >= BRINK.waitSeconds) {
        character.playbackSpeed = 1;
        setState('vanish');
      }
      break;

    // Off the edge, carried along the clip's own travel; the clip drops her.
    case 'vanish': {
      if (stateTime < settleFrom) {
        clipTime = stateTime;
        pos.copy(brink).add(vanishOffset(clipTime, tmpPos));
      } else {
        if (fallTime < 0) {
          // From here she falls on as the clip had her going: its pace
          // over the tenth of a second before.
          fallAcross.copy(vanishOffset(settleFrom, tmpVec)).sub(vanishOffset(settleFrom - 0.1, tmpPos)).mulScalar(10);
          vel.copy(fallAcross);
          vel.y = clipFall.speed;
          clipTime = settleFrom;
          fallTime = fallY = 0;
        }
        // The clip slows to rest; her height is the fall's, less what the
        // clip still drops her pelvis by itself.
        const rate = 1 - smooth(settleFrom, settleFrom + EDGE.settleSeconds, stateTime);
        character.playbackSpeed = rate;
        clipTime = Math.min(clipTime + rate * dt, vanishSeconds);
        fall(dt);
        pos.x += vel.x * dt;
        pos.z += vel.z * dt;
        fallY += vel.y * dt;
        pos.y = brink.y + fallY - (vanishHeight(clipTime) - vanishHeight(settleFrom));
      }
      updateHoldCamera(dt);
      if (stateTime >= EDGE.lipAt && stopTime < 0) {
        audio.stop('music-dawn', 1); // she falls in silence
        edge.copy(brink).add(vanishOffset(EDGE.lipAt, tmpPos));
        stopTime = 0;
      }
      if (stateTime >= settleFrom + EDGE.settleSeconds) setState('drop');
      break;
    }

    // She falls out of sight below the edge; the rumble dies away.
    case 'drop':
    case 'hold': {
      rumble *= Math.exp(-2.5 * dt);
      if (pos.y > edge.y - 15) {
        fall(dt);
        pos.add(tmpVec.copy(vel).mulScalar(dt));
      }
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
  audio.play('music-flight', { cut: true }); // from its start, as she bursts up
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
  cloudSounded = false;
  audio.play('launch', { cut: true });
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
  updateFlightSound(dt);
  if (!swapped) {
    timeOfDay.update(dt);
    updateAir(dt);
  }
  if (swapped) {
    skyClouds.update(dt, flight, scene.cameraEntity);
    flightCliffs.update(dt, flight, scene.cameraEntity);
    flightScenery.update(dt, flight, scene.cameraEntity);
    flightAir.update(dt, flight, scene.cameraEntity);
  }

  const camAlong = scene.cameraEntity.getPosition().dot(s.forward);
  const [r0, r1] = LAUNCH.revealMetres;
  windFx.visibility = smooth(lipAlong + r0, lipAlong + r1, camAlong);
  if (!onOwnLayer && (camAlong > lipAlong + r0 || s.pos.y > edge.y + LAUNCH.ownLayerAbove)) {
    character.setLayers([LAYERID_WORLD]);
    onOwnLayer = true;
  }

  // Inside the cloud bank, the island becomes the sky. The bank's rush
  // peaks 1.25 s into its sound, as the camera crosses its middle.
  updateFlash();
  if (!cloudSounded && camAlong >= wipeAlong - s.speed * 1.25) {
    cloudSounded = true;
    audio.play('cloud-pass', { cut: true });
  }
  if (!swapped && camAlong >= wipeAlong) swapToSky();

  if (launchShot.done && swapped && Math.abs(climbVel) < 0.3) {
    s.pitchDeg = 0;
    flailAtFly = s.flail;
    flailClipAtFly = flailClip;
    confidence = 0;
    s.altitude = s.baseAltitude = s.pos.y;
    hintEl.textContent = '';
    document.body.classList.remove('cinema');
    setState('fly');
  }
}

let cloudSounded = false;

// A soft white bloom peaking where the camera crosses the middle of the bank.
let flashing = false;
function updateFlash() {
  const camAlong = scene.cameraEntity.getPosition().dot(flight.state.forward);
  const flash = LAUNCH.flashOpacity * Math.max(1 - Math.abs(camAlong - wipeAlong) / LAUNCH.flashMetres, 0);
  fadeEl.style.opacity = flash;
  flashing = flash > 0 || camAlong < wipeAlong;
}

function swapToSky() {
  // The sky scene keeps the golden hour she left in, to begin with.
  skyGrade.intensity = timeOfDay.grade.intensity;
  skyGrade.color = timeOfDay.grade.color;
  skyGrade.time = 0;
  skyGrade.clouds = -1;
  timeOfDay.disable();
  updateSkyGrade(0);
  celestial.enabled = false;
  ambience.enabled = false;
  for (const name of ['night-bed', 'dawn-bed', 'island-wind', 'rumble']) audio.level(name, 0, 0.6);
  sanctuary.entity.enabled = false;
  sky.entity.enabled = true;
  sky.entity.setLocalEulerAngles(0, flight.state.headingDeg - SKY_VIEW_DEG, 0);
  skyAnchor.copy(flight.state.pos);
  skyClouds.enabled = true;
  skyClouds.reset(flight, scene.cameraEntity);
  flightCliffs.reset(flight);
  flightScenery.reset(flight);
  flightAir.reset(flight);
  swapped = true;
  placeFlyer();
}

// ?fly=1: straight into the flight, already in the sky.
function startFlyDirect() {
  // Started on, so its burst still comes as the area's title shows.
  audio.play('music-flight', { cut: true, offset: FLIGHT_MUSIC.titleAt - AREA_TITLE.after - FLIGHT_MUSIC.titleIn });
  flight.reset(FLY_START, EDGE.headingDeg);
  character.playAnimation('idle', { loop: true });
  character.playbackSpeed = 0.6;
  flightRig.enabled = true;
  swapToSky();
  chaseCamera.snap(flight);
  windFx.enabled = true;
  windFx.reset(flight, scene.cameraEntity);
  hintEl.textContent = '';
  setState('fly');
}

const skyGrade = { intensity: 0, color: null, time: 0, clouds: -1 };
function updateSkyGrade(dt) {
  const g = SKY_GRADE;
  skyGrade.time += dt;
  const settled = smooth(g.after, g.after + g.seconds, skyGrade.time);
  const k = 1 - (1 - g.settle) * settled;
  if (skyGrade.clouds !== settled) {
    skyGrade.clouds = settled;
    const { warm, sky: cool } = CLOUD_COLORS;
    const mix = (a, b) => a.map((v, i) => v + (b[i] - v) * settled);
    for (const clouds of [windFx, skyClouds]) clouds.setColors(mix(warm.base, cool.base), mix(warm.top, cool.top));
  }
  sky.setTint(skyGrade.intensity * g.share * k, skyGrade.color);
  character.setTint(skyGrade.intensity * g.herShare * k, skyGrade.color);
}

// A phone held upright gets index.html's #rotate over everything, and the
// scene waits for it to be turned. The sound waits with it, and while the
// page is hidden.
const upright = matchMedia('(orientation: portrait) and (pointer: coarse)');
const holdForUpright = () => {
  scene.app.timeScale = upright.matches ? 0 : 1;
  audio.held = upright.matches || document.hidden;
};
upright.addEventListener('change', holdForUpright);
document.addEventListener('visibilitychange', holdForUpright);
holdForUpright();

scene.app.on('update', (dt) => {
  stateTime += dt;
  updateSkip(dt);
  if (swapped) updateSkyGrade(dt);
  if (state === 'launch') updateLaunch(dt);
  else if (state === 'fly') updateFlight(dt);
  else if (state === 'crash') updateCrash(dt);
  else updateIslandSequence(dt);
  audio.update(dt);
});

// ── Hold to skip ──────────────────────────────────────────────────────────

// Holding the mouse button or a finger down through a cutscene (not a key)
// brings up "Hold to skip"; held for `holdSeconds` it cuts through black to
// the flight. Let go and the ring drains, and the prompt lingers a moment
// before it goes.
const SKIP = { holdSeconds: 1.2, lingerSeconds: 0.8, blackSeconds: 0.45 };
const CUTSCENE = new Set(['approach', 'portrait', 'turn', 'dawn', 'backout', 'brink', 'vanish', 'drop', 'hold', 'launch']);
let skipHeld = false;
let skipHold = 0; // seconds held
let skipLinger = 0;
let skipping = false;

function pressSkip() {
  // Not the click that started the story.
  if (!CUTSCENE.has(state) || (state === 'approach' && stateTime === 0)) return;
  skipHeld = true;
}
const releaseSkip = () => (skipHeld = false);
window.addEventListener('pointerdown', pressSkip);
for (const type of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(type, releaseSkip);

function updateSkip(dt) {
  const on = skipHeld && CUTSCENE.has(state) && !skipping;
  skipHold = on ? skipHold + dt : Math.max(skipHold - 3 * dt, 0);
  skipLinger = on ? SKIP.lingerSeconds : Math.max(skipLinger - dt, 0);
  skipEl.classList.toggle('show', on || (skipLinger > 0 && !skipping));
  skipEl.style.setProperty('--p', Math.min(skipHold / SKIP.holdSeconds, 1).toFixed(3));
  if (on && skipHold >= SKIP.holdSeconds) skipToFlight();
}

function skipToFlight() {
  skipping = true;
  audio.play('ui-skip');
  audio.cut(SKIP.blackSeconds);
  skipHeld = false;
  curtainEl.classList.add('quick');
  curtainEl.classList.remove('up');
  setTimeout(() => {
    // Whatever the story was doing, put it away.
    pulse.amount = 0;
    pulseTime = -1;
    rumble = 0;
    fadeEl.style.opacity = 0;
    flashing = false;
    if (flailClip > 0) setFlailClip(0);
    flailAtFly = flailClipAtFly = confidence = 0;
    character.setLayers([LAYERID_WORLD]);
    onOwnLayer = true;
    document.body.classList.remove('cinema');
    if (!swapped) {
      // So the sky takes on the golden hour, whenever it was cut short.
      setGlow(0);
      timeOfDay.setPhase(goldenPhase);
    }
    windFx.visibility = 1;
    startFlyDirect();
    skipHold = 0;
    skipping = false;
    curtainEl.classList.remove('quick');
    curtainEl.classList.add('up');
  }, SKIP.blackSeconds * 1000);
}

// ── Flight ────────────────────────────────────────────────────────────────

// After the area's title, unless she has been steered already.
let steered = false;
let controlsShown = false;
function showControls() {
  controlsShown = true;
  if (steered) return;
  controlsEl.classList.add('show');
  controlsEl.setAttribute('aria-hidden', 'false');
}

let areaShown = false;
function showAreaTitle() {
  areaShown = true;
  areaEl.classList.remove('play');
  void areaEl.offsetWidth; // so the animation runs from the start
  areaEl.classList.add('play');
  audio.play('area-reveal');
}

function updateFlight(dt) {
  if (stateTime >= CRASH_AFTER || crashNow) {
    crashNow = false;
    startCrash();
    return;
  }
  flightCliffs.stopAt(flight, flight.state.speed * (CRASH_AFTER - stateTime) + crash.clearFrom - CRASH.clearMargin);
  if (!areaShown && stateTime >= AREA_TITLE.after) showAreaTitle();
  if (!controlsShown && stateTime >= AREA_TITLE.after + AREA_TITLE.seconds - AREA_TITLE.controlsBefore) showControls();
  const { turn, climb } = steering(dt);
  confidence += dt * (1 + LAUNCH.steerConfidence * Math.max(Math.abs(turn), Math.abs(climb)));
  const shaky = 1 - smooth(0, LAUNCH.confidenceSeconds, confidence);
  flight.state.flail = flailAtFly * shaky;
  if (flailClip > 0) setFlailClip(flailClipAtFly * shaky);
  flight.update(dt, { turn, climb });
  placeFlyer();
  flightRig.update(dt, flight);
  chaseCamera.update(dt, flight);
  windFx.update(dt, flight, scene.cameraEntity);
  skyClouds.update(dt, flight, scene.cameraEntity);
  flightCliffs.update(dt, flight, scene.cameraEntity);
  flightScenery.update(dt, flight, scene.cameraEntity);
  flightAir.update(dt, flight, scene.cameraEntity);
  if (flashing) updateFlash();
  updateFlightSound(dt);
}

// The air as she flies: the rush with her speed, a whistle as she banks,
// climbs or dives, buffeting in rough air, her clothes flapping as she
// flails, and the open sky once she is in it. A sharp roll into a bank
// whooshes, toward the side she rolls to, louder the further it will go;
// now and then a flock calls when one is near.
const BANK_WHOOSH = { degPerSecond: 25, wait: 0.8 };
const BIRD_CALLS = { withinMetres: 70, every: [6, 16] };
let bankSwinging = false;
let bankWhooshWait = 0;
let birdWait = 4;
function updateFlightSound(dt) {
  const s = flight.state;
  const o = flight.options;
  audio.level('flight-wind', 0.45 + 0.55 * Math.min(s.speed / o.speed, 1));
  audio.level('flight-whistle', (0.6 * Math.abs(s.vel.y)) / o.maxClimb + (0.5 * Math.abs(s.bankDeg)) / o.maxBankDeg);
  audio.level('turbulence', s.pocket, 0.3);
  audio.level('cloth-flap', 0.2 + 0.8 * s.flail, 0.3);
  audio.level('sky-bed', swapped ? 1 : 0, 2);

  bankWhooshWait -= dt;
  const swing = Math.abs(s.bankVel);
  if (!bankSwinging && swing > BANK_WHOOSH.degPerSecond && bankWhooshWait <= 0) {
    const reach = Math.min(Math.abs(s.targetBankDeg - s.bankDeg) / (1.5 * o.maxBankDeg), 1);
    audio.play('bank-whoosh', { gain: 0.3 + 0.7 * reach, pan: 0.4 * Math.sign(s.bankVel) });
    bankWhooshWait = BANK_WHOOSH.wait;
  }
  bankSwinging = swing > 0.6 * BANK_WHOOSH.degPerSecond;

  birdWait -= dt;
  const flock = flightScenery.nearestFlock;
  if (birdWait <= 0 && flock.distance < BIRD_CALLS.withinMetres) {
    audio.play('birds-distant', { gain: smooth(BIRD_CALLS.withinMetres, 25, flock.distance), pan: -0.6 * flock.side });
    const [a, b] = BIRD_CALLS.every;
    birdWait = a + Math.random() * (b - a);
  }
}

// The storm, the cliff and the fall (crash.js). Her controls go and the
// bars come in; everything that moves with her runs on the sequence's time,
// slowed through the blow, and the flight's sound until the black.
function startCrash() {
  steered = true;
  controlsEl.classList.remove('show');
  controlsEl.setAttribute('aria-hidden', 'true');
  document.body.classList.add('cinema');
  crash.start(steerInput);
  audio.stop('music-flight', 5); // easing out under the storm's rise
  audio.play('music-storm', { cut: true }); // 7.3 s, to the blow
  setState('crash');
}

function updateCrash(dt) {
  const cdt = crash.update(dt);
  if (crash.done) {
    wakeUp();
    return;
  }
  windFx.update(cdt, flight, scene.cameraEntity);
  skyClouds.update(cdt, flight, scene.cameraEntity);
  flightCliffs.update(cdt, flight, scene.cameraEntity);
  flightScenery.update(cdt, flight, scene.cameraEntity);
  flightAir.update(cdt, flight, scene.cameraEntity);
  if (crash.phase !== 'out') updateFlightSound(cdt);
}

// ── Waking: back under the tree ───────────────────────────────────────────

const wakeSide = new Vec3(-faceDir.z, 0, faceDir.x); // her right
let wokeTime = 0;
let wakeSnap = 0; // frames left to put the look straight on her face
const faceSteady = new Vec3(); // her face, slowly averaged
let faceY = 0; // her face's height, held
let faceLastY = 0; // as her bones last left it
let sighed = false;
let dozing = false;
let menuBack = false;
// Her breath as she wakes, [seconds in, sound]: the gasp as her eyes open,
// panting until she breathes in, held, and out (no sigh) as she leans back,
// and her back down the trunk with a last soft breath out.
const WAKE_SOUNDS = [
  [0.15, 'wake-gasp'], [0.7, 'wake-pant'], [WAKE_UP.endAt, 'wake-breath'],
  [WAKE_UP.sigh.at, 'wake-exhale'], [WAKE_UP.sigh.at + WAKE_UP.sigh.slide, 'wake-slide'],
  [WAKE_UP.sigh.at + WAKE_UP.sigh.slide + 0.1, 'wake-settle'],
];
let wakeSound = 0; // the next of them

function wakeUp() {
  crash.finish();
  // The island in the golden hour again, and none of the sky.
  sky.entity.enabled = false;
  for (const layer of [windFx, skyClouds, flightCliffs, flightScenery, flightAir]) layer.enabled = false;
  sanctuary.entity.enabled = true;
  swapped = false;
  timeOfDay.enable();
  timeOfDay.setPhase(goldenPhase);
  timeOfDay.setSpeed(0);
  celestial.enabled = true;
  ambience.enabled = true;
  setGlow(0);
  // Her, standing where she dozed.
  flightRig.enabled = false;
  character.stopLayer('flail');
  character.setLayers([scene.envLayerId]);
  pos.copy(seat);
  headingDeg = SEAT.headingDeg;
  placeCharacter();
  character.playAnimation('breathe', { loop: false });
  character.playbackSpeed = 1;
  wokeTime = 0;
  // Her bones only move once she is in view, and they still have her in
  // the sky: so the look starts where her face will be, and goes onto it
  // once they have caught up.
  faceLook.set(seat.x + faceDir.x * 0.1, seat.y + WAKE_UP.faceHeight, seat.z + faceDir.z * 0.1);
  faceSteady.copy(faceLook);
  faceY = faceLastY = faceLook.y;
  wakeSnap = 3;
  sighed = dozing = menuBack = false;
  wakeSound = 0;
  moved = false; // back at the tree
  setLids(1);
  setState('woken');
}

function breatheAwake() {
  while (wakeSound < WAKE_SOUNDS.length && wokeTime >= WAKE_SOUNDS[wakeSound][0]) {
    const name = WAKE_SOUNDS[wakeSound++][1];
    if (name === 'wake-breath') audio.stop('wake-pant', 0.6); // caught
    audio.play(name, { cut: true });
  }
}

// Her eyes opening, and the world slowly coming into focus.
function openEyes() {
  const keys = WAKE_UP.lids;
  let i = 0;
  while (i < keys.length - 2 && wokeTime > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1];
  setLids(a + (b - a) * smooth(t0, t1, wokeTime));
  const blur = WAKE_UP.blur.px * (1 - smooth(0, WAKE_UP.blur.seconds, wokeTime));
  const gray = 1 - smooth(WAKE_UP.gray.from, WAKE_UP.gray.to, wokeTime);
  const filter = [gray > 0.005 && `grayscale(${gray.toFixed(3)})`, blur > 0.05 && `blur(${blur.toFixed(2)}px)`];
  canvas.style.filter = filter.filter(Boolean).join(' ');
}

// Close on her face, following it, and backing slowly out.
function updateWoken(dt) {
  const w = WAKE_UP, c = w.close, b = w.backOut;
  wokeTime += dt;
  if (facePoint(lookGoal).distance(seat) < 3) {
    if (wakeSnap > 0) {
      wakeSnap--;
      faceLook.copy(lookGoal);
      faceSteady.copy(lookGoal);
      faceY = faceLastY = lookGoal.y;
    } else {
      followFace(dt);
      faceY = lookGoal.y + (lookGoal.y - faceLastY) * c.lead;
      faceLastY = lookGoal.y;
    }
  }
  faceSteady.lerp(faceSteady, faceLook, 1 - Math.exp(-c.steady * dt));
  const out = smoother(Math.min(Math.max((wokeTime - b.from) / b.seconds, 0), 1));
  camPos.copy(faceDir).mulScalar(c.metres + b.metres * out).add(faceSteady).add(tmpVec.copy(wakeSide).mulScalar(c.side));
  camPos.y = faceY + c.up + b.rise * out;
  camPos.add(breathe(dt).mulScalar(c.handheld));
  tmpPos.copy(faceLook);
  tmpPos.y = faceY;
  const f = aim(camPos, tmpPos);
  lookAlong(f.yaw, f.pitch);
  camFov = c.fov + (b.fov - c.fov) * out;
  applyCamera(dt, VIEW.sway);
  openEyes();
  breatheAwake();
  if (wokeTime >= w.wideAt) setState('wokenWide');
}

// High and far off, looking down on her whole, drifting in.
function updateWokenWide(dt) {
  const w = WAKE_UP.wide;
  wokeTime += dt;
  const u = smoother(Math.min((wokeTime - WAKE_UP.wideAt) / (WAKE_UP.endAt - WAKE_UP.wideAt), 1));
  camPos.copy(faceDir).mulScalar(w.ahead - w.drift * u).add(seat).add(tmpVec.copy(wakeSide).mulScalar(w.side));
  camPos.y = seat.y + w.height;
  const a = aim(camPos, tmpVec.set(seat.x, seat.y + w.lookUp, seat.z));
  lookAlong(a.yaw, a.pitch);
  camFov = w.fov;
  applyCamera(dt, MENU_CAMERA.sway);
  settle();
  if (wokeTime >= WAKE_UP.endAt) setState('wokenEnd');
}

// In low from her side for the deep breath, pushing slowly in.
const endPos = new Vec3(); // the shot's own pose, before the breathing
function updateWokenEnd(dt) {
  const e = WAKE_UP.end;
  wokeTime += dt;
  followFace(dt);
  const push = smoother(Math.min((wokeTime - WAKE_UP.endAt) / (WAKE_UP.home.at - WAKE_UP.endAt), 1)) * e.push;
  endPos.copy(faceDir).mulScalar(e.ahead - push).add(seat).add(tmpVec.copy(wakeSide).mulScalar(e.side));
  endPos.y = seat.y + e.height;
  camPos.copy(endPos).add(breathe(dt));
  const a = aim(camPos, tmpVec.copy(faceLook).sub(tmpPos.set(0, e.lookDown, 0)));
  lookAlong(a.yaw, a.pitch);
  camFov = e.fov;
  applyCamera(dt, MENU_CAMERA.sway);
  settle();
  if (wokeTime >= WAKE_UP.home.at) {
    homeFrom = around(endPos);
    setState('homeward');
  }
}

// As the breath ends, the sigh, back against the tree.
function settle() {
  breatheAwake();
  if (!sighed && wokeTime >= WAKE_UP.sigh.at) {
    sighed = true;
    character.crossfadeTo('sigh', { duration: WAKE_UP.sigh.fade, loop: false });
  }
}

// Where `p` is round her seat: degrees round from straight ahead of her (to
// her right), metres out and metres up.
function around(p) {
  tmpVec.copy(p).sub(seat);
  const ahead = tmpVec.dot(faceDir), right = tmpVec.dot(wakeSide);
  return { angle: Math.atan2(right, ahead) / DEG, radius: Math.hypot(ahead, right), height: tmpVec.y };
}

// How far along a move of `seconds` it is at `t` (0..1): easing in over
// `accel` seconds, at one speed, and easing out over `decel`.
function glide(t, seconds, accel, decel) {
  const v = 1 / (seconds - accel / 2 - decel / 2);
  if (t <= 0) return 0;
  if (t < accel) return (v * t * t) / (2 * accel);
  if (t < seconds - decel) return v * (accel / 2 + t - accel);
  if (t < seconds) return 1 - (v * (seconds - t) ** 2) / (2 * decel);
  return 1;
}

// In one move from the side shot, never stopping: backing out and round
// her, keeping her whole in it as she sighs and sinks back against the
// tree; turning off her to look out as the golden hour goes down into the
// night; and coming round into the menu's frame of her, the menu coming up.
let homeFrom = { angle: 0, radius: 0, height: 0 };
const homeLook = new Vec3();
const duskPhase = timeOfDay.phaseAtElevation(WAKE_UP.home.downTo);
const curve3 = (a, b, c, s) => (1 - s) ** 2 * a + 2 * (1 - s) * s * b + s * s * c;
function updateHomeward(dt) {
  const h = WAKE_UP.home, t = stateTime;
  wokeTime += dt;
  menuTime += dt;
  settle();
  followFace(dt);
  const m = menuPose();
  const to = around(menuCam);
  // Along a curve from the side shot, bent out toward `via`, into the menu's.
  const s = glide(t, h.seconds, h.accel, h.decel);
  const angle = curve3(homeFrom.angle, h.via.angle, to.angle, s) * DEG;
  const radius = curve3(homeFrom.radius, h.via.radius, to.radius, s);
  camPos.copy(faceDir).mulScalar(Math.cos(angle) * radius).add(tmpVec.copy(wakeSide).mulScalar(Math.sin(angle) * radius)).add(seat);
  camPos.y = seat.y + curve3(homeFrom.height, h.via.height, to.height, s);
  camPos.add(breathe(dt).mulScalar(1 - smooth(0, 4, t)));
  camFov = curve3(WAKE_UP.end.fov, h.via.fov, MENU_CAMERA.fov, s);
  // From under her face onto her whole, halfway from her face to her feet,
  // as she sinks; off her to look out; and round onto the menu's look.
  homeLook.copy(faceLook).sub(tmpPos.set(0, WAKE_UP.end.lookDown, 0));
  homeLook.lerp(homeLook, tmpPos.copy(faceLook).add(seat).mulScalar(0.5), smooth(h.frame[0], h.frame[1], t));
  const a = aim(camPos, homeLook);
  const away = smooth(h.away.turn[0], h.away.turn[1], t);
  const back = smoother(Math.min(Math.max((t - h.back[0]) / (h.back[1] - h.back[0]), 0), 1));
  const yaw = a.yaw + h.away.deg * away, pitch = a.pitch + (h.away.pitchDeg - a.pitch) * away;
  lookAlong(lerpDeg(yaw, m.yaw, back), pitch + (m.pitch - pitch) * back);
  applyCamera(dt, MENU_CAMERA.sway);
  // Back in the doze, out of frame.
  if (!dozing && t >= h.dozeAt) {
    dozing = true;
    character.playAnimation('doze', { loop: true });
  }
  if (t >= h.bars) document.body.classList.remove('cinema');
  // The sun sinking back below the sea of cloud, into the night, and the
  // fireflies' light coming up on her with it.
  const x = Math.min(Math.max((t - h.night[0]) / (h.night[1] - h.night[0]), 0), 1);
  const sinking = smooth(0, h.sinking, x), deepening = smooth(h.sinking, 1, x);
  timeOfDay.setPhase(deepening > 0
    ? duskPhase + (SKY.menuPhase - duskPhase) * deepening
    : timeOfDay.phaseAtElevation(SKY.goldenElevation + (h.downTo - SKY.goldenElevation) * sinking));
  setGlow(SEAT.glow * smoother(x));
  if (!menuBack && s >= h.menuAt) {
    menuBack = true;
    showMenu();
  }
  if (t >= h.seconds) backToMenu();
}

// Where it all began, and the story set to run again from Start.
function backToMenu() {
  wakeTime = pulseTime = stopTime = fallTime = -1;
  clipTime = fallY = rumble = 0;
  canvas.style.filter = '';
  setState('menu');
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
    seatPose,
    windFx,
    skyClouds,
    flightCliffs,
    flightScenery,
    flightAir,
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
    audio,
    crash,
  };
}

const query = new URLSearchParams(location.search);
if (query.get('fly') === '1' || crashNow) startFlyDirect();
else {
  startMenu();
  if (query.get('start') === '1') startAwakening();
}
// Lift the curtain once a couple of frames have drawn her posed in place.
scene.app.once('postrender', () => scene.app.once('postrender', () => curtainEl.classList.add('up')));
