import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AppBase,AppOptions,NullGraphicsDevice,CameraComponentSystem,Entity,Vec3} from 'playcanvas';
import {createFlight} from '../src/flight.js';
import {createChaseCamera} from '../src/chaseCamera.js';
import {createCrash} from '../src/crash.js';
const canvas={id:'impact-framing',width:1280,height:720};
const app=new AppBase(canvas),options=new AppOptions();options.graphicsDevice=new NullGraphicsDevice(canvas);options.componentSystems=[CameraComponentSystem];app.init(options);Object.assign(app.graphicsDevice.clientRect,{width:1280,height:720});
const data=JSON.parse(readFileSync(new URL('../public/assets/flight/cliffs/cliffs.mesh.json',import.meta.url)));
const assets={variants:data.variants,instantiate(i,parent){const entity=new Entity();parent.addChild(entity);return {entity,variant:data.variants[i],instances:[]};}};
const noop=()=>{};
function run(heading,dt,original,legacyRecoil=false){
 const camera=new Entity();app.root.addChild(camera);camera.addComponent('camera',{fov:55,aspectRatio:1280/720,aspectRatioMode:1});
 const body=new Entity();app.root.addChild(body);
 const flight=createFlight({headingDeg:heading});flight.reset(new Vec3(0,40,0),heading);
 const chaseCamera=createChaseCamera(camera);chaseCamera.snap(flight);
 const cloud={anchorCloud:noop,placeWipe:(f,a)=>f.state.pos.dot(f.state.forward)+a};
 const element=()=>({style:{setProperty:noop}}),sounds=[];
 const fadeEl=element(),dreadEl=element(),screen=element();
 const character={armature:{entity:body,rigBoneNames:[],skeleton:{parents:[]}},stopLayer:noop,crossfadeTo:noop,setPosition:(...v)=>body.setPosition(...v),setRotation:(...v)=>body.setEulerAngles(...v)};
 const crash=createCrash({scene:{app,cameraEntity:camera},flight,character,chaseCamera,flightRig:{enabled:true,update:noop},windFx:{...cloud},skyClouds:{...cloud},flightCliffs:{keepClear:noop},cliffAssets:assets,audio:{play:(name,opts)=>sounds.push({name,...opts}),level:noop,cut:noop},fadeEl,dreadEl,canvas:screen,setLids:noop,placeFlyer:noop},{...(original?{camera:{impactKick:null,recovery:null}}:{}),...(legacyRecoil?{hit:{away:11,drag:1.4}}:{})});
 crash.start({turn:0,climb:0});const frames=[];
 for(let time=0;time<20&&!crash.done;time+=dt){
  crash.update(dt);const stats=crash.stats();if(crash.phase!=='fall')continue;
  camera.camera.onAppPrerender();const p=camera.camera.worldToScreen(flight.state.pos);
  assert([p.x,p.y,p.z].every(Number.isFinite),'camera projection stays finite');
  if(stats.sinceHit===0){
   assert(Number(fadeEl.style.opacity)>=.6,'flash lands on the contact frame');
   assert(Number(dreadEl.style.opacity)>=.5,'vignette lands on the contact frame');
   assert(screen.style.filter.includes('contrast(2.200)'),'instant contrast pulse');
  }
  frames.push({bodyPos:flight.state.pos.clone(),forward:camera.forward.clone(),time:stats.sinceHit,pos:camera.getPosition().clone(),rotation:camera.getRotation().clone(),fov:camera.camera.fov,x:p.x/1280,y:p.y/720,z:p.z});
 }
 assert.equal(sounds.filter(s=>s.name==='cliff-impact').length,1);
 assert(!sounds.some(s=>s.name==='cliff-gasp'),'no pre-impact gasp');
 assert(sounds.find(s=>s.name==='cliff-impact').pan<0&&sounds.find(s=>s.name==='fall-rise').pan>0,'sound follows the impact direction');
 crash.finish();assert.equal(screen.style.filter,'','screen effect clears on finish');assert.equal(Number(fadeEl.style.opacity),0);camera.destroy();body.destroy();return frames;
}
for(const heading of [0,62,180])for(const dt of [1/30,1/60,1/120]){
 const original=run(heading,dt,true),adjusted=run(heading,dt,false);assert.equal(original.length,adjusted.length);
 let matched=0;
 for(let i=0;i<original.length;i++){
  const a=original[i],b=adjusted[i];
  assert.equal(a.fov,b.fov,'original close-up and fall FOV are preserved throughout');
  if(a.time>=2.01){
   assert(a.pos.distance(b.pos)<1e-6,'underlying fall position is restored');
   assert(a.rotation.equalsApprox(b.rotation,1e-6),'underlying fall orientation is preserved');
   if(a.time>=2.01)matched++;
  }
 }
 assert(adjusted[0].forward.y>.3&&adjusted[0].forward.y<.5,'impact looks sideways with a modest upward tilt');
 const legacy=run(heading,dt,true,true);
 const distance=frames=>{const a=frames[0].bodyPos,b=frames.find(f=>f.time>=1).bodyPos;return Math.hypot(b.x-a.x,b.z-a.z);};
 assert(distance(adjusted)<distance(legacy)*.7,'first-second recoil is at least 30% shorter');
 assert(matched>2.9/dt,'compare the remaining three seconds of the original falling shot');
 assert(adjusted.some(f=>f.time<.3&&(f.z<0||f.y>1||f.y<0)),'upward toss lets her leave the frame');
 assert(adjusted.some((f,i)=>f.time>.1&&f.time<.4&&f.pos.y>original[i].pos.y+.15),'camera rises after contact');
 for(const f of adjusted.filter(f=>f.time>=1&&f.time<=1.6)){
  assert(f.pos.distance(f.bodyPos)>1.7,'returning camera stays outside her tumbling body');
  assert(f.z>0&&f.x>.1&&f.x<.9&&f.y>.1&&f.y<.9,'recovery keeps her in frame after the intentional toss');
 }
}
app.destroy();console.log('Passed: preserved FOV, upward toss and gravity drop, instant screen pulse, shorter recoil, safe camera recovery, underlying fall camera restored after 2 s, directional audio and no gasp, at 30/60/120 Hz across three headings.');
