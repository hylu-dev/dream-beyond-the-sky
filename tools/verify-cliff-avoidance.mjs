// Run with: node tools/verify-cliff-avoidance.mjs
// Flies the real flight model among the real cliff boxes with a pilot who
// steers straight at the nearest cliff ahead, and checks she is turned round
// every one: never so close that a cliff has to hide from her or from the
// real chase camera, and pushed off the rock only ever by a slide, never a
// jump. Pilots who aren't aiming at rock are never steered at all. Uses PlayCanvas's null device; no GPU.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AppBase, AppOptions, NullGraphicsDevice, CameraComponentSystem, Entity } from 'playcanvas';
import { createFlight } from '../src/flight.js';
import { createFlightCliffs, CLIFF_DEFAULTS } from '../src/flightCliffs.js';
import { createChaseCamera } from '../src/chaseCamera.js';

const data = JSON.parse(await readFile(new URL('../public/assets/flight/cliffs/cliffs.mesh.json', import.meta.url)));
const canvas = { id: 'cliff-avoidance', width: 1280, height: 720 };
const app = new AppBase(canvas);
const options = new AppOptions();
options.graphicsDevice = new NullGraphicsDevice(canvas);
options.componentSystems = [CameraComponentSystem];
app.init(options);
// The cliffs' boxes are all avoidance reads; their meshes stay out of it.
const assets = {
  variants: data.variants.map(v => ({ id: v.id, bounds: v.bounds })),
  instantiate(index, parent) {
    const variant = this.variants[index];
    const entity = new Entity(variant.id);
    parent.addChild(entity);
    return { entity, instances: [], variant };
  },
};

// Pilots: `aim` steers at the nearest cliff ahead; `idle` lets go of the
// controls; `wander` drifts about the way a player looking around might.
function run(start, { avoid, pilot = 'aim' }) {
  let seed = start;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const root = new Entity('run');
  app.root.addChild(root);
  const scene = { app: { root } };
  const flight = createFlight({ headingDeg: 62 });
  flight.reset({ x: 0, y: 40, z: 0 }, 62);
  const cliffs = createFlightCliffs(scene, assets);
  const camera = new Entity('camera');
  camera.addComponent('camera', { fov: 50 });
  root.addChild(camera);
  const chase = createChaseCamera(camera);
  cliffs.reset(flight);
  chase.snap(flight);
  const input = { turn: 0, climb: 0 };
  let closest = Infinity, hits = 0, biggestShove = 0;
  for (let frame = 0; frame < 60 * 120; frame++) {
    const dt = 1 / 60, s = flight.state;
    // Aim for the middle of the nearest cliff still ahead.
    const target = cliffs.list(flight).filter(c => c.ahead > -5 && !c.parked).sort((a, b) => a.ahead - b.ahead)[0];
    const steer = { turn: 0, climb: 0 };
    if (pilot === 'wander') {
      steer.turn = Math.sin(frame / 150) * 0.5;
      steer.climb = Math.sin(frame / 230) * 0.3;
    } else if (pilot === 'aim' && target) {
      steer.turn = Math.max(-1, Math.min(1, target.offset / 4));
      steer.climb = Math.max(-1, Math.min(1, (target.top - 6) / 6));
    }
    if (avoid) {
      const d = cliffs.dodge(flight);
      input.turn = d.turn === null ? steer.turn : steer.turn + (d.turn - steer.turn) * d.weight;
      input.climb = d.climb === null ? steer.climb : steer.climb + (d.climb - steer.climb) * d.weight;
    } else Object.assign(input, steer);
    flight.update(dt, input);
    const before = s.pos.clone();
    if (avoid) cliffs.keepOff(flight, dt);
    biggestShove = Math.max(biggestShove, before.distance(s.pos));
    chase.update(dt, flight);
    cliffs.update(dt, flight, camera);
    const gap = Math.min(...cliffs.list(flight).filter(c => !c.parked).map(c => c.gap));
    closest = Math.min(closest, gap);
    if (gap <= CLIFF_DEFAULTS.clear) hits++;
  }
  const stats = cliffs.stats();
  root.destroy();
  return { seed: start, pilot, closest: +closest.toFixed(2), hitFrames: hits, biggestShove: +biggestShove.toFixed(3),
    dodgeFrames: stats.dodgeFrames, contactFrames: stats.contactFrames, lensHiddenFrames: stats.hiddenFrames, passes: stats.passes };
}

const seeds = [1, 7, 42, 1234, 98765];
const without = seeds.map(seed => run(seed, { avoid: false }));
const withAvoid = seeds.map(seed => run(seed, { avoid: true }));
const calm = seeds.flatMap(seed => ['idle', 'wander'].map(pilot => run(seed, { avoid: true, pilot })));
assert.ok(without.reduce((n, r) => n + r.hitFrames, 0) > 0, 'the hostile pilot does fly into cliffs when nothing stops her');
for (const r of withAvoid) {
  assert.equal(r.hitFrames, 0, `seed ${r.seed}: she never comes within ${CLIFF_DEFAULTS.clear} m of the rock`);
  assert.ok(r.biggestShove <= CLIFF_DEFAULTS.avoid.slide / 60 + 1e-3, `seed ${r.seed}: she slides off the rock, never jumps`);
  assert.ok(r.dodgeFrames > 0, `seed ${r.seed}: the dodge steered her`);
  assert.equal(r.lensHiddenFrames, 0, `seed ${r.seed}: the chase camera never goes into the rock either`);
}
for (const r of calm) {
  assert.equal(r.dodgeFrames, 0, `seed ${r.seed}, ${r.pilot}: ordinary flying is never taken over`);
  assert.equal(r.contactFrames, 0, `seed ${r.seed}, ${r.pilot}: nor pushed`);
}
console.log(JSON.stringify({ without, withAvoid, calm }, null, 2));
app.destroy();
