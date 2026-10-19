import {
  BLEND_ADDITIVEALPHA,
  BLEND_NORMAL,
  CULLFACE_NONE,
  Color,
  Entity,
  Mesh,
  MeshInstance,
  PIXELFORMAT_RGBA8,
  StandardMaterial,
  Texture,
} from 'playcanvas';

// Camera-facing sprites shared by the effects: a unit quad, textures drawn
// on a 2D canvas, and an unlit material whose tint (`material_emissive`) and
// opacity (`material_opacity`) each sprite overrides.

// A unit quad in the XY plane, facing +Z.
export function createQuad(device) {
  const mesh = new Mesh(device);
  mesh.setPositions([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
  mesh.setNormals([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  mesh.setUvs(0, [0, 0, 1, 0, 1, 1, 0, 1]);
  mesh.setIndices([0, 1, 2, 0, 2, 3]);
  mesh.update();
  return mesh;
}

export function canvasTexture(device, width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new Texture(device, { width, height, format: PIXELFORMAT_RGBA8, mipmaps: true });
  texture.setSource(canvas);
  return texture;
}

// `additive` for things that glow: they brighten what is behind them and
// never darken it.
export function spriteMaterial(texture, { additive = false } = {}) {
  const material = new StandardMaterial();
  material.useLighting = false;
  material.useSkybox = false;
  material.useFog = false;
  material.diffuse = new Color(0, 0, 0);
  // Not pure white, so the shader keeps the emissive tint that each sprite
  // overrides through `material_emissive`.
  material.emissive = new Color(0.99, 0.99, 0.99);
  material.emissiveMap = texture;
  material.opacityMap = texture;
  material.opacityMapChannel = 'a';
  material.blendType = additive ? BLEND_ADDITIVEALPHA : BLEND_NORMAL;
  material.depthWrite = false;
  material.cull = CULLFACE_NONE;
  material.update();
  return material;
}

export function makeSprite(parent, quad, material, name) {
  const meshInstance = new MeshInstance(quad, material);
  const entity = new Entity(name);
  entity.addComponent('render', { meshInstances: [meshInstance], castShadows: false });
  parent.addChild(entity);
  meshInstance.setParameter('material_opacity', 0);
  meshInstance.visible = false;
  return { entity, meshInstance, opacity: 0 };
}

export function setOpacity(sprite, value) {
  // Zero-alpha quads still cost culling, sorting and draw submission unless
  // explicitly hidden. Keep entities alive so simulation and fades continue.
  if (sprite.opacity === value) return;
  sprite.opacity = value;
  sprite.meshInstance.visible = value > 0;
  sprite.meshInstance.setParameter('material_opacity', value);
}

export function setTint(sprite, rgb) {
  sprite.meshInstance.setParameter('material_emissive', rgb);
}

// A round soft glow: `core` of the radius at full strength, falling off
// with `falloff` (higher is tighter) to nothing at the edge.
export function drawGlow(ctx, w, h, { core = 0.08, falloff = 2.2 } = {}) {
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = Math.hypot((x + 0.5) / w - 0.5, (y + 0.5) / h - 0.5) * 2;
      const a = r < core ? 1 : Math.max(1 - (r - core) / (1 - core), 0) ** falloff;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function smooth(edge0, edge1, x) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}
