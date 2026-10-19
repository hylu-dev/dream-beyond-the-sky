// Run with: node tools/verify-flight-atmosphere.mjs
// Uses the actual PlayCanvas entities, materials, mesh buffers and flight
// simulation on its null graphics device. This does not verify GPU rendering.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AppBase, AppOptions, NullGraphicsDevice, RenderComponentSystem, CameraComponentSystem, Entity, Texture } from 'playcanvas';
import { createFlight } from '../src/flight.js';
import { createFlightScenery, ISLAND_ART } from '../src/flightScenery.js';
import { createFlightAir } from '../src/flightAir.js';

const canvas = { id: 'flight-test', width: 1280, height: 720, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }) };
const app = new AppBase(canvas);
const options = new AppOptions();
options.graphicsDevice = new NullGraphicsDevice(canvas);
options.componentSystems = [RenderComponentSystem, CameraComponentSystem];
app.init(options);
// Supply file transport for the texture; no browser/GPU or image decode here.
let loadedTexture;
let textureLoads = 0;
const textureLoaded = new Promise((resolve, reject) => {
  app.loader.addHandler('texture', {
    load(url, callback) {
      textureLoads++;
      const path = typeof url === 'string' ? url : url.load;
      readFile(new URL(`../public${path}`, import.meta.url)).then(data => {
        assert.equal(data.toString('ascii', 1, 4), 'PNG');
        assert.equal(data[25], 6, 'painted atlas must preserve RGBA transparency');
        loadedTexture = new Texture(app.graphicsDevice, { width: data.readUInt32BE(16), height: data.readUInt32BE(20) });
        callback(null, loadedTexture);
        resolve();
      }).catch(reject);
    },
    open: (_url, texture) => texture,
    patch() {},
  });
});
const scene = { app };
const scenery = createFlightScenery(scene);
const air = createFlightAir(scene);
const flight = createFlight();
const camera = new Entity('test-camera');
camera.addComponent('camera', { nearClip: 0.05, farClip: 500 });
app.root.addChild(camera);
await textureLoaded;
assert.equal(scenery.stats().textureReady, true);
assert.equal(loadedTexture.width, ISLAND_ART.width);
assert.equal(loadedTexture.height, ISLAND_ART.height);
assert.equal(scenery.enabled, false, 'scenery must not appear during the menu');
assert.equal(air.enabled, false, 'air must not appear during the menu');

function meshes() {
  return app.root.findComponents('render').flatMap(c => c.meshInstances);
}
function inspectBuffers() {
  for (const instance of meshes()) {
    const positions = [], colors = [];
    instance.mesh.getPositions(positions);
    instance.mesh.getColors(colors);
    assert.ok(positions.every(Number.isFinite), 'all geometry positions remain finite');
    assert.ok(colors.every(Number.isFinite), 'all vertex colors remain finite');
    for (let i = 3; i < colors.length; i += 4) assert.ok(colors[i] >= 0 && colors[i] <= 1, 'alpha is bounded');
    const opacity = instance.getParameter('material_opacity');
    if (opacity) assert.ok(opacity.data >= 0 && opacity.data <= 1);
    if (instance.node.name.startsWith('painted-island-')) {
      assert.equal(positions.length, 12, 'each island is exactly one four-vertex plane');
      assert.equal(instance.material.depthWrite, false, 'transparent borders must not occlude the sky');
      assert.equal(instance.material.opacityMap, loadedTexture);
      assert.ok(Math.abs(instance.node.up.y - 1) < 1e-5, 'painted buildings stay upright');
      const pos = instance.node.getPosition(), cam = camera.getPosition();
      const towardCamera = (cam.x - pos.x) * instance.node.forward.x + (cam.z - pos.z) * instance.node.forward.z;
      assert.ok(towardCamera <= 1e-5, 'painted +Z front faces the camera without mirroring');
    }
  }
}

const meshCount = meshes().length;
const buffers = new Set(meshes().map(instance => instance.mesh.vertexBuffer));
let recycled = 0;
for (const heading of [0, 62, 180, -90]) {
  flight.reset({ x: 40, y: 20, z: -80 }, heading);
  scenery.reset(flight);
  air.reset(flight);
  for (let frame = 0; frame < 3600; frame++) {
    const dt = frame % 120 === 0 ? 0.1 : 1 / 60;
    flight.update(dt, { turn: Math.sin(frame / 180) });
    const s = flight.state;
    camera.setPosition(s.pos.x - s.forward.x * 3.1, s.pos.y + 1.05, s.pos.z - s.forward.z * 3.1);
    camera.lookAt(s.pos);
    scenery.update(dt, flight, camera);
    air.update(dt, flight, camera);
    if (frame % 300 === 0) inspectBuffers();
  }
  assert.equal(meshes().length, meshCount, 'entity count stays fixed after recycling');
  assert.deepEqual(new Set(meshes().map(instance => instance.mesh.vertexBuffer)), buffers, 'buffers are reused');
  assert.ok(scenery.stats().recycled > 10, 'new scenery continues after a minute');
  assert.ok(scenery.stats().visibleIslands > 0);
  app.render(); // Exercise material shader generation and render submission.
  recycled += scenery.stats().recycled;
}
const closeIsland = app.root.findByName('painted-island-0');
const closePosition = closeIsland.getPosition();
camera.setPosition(closePosition.x, closePosition.y, closePosition.z + 1);
scenery.update(0, flight, camera);
assert.equal(closeIsland.render.meshInstances[0].getParameter('material_opacity').data, 0, 'cutout dissolves before reaching the lens');
flight.state.speed = 0;
assert.equal(flight.speedNorm(), 0);
flight.state.speed = 9;
flight.state.bankDeg = flight.state.pocket = 0;
for (let i = 0; i < 180; i++) air.update(1 / 60, flight, camera);
const calm = air.stats().intensity;
flight.state.pocket = 1;
for (let i = 0; i < 180; i++) air.update(1 / 60, flight, camera);
assert.ok(air.stats().intensity > calm * 2, 'rough air visibly increases effect intensity');
inspectBuffers();
scenery.enabled = air.enabled = false;
const before = { ...scenery.stats() };
scenery.update(1, flight, camera);
assert.deepEqual(scenery.stats(), before, 'disabled scenery does not advance');
// The main game keeps the birds but retires painted islands. That mode must
// not fetch/decode/upload the atlas or allocate the four unused plane meshes.
const loadsBefore = textureLoads;
const meshesBefore = meshes().length;
const birdsOnly = createFlightScenery(scene, { islands: 0 });
assert.equal(textureLoads, loadsBefore, 'birds-only scenery requests no island texture');
assert.equal(birdsOnly.stats().paintedVariants, 0);
assert.equal(meshes().length - meshesBefore, 3, 'birds-only scenery creates just the flock meshes');
birdsOnly.reset(flight);
birdsOnly.update(1 / 60, flight, camera);
assert.equal(birdsOnly.stats().birds, 21);
inspectBuffers();
console.log(JSON.stringify({ passed: true, headings: 4, simulatedSeconds: 250, meshInstances: meshCount,
  uniqueBuffers: buffers.size, recycled, scenery: scenery.stats(), air: air.stats() }, null, 2));
