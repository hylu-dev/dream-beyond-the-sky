import { BLEND_ADDITIVEALPHA, CULLFACE_NONE, Color, Entity, Mesh, MeshInstance, StandardMaterial, Vec3 } from 'playcanvas';
import { smooth } from './sprites.js';

const random = (a, b) => a + Math.random() * (b - a);
const MOTE_CORNERS = [[-1, 0], [0, 1.8], [1, 0], [0, -1.8]];

// Thin, curved filaments and little sunlit airborne seeds. A single dynamic
// mesh keeps the extra atmosphere to one draw call. Positions are anchored in
// the world, so the camera overtakes them instead of carrying a screen overlay.
export function createFlightAir(scene) {
  const root = new Entity('flight-air');
  root.enabled = false;
  scene.app.root.addChild(root);
  const material = new StandardMaterial();
  material.useLighting = material.useSkybox = material.useFog = false;
  material.diffuse = new Color(0, 0, 0);
  material.emissive = new Color(0.99, 0.99, 0.99);
  material.emissiveVertexColor = true;
  material.opacityVertexColor = true;
  material.opacityVertexColorChannel = 'a';
  material.blendType = BLEND_ADDITIVEALPHA;
  material.depthWrite = false;
  material.cull = CULLFACE_NONE;
  material.update();

  const ribbonCount = 14, moteCount = 64, segments = 10;
  const vertexCount = ribbonCount * (segments + 1) * 3 + moteCount * 5;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const indices = [];
  for (let i = 0; i < ribbonCount; i++) {
    const base = i * (segments + 1) * 3;
    for (let j = 0; j < segments; j++) {
      for (let k = 0; k < 2; k++) {
        const n = base + j * 3 + k;
        indices.push(n, n + 3, n + 1, n + 1, n + 3, n + 4);
      }
    }
  }
  const moteBase = ribbonCount * (segments + 1) * 3;
  for (let i = 0; i < moteCount; i++) {
    const n = moteBase + i * 5;
    indices.push(n, n + 1, n + 2, n, n + 2, n + 3, n, n + 3, n + 4, n, n + 4, n + 1);
  }
  const mesh = new Mesh(scene.app.graphicsDevice);
  mesh.setPositions(positions);
  mesh.setColors(colors);
  mesh.setIndices(indices);
  mesh.update();
  const instance = new MeshInstance(mesh, material);
  root.addComponent('render', { meshInstances: [instance], castShadows: false });
  const ribbons = Array.from({ length: ribbonCount }, () => ({ pos: new Vec3(), age: 0, length: 1, phase: 0, width: 1 }));
  const motes = Array.from({ length: moteCount }, () => ({ pos: new Vec3(), age: 0, size: 1, phase: 0 }));
  const tmp = new Vec3(), point = new Vec3(), side = new Vec3(), view = new Vec3();
  let time = 0, intensity = 0;

  function place(item, s, first, ribbon) {
    const ahead = first ? random(-5, 65) : random(45, 72);
    const angle = random(0, Math.PI * 2);
    const radius = ribbon ? random(3, 12) : random(2.5, 19);
    item.pos.set(s.pos.x + s.forward.x * ahead + s.left.x * Math.cos(angle) * radius,
      s.pos.y + Math.sin(angle) * radius * 0.65,
      s.pos.z + s.forward.z * ahead + s.left.z * Math.cos(angle) * radius);
    item.age = first ? 2 : 0;
    item.phase = random(0, Math.PI * 2);
    item.length = random(2.5, 7);
    item.width = random(0.012, 0.035);
    item.size = random(0.018, 0.052);
  }

  function vertex(index, x, y, z, alpha, warm = false) {
    const p = index * 3, c = index * 4;
    positions[p] = x;
    positions[p + 1] = y;
    positions[p + 2] = z;
    colors[c] = warm ? 1 : 0.78;
    colors[c + 1] = warm ? 0.82 : 0.87;
    colors[c + 2] = warm ? 0.49 : 1;
    colors[c + 3] = alpha;
  }

  return {
    reset(flight) {
      time = intensity = 0;
      root.enabled = true;
      ribbons.forEach(r => place(r, flight.state, true, true));
      motes.forEach(m => place(m, flight.state, true, false));
    },
    update(dt, flight, camera) {
      if (!root.enabled) return;
      const s = flight.state;
      time += dt;
      const speed = smooth(0, 12, Math.abs(s.speed));
      const energy = speed * (0.6 + s.pocket * 1.8 + Math.abs(s.bankDeg) / flight.options.maxBankDeg * 0.35);
      intensity += (energy - intensity) * (1 - Math.exp(-dt * 3));
      const cam = camera.getPosition(), right = camera.right, up = camera.up;
      let n = 0;
      for (const r of ribbons) {
        tmp.copy(r.pos).sub(cam);
        if (tmp.dot(camera.forward) < -r.length - 4 || tmp.lengthSq() > 95 * 95) place(r, s, false, true);
        r.age += dt;
        r.pos.x += s.gust.x * dt * 0.12;
        r.pos.y += s.gust.y * dt * 0.1;
        const distance = tmp.copy(r.pos).sub(cam).length();
        const fade = smooth(0, 1, r.age) * smooth(1, 5, distance) * smooth(80, 40, distance);
        for (let j = 0; j <= segments; j++) {
          const t = j / segments;
          const curl = Math.sin(t * 4 + r.phase + time * 0.8) * (0.12 + s.pocket * 0.35);
          point.set(r.pos.x + s.forward.x * t * r.length + s.left.x * curl,
            r.pos.y + Math.cos(t * 3 + r.phase + time * 0.7) * (0.1 + s.pocket * 0.22),
            r.pos.z + s.forward.z * t * r.length + s.left.z * curl);
          view.copy(cam).sub(point);
          side.cross(s.forward, view).normalize().mulScalar(r.width * (0.8 + intensity * 0.6));
          const alpha = Math.sin(t * Math.PI) ** 2 * fade * intensity * 0.2;
          vertex(n++, point.x - side.x, point.y - side.y, point.z - side.z, 0);
          vertex(n++, point.x, point.y, point.z, alpha);
          vertex(n++, point.x + side.x, point.y + side.y, point.z + side.z, 0);
        }
      }
      for (const m of motes) {
        tmp.copy(m.pos).sub(cam);
        if (tmp.dot(camera.forward) < -4 || tmp.lengthSq() > 85 * 85) place(m, s, false, false);
        m.age += dt;
        m.pos.x += (s.gust.x * 0.16 + Math.sin(time + m.phase) * 0.1) * dt;
        m.pos.y += (s.gust.y * 0.12 + Math.cos(time * 1.3 + m.phase) * 0.12) * dt;
        const distance = tmp.copy(m.pos).sub(cam).length();
        const alpha = (0.24 + intensity * 0.25) * smooth(0, 0.8, m.age) * smooth(0.7, 4, distance) * smooth(65, 35, distance);
        vertex(n++, m.pos.x, m.pos.y, m.pos.z, alpha, true);
        for (const [x, y] of MOTE_CORNERS) {
          vertex(n++, m.pos.x + (right.x * x + up.x * y) * m.size,
            m.pos.y + (right.y * x + up.y * y) * m.size,
            m.pos.z + (right.z * x + up.z * y) * m.size, 0, true);
        }
      }
      mesh.setPositions(positions);
      mesh.setColors(colors);
      mesh.update();
    },
    get enabled() { return root.enabled; },
    set enabled(v) { root.enabled = v; },
    stats() { return { ribbons: ribbonCount, motes: moteCount, intensity }; },
  };
}
