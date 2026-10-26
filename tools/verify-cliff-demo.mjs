import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AppBase, AppOptions, NullGraphicsDevice, RenderComponentSystem, CameraComponentSystem, Entity, MeshInstance, Texture, Vec3 } from 'playcanvas';
import { createCliffMaterial, createCliffMesh } from '../src/cliffAssets.js';
import { createWindFx } from '../src/windFx.js';
import { createFlight } from '../src/flight.js';

// Only the browser canvas transport is stubbed. The game's cloud generator
// fills real pixel arrays; its meshes/materials run on PlayCanvas's null device.
const paintedClouds = [];
class TestCanvas {
  width = 128; height = 128;
  getContext() {
    return {
      createImageData: (w,h) => ({ width:w, height:h, data:new Uint8ClampedArray(w*h*4) }),
      putImageData: image => paintedClouds.push(image),
      createLinearGradient: () => ({ addColorStop() {} }), fillRect() {},
    };
  }
}
globalThis.HTMLCanvasElement = TestCanvas;
globalThis.HTMLVideoElement = class {};
globalThis.document = { createElement: () => new TestCanvas() };
const canvas = { id: 'cliff-check', width: 1280, height: 720 };
const app = new AppBase(canvas);
const options = new AppOptions();
options.graphicsDevice = new NullGraphicsDevice(canvas);
options.componentSystems = [RenderComponentSystem, CameraComponentSystem];
app.init(options);
const device = app.graphicsDevice;
const data = JSON.parse(await readFile(new URL('../public/assets/flight/cliffs/cliffs.mesh.json', import.meta.url)));
const ivyPng = await readFile(new URL('../art/flight-cliffs/painted-ivy.png', import.meta.url));
const ivyAspect = ivyPng.readUInt32BE(16) / ivyPng.readUInt32BE(20);
assert.ok(ivyAspect < .4, 'dedicated ivy is a tall texture');
assert.equal(data.source, 'Blender');
assert.deepEqual(data.variants.map(v=>v.id), ['tall-spire','chunk','arch','slab']);
const texture = new Texture(device, { width: 1254, height: 1254 });
const mat = createCliffMaterial(device, texture);
const terrainMat = createCliffMaterial(device,texture,false,texture);
assert.equal(terrainMat.opacityVertexColor,false,'grass weights do not make the rock transparent');
const foliageMat = createCliffMaterial(device, texture, true);
assert.equal(foliageMat.opacityMap, texture, 'foliage uses the generated alpha cutouts');
assert.equal(foliageMat.alphaTest, .35);
assert.equal(foliageMat.depthWrite, true, 'cutout leaves correctly occlude rear clouds');
assert.equal(mat.useLighting, false, 'stone uses painted, baked illumination');
assert.equal(mat.depthWrite, true, 'rear clouds must be occluded by the cliff');
assert.equal(mat.opacityMap, null, 'stone contains no painted cloud transparency');
for (const variant of data.variants) {
  const parts = [variant, variant.details, variant.greenery, variant.foliage, variant.ivy, variant.fragments].filter(Boolean);
  assert.ok(parts.reduce((sum,part)=>sum+part.triangles,0) <= 2500, 'simplified dressed cliff stays within its geometry budget');
  assert.ok(variant.triangles<=450, 'broad cliff faces replace the dense ribbed shell');
  assert.ok(variant.bounds[1][1] - variant.bounds[0][1] >= 18, 'cliff is substantial at close range');
  for (const values of [variant.positions, variant.normals, variant.uvs, variant.colors]) assert.ok(values.every(Number.isFinite));
  assert.equal(variant.positions.length, variant.triangles * 9);
  assert.equal(variant.normals.length, variant.positions.length);
  assert.equal(variant.colors.length, variant.triangles * 12);
  // Independently traverse the exported triangle positions: overlapping but
  // disconnected block meshes would fail this check even if they look close.
  const points = new Map(), neighbors = [], ids = [];
  for (let i = 0; i < variant.positions.length; i += 3) {
    const key = variant.positions.slice(i, i + 3).join(',');
    if (!points.has(key)) { points.set(key, points.size); neighbors.push(new Set()); }
    ids.push(points.get(key));
  }
  for (let i = 0; i < ids.length; i += 3) for (let j = 0; j < 3; j++) {
    const a = ids[i + j], b = ids[i + (j + 1) % 3];
    neighbors[a].add(b); neighbors[b].add(a);
  }
  const visited = new Set([0]), queue = [0];
  while (queue.length) for (const neighbor of neighbors[queue.pop()]) {
    if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
  }
  assert.equal(visited.size, points.size, 'each rock formation is a single connected surface');
  // The lower quarter must be much narrower than the broad shoulders.
  const lower=[], upper=[];
  const minY=variant.bounds[0][1], maxY=variant.bounds[1][1], height=maxY-minY;
  for(let i=0;i<variant.positions.length;i+=3) {
    const [x,y]=variant.positions.slice(i,i+3);
    if(y<minY+height*.25) lower.push(x);
    if(y>minY+height*.70) upper.push(x);
  }
  if(variant.id!=='arch') assert.ok(Math.max(...lower)-Math.min(...lower)<(Math.max(...upper)-Math.min(...upper))*.70, 'rock tapers to an uneven narrow base');
  assert.equal(variant.trees,1);
  const grassWeights=variant.colors.filter((_,i)=>i%4===3);
  assert.ok(grassWeights.some(w=>w===0)&&grassWeights.some(w=>w===1)&&grassWeights.some(w=>w>.1&&w<.9), 'terrain exports stone, meadow and soft transition weights');
  assert.ok(variant.vines>=8, 'ivy remains distributed around the perimeter');
  assert.ok(variant.details.bounds[1][1]>maxY+.2, 'ruined architecture rises above the terrace');
  assert.ok(variant.ivy.bounds[0][1]<maxY-15, 'ivy trails down the face, not just the summit');
  assert.equal(variant.ivy.triangles,variant.vines*2,'every vine uses one simple quad');
  for(let start=0;start<variant.ivy.positions.length/3;start+=6) {
    const corners=new Map();
    for(let i=start;i<start+6;i++) corners.set(variant.ivy.uvs.slice(i*2,i*2+2).join(','),variant.ivy.positions.slice(i*3,i*3+3));
    assert.equal(corners.size,4,'each ivy quad uses the whole texture once');
    const a=corners.get('0,0'), b=corners.get('1,0'), c=corners.get('0,1');
    const width=Math.hypot(...a.map((n,i)=>n-b[i])), height=Math.hypot(...a.map((n,i)=>n-c[i]));
    assert.ok(Math.abs(width/height-ivyAspect)<.00001,'ivy leaf proportions are preserved');
  }
  for(const part of parts) {
    for(const values of [part.positions,part.normals,part.uvs,part.colors]) assert.ok(values.every(Number.isFinite));
    assert.equal(part.positions.length,part.triangles*9);
    assert.equal(part.uvs.length,part.triangles*6);
    assert.equal(part.colors.length,part.triangles*12);
  }
  const entity = new Entity(variant.id);
  const colorMat=createCliffMaterial(device,null);
  entity.addComponent('render', { meshInstances: parts.map((part,i)=>new MeshInstance(createCliffMesh(device,part),[terrainMat,mat,colorMat,foliageMat,foliageMat,terrainMat][i])) });
  app.root.addChild(entity);
  const glb = await readFile(new URL(`../art/flight-cliffs/${variant.id}.glb`, import.meta.url));
  const gltf = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)));
  for(const material of gltf.materials) assert.ok(material.extensions.KHR_materials_unlit);
  assert.ok(gltf.materials.filter(m=>m.pbrMetallicRoughness.baseColorTexture).length>=4, 'portable terrain includes baked grass/stone blend');
  for (const mesh of gltf.meshes) for (const primitive of mesh.primitives) {
    const material=gltf.materials[primitive.material];
    if(material.name.includes('portable-terrain')) {
      assert.equal(material.pbrMetallicRoughness.baseColorTexture.texCoord,1,'baked terrain uses its portable UV layout');
      assert.ok('TEXCOORD_1' in primitive.attributes);
    }
  }
  assert.ok(gltf.materials.some(m=>m.alphaMode==='BLEND'||m.alphaMode==='MASK'), 'portable foliage retains alpha');
  for (const m of gltf.meshes) assert.ok('COLOR_0' in m.primitives[0].attributes, 'portable GLB retains painted shading');
}
// Verify the defining silhouettes independently of their labels.
const byId=Object.fromEntries(data.variants.map(v=>[v.id,v]));
const size=v=>v.bounds[1].map((n,i)=>n-v.bounds[0][i]);
assert.ok(size(byId['tall-spire'])[1]/size(byId['tall-spire'])[0]>2);
assert.ok(size(byId.slab)[0]/size(byId.slab)[1]>1.6);
assert.ok(size(byId.chunk)[0]>26);
function hits(mesh,x,y) {
  const p=mesh.positions, origin=new Vec3(x,y,-100), direction=new Vec3(0,0,1);
  for(let i=0;i<p.length;i+=9) {
    const a=new Vec3(...p.slice(i,i+3)),b=new Vec3(...p.slice(i+3,i+6)),c=new Vec3(...p.slice(i+6,i+9));
    const e1=b.clone().sub(a),e2=c.clone().sub(a),h=new Vec3().cross(direction,e2),det=e1.dot(h);
    if(Math.abs(det)<1e-7) continue;
    const s=origin.clone().sub(a),u=s.dot(h)/det;
    if(u<0||u>1) continue;
    const q=new Vec3().cross(s,e1),v=direction.dot(q)/det;
    if(v<0||u+v>1) continue;
    if(e2.dot(q)/det>0) return true;
  }
  return false;
}
assert.equal(hits(byId.arch,0,0),false,'arch opening is genuinely empty through its depth');
assert.equal(hits(byId.arch,0,11),true,'arch has a connecting stone bridge');
assert.equal(hits(byId.arch,-13,-7),true,'arch has a left leg');
assert.equal(hits(byId.arch,13,-7),true,'arch has a right leg');

