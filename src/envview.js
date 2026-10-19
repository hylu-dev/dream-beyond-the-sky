import { Vec3 } from 'playcanvas';
import { Scene, Environment, Character, Animation, SkyDome } from '@viggle/splat-engine';

// Dev-only: an environment on its own, for scouting shots. ?env= the file
// under /assets, ?scale= metres per unit; the floor under the capture point
// is put at y = 0. window.setCam(px, py, pz, lx, ly, lz, fov) frames a shot;
// window.place(x, y, z, yawDeg, clip) stands her somewhere. ?clip= cuts the
// capture off that many metres out and puts a daytime SkyDome behind it.
const q = new URLSearchParams(location.search);
const scene = await Scene.create(document.getElementById('canvas'), { fov: 60, near: 0.05, far: 5000 });
scene.start();
const [env, character] = await Promise.all([
  Environment.load(scene, `/assets/${q.get('env') ?? 'floating-island-realm.spz'}`, {
    scale: +(q.get('scale') ?? 8.2915),
    position: { x: 0, y: 1.5, z: 0 },
  }),
  Character.load(scene, '/assets/martial-artist.vsplat'),
  Animation.loadGlb(scene, '/assets/anims/idle.glb', 'idle'),
  Animation.loadGlb(scene, '/assets/anims/doze.glb', 'doze'),
]);
if (q.has('clip')) {
  env.setClipDistanceOrigin(new Vec3(0, 1.5, 0));
  env.setClipDistance(0, +q.get('clip'));
  SkyDome.create(scene).setLook({ mode: 3, zenith: '#3d8fe0', horizon: '#ffd9a8', ground: '#8fb0cc', warm: '#ffe0b0', dark: false });
}
character.setLayers([scene.envLayerId]);
character.setPosition(0, -100, 0);
character.playAnimation('idle', { loop: true });
window.character = character;
window.setCam = (px, py, pz, lx, ly, lz, fov = 60) => {
  scene.cameraEntity.setPosition(px, py, pz);
  scene.cameraEntity.lookAt(lx, ly, lz);
  scene.cameraEntity.camera.fov = fov;
};
window.place = (x, y, z, yaw = 0, clip = 'idle') => {
  character.setPosition(x, y, z);
  character.setRotation(0, yaw, 0);
  character.playAnimation(clip, { loop: true });
};
window.setCam(0, 1.5, 0, 0, 1.5, -1);
window.__ready = true;
