// --generate requests missing takes; --install applies the selected master.
import {copyFileSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dir=`${root}art/audio/impact-review/`;
const variants=[
 {id:'01',title:'Body against stone',description:'Close, blunt contact with cloth and a short gritty stone crack.',prompt:'One sudden close collision: a clothed adult body strikes a rough stone cliff at speed. Heavy deep chest thud, short gritty mineral crack and cloth slap, then tiny falling grit. Dry, weighty, realistic film foley. Brief natural rock resonance fading into quiet air. Exactly one hit immediately at the beginning. No voice, music, cartoon boing, metallic ring, pitched bass sweep or explosion.'},
 {id:'02',title:'Glancing rock fracture',description:'A rougher contact with a scrape and debris trailing off the cliff.',prompt:'One violent glancing collision with a huge rock wall. An immediate deep blunt body thud, short stone fracture and gravel scrape peeling away, then a little falling debris and a dark canyon reflection. Serious realistic adventure-film foley, tactile cloth and stone, substantial low-mid weight. One impact only. No voice, music, boing, electronic sub drop, repeated hits or explosion.'},
 {id:'03',title:'Deep canyon collision',description:'A weightier cinematic impact with a dark, spacious rock resonance.',prompt:'One sudden heavy collision with a massive stone wall. A very low dense crushing thud and brief sharp mineral crunch; the stone mass resonates with a deep short natural rumble and a distant outdoor canyon reflection. Serious dramatic film sound, physical and frightening, close body contact. Single impact at the beginning, then natural decay. No music, synthesized bass sweep, comic boing, metal, voice or explosion.'},
 {id:'04',title:'Muffled body impact',description:'A restrained, heavy thump with less crack and a short decay.',prompt:'One close muffled full-body collision against hard granite. Very deep compact organic thump, dense low-mid chest pressure, subtle clothing snap and dry stone grit. Heavy realistic film foley with a soft leading body thud and tight low stone resonance. One hit immediately at the beginning, decaying into silence. No trailer explosion, high snap, elastic bounce, pitched bass glide, electronics, music or voice.'},
];
mkdirSync(`${dir}raw`,{recursive:true});mkdirSync(`${dir}audio`,{recursive:true});
if(process.argv.includes('--generate')){
 const key=process.env.ELEVENLABS_API_KEY??JSON.parse(readFileSync(`${homedir()}/.claude.json`,'utf8')).mcpServers?.elevenlabs?.env?.ELEVENLABS_API_KEY;
 if(!key)throw Error('No ElevenLabs key configured');
 const jobs=variants.filter(v=>!existsSync(`${dir}raw/${v.id}.mp3`));
 await Promise.all(Array.from({length:2},async()=>{for(let v;(v=jobs.shift());){
  const response=await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_192',{method:'POST',headers:{'xi-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({text:v.prompt,duration_seconds:3,prompt_influence:.65,loop:false,model_id:'eleven_text_to_sound_v2'})});
  if(!response.ok)throw Error(`Generation ${v.id} failed (${response.status}): ${await response.text()}`);
  writeFileSync(`${dir}raw/${v.id}.mp3`,Buffer.from(await response.arrayBuffer()));console.log(`Generated ${v.id}: ${v.title}`);
 }}));
}
const run=args=>{const r=spawnSync('ffmpeg',['-nostdin','-hide_banner','-y',...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stderr;};
const measure=(src,shape='')=>{const r=run(['-i',src,'-af',`${shape}loudnorm=print_format=json`,'-f','null','-']);return JSON.parse(r.slice(r.lastIndexOf('{'),r.lastIndexOf('}')+1));};
const options=[...variants,{id:'05',title:'Existing layers · tighter cut',description:'The earlier remix: body thud forward, less synthetic bass, shorter rumble.',file:'05-remix.mp3'},{id:'00',title:'Current sound · reference',description:'The previous impact, level-matched for comparison.',file:'00-current.mp3'}];
for(const v of options){
 const src=`${dir}raw/${v.file??v.id+'.mp3'}`;
 if(!existsSync(src))throw Error(`Missing ${src}; run with --generate to request new takes.`);
 const shape='silenceremove=start_periods=1:start_threshold=-38dB:start_silence=0.003,atrim=duration=3,asetpts=PTS-STARTPTS,apad=whole_dur=3,afade=t=in:d=0.003,afade=t=out:st=2.45:d=0.55,';
 const measured=measure(src,shape),gain=-22-Number(measured.input_i);
 v.selected=v.id==='03';
 const finish=v.selected?'bass=g=1.5:f=120:t=q:w=0.707,volume=2dB,':'';
 if(v.selected){
  v.mastering={gainDb:2,lowShelfDb:1.5,lowShelfHz:120};
  v.description+=' Selected with a small volume lift and extra low-end weight.';
 }
 v.solo=`audio/${v.id}-solo.mp3`;v.mix=`audio/${v.id}-scene.mp3`;
 run(['-i',src,'-af',`${shape}volume=${gain.toFixed(2)}dB,${finish}aresample=176400,alimiter=limit=0.79:level=false,aresample=44100`,'-ar','44100','-b:a','192k',dir+v.solo]);
 const graph=[
 '[0:a]volume=1.3,pan=stereo|c0=0.85*c0+0.15*c1|c1=0.55*c1,adelay=1200:all=1[hit]',
 "[1:a]atrim=duration=5.4,asetpts=PTS-STARTPTS,volume='if(lt(t,1.2),0.38,if(lt(t,1.38),0.045,0.045+0.335*(1-exp(-(t-1.38)/0.3))))':eval=frame[air]",
 '[2:a]volume=0.35,atrim=duration=1.2,afade=t=out:st=0.95:d=0.25[approach]',
 "[3:a]atrim=duration=4.2,asetpts=PTS-STARTPTS,volume='0.13+0.6*(1-exp(-t/0.5))':eval=frame,adelay=1200:all=1[fall]",
 '[hit][air][approach][fall]amix=inputs=4:normalize=0,atrim=duration=5.4,afade=t=out:st=5:d=0.4,alimiter=limit=0.89:level=false[out]'];
 run(['-i',dir+v.solo,'-i',`${root}public/assets/audio/flight-wind.mp3`,'-i',`${root}public/assets/audio/cliff-pass-1.mp3`,'-i',`${root}public/assets/audio/fall-rise.mp3`,'-filter_complex',graph.join(';'),'-map','[out]','-ar','44100','-b:a','192k',dir+v.mix]);
 v.measurement=measure(dir+v.solo);console.log(`Built ${v.id}: ${v.measurement.input_i} LUFS`);
}
writeFileSync(dir+'options.js','window.IMPACT_OPTIONS = '+JSON.stringify(options)+';\n');
writeFileSync(dir+'generation.json',JSON.stringify({model:'eleven_text_to_sound_v2',duration:3,normalizationLUFS:-22,selectedId:'03',sceneImpactAt:1.2,options},null,2)+'\n');
if(process.argv.includes('--install')){
 copyFileSync(dir+options.find(v=>v.selected).solo,`${root}public/assets/audio/cliff-impact.mp3`);
 console.log('Installed Deep canyon collision with +2 dB gain and a gentle +1.5 dB low shelf.');
}
