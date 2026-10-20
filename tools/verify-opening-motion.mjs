// Validate the shipped clip through the same GLB decoder used by the game.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Animation } from '@viggle/splat-engine';
import { Quat } from 'playcanvas';
const load = name => {
  const b = fs.readFileSync(new URL(`../public/assets/anims/${name}.glb`, import.meta.url));
  return Animation.fromGlb(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const walk = load('getup-sunrise'), drop = load('vanish');
const path = JSON.parse(fs.readFileSync(new URL('../public/assets/anims/getup-sunrise.path.json', import.meta.url)));
assert.equal(walk.numBones, drop.numBones, 'walk and drop must use the same rig');
assert.equal(walk.numBones, 441);
assert.equal(walk.numFrames, path.x.length);
assert.equal(path.x.length, path.z.length);
assert.equal(path.dt, 1 / 30);
for (const entry of walk.skeletalStore.keyframes.values()) {
  for (const values of [entry.positions, entry.rotations, entry.scales]) assert.ok(values.every(Number.isFinite));
}
const pelvis = walk.skeletalStore.keyframes.get(1), target = drop.skeletalStore.keyframes.get(1);
const last = new Quat(...pelvis.rotations.slice(-4));
const first = new Quat(...target.rotations.slice(0, 4));
const delta = first.clone().mul(last.clone().invert());
const yaw = 2 * Math.atan2(delta.y, delta.w) * 180 / Math.PI;
const headingError = Math.abs(((yaw + 540) % 360) - 180);
assert.ok(headingError < 0.1, `stop/drop heading mismatch: ${headingError} degrees`);
const speed = path.x.slice(1).map((x,i) => Math.hypot(x-path.x[i],path.z[i+1]-path.z[i])/path.dt);
assert.ok(speed.every(Number.isFinite));
assert.ok(Math.max(...speed) < 1.6, 'walk must stay below a brisk walking pace');
assert.ok(speed.at(-1) < 0.025, 'walk must decelerate to a stop');
console.log(`Opening motion passed: ${walk.numFrames} frames, ${walk.numBones} bones; heading seam ${headingError.toFixed(3)}°, peak travel ${Math.max(...speed).toFixed(2)} m/s, final travel ${speed.at(-1).toFixed(3)} m/s.`);
