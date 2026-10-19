// node tools/verify-performance.mjs [--measure-only]
// Deterministic CPU work / render-submission benchmark on PlayCanvas's null
// device. Counts are reproducible; timings are diagnostic, not GPU/FPS claims.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { AppBase, AppOptions, NullGraphicsDevice, RenderComponentSystem, CameraComponentSystem, Entity, Vec3 } from 'playcanvas';
import { createFlight } from '../src/flight.js';
import { createWindFx } from '../src/windFx.js';
import { createQuad, makeSprite, setOpacity, spriteMaterial } from '../src/sprites.js';

class TestCanvas {
  width = 128; height = 128;
  getContext() {
    return {
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      putImageData() {}, createLinearGradient: () => ({ addColorStop() {} }), fillRect() {},
    };
  }
}
globalThis.HTMLCanvasElement = TestCanvas;
globalThis.HTMLVideoElement = class {};
globalThis.document = { createElement: () => new TestCanvas(), removeEventListener() {} };
let seed = 123456;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const measureOnly = process.argv.includes('--measure-only');
const canvas = { id: 'performance-check', width: 1280, height: 720 };
const app = new AppBase(canvas);
const options = new AppOptions();
options.graphicsDevice = new NullGraphicsDevice(canvas);
options.componentSystems = [RenderComponentSystem, CameraComponentSystem];
app.init(options);
const camera = new Entity('camera');
camera.addComponent('camera', { nearClip: 0.05, farClip: 5000 });
app.root.addChild(camera);
const flight = createFlight();
flight.reset({ x: 0, y: 0, z: 0 }, 62);
const near = createWindFx({ app });
const far = createWindFx({ app }, {
  clouds: 24, reserved: 12, spritesPerCloud: 10, cloudRadius: [20, 42],
  cloudSpacing: [11, 20], sideSwitch: 0.5, clearingChance: 0,
  cloudAhead: 340, cloudOffset: [16, 90], closeCloudChance: 0,
  cloudDrop: [-42, 26], deckChance: 0.15, deckRadius: [40, 60],
  deckDrop: [-36, -24], streaks: 0,
});
near.reset(flight, camera);
far.reset(flight, camera);
// Populate the reserved banks as cliff shrouds, matching the flight setup.
for (const [i, index] of far.reservedClouds.entries()) {
  const center = flight.state.forward.clone().mulScalar(40 + i * 28);
  center.add(flight.state.left.clone().mulScalar((i % 2 ? -1 : 1) * 45));
  center.y = -20;
  far.anchorCloud(index, center, 18, { opacity: 0.85 });
}
near.enabled = far.enabled = true;
const instances = app.root.findComponents('render').flatMap(c => c.meshInstances);
let looks = 0, parameters = 0, draws = 0;
for (const instance of instances) {
  const lookAt = instance.node.lookAt, setParameter = instance.setParameter;
  instance.node.lookAt = function (...args) { looks++; return lookAt.apply(this, args); };
  instance.setParameter = function (...args) { parameters++; return setParameter.apply(this, args); };
}
app.graphicsDevice.draw = () => { draws++; };
const hash = createHash('sha256');
const times = [];
let renderable = 0;
for (let frame = 0; frame < 1800; frame++) {
  flight.update(1 / 60, { turn: Math.sin(frame / 180), climb: Math.sin(frame / 300) * 0.3 });
  const s = flight.state;
  camera.setPosition(s.pos.x - s.forward.x * 3.1, s.pos.y + 1.05, s.pos.z - s.forward.z * 3.1);
  camera.lookAt(s.pos);
  const start = performance.now();
  near.update(1 / 60, flight, camera);
  far.update(1 / 60, flight, camera);
  times.push(performance.now() - start);
  if (frame % 60 === 0) {
    app.render();
    for (const instance of instances) {
      const alpha = instance.getParameter('material_opacity').data;
      if (instance.visible) renderable++;
      if (!measureOnly && alpha === 0) assert.equal(instance.visible, false, 'transparent sprites are excluded from rendering');
      // Only visible transforms affect the picture; hidden ones may be deferred.
      hash.update(JSON.stringify([alpha, alpha > 0 ? Array.from(instance.node.getWorldTransform().data) : null]));
    }
  }
}
times.sort((a, b) => a - b);
const report = {
  frames: times.length, sprites: instances.length, billboardUpdates: looks,
  parameterWrites: parameters, sampledDrawCalls: draws, sampledRenderableSprites: renderable,
  medianUpdateMs: +times[Math.floor(times.length / 2)].toFixed(3),
  p95UpdateMs: +times[Math.floor(times.length * 0.95)].toFixed(3),
  visualStateHash: hash.digest('hex'),
};
const compareIndex = process.argv.indexOf('--compare');
if (compareIndex !== -1) {
  const baseline = JSON.parse(await readFile(process.argv[compareIndex + 1], 'utf8'));
  assert.equal(report.visualStateHash, baseline.visualStateHash, 'visible transforms and opacity match the baseline');
  assert.ok(report.sampledDrawCalls < baseline.sampledDrawCalls, 'fewer render submissions than the baseline');
  assert.ok(report.billboardUpdates < baseline.billboardUpdates, 'fewer billboard updates than the baseline');
  assert.ok(report.parameterWrites < baseline.parameterWrites, 'fewer shader parameter writes than the baseline');
}

if (!measureOnly) {
  const sprite = makeSprite(app.root, createQuad(app.graphicsDevice), spriteMaterial(null), 'opacity-lifecycle');
  assert.equal(sprite.meshInstance.visible, false, 'new sprites start hidden');
  setOpacity(sprite, 0.000001);
  assert.equal(sprite.meshInstance.visible, true, 'even a faint nonzero sprite is preserved');
  setOpacity(sprite, 0);
  assert.equal(sprite.meshInstance.visible, false);
  setOpacity(sprite, 0.5);
  assert.equal(sprite.meshInstance.visible, true, 'faded sprites can reappear');
  sprite.entity.destroy();

  // An anchored cloud can move while invisible and return at its new center.
  const index = far.reservedClouds[0];
  const center = camera.getPosition().clone().add(new Vec3(0, 0, 20));
  far.anchorCloud(index, center, 10);
  far.update(0, flight, camera);
  const puff = app.root.findByName('cloud-24-0');
  const before = puff.getPosition().clone();
  far.visibility = 0;
  far.update(0, flight, camera);
  assert.equal(puff.render.meshInstances[0].visible, false);
  center.x += 15;
  far.moveCloud(index, center);
  far.update(0, flight, camera);
  far.visibility = 1;
  far.update(0, flight, camera);
  assert.ok(Math.abs(puff.getPosition().x - before.x - 15) < 1e-4, 'anchor moves by 15 m within float32 precision');
  assert.equal(puff.render.meshInstances[0].visible, true);
  far.anchorCloud(index, center, 10, { opacity: 0 });
  far.update(0, flight, camera);
  assert.equal(puff.render.meshInstances[0].visible, false, 'parked shrouds stay hidden');
}
console.log(JSON.stringify(report, null, 2));
app.destroy();
