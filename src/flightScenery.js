import {
  Asset, BLEND_NORMAL, CULLFACE_NONE, Color, Entity, Mesh, MeshInstance,
  SHADERLANGUAGE_GLSL, SHADERLANGUAGE_WGSL, ShaderChunks, StandardMaterial, Vec3,
} from 'playcanvas';
import { createQuad, smooth } from './sprites.js';

// Local, world-fixed scenery: the sky capture follows the flyer, these don't.
// Everything is pooled, and only recycled well behind the camera. Keep this
// separate from the island cinematic and its environment/lighting controls.
export const SCENERY_DEFAULTS = {
  islands: 12,
  spacing: 26,
  ahead: 310,
  birdsPerFlock: 7,
  flocks: 3,
};

const random = (a, b) => a + Math.random() * (b - a);
function advance(point, axis, distance) {
  point.x += axis.x * distance;
  point.y += axis.y * distance;
  point.z += axis.z * distance;
  return point;
}

function material(device) {
  const m = new StandardMaterial();
  m.useLighting = m.useSkybox = m.useFog = false;
  m.diffuse = new Color(0, 0, 0);
  m.emissive = new Color(0.99, 0.99, 0.99);
  m.emissiveVertexColor = true;
  m.cull = CULLFACE_NONE;
  m.blendType = BLEND_NORMAL;
  m.depthWrite = true;
  // Haze belongs to these objects only. Blend in linear colour after the
  // painted albedo is sampled; multiplication alone would leave black cracks
  // and dark shrubs looking pasted onto the soft photographic environment.
  for (const language of [SHADERLANGUAGE_GLSL, SHADERLANGUAGE_WGSL]) {
    const source = ShaderChunks.get(device, language).get('emissivePS');
    const wgsl = language === SHADERLANGUAGE_WGSL;
    const declaration = wgsl ? 'uniform flight_haze: f32;\n' : 'uniform float flight_haze;\n';
    const blend = wgsl
      ? 'dEmission = mix(dEmission, vec3f(0.57, 0.54, 0.66), uniform.flight_haze);'
      : 'dEmission = mix(dEmission, vec3(0.57, 0.54, 0.66), flight_haze);';
    m.getShaderChunks(language).set('emissivePS', declaration + source.replace(/}\s*$/, `${blend}\n}\n`));
  }
  m.setParameter('flight_haze', 0.15);
  m.update();
  return m;
}

// Hand-authored atlas frames include transparent gutters and all soft mist.
// The generated paintings vary in width; preserve each frame's aspect ratio.
export const ISLAND_ART = {
  url: '/assets/flight/painted-islands-atlas.png',
  width: 1254,
  height: 1254,
  frames: [
    { name: 'pine-arch', x: 150, y: 16, width: 400, height: 615 },
    { name: 'temple-pinnacle', x: 706, y: 16, width: 480, height: 615 },
    { name: 'waterfall-gateway', x: 70, y: 639, width: 670, height: 615 },
    { name: 'quiet-shrine', x: 770, y: 639, width: 390, height: 615 },
  ],
};

function paintedPlane(device, frame) {
  const mesh = createQuad(device);
  const u0 = frame.x / ISLAND_ART.width, u1 = (frame.x + frame.width) / ISLAND_ART.width;
  const v0 = 1 - (frame.y + frame.height) / ISLAND_ART.height, v1 = 1 - frame.y / ISLAND_ART.height;
  mesh.setUvs(0, [u0, v0, u1, v0, u1, v1, u0, v1]);
  mesh.update();
  return mesh;
}

function render(parent, name, mesh, mat) {
  const entity = new Entity(name);
  const instance = new MeshInstance(mesh, mat);
  entity.addComponent('render', { meshInstances: [instance], castShadows: false, receiveShadows: false });
  parent.addChild(entity);
  return { entity, instance };
}