const camera = new Entity('camera');
camera.addComponent('camera');
app.root.addChild(camera);
camera.setPosition(7,2,55);
camera.lookAt(-18,0,0);
const flight = createFlight({ headingDeg: 180 });
flight.reset({ x:7, y:2, z:55 }, 180);
const wind = createWindFx({app}, { clouds:8, spritesPerCloud:16, streaks:0, cloudAhead:240 });
wind.enabled = true;
wind.reset(flight,camera);
for (let i=0; i<8; i++) wind.anchorCloud(i,new Vec3(-18,-15+i*4,0),10);
assert.equal(paintedClouds.length,3, 'shroud uses all three original in-game puff variants');
assert.ok(paintedClouds[0].data.some((v,i) => i%4===3 && v>128));
assert.equal(paintedClouds[0].data[3],0, 'original soft cloud edges remain transparent');
const instances = app.root.findComponents('render').flatMap(r=>r.meshInstances);
const originalBuffers = instances.map(i=>i.mesh.vertexBuffer);
const puff = app.root.findByName('cloud-0-0');
const before = puff.getPosition().clone();
for(let frame=0;frame<7200;frame++) {
  // Repeatedly fly well past the cliffs. Anchored banks must not recycle.
  flight.state.pos.z = 55-frame*.2;
  camera.setPosition(7,2,flight.state.pos.z);
  camera.lookAt(7,2,flight.state.pos.z-10);
  wind.update(1/60,flight,camera);
}
assert.ok(puff.getPosition().distance(before)<2, 'shroud stays attached after two minutes of travel');
assert.deepEqual(instances.map(i=>i.mesh.vertexBuffer),originalBuffers, 'cloud buffers remain pooled');
wind.reset(flight,camera);
assert.ok(puff.getPosition().distance(before)>100, 'normal reset releases the optional scenery anchors');
assert.throws(()=>wind.anchorCloud(99,new Vec3(),10), RangeError);
camera.setPosition(7,2,55);
camera.lookAt(-18,0,0);
app.render();
assert.ok(terrainMat.variants.size>0,'terrain GLSL shader is generated during render submission');
for(const shader of terrainMat.variants.values()) { assert.ok(!shader.failed); assert.ok(shader.definition.fshader.includes('grassWeight')); assert.ok(!shader.definition.fshader.includes('{STD_')); }
// Exercise the native WGSL source path too. Null device validates generation
// and preprocessing, not GPU compilation or final pixel output.
const {getProgramLibrary}=await import('../node_modules/playcanvas/build/playcanvas/src/scene/shader-lib/get-program-library.js');
getProgramLibrary(device).clearCache();
getProgramLibrary(device).definitionsCache.clear();
device.isWebGPU=true;
try {
  const wgslMat=createCliffMaterial(device,texture,false,texture);
  const wgslMesh=createCliffMesh(device,data.variants[0]);
  const instance=new MeshInstance(wgslMesh,wgslMat);
  const shader=instance.getShaderInstance(0,0,app.scene,camera.camera.camera.shaderParams,null,null,[[],[],[]]).shader;
  assert.equal(shader.definition.shaderLanguage,'wgsl');
  assert.ok(!shader.failed && shader.definition.fshader.includes('fn getEmission'));
  assert.ok(shader.definition.fshader.includes('grassWeight')&&!shader.definition.fshader.includes('{STD_'));
} finally { device.isWebGPU=false; }
console.log(JSON.stringify({passed:true,variants:data.variants.map(v=>({name:v.name,triangles:[v,v.details,v.greenery,v.foliage,v.ivy,v.fragments].filter(Boolean).reduce((sum,p)=>sum+p.triangles,0),trees:v.trees,vines:v.vines})),cloudSprites:128,simulatedSeconds:120,gpuVisualCheck:false},null,2));
