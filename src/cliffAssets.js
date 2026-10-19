import { assetUrl } from './assetUrl.js';
import {
  ADDRESS_REPEAT, Asset, CULLFACE_NONE, Color, Entity, Mesh, MeshInstance,
  SHADERLANGUAGE_GLSL, SHADERLANGUAGE_WGSL, ShaderChunks, StandardMaterial,
} from 'playcanvas';

export const CLIFF_ASSET_ROOT = assetUrl('flight/cliffs/');

export function createCliffMaterial(device, texture, cutout = false, grassTexture = null) {
  const material = new StandardMaterial();
  material.useLighting = material.useSkybox = material.useFog = false;
  material.diffuse = new Color(0, 0, 0);
  material.emissive = new Color(.99, .99, .99);
  material.emissiveMap = texture;
  material.emissiveVertexColor = true;
  if (cutout) {
    material.opacityMap = texture;
    material.opacityMapChannel = 'a';
    material.alphaTest = .35;
  }
  material.cull = CULLFACE_NONE;
  // Opaque depth is important: a cloud behind the wall must stay behind it.
  material.depthWrite = true;
  for (const language of [SHADERLANGUAGE_GLSL, SHADERLANGUAGE_WGSL]) {
    const wgsl = language === SHADERLANGUAGE_WGSL;
    const source = ShaderChunks.get(device, language).get('emissivePS');
    let declaration = wgsl ? 'uniform cliff_haze: f32;\n' : 'uniform float cliff_haze;\n';
    let grassBlend = '';
    if (grassTexture) {
      declaration += wgsl
        ? 'var cliff_grass: texture_2d<f32>;\nvar cliff_grassSampler: sampler;\n'
        : 'uniform sampler2D cliff_grass;\n';
      grassBlend = wgsl ? `
        let meadow = decodeGamma(textureSampleBias(cliff_grass, cliff_grassSampler, {STD_EMISSIVE_TEXTURE_UV} * 2.4, uniform.textureBias));
        let grassWeight = smoothstep(0.18, 0.82, vVertexColor.a + dot(meadow, vec3f(0.2126, 0.7152, 0.0722)) * 1.6 - 0.32);
        dEmission = mix(dEmission, meadow * vVertexColor.rgb * uniform.material_emissive, grassWeight);
      ` : `
        vec3 meadow = decodeGamma(texture2DBias(cliff_grass, {STD_EMISSIVE_TEXTURE_UV} * 2.4, textureBias));
        float grassWeight = smoothstep(0.18, 0.82, vVertexColor.a + dot(meadow, vec3(0.2126, 0.7152, 0.0722)) * 1.6 - 0.32);
        dEmission = mix(dEmission, meadow * vVertexColor.rgb * material_emissive, grassWeight);
      `;
    }
    const blend = wgsl
      ? 'dEmission = mix(dEmission, vec3f(0.34, 0.35, 0.40), uniform.cliff_haze);'
      : 'dEmission = mix(dEmission, vec3(0.34, 0.35, 0.40), cliff_haze);';
    material.getShaderChunks(language).set('emissivePS', declaration + source.replace(/}\s*$/, `${grassBlend}\n${blend}\n}\n`));
  }
  material.setParameter('cliff_haze', .08);
  if (grassTexture) material.setParameter('cliff_grass', grassTexture);
  material.update();
  return material;
}

export function createCliffMesh(device, data) {
  const mesh = new Mesh(device);
  mesh.setPositions(data.positions);
  mesh.setNormals(data.normals);
  mesh.setUvs(0, data.uvs);
  mesh.setColors(data.colors);
  mesh.update();
  return mesh;
}

export async function loadCliffAssets(scene) {
  const loadTexture = filename => new Promise((resolve, reject) => {
    const asset = new Asset(filename, 'texture', { url: `${CLIFF_ASSET_ROOT}${filename}` });
    asset.ready(() => {
      asset.resource.anisotropy = Math.min(4, scene.app.graphicsDevice.maxAnisotropy);
      if (filename === 'painted-grass.png') {
        asset.resource.addressU = asset.resource.addressV = ADDRESS_REPEAT;
      }
      resolve(asset.resource);
    });
    asset.once('error', reject);
    scene.app.assets.add(asset);
    scene.app.assets.load(asset);
  });
  const [texture, foliageTexture, ivyTexture, grassTexture, data] = await Promise.all([
    loadTexture('painted-stone.png'),
    loadTexture('painted-foliage.png'),
    loadTexture('painted-ivy.png'),
    loadTexture('painted-grass.png'),
    fetch(`${CLIFF_ASSET_ROOT}cliffs.mesh.json`).then(response => {
      if (!response.ok) throw new Error(`Cliff geometry: HTTP ${response.status}`);
      return response.json();
    }),
  ]);
  const material = createCliffMaterial(scene.app.graphicsDevice, texture);
  const terrainMaterial = createCliffMaterial(scene.app.graphicsDevice, texture, false, grassTexture);
  const greeneryMaterial = createCliffMaterial(scene.app.graphicsDevice, null);
  const foliageMaterial = createCliffMaterial(scene.app.graphicsDevice, foliageTexture, true);
  const ivyMaterial = createCliffMaterial(scene.app.graphicsDevice, ivyTexture, true);
  const variants = data.variants.map(variant => ({
    ...variant, mesh: createCliffMesh(scene.app.graphicsDevice, variant),
    greeneryMesh: createCliffMesh(scene.app.graphicsDevice, variant.greenery),
    detailsMesh: createCliffMesh(scene.app.graphicsDevice, variant.details),
    foliageMesh: createCliffMesh(scene.app.graphicsDevice, variant.foliage),
    ivyMesh: createCliffMesh(scene.app.graphicsDevice, variant.ivy),
    fragmentsMesh: variant.fragments ? createCliffMesh(scene.app.graphicsDevice, variant.fragments) : null,
  }));
  return {
    variants,
    instantiate(index, parent = scene.app.root) {
      const variant = variants[index];
      const entity = new Entity(variant.id);
      const instance = new MeshInstance(variant.mesh, terrainMaterial);
      const greeneryInstance = new MeshInstance(variant.greeneryMesh, greeneryMaterial);
      const instances = [instance, new MeshInstance(variant.detailsMesh, material),
        greeneryInstance, new MeshInstance(variant.foliageMesh, foliageMaterial),
        new MeshInstance(variant.ivyMesh, ivyMaterial)];
      if (variant.fragmentsMesh) instances.push(new MeshInstance(variant.fragmentsMesh, terrainMaterial));
      entity.addComponent('render', { meshInstances: instances, castShadows: false, receiveShadows: false });
      parent.addChild(entity);
      return { entity, instance, instances, variant };
    },
  };
}