export function createFlightScenery(scene, options = {}) {
  const o = { ...SCENERY_DEFAULTS, ...options };
  const { app } = scene, device = app.graphicsDevice;
  const root = new Entity('flight-scenery');
  root.enabled = false;
  app.root.addChild(root);
  const painted = material(device), birdMaterial = material(device);
  // The illustration supplies all modelling and light. Alpha blends its
  // brushwork and mist without the rectangle writing into the depth buffer.
  painted.emissiveVertexColor = false;
  painted.depthWrite = false;
  painted.opacityMapChannel = 'a';
  painted.update();
  const asset = new Asset('flight-painted-islands', 'texture', { url: ISLAND_ART.url });
  asset.ready(() => {
    asset.resource.anisotropy = Math.min(2, device.maxAnisotropy);
    painted.emissiveMap = asset.resource;
    painted.opacityMap = asset.resource;
    painted.update();
  });
  asset.on('error', (err) => console.warn('Painted flight islands unavailable; hiding cutouts.', err));
  app.assets.add(asset);
  app.assets.load(asset);

  const planes = ISLAND_ART.frames.map(frame => paintedPlane(device, frame));
  const islands = Array.from({ length: o.islands }, (_, i) => {
    const variant = i % planes.length;
    const part = render(root, `painted-island-${i}`, planes[variant], painted);
    part.entity.enabled = false;
    part.instance.setParameter('material_opacity', 0);
    return { ...part, frame: ISLAND_ART.frames[variant], age: 0, along: 0, radius: 0 };
  });

  const flocks = Array.from({ length: o.flocks }, (_, index) => {
    const mesh = new Mesh(device);
    // Four triangles per bird: two tapered wings, body and forked tail.
    const positions = new Float32Array(o.birdsPerFlock * 36);
    const colors = new Float32Array(o.birdsPerFlock * 48);
    for (let i = 0; i < colors.length; i += 4) colors.set([0.24, 0.26, 0.32, 1], i);
    mesh.setPositions(positions);
    mesh.setColors(colors);
    mesh.update();
    return { ...render(root, `distant-birds-${index}`, mesh, birdMaterial), mesh, positions, center: new Vec3(), age: 0, direction: 1, phase: index * 2.3 };
  });
  const tmp = new Vec3();
  let cursor = 0, sequence = 0, time = 0, recycled = 0;

  function placeIsland(island, s, along, first = false) {
    const sign = sequence++ % 2 ? -1 : 1;
    const near = sequence % 3 !== 0;
    const height = near ? random(8, 12) : random(12, 17);
    const side = sign * (near ? random(13, 21) : random(29, 46));
    island.entity.setPosition(s.pos.x + s.forward.x * (along - s.pos.dot(s.forward)) + s.left.x * side,
      s.altitude + (sequence % 4 === 0 ? random(5, 10) : random(-6, -3)),
      s.pos.z + s.forward.z * (along - s.pos.dot(s.forward)) + s.left.z * side);
    island.entity.setLocalScale(height * island.frame.width / island.frame.height, height, 1);
    island.along = along;
    island.radius = height * 0.6;
    island.age = first ? 5 : 0;
  }

  function placeFlock(flock, s, index) {
    flock.direction = index % 2 ? -1 : 1;
    const ahead = 58 + index * 33;
    advance(advance(flock.center.copy(s.pos), s.forward, ahead), s.left, -flock.direction * random(18, 35));
    flock.center.y = s.altitude + random(8, 19);
    flock.age = 0;
  }

  function updateBirds(dt, s) {
    for (const flock of flocks) {
      flock.age += dt;
      advance(advance(flock.center, s.left, flock.direction * dt * 3.1), s.forward, dt * 1.7);
      if (tmp.copy(flock.center).sub(s.pos).dot(s.forward) < -18) placeFlock(flock, s, 1 + flocks.indexOf(flock));
      flock.entity.setPosition(flock.center);
      flock.entity.setEulerAngles(0, s.headingDeg + flock.direction * 61, 0);
      let n = 0;
      for (let i = 0; i < o.birdsPerFlock; i++) {
        const row = Math.ceil(i / 2), side = i % 2 ? -1 : 1;
        const x = row * side * 1.7, y = Math.sin(time * 0.7 + i) * 0.35, z = -row * 1.55;
        const phase = time * 4.5 + i * 0.8 + flock.phase;
        // A few strokes, then a long banked glide; never synchronized.
        const stroke = smooth(-0.15, 0.45, Math.sin(time * 0.65 + i * 0.42 + flock.phase));
        const wing = 0.12 + Math.sin(phase) * 0.46 * stroke;
        const points = [
          [0, 0, 0.28], [-0.95, wing, -0.1], [-0.26, 0.02, -0.18],
          [0, 0, 0.28], [0.26, 0.02, -0.18], [0.95, wing, -0.1],
          [-0.08, 0, -0.28], [0, 0.07, 0.39], [0.08, 0, -0.28],
          [-0.18, 0.03, -0.48], [0, 0, -0.14], [0.18, 0.03, -0.48],
        ];
        for (const p of points) {
          flock.positions[n++] = x + p[0] * 0.7;
          flock.positions[n++] = y + p[1] * 0.7;
          flock.positions[n++] = z + p[2] * 0.7;
        }
      }
      flock.mesh.setPositions(flock.positions);
      flock.mesh.update();
      const distance = tmp.copy(flock.center).sub(s.pos).length();
      flock.instance.setParameter('material_opacity', 0.68 * smooth(0, 3, flock.age) * smooth(175, 125, distance));
      flock.instance.setParameter('flight_haze', 0.18 + smooth(30, 160, distance) * 0.5);
    }
  }

  return {
    reset(flight) {
      const s = flight.state;
      root.enabled = true;
      sequence = recycled = time = 0;
      cursor = s.pos.dot(s.forward) + 34;
      for (const island of islands) {
        placeIsland(island, s, cursor, true);
        cursor += o.spacing;
      }
      flocks.forEach((flock, i) => placeFlock(flock, s, i));
    },
    update(dt, flight, camera) {
      if (!root.enabled) return;
      time += dt;
      const s = flight.state, along = s.pos.dot(s.forward);
      for (const island of islands) {
        if (island.along < along - island.radius - 18) {
          cursor = Math.max(cursor, along + o.ahead - o.spacing);
          placeIsland(island, s, cursor);
          cursor += o.spacing;
          recycled++;
        }
        island.age += dt;
        const pos = island.entity.getPosition(), cam = camera.getPosition();
        const distance = tmp.copy(pos).sub(cam).length();
        // Turn only around world-up: banked cameras must not tilt the ruins.
        // +Z is the painted front, while lookAt points -Z toward its target.
        island.entity.lookAt(cam.x, pos.y, cam.z);
        island.entity.rotateLocal(0, 180, 0);
        // A close approach dissolves into mist before a painting fills the
        // lens. At the normal fly-by spacing the silhouette stays solid.
        const alpha = smooth(o.ahead + 25, o.ahead - 45, distance) * smooth(0, 3, island.age)
          * smooth(4, 11, distance);
        island.entity.enabled = !!asset.resource && alpha > 0.005;
        island.instance.setParameter('material_opacity', alpha);
        island.instance.setParameter('flight_haze', 0.08 + smooth(20, 240, distance) * 0.64);
      }
      updateBirds(dt, s);
    },
    get enabled() { return root.enabled; },
    set enabled(v) { root.enabled = v; },
    stats() {
      return { islands: islands.length, visibleIslands: islands.filter(i => i.entity.enabled).length,
        birds: flocks.length * o.birdsPerFlock, recycled, textureReady: !!asset.resource,
        paintedVariants: planes.length, islandTriangles: islands.length * 2 };
    },
  };
}
