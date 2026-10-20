// Pose behavior checks, independent of rendering. Browser review still judges the motion.
import assert from 'node:assert/strict';
import { AppBase, AppOptions, NullGraphicsDevice, Entity, Mat4, Quat, Vec3 } from 'playcanvas';
import { createFaceGuard } from '../src/flightFaceGuard.js';
import { createFlightRig } from '../src/flightRig.js';
import { createFlight } from '../src/flight.js';
import { createFlightCliffs } from '../src/flightCliffs.js';
const names=['spine_02','spine_03','spine_04','neck_01','head',...['upperarm','lowerarm','hand','thigh','calf','foot'].flatMap(n=>[n+'_l',n+'_r'])];
function setup(){
 const armature={rigBoneNames:names,skeleton:{parents:names.map(()=>-1),applyLocal(_pose,transform,out){for(const m of out)m.copy(transform);}},entity:new Entity(),getBoneWorldMatrix:()=>new Mat4()};
 const rig=createFlightRig({armature});rig.enabled=true;
 const flight=createFlight({turbulence:0});flight.reset(new Vec3(0,40,0));
 const tick=(seconds,context={},dt=1/60)=>{for(let t=0;t<seconds-1e-8;t+=dt)rig.update(dt,flight,context);return rig.stats().channels;};
 return {rig,flight,tick,armature};
}
const a=setup();let ch,asymmetry=0;
for(let i=0;i<8;i++){ch=a.tick(1,{uncertainty:.6});asymmetry=Math.max(asymmetry,Math.abs(ch.armBackL-ch.armBackR)+Math.abs(ch.kneeL-ch.kneeR));}
assert(asymmetry>3,'calm glide retains uneven balance adjustments over time');
a.flight.state.targetBankDeg=-38;ch=a.tick(.3,{uncertainty:1});
assert(ch.elbowL>2&&ch.elbowR>2,'a new turn catches balance with both elbows');
a.flight.state.bankDeg=-38;ch=a.tick(2);
assert(ch.kneeL>ch.kneeR+10,'inside knee bends while outside leg trails');
assert(ch.bodyRoll < -20 && ch.headLook < -25, 'left bank visibly rolls the body left while looking right');
const left=ch.legSwing;a.flight.state.targetBankDeg=38;a.flight.state.bankDeg=38;ch=a.tick(1/60);
assert(Math.abs(ch.legSwing-left)<1,'legs do not snap across on a turn reversal');
ch=a.tick(4);assert(ch.legSwing<0&&ch.kneeR>ch.kneeL+10,'opposite turn settles to the opposite pose');
assert(ch.bodyRoll > 20 && ch.headLook > 25, 'right bank mirrors the partial roll and counterlook');
// Expressive rolls change the pose, not the flight path, and cannot spin.
const physical=createFlight({turbulence:0}),expressive=createFlight({turbulence:0});
physical.reset(new Vec3(0,40,0));expressive.reset(new Vec3(0,40,0));
for(let i=0;i<120;i++){expressive.state.poseRollDeg=999;physical.update(1/60,{turn:.7});expressive.update(1/60,{turn:.7});}
assert(physical.state.pos.equals(expressive.state.pos),'expressive rolls never alter steering or collision travel');
expressive.state.flail=0;expressive.state.gust.set(0,0,0);
const expected=new Quat().setFromAxisAngle(new Vec3(0,1,0),expressive.state.yawDeg)
 .mul(new Quat().setFromAxisAngle(new Vec3(0,0,1),82))
 .mul(new Quat().setFromAxisAngle(new Vec3(1,0,0),expressive.options.bodyPitchDeg));
