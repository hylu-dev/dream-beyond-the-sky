// Prepare a PINOC seated-rise/walk/stop for the opening. The source stays in
// PINOC; only the prepared clip and its matching travel ship with the game.
// node tools/prepare-opening-motion.mjs source.glb [output.glb]
import fs from 'node:fs';
import { Quat, Vec3 } from 'playcanvas';
const [source, destination = 'public/assets/anims/getup-sunrise.glb'] = process.argv.slice(2);
if (!source) throw new Error('Pass a generated splat-skeleton GLB.');
function read(file) {
  const b = fs.readFileSync(file), size = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + size));
  const bin = b.subarray(28 + size), animation = json.animations[0];
  const tracks = animation.channels.map(ch => {
    const sampler = animation.samplers[ch.sampler], a = json.accessors[sampler.output];
    const bv = json.bufferViews[a.bufferView], dim = {SCALAR:1,VEC3:3,VEC4:4}[a.type];
    if (![5126,5122].includes(a.componentType) || !dim) throw new Error('Unsupported animation accessor.');
    const bytes = a.componentType === 5126 ? 4 : 2, stride = bv.byteStride || dim*bytes;
    const value = offset => a.componentType === 5126 ? bin.readFloatLE(offset) : Math.max(-1,bin.readInt16LE(offset)/32767);
    const offset = (bv.byteOffset || 0) + (a.byteOffset || 0);
    return { ch, sampler, name: json.nodes[ch.target.node].name, path: ch.target.path, dim,
      values: Array.from({length:a.count}, (_, k) => Array.from({length:dim}, (_,j) => value(offset + k*stride+j*bytes))) };
  });
  return { json, tracks };
}
const clip = read(source), target = read('public/assets/anims/vanish.glb');
const track = (c, name, path) => c.tracks.find(t => t.name === name && t.path === path);
const pelvis = track(clip, 'pelvis', 'rotation');
const end = new Quat(...pelvis.values.at(-1));
const next = new Quat(...track(target, 'pelvis', 'rotation').values[0]);
const delta = next.clone().mul(end.clone().invert());
const yaw = 2 * Math.atan2(delta.y, delta.w);
const align = new Quat().setFromAxisAngle(Vec3.UP, yaw * 180 / Math.PI);
// Move the early seated hold out of the visible section, then stretch the
// walking portion. Monotone cubic interpolation keeps playback speed continuous.
const knots = [[0,2.3],[2.1,4],[6.8,7.4],[8,239/30]];
const slopes = knots.slice(1).map((p,i)=>(p[1]-knots[i][1])/(p[0]-knots[i][0]));
const tangents = [slopes[0], ...slopes.slice(1).map((s,i)=>2*s*slopes[i]/(s+slopes[i])), 0];
function sourceTime(t) {
  let i = 0; while(i < knots.length-2 && t > knots[i+1][0]) i++;
  const [a,b] = [knots[i],knots[i+1]], h = b[0]-a[0], u = Math.min(1,(t-a[0])/h);
  return (2*u**3-3*u*u+1)*a[1]+(u**3-2*u*u+u)*h*tangents[i]+(-2*u**3+3*u*u)*b[1]+(u**3-u*u)*h*tangents[i+1];
}
const frames = 241;
for (const t of clip.tracks) {
  if (t.values.length === 1) continue;
  const input = t.values;
  t.values = Array.from({length:frames}, (_,k) => {
    const f = Math.min(input.length-1, sourceTime(k/30)*30), i = Math.min(Math.floor(f),input.length-2), u = f-i;
    if(t.path === 'rotation') return new Quat().slerp(new Quat(...input[i]),new Quat(...input[i+1]),u).toArray();
    return input[i].map((v,j)=>v+(input[i+1][j]-v)*u);
  });
  // A short, sign-aware filter removes frame jitter without flattening a step.
  const values = t.values;
  t.values = values.map((v,k) => {
    if(k===0 || k===frames-1) return v;
    const sum = v.map(x=>x*0.6);
    for(const n of [k-1,k+1]) {
      const sign = t.path==='rotation' && v.reduce((s,x,j)=>s+x*values[n][j],0)<0 ? -1 : 1;
      sum.forEach((_,j)=>sum[j]+=values[n][j]*0.2*sign);
    }
    const length = t.path==='rotation' ? Math.hypot(...sum) : 1;
    return sum.map(x=>x/length);
  });
}
for(const q of pelvis.values) q.splice(0,4,...align.clone().mul(new Quat(...q)).normalize().toArray());
const translation = track(clip,'pelvis','translation');
for(const p of translation.values) p.splice(0,3,...align.transformVector(new Vec3(...p)).toArray());
const first = translation.values[0];
const path = {dt:1/30, x:translation.values.map(p=>p[0]-first[0]), z:translation.values.map(p=>p[2]-first[2])};
// Repack the skeleton-only file; shared timestamp accessors keep it compact.
const buffers=[], views=[], accessors=[];
let length=0;
function append(values, type) {
  const dim={SCALAR:1,VEC3:3,VEC4:4}[type], data=Buffer.alloc(values.length*dim*4);
  values.flat().forEach((v,i)=>data.writeFloatLE(v,i*4));
  const index=accessors.length;
  views.push({buffer:0,byteOffset:length,byteLength:data.length});
  accessors.push({bufferView:views.length-1,componentType:5126,count:values.length,type,
    min:Array.from({length:dim},(_,j)=>Math.min(...values.map(v=>dim===1?v:v[j]))),
    max:Array.from({length:dim},(_,j)=>Math.max(...values.map(v=>dim===1?v:v[j])))});
  buffers.push(data);length+=data.length;return index;
}
const times=append(Array.from({length:frames},(_,k)=>k/30),'SCALAR'), single=append([0],'SCALAR');
const animation={name:'Measured rise, walk and stop',channels:[],samplers:[],extras:{sourceAsset:'3b048062-ef15-490a-989d-a66bdd93e858',sourceTask:'0f3053af-1eb0-4aea-821d-383e36d45ed2'}};
for(const t of clip.tracks) {
  animation.channels.push({sampler:animation.samplers.length,target:t.ch.target});
  animation.samplers.push({input:t.values.length===1?single:times,output:append(t.values,t.dim===4?'VEC4':'VEC3'),interpolation:'LINEAR'});
}
const json={asset:{version:'2.0',generator:'prepare-opening-motion.mjs'},scene:0,scenes:[{nodes:[0]}],nodes:clip.json.nodes.slice(0,441),skins:[{joints:Array.from({length:441},(_,i)=>i),skeleton:0}],animations:[animation],buffers:[{byteLength:length}],bufferViews:views,accessors};
let text=JSON.stringify(json);text+=' '.repeat((4-Buffer.byteLength(text)%4)%4);
const jb=Buffer.from(text),bin=Buffer.concat(buffers),out=Buffer.alloc(28+jb.length+bin.length);
out.write('glTF');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(jb.length,12);out.writeUInt32LE(0x4e4f534a,16);jb.copy(out,20);out.writeUInt32LE(bin.length,20+jb.length);out.writeUInt32LE(0x004e4942,24+jb.length);bin.copy(out,28+jb.length);
fs.writeFileSync(destination,out);fs.writeFileSync(destination.replace(/\.glb$/,'.path.json'),JSON.stringify(path));
console.log(JSON.stringify({frames,seconds:8,alignmentDegrees:yaw*180/Math.PI,travelMetres:Math.hypot(path.x.at(-1),path.z.at(-1))}));
