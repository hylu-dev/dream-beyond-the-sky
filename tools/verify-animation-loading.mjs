import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadAnimation } from '../src/loadAnimation.js';

const originalFetch = globalThis.fetch;
const scene = { skeletalAnimationLibrary: new Map() };
const url = '/assets/anims/getup-sunrise.glb';
try {
  // Vite returns its HTML fallback with HTTP 200 for a missing public asset.
  globalThis.fetch = async () => new Response('<!doctype html><html></html>', {
    headers: { 'content-type': 'text/html' },
  });
  await assert.rejects(loadAnimation(scene, url, 'getup'), /getup.*getup-sunrise\.glb.*expected a GLB file, received text\/html/);
  assert.equal(scene.skeletalAnimationLibrary.size, 0);

  globalThis.fetch = async () => new Response(new Uint8Array([0, 1]));
  await assert.rejects(loadAnimation(scene, url, 'getup'), /expected a GLB file/);
  globalThis.fetch = async () => new Response('Missing', { status: 404 });
  await assert.rejects(loadAnimation(scene, url, 'getup'), /getup.*HTTP 404/);

  const bytes = fs.readFileSync(new URL('../public/assets/anims/getup-sunrise.glb', import.meta.url));
  globalThis.fetch = async (requested, options) => {
    assert.equal(requested, url);
    assert.equal(options.cache, 'no-cache');
    return new Response(bytes, { headers: { 'content-type': 'model/gltf-binary' } });
  };
  const animation = await loadAnimation(scene, url, 'getup');
  assert.equal(animation.numBones, 441);
  assert.equal(animation.numFrames, 241);
  assert.equal(scene.skeletalAnimationLibrary.get('getup'), animation);
  console.log('Animation loading passed: HTML, truncated data and HTTP errors rejected; valid clip registered after revalidation.');
} finally {
  globalThis.fetch = originalFetch;
}
