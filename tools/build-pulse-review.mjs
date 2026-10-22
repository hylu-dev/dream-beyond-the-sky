// Builds art/audio/pulse-review/: candidate pulse sounds (the sun's ring of
// light at golden hour) in the direction of Clair Obscur: Expedition 33's
// hits - a sharp compressed transient, a saturated sub drop cut off short,
// a processed electronic wobble - over the shipped gong, with Chinese drum
// and string colour. `--generate` requests missing raw takes from
// ElevenLabs; existing takes are kept. `--install` renders the selected
// option at its in-game length and level and copies it to the game.
import {copyFileSync,existsSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=`${root}art/audio/pulse-review/`;
const layers={
 transient:{seconds:2,takes:2,prompt:'One extremely sharp, heavily compressed cinematic impact transient: a tight punchy close thud with a crisp click at the very front and a dense, muted low body that stops quickly. Modern action-game hit design, dry and powerful. Exactly one hit at the beginning. No music, no voice, no reverb tail, no riser.'},
 subdrop:{seconds:2,takes:2,prompt:'A heavy saturated sub-bass drop impact: an instant, deep, distorted boom that plunges down in pitch and is cut off abruptly after half a second. Dense, gritty and overdriven, felt in the chest. One hit only. No music, no melody, no drums, no reverb.'},
 wub:{seconds:3,takes:2,prompt:'A heavy processed electronic bass wobble: a deep, distorted, growling dubstep-style wub that wobbles twice slowly and stops. Dark and weighty, one short phrase. No drums, no melody, no voice.'},
 dagu:{seconds:3,takes:2,prompt:'One huge Chinese war drum (dagu) struck once with full force: a deep booming drum-skin hit with a tight attack and a short dark resonance. Single strike, no other instruments, no music.'},
 guqin:{seconds:3,takes:2,prompt:'A low guqin string plucked hard once with a slow downward pitch slide: a deep, woody, resonant twang fading out. Single note, no melody, no other instruments, no music.'},
};
mkdirSync(`${dir}raw`,{recursive:true});mkdirSync(`${dir}audio`,{recursive:true});
if(process.argv.includes('--generate')){
 const key=process.env.ELEVENLABS_API_KEY??JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8')).mcpServers?.elevenlabs?.env?.ELEVENLABS_API_KEY;
 if(!key)throw Error('No ElevenLabs key configured');
 const jobs=Object.entries(layers).flatMap(([name,l])=>Array.from({length:l.takes},(_,i)=>({name,l,file:`${dir}raw/${name}-${i+1}.mp3`}))).filter(j=>!existsSync(j.file));
 await Promise.all(Array.from({length:2},async()=>{for(let j;(j=jobs.shift());){
  const response=await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192',{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({text:j.l.prompt,duration_seconds:j.l.seconds,prompt_influence:.6,loop:false,model_id:'eleven_text_to_sound_v2'})});
  if(!response.ok)throw Error(`Generation ${j.file} failed (${response.status}): ${await response.text()}`);
  writeFileSync(j.file,Buffer.from(await response.arrayBuffer()));console.log(`Generated ${j.file.slice(dir.length)}`);
 }}));
}

// Synthesized parts, all on the sub's 38 Hz so they cannot clash with it:
// an 8 ms click for the front of the hit; a sub that plunges from 120 Hz
// to 38 in 0.15 s and is cut off at 0.55 s; and a wobble, a 38 Hz buzz
// whose upper harmonics open and close 2.5 times a second, for a second;
// and a deep, clean sub for the muted rounds, from 80 Hz down to D (36.7)
// over 0.4 s with its octave, dying away over two seconds.
const SR=44100;
const synth={
 click:`anoisesrc=d=0.03:c=white:r=${SR}:a=1,afade=t=out:st=0:d=0.008:curve=exp,highpass=f=1800`,
 sub:`aevalsrc='sin(2*PI*(38*t+0.15*82*(1-exp(-t/0.15))*1))*(1-exp(-800*t))*if(lt(t,0.52),1,max(0,1-(t-0.52)/0.03))':s=${SR}:d=0.6`,
 deep:`aevalsrc='(sin(2*PI*(36.7*t+0.4*43.3*(1-exp(-t/0.4))))+0.3*sin(4*PI*(36.7*t+0.4*43.3*(1-exp(-t/0.4)))))*(1-exp(-300*t))*exp(-1.1*t)':s=${SR}:d=4`,
 wobble:`aevalsrc='(${Array.from({length:12},(_,i)=>`sin(2*PI*${38*(i+1)}*t)/${i+1}*exp(-${i+1}/(1+9*(0.5-0.5*cos(2*PI*2.5*t))))`).join('+')})*(1-exp(-60*t))*if(lt(t,0.95),1,max(0,1-(t-0.95)/0.05))':s=${SR}:d=1`,
};
const SAT='volume=15dB,asoftclip=type=tanh,volume=-9dB'; // driven into a soft clip: grit you hear on small speakers
const PUNCH='acompressor=threshold=-30dB:ratio=10:attack=0.1:release=60:makeup=8'; // squashed flat so it punches
const raw=(n)=>`${dir}raw/${n}.mp3`;
// Each layer [source, dB, delay s, filter]: a raw take's name, `synth.*`, or a file.
// raw/gong is the pulse as it shipped before this review (the gongs and
// falling sub of tools/audio-sounds.mjs's old recipe, in git history).
// The gong is the body and tail: muffled, above the sub (which is the hit's
// alone, so its cut-off is heard), and swelling in under the strike.
const GONG=[raw('gong'),-4,0,"highpass=f=70,lowpass=f=700,volume='min(1,0.3+1.4*t)':eval=frame"];
const HIT=[[synth.click,-4,0,`${PUNCH}`],[raw('transient-1'),4,0,`atrim=0:0.6,afade=t=out:st=0.45:d=0.15,${PUNCH},${SAT}`],[synth.sub,4,0,`${SAT},lowpass=f=2500`],[raw('subdrop-2'),0,0,`atrim=0:0.55,afade=t=out:st=0.5:d=0.05,${SAT}`]];
const ASIA=[[raw('dagu-2'),0,0,'highpass=f=40'],[raw('guqin-2'),-4,0.04,'highpass=f=70']];
// The muted rounds: a felt thump, not a click; the deep sub and the bowed
// bass undertone (art/audio/raw/pulse-bass-2) under the gong; then the
// bowed bronze gong's singing (art/audio/raw/gong-shimmer) blooming in.
const MUTED=[[raw('transient-2'),2,0,'lowpass=f=600,acompressor=threshold=-24dB:ratio=3:attack=5:release=120:makeup=3'],[synth.deep,2,0,'lowpass=f=160'],[`${root}art/audio/raw/pulse-bass-2.mp3`,-5,0,'lowpass=f=350,lowpass=f=350,afade=t=in:d=0.4']];
const BRONZE=(take,db)=>[`${root}art/audio/raw/gong-shimmer-${take}.mp3`,db,0.25,'highpass=f=250,afade=t=in:d=0.8'];
// With nothing cut off, the gong keeps its own deep tail.
const GONG_DEEP=[raw('gong'),-3,0,"lowpass=f=700,volume='min(1,0.4+1.2*t)':eval=frame"];
const DAGU=[raw('dagu-2'),-2,0,'lowpass=f=900,highpass=f=40'];
const options=[
 {id:'06',title:'Muted deep boom',round:2,selected:true,description:'A soft felt thump and a clean, deep sub that drops to D and dies away over two seconds, with the bowed bass undertone, under the gong. No click, no grit, no wobble.',layers:[...MUTED,GONG_DEEP]},
 {id:'07',title:'Boom + bronze bloom',round:2,description:'As 06, with the singing of a bowed bronze gong blooming in after the strike: warm, airy and a little magical.',layers:[...MUTED,BRONZE(2,-6),GONG_DEEP]},
 {id:'08',title:'Boom + bright bronze',round:2,description:'As 07 with the brighter, glassier bowed-gong take, a touch more sparkle over the tail.',layers:[...MUTED,BRONZE(1,-7),GONG_DEEP]},
 {id:'09',title:'Boom + muffled dagu',round:2,description:'As 06, with a huge Chinese war drum struck under it, muffled so it adds weight rather than snap.',layers:[...MUTED,DAGU,GONG_DEEP]},
 {id:'10',title:'Boom, dagu and bronze',round:2,description:'The muted boom, the muffled dagu and the warm bronze bloom together.',layers:[...MUTED,DAGU,BRONZE(2,-6),GONG_DEEP]},
 {id:'04',title:'Last round · hit, drum and guqin',round:1,description:'From the last round: the click, saturated cut-off sub and gong, with a huge Chinese war drum (dagu) under the strike and a low guqin string plucked with a falling slide over the tail. No electronics beyond the sub.',layers:[...HIT,...ASIA,GONG]},
 {id:'00',title:'Current gong · reference',description:'The shipped pulse, level-matched.',layers:[[raw('gong'),0,0,'']]},
];
const run=args=>{const r=spawnSync('ffmpeg',['-nostdin','-hide_banner','-y',...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stderr;};
const measure=(args,shape='')=>{const r=run([...args,'-af',`${shape}loudnorm=print_format=json`,'-f','null','-']);return JSON.parse(r.slice(r.lastIndexOf('{'),r.lastIndexOf('}')+1));};
const peak=(args,shape)=>Number(/max_volume: (-?[\d.]+) dB/.exec(run([...args,'-af',`${shape}volumedetect`,'-f','null','-']))[1]);
const input=(src)=>src.startsWith('/')?['-i',src]:['-f','lavfi','-i',src];
const SECONDS=8,LUFS=-16;
// In game: the whole gong tail, 14 s fading over the last 3, at the old
// pulse's -12 LUFS, peaks held to -1.5 dBFS as tools/process-audio.mjs does.
const GAME={seconds:14,fade:3,lufs:-12,limit:10**(-1.5/20)};
const install=process.argv.includes('--install');
for(const o of options){
 // Each layer brought to -20 LUFS through its filter, then its dB and delay.
 const args=[],chains=[];
 o.layers.forEach(([src,db,delay,filter],k)=>{
  const shape=`${filter?`${filter},`:''}aformat=sample_rates=${SR}:channel_layouts=stereo,`;
  // Too short to measure loudness (the click): its peak to -6 dBFS instead.
  const lufs=Number(measure(input(src),shape).input_i);
  const gain=(Number.isFinite(lufs)&&lufs>-70?-20-lufs:-6-peak(input(src),shape))+db;
  args.push(...input(src));chains.push(`[${k}:a]${shape}volume=${gain.toFixed(2)}dB,adelay=${Math.round(delay*1000)}:all=1,apad=whole_dur=${GAME.seconds}[l${k}]`);
 });
 const render=(file,seconds,fade)=>run([...args,'-filter_complex',`${chains.join(';')};${o.layers.map((_,k)=>`[l${k}]`).join('')}amix=inputs=${o.layers.length}:normalize=0,atrim=0:${seconds},afade=t=out:st=${seconds-fade}:d=${fade}[out]`,'-map','[out]',file]);
 const mix=`${dir}audio/${o.id}-mix.wav`;
 render(mix,SECONDS,1.5);
 if(install&&o.selected){
  const full=`${dir}audio/${o.id}-full.wav`;render(full,GAME.seconds,GAME.fade);
  o.game=`audio/${o.id}-game.mp3`;
  run(['-i',full,'-af',`volume=${(GAME.lufs-Number(measure(['-i',full]).input_i)).toFixed(2)}dB,aresample=176400,alimiter=limit=${GAME.limit}:attack=5:release=60:level=false,aresample=44100`,'-b:a','160k',dir+o.game]);
  rmSync(full);copyFileSync(dir+o.game,`${root}public/assets/audio/pulse.mp3`);
  console.log(`Installed ${o.id}: ${o.title}, ${measure(['-i',dir+o.game]).input_i} LUFS`);
 }
 const gain=LUFS-Number(measure(['-i',mix]).input_i);
 o.solo=`audio/${o.id}-solo.mp3`;
 run(['-i',mix,'-af',`volume=${gain.toFixed(2)}dB,aresample=176400,alimiter=limit=0.84:level=false,aresample=44100`,'-b:a','192k',dir+o.solo]);
 // In scene: the dawn meadow and the island wind, the pulse struck 1 s in.
 o.scene=`audio/${o.id}-scene.mp3`;
 run(['-i',dir+o.solo,'-i',`${root}public/assets/audio/dawn-bed.mp3`,'-i',`${root}public/assets/audio/island-wind.mp3`,'-filter_complex',`[0:a]adelay=1000:all=1[p];[1:a]volume=0.35[b];[2:a]volume=0.3[w];[p][b][w]amix=inputs=3:normalize=0:duration=first,atrim=0:${SECONDS+1},afade=t=in:d=0.3,alimiter=limit=0.89:level=false[out]`,'-map','[out]','-b:a','192k',dir+o.scene]);
 rmSync(mix);
 o.measurement=measure(['-i',dir+o.solo]);console.log(`Built ${o.id}: ${o.title}, ${o.measurement.input_i} LUFS`);
 delete o.layers;
}
writeFileSync(`${dir}options.js`,'window.PULSE_OPTIONS = '+JSON.stringify(options)+';\n');
writeFileSync(`${dir}generation.json`,JSON.stringify({model:'eleven_text_to_sound_v2',normalizationLUFS:LUFS,sceneStrikeAt:1,selectedId:options.find(o=>o.selected).id,game:GAME,layers},null,2)+'\n');
