import { Animation } from '@viggle/splat-engine';

// The engine's persistent binary cache can retain a successful HTTP response
// containing Vite's HTML fallback. Fetch local clips through the browser's
// revalidated HTTP cache instead, and only register validated animation data.
export async function loadAnimation(scene, url, name) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Animation "${name}" (${url}): HTTP ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  const header = new DataView(buffer);
  if (buffer.byteLength < 12 || header.getUint32(0, true) !== 0x46546c67) {
    throw new Error(`Animation "${name}" (${url}): expected a GLB file, received ${response.headers.get('content-type') || 'invalid data'}. Check that the asset exists.`);
  }
  const animation = Animation.fromGlb(buffer);
  animation.register(scene, name);
  return animation;
}
