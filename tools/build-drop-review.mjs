// Rebuild the review-only auditions; never changes the game's sound files.
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=`${root}art/audio/drop-review/`;
const spec=JSON.parse(readFileSync(`${dir}generation.json`,'utf8'));
const run=args=>{const r=spawnSync('ffmpeg',['-nostdin','-hide_banner','-y',...args],{encoding:'utf8'});if(r.status)throw Error(r.stderr);return r.stderr;};
const measure=(file,shape)=>{const r=run(['-i',file,'-af',`${shape}loudnorm=print_format=json`,'-f','null','-']);return JSON.parse(r.slice(r.lastIndexOf('{'),r.lastIndexOf('}')+1));};
const preview={dropAt:3,flightAt:6.9,length:9.9,dawnFrom:26,dawnFade:2.5,silence:0.65};
const scratch=mkdtempSync(join(tmpdir(),'drop-review-'));
for(const v of spec.variants){
 const raw=v.source.startsWith('raw/')?v.source:`raw/${v.id}.mp3`;
 if(!existsSync(dir+raw))copyFileSync(v.source,dir+raw);
 v.source=raw;
 const {seconds=v.id==='08'?2.1:3.25,pitchFactor=v.id==='05'?0.5:1,stretch=1,fadeIn=0.025,fadeOut=0.25,sustain,trimLeading=true,lufs=-24,highShelfDb=0,highShelfHz=3200}=v.audioSettings??v.revision??{};
 const sampleRate=Math.round(44100*pitchFactor);
 const totalTempo=1/((sampleRate/44100)*stretch);
 const stages=Math.max(2,Math.ceil(Math.abs(Math.log2(totalTempo))));
 const tempo=totalTempo**(1/stages);
 const pitch=pitchFactor!==1||stretch!==1?`aresample=44100,asetrate=${sampleRate},aresample=44100,${Array(stages).fill(`atempo=${tempo}`).join(',')},`:'';
 const prepare=`${trimLeading?'silenceremove=start_periods=1:start_duration=0.015:start_threshold=-48dB:start_silence=0.015,':''}${pitch}`;
 let input=dir+raw;
 if(sustain){
  // Repeat the steady bowed body with overlapping seams, retaining the original attack.
  input=join(scratch,`${v.id}.wav`);
  const labels=Array.from({length:sustain.repeats},(_,i)=>`[branch${i}]`).join('');
  const graph=[`[0:a]${prepare}asplit=${sustain.repeats+1}[head]${labels}`,`[head]atrim=end=${sustain.end},asetpts=PTS-STARTPTS[part0]`];
  for(let i=0;i<sustain.repeats;i++){
   graph.push(`[branch${i}]atrim=start=${sustain.start}:end=${sustain.end},asetpts=PTS-STARTPTS[loop${i}]`);
   graph.push(`[part${i}][loop${i}]acrossfade=d=${sustain.crossfade}:c1=qsin:c2=qsin[part${i+1}]`);
  }
  run(['-i',dir+raw,'-filter_complex',graph.join(';'),'-map',`[part${sustain.repeats}]`,'-ar','44100',input]);
 }
 const tone=highShelfDb?`treble=g=${highShelfDb}:f=${highShelfHz}:t=q:w=0.707,`:'';
 const shape=`${sustain?'':prepare}${tone}atrim=duration=${seconds},asetpts=PTS-STARTPTS,afade=t=in:d=${fadeIn},areverse,afade=t=in:d=${fadeOut},areverse,`;
 const gain=lufs-Number(measure(input,shape).input_i);
 const solo=`audio/${v.id}-solo.mp3`;
 run(['-i',input,'-af',`${shape}volume=${gain.toFixed(2)}dB,aresample=176400,alimiter=limit=0.84:level=false,aresample=44100`,'-ar','44100','-b:a','160k',dir+solo]);
 v.solo=solo;v.mix=`audio/${v.id}-mix.mp3`;v.processing={lufs,seconds,leadingSilenceTrimmed:trimLeading,pitchFactor,stretch,fadeIn,fadeOut,...(highShelfDb?{highShelfDb,highShelfHz}:{}),...(sustain?{sustain}:{})};
 v.preview={...preview,...v.previewOverride};
 console.log(`${v.id} ${v.title}: ${measure(dir+solo,'').input_i} LUFS`);
}
const asset=name=>`${root}public/assets/audio/${name}.mp3`;
for(const v of [...spec.variants,{id:'baseline',mix:'audio/baseline-mix.mp3'}]){
 const timing=v.preview??preview;
 const inputs=['-ss',String(timing.dawnFrom),'-i',asset('music-dawn'),'-i',asset('music-flight'),'-i',asset('night-bed'),'-i',asset('island-wind'),'-i',asset('dawn-bed')];
 const start=v.id==='baseline'?6:timing.dropAt,fade=v.id==='baseline'?0.25:timing.dawnFade;
 const graph=[`[0:a]asetpts=PTS-STARTPTS,volume=0.8,afade=t=out:st=${start}:d=${fade}[dawn]`,
 `[1:a]atrim=duration=${timing.length-timing.flightAt},asetpts=PTS-STARTPTS,volume=1.6,adelay=${Math.round(timing.flightAt*1000)}:all=1[flight]`,
 '[2:a]volume=0.22[night]','[3:a]volume=0.85[wind]','[4:a]volume=0.45[birds]'];
 let labels='[dawn][flight][night][wind][birds]',count=5;
 if(v.solo){inputs.push('-i',dir+v.solo);graph.push(`[5:a]volume=0.8,adelay=${Math.round(timing.dropAt*1000)}:all=1[tone]`);labels+='[tone]';count++;}
 graph.push(`${labels}amix=inputs=${count}:normalize=0:duration=longest,atrim=duration=${timing.length},volume=0.9,alimiter=limit=0.89:level=false[out]`);
 run([...inputs,'-filter_complex',graph.join(';'),'-map','[out]','-ar','44100','-b:a','160k',dir+v.mix]);
}
spec.preview={...preview,notes:'Audio mockups. Effects start at foot release. 03C–03F use five-second crossfades and longer previews. 03D–03F retain their generated pitch. 03F2 and 03D2 tune those fresh performances to 03C’s register, preserve their duration without loops, and release over 2.5 seconds. 03G is a reference-guided native D5 performance with a 2.5-second release and no local pitch correction. 03I and 03J are softer native D5 performances at -30 LUFS, with a gentle -3 dB treble shelf. Game audio is unchanged.'};
writeFileSync(`${dir}generation.json`,JSON.stringify(spec,null,2)+'\n');
writeFileSync(`${dir}options.js`,'window.DROP_REVIEW = '+JSON.stringify(spec)+';\n');
rmSync(scratch,{recursive:true,force:true});
console.log(`Built ${spec.variants.length} isolated sounds and scene mixes, plus the current-score reference.`);
