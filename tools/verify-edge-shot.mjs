// Projection checks for the low ledge shot; no GPU or splat occlusion check.
import assert from 'node:assert/strict';
import { AppBase, AppOptions, CameraComponentSystem, Entity, NullGraphicsDevice, Vec3 } from 'playcanvas';
import { createEdgeShot } from '../src/edgeShot.js';

const canvas = { id: 'edge-shot-check', width: 1280, height: 720 };
const app = new AppBase(canvas);
const options = new AppOptions();
options.graphicsDevice = new NullGraphicsDevice(canvas);
options.componentSystems = [CameraComponentSystem];
app.init(options);
const camera = new Entity('camera');
camera.addComponent('camera', { nearClip: 0.05, farClip: 5000 });
app.root.addChild(camera);
const radians = Math.PI / 180;
const sun = new Vec3(Math.sin(82 * radians) * Math.cos(16 * radians), Math.sin(16 * radians), Math.cos(82 * radians) * Math.cos(16 * radians));
const shot = createEdgeShot();
const from = { pos: new Vec3(-0.5, 3.8, -3.6), yaw: 83, pitch: 11, fov: 46 };
const project = (point) => camera.camera.worldToScreen(point);
let samples = 0;
for (const [width, height] of [[1280, 720], [1920, 1080], [844, 390], [1024, 768]]) {
  app.graphicsDevice.resizeCanvas(width, height);
  Object.assign(app.graphicsDevice.clientRect, { width, height });
  camera.camera.aspectRatio = width / height;
  for (let step = 0; step <= 100; step++) {
    const pose = shot.frame(from, step / 100);
    camera.setPosition(pose.position);
    camera.lookAt(pose.target);
    camera.camera.fov = pose.fov;
    app.fire('prerender');
    const light = project(sun.clone().mulScalar(900).add(pose.position));
    // The sun stays ahead for the entire move; there is no pan to find her.
    assert.ok(Math.abs(light.x / width - 0.5) < 0.02, 'camera keeps looking toward the sun');
    assert.ok(light.y / height > 0.1 && light.y / height < 0.5, 'sun stays in the upper frame');
    if (step === 100) {
      const feet = new Vec3(2.1, 1.47, -4.6);
      const bottom = project(feet);
      const head = project(feet.clone().add(new Vec3(0, 1.75, 0)));
      const torso = project(feet.clone().add(new Vec3(0, 1.1, 0)));
      assert.ok(Math.abs(torso.x / width - 0.5) < 0.001, 'approved ledge framing stays centred');
      assert.ok(head.y / height > 0.1 && bottom.y / height < 0.9, 'whole body clears the letterbox');
      assert.ok(light.y / height > 0.1 && light.y < head.y - height * 0.03, 'sun disc clears the top of her silhouette');
      assert.ok(pose.position.y < feet.y + 1.1, 'final camera stays below her chest');
      assert.ok(pose.position.distance(new Vec3(-0.65, 2.55, -4.95)) < 1e-6, 'approved camera position is preserved');
    }
    samples++;
  }
}
console.log(`Edge shot projection checks passed: ${samples} dolly samples across four landscape viewports; steady sun bearing and preserved final framing. Rendered review is also required for occlusion.`);
