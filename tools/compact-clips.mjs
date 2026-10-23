// Shrink animation clips for shipping: drop everything the engine's clip
// decoder never reads (meshes, materials, skin bind matrices), and store
// float rotations as normalized 16-bit, as the other shipped clips already
// do. Translations stay float. Each clip is decoded before and after with
// the engine's own parser, and the result is only written if every bone
// stays within tolerance on every frame.
// node tools/compact-clips.mjs public/assets/anims/wake.glb [...]
import fs from 'node:fs';
import { Animation } from '@viggle/splat-engine';

const FLOAT = 5126, SHORT = 5122;
const DIMS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES = { [FLOAT]: 4, [SHORT]: 2, 5121: 1, 5123: 2, 5125: 4, 5120: 1 };
// Worst allowed per-component change after decoding: 16-bit steps are 3e-5.
const TOLERANCE = 1e-4;

function readGlb(file) {
  const b = fs.readFileSync(file);
  const jsonLength = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLength));
  const binStart = 20 + jsonLength + 8;
  return { json, bin: b.subarray(binStart, binStart + b.readUInt32LE(20 + jsonLength)) };
}

function accessorFloats(json, bin, index) {
  const a = json.accessors[index], view = json.bufferViews[a.bufferView];
  const dim = DIMS[a.type], size = BYTES[a.componentType];
  const stride = view.byteStride || dim * size, start = (view.byteOffset || 0) + (a.byteOffset || 0);
  const out = new Float32Array(a.count * dim);
  for (let k = 0; k < a.count; k++) {
    for (let c = 0; c < dim; c++) {
      const at = start + k * stride + c * size;
      out[k * dim + c] = a.componentType === FLOAT ? bin.readFloatLE(at) : Math.max(bin.readInt16LE(at) / 32767, -1);
    }
  }
  return out;
}

function compact(file) {
  const { json, bin } = readGlb(file);
  const animation = json.animations[0];
  const chunks = [];
  let length = 0;
  const views = [], accessors = [], remap = new Map();
  function addAccessor(index, quantize) {
    const key = `${index}:${quantize}`;
    if (remap.has(key)) return remap.get(key);
    const a = json.accessors[index];
    const values = accessorFloats(json, bin, index);
    let data;
    if (quantize) {
      data = Buffer.alloc(values.length * 2);
      for (let i = 0; i < values.length; i++) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, values[i])) * 32767), i * 2);
    } else {
      data = Buffer.from(values.buffer, values.byteOffset, values.byteLength);
    }
    const pad = (4 - (length % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); length += pad; }
    views.push({ buffer: 0, byteOffset: length, byteLength: data.length });
    chunks.push(data);
    length += data.length;
    const out = { bufferView: views.length - 1, componentType: quantize ? SHORT : FLOAT, count: a.count, type: a.type };
    if (quantize) out.normalized = true;
    if (a.min && !quantize) out.min = a.min;
    if (a.max && !quantize) out.max = a.max;
    accessors.push(out);
    remap.set(key, accessors.length - 1);
    return accessors.length - 1;
  }
  const samplers = animation.samplers.map((s, i) => {
    const channel = animation.channels.find(c => c.sampler === i);
    const rotation = channel?.target.path === 'rotation';
    return { ...s, input: addAccessor(s.input, false), output: addAccessor(s.output, rotation) };
  });
  const nodes = json.nodes.map(({ mesh, ...node }) => node);
  const skins = (json.skins || []).map(({ inverseBindMatrices, ...skin }) => skin);
  const out = {
    asset: json.asset,
    ...(json.scene !== undefined && { scene: json.scene }),
    ...(json.scenes && { scenes: json.scenes }),
    nodes,
    ...(skins.length && { skins }),
    animations: [{ ...animation, samplers }],
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: length }],
  };
  return writeGlb(out, Buffer.concat(chunks, length));
}

function writeGlb(json, bin) {
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const body = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + text.length + 8 + body.length, 8);
  const chunk = (data, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(data.length, 0);
    h.writeUInt32LE(type, 4);
    return Buffer.concat([h, data]);
  };
  return Buffer.concat([header, chunk(text, 0x4e4f534a), chunk(body, 0x004e4942)]);
}

// The decoded clip's keyframes, as one flat list of numbers.
function decode(bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const animation = Animation.fromGlb(buffer);
  const values = [];
  const walk = (v) => {
    if (ArrayBuffer.isView(v)) values.push(...v);
    else if (v instanceof Map) [...v.keys()].sort().forEach((k) => walk(v.get(k)));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.keys(v).sort().forEach((k) => walk(v[k]));
    else if (typeof v === 'number') values.push(v);
  };
  walk(animation.skeletalStore.keyframes);
  return { values, frames: animation.numFrames, bones: animation.numBones };
}

for (const file of process.argv.slice(2)) {
  const before = fs.readFileSync(file);
  const after = compact(file);
  const a = decode(before), b = decode(after);
  if (a.frames !== b.frames || a.bones !== b.bones || a.values.length !== b.values.length) {
    throw new Error(`${file}: decoded shape changed (${a.frames}x${a.bones} -> ${b.frames}x${b.bones})`);
  }
  let worst = 0;
  for (let i = 0; i < a.values.length; i++) worst = Math.max(worst, Math.abs(a.values[i] - b.values[i]));
  if (!(worst <= TOLERANCE)) throw new Error(`${file}: decoded keyframes moved by ${worst}`);
  if (after.length >= before.length) {
    console.log(`${file}: already compact (${before.length} bytes), left as is`);
    continue;
  }
  fs.writeFileSync(file, after);
  console.log(`${file}: ${(before.length / 1e6).toFixed(2)} MB -> ${(after.length / 1e6).toFixed(2)} MB, worst decoded change ${worst.toExponential(1)}`);
}