const actual=expressive.getOrientation();
assert(Math.abs(Math.abs(expected.x*actual.x+expected.y*actual.y+expected.z*actual.z+expected.w*actual.w)-1)<1e-6,'expressive roll is capped below a quarter turn');
const c=setup();c.rig.reactToCloud(1);ch=c.tick(.7);
assert(ch.guard>.9&&c.rig.stats().guardSide===1,'cloud entry raises the left face guard');
const age=c.rig.stats().cloudAge;c.rig.reactToCloud(-1);assert.equal(c.rig.stats().cloudAge,age,'overlapping clouds do not restart the gesture');
ch=c.tick(5);assert(Math.abs(ch.elbowL)<8&&ch.brace<.02&&ch.guard<.02,'cloud gesture releases instead of remaining locked');
const rock=setup();ch=rock.tick(2,{cliff:{strength:1,side:-1}});
assert(ch.guard>.99&&rock.rig.stats().guardSide===-1,'right cliff protects the right side');
rock.rig.reactToCloud(1);rock.tick(.7,{cliff:{strength:1,side:-1}});
assert.equal(rock.rig.stats().guardSide,-1,'opposite overlapping threats retain one shielding arm');
const low=setup(),high=setup();for(const test of [low,high]){test.flight.state.targetBankDeg=-28;test.flight.state.bankDeg=-20;}
const l=low.tick(3,{uncertainty:.6},.1),h=high.tick(3,{uncertainty:.6},1/120);
for(const name of Object.keys(l))assert(Math.abs(l[name]-h[name])<2,`${name}: slow frames preserve the pose`);
for(let i=0;i<600;i++){
 low.flight.state.targetBankDeg=i%2?38:-38;low.flight.state.climbVel=i%2?5:-5;
 low.rig.update(i%5===0?.25:1/30,low.flight,{uncertainty:1,cliff:{strength:1,side:i%2?1:-1}});
 const pose={rotations:names.map(()=>new Quat())};low.armature.poseModifier(pose);
 for(const q of pose.rotations){assert([q.x,q.y,q.z,q.w].every(Number.isFinite));assert(Math.abs(q.length()-1)<1e-5);}
 for(const value of Object.values(low.rig.stats().channels))assert(Number.isFinite(value)&&Math.abs(value)<130,'joint channels stay bounded during repeated reversals');
}
low.rig.enabled=false;low.rig.enabled=true;
assert(Object.values(low.rig.stats().channels).every(v=>v===0),'restart clears previous motion and reactions');
// A real two-bone hierarchy checks the resulting forearm, not just channels.
for (const side of [1,-1]) for (const bank of [0,65,-65]) {
 const entity=new Entity();entity.setEulerAngles(80,24,bank);
 const parents=[-1,-1,1,2,-1,4,5];
 const skeleton={parents,applyLocal(pose,root,out){
  for(let i=0;i<parents.length;i++)out[i].mul2(parents[i]<0?root:out[parents[i]],new Mat4().setTRS(pose.positions[i],pose.rotations[i],pose.scales[i]));
 }};
 const armature={entity,skeleton,rigBoneNames:parents.map(String)};
 const bones={head:0,upperarm:{l:1,r:4},lowerarm:{l:2,r:5},hand:{l:3,r:6}};
 const guard=createFaceGuard(armature,bones);
 const pose={positions:[[0,1.6,0],[.18,1.4,0],[.30,0,0],[.30,0,0],[-.18,1.4,0],[-.30,0,0],[-.30,0,0]].map(v=>new Vec3(...v)),rotations:parents.map(()=>new Quat()),scales:parents.map(()=>new Vec3(1,1,1))};
 guard(pose,side,1,entity.getRotation());
 const world=parents.map(()=>new Mat4());skeleton.applyLocal(pose,entity.getWorldTransform(),world);
 const inverse=new Mat4().copy(entity.getWorldTransform()).invert();
 const wrist=inverse.transformPoint(world[side>0?3:6].getTranslation(new Vec3()));
 assert(wrist.distance(new Vec3(-side*.12,1.72,.17))<1e-4,'wrist reaches across the face through banks on either side');
 const elbow=inverse.transformPoint(world[side>0?2:5].getTranslation(new Vec3()));
 assert(elbow.x*side>.1&&elbow.z>.1,'raised elbow keeps the forearm in front of the face');
 for(const i of side>0?[4,5,6]:[1,2,3])assert(pose.rotations[i].equals(new Quat()),'free arm is untouched by the face guard');
}
// Real cliff bounds: proximity must come from geometry, with the correct
// side, and disappear after passing or disabling the scenery.
const canvas={id:'flight-awareness',width:64,height:64};
const app=new AppBase(canvas),options=new AppOptions();
options.graphicsDevice=new NullGraphicsDevice(canvas);app.init(options);
const root=app.root;
const variant={bounds:[[-2,-5,-2],[2,5,2]]};
const assets={variants:[variant],instantiate(_i,parent){const entity=new Entity('rock');parent.addChild(entity);return {entity,instances:[],variant};}};
const cliffs=createFlightCliffs({app:{root}},assets,{perFormation:1,farShare:0,underShare:0,near:{side:[6,6],scale:[1,1],top:[2,2]},yawJitterDeg:0,clouds:{reservedClouds:[0],anchorCloud(){},moveCloud(){}}});
const nearby=createFlight();nearby.reset(new Vec3(0,40,0));cliffs.reset(nearby);cliffs.update(0,nearby,new Entity('camera'));
assert.equal(cliffs.awareness(nearby).strength,0,'distant cliffs do not trigger a protective pose');
nearby.state.pos.z=32;
const before=nearby.state.pos.clone(),notice={...cliffs.awareness(nearby)};
assert(notice.strength>.25&&notice.strength<=1,'approaching a near cliff produces graded awareness');
assert.equal(notice.side,Math.sign(cliffs.list(nearby)[0].offset),'awareness identifies the actual side of the rock');
assert(nearby.state.pos.equals(before),'pose awareness never moves the player');
nearby.state.pos.z=60;assert.equal(cliffs.awareness(nearby).strength,0,'passed cliffs release the protective pose');
nearby.state.pos.z=32;cliffs.enabled=false;assert.equal(cliffs.awareness(nearby).strength,0,'hidden scenery does not affect the pose');
app.destroy();
console.log('Passed: persistent balance, turn catch and delayed legs, side-specific cloud/cliff reactions, recovery, slow-frame stability, finite normalized poses, restart reset.');
