import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Animation } from '@viggle/splat-engine';
import { createStepOff } from '../src/stepOff.js';
const load = name => {
  const b = fs.readFileSync(new URL(`../public/assets/anims/${name}.glb`, import.meta.url));
  return Animation.fromGlb(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const clip = load('step-off'), stance = load('vanish');
const path = JSON.parse(fs.readFileSync(new URL('../public/assets/anims/step-off.path.json', import.meta.url)));
assert.equal(clip.numBones, stance.numBones);
for (const axis of ['x', 'y', 'z']) {
  assert.equal(path[axis].length, clip.numFrames);
  assert.ok(path[axis].every(Number.isFinite));
}
// A hard animation change at toe-off must begin in the exact held stance.
for (const [bone, entry] of clip.skeletalStore.keyframes) {
  const ref = stance.skeletalStore.keyframes.get(bone);
  const q = entry.rotations.slice(0, 4), r = ref.rotations.slice(0, 4);
  assert.ok(Math.abs(q.reduce((sum,x,j)=>sum+x*r[j],0)) > 0.999999, `bone ${bone} pops at start`);
  // Constant translations are supplied by the character's bind pose, not the clip.
  if (clip.translationMask?.[bone]) {
    assert.ok(Math.abs(entry.positions[1]-ref.positions[1]) < 0.00001, `bone ${bone} jumps vertically`);
  }
}
const fall = createStepOff(path, { headingDeg:83 });
const pelvisHeight = time => {
  const f = Math.min(time / path.dt, path.y.length - 1), i = Math.min(Math.floor(f), path.y.length - 2);
  return path.y[i] + (path.y[i+1]-path.y[i])*(f-i);
};
const at = time => {
  const frame = fall.frame(time);
  return { x:frame.offset.x, y:frame.offset.y+pelvisHeight(frame.clipTime), z:frame.offset.z };
};
const epsilon = 0.00001, release = at(fall.releaseAt);
for(const axis of ['x','y','z']) {
  const before = (release[axis]-at(fall.releaseAt-epsilon)[axis])/epsilon;
  const after = (at(fall.releaseAt+epsilon)[axis]-release[axis])/epsilon;
  assert.ok(Math.abs(before-after)<0.001, `${axis} velocity jumps at release`);
}
const a = at(fall.releaseAt+0.2), b = at(fall.releaseAt+0.4), c = at(fall.releaseAt+0.6);
assert.ok(Math.abs((c.y-2*b.y+a.y)/0.04 + 13)<0.00001, 'pelvis must accelerate downward at 13 m/s²');
for(const axis of ['x','z']) assert.ok(Math.abs(c[axis]-2*b[axis]+a[axis])<0.00001, 'horizontal momentum must not accelerate');
for(let t=fall.releaseAt;t<3;t+=1/144) {
  const p=at(t),next=at(t+1/144);
  assert.ok(Object.values(p).every(Number.isFinite));
  assert.ok(next.y<p.y, 'fall must not rebound');
}
console.log(`Step-off passed: matched starting stance; continuous release at ${fall.releaseAt.toFixed(3)}s; constant horizontal momentum and downward gravity through the frozen final pose.`);
