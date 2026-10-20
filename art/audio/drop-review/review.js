const {variants,preview}=window.DROP_REVIEW;
const $=s=>document.querySelector(s), player=$('#player');
const key='dream-drop-review-v1';let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
let active=null,mode='mix',request=0;
const persist=()=>{try{localStorage.setItem(key,JSON.stringify(saved));}catch{ $('#status').textContent='Browser storage is unavailable. Save feedback before closing this page.'; }};
const format=t=>`${Math.floor((t||0)/60)}:${String(Math.floor((t||0)%60)).padStart(2,'0')}`;
const cueTime=t=>`0:${t.toFixed(2).padStart(5,'0')}`;
function summary(){const favorites=variants.filter(v=>saved[v.id]?.favorite);$('#summary').textContent=favorites.length?favorites.map(v=>`${v.id} — ${v.title}`).join(' · '):'No favorites yet. You can also simply tell me the take numbers.';}
for(const v of variants){
 const card=document.createElement('article');card.className=`card${v.revision||v.native||v.pitchMatched?' revision':''}`;card.dataset.id=v.id;card.id=`take-${v.id}`;
 card.innerHTML=`<div class="card-top"><span class="number">${v.id}</span><h3>${v.title}</h3><button class="star" aria-label="Favorite ${v.id}: ${v.title}" aria-pressed="false">☆</button></div><p>${v.description}</p><span class="harmony">${v.harmony}</span><div class="actions"><button class="primary mix" aria-label="Play scene mix ${v.id}">▶ Scene mix</button><button class="solo" aria-label="Play sound only ${v.id}">Sound only</button></div><label class="notes">Your notes<textarea placeholder="What works? What would you change?" aria-label="Notes for ${v.id}"></textarea></label>`;
 const star=card.querySelector('.star'),notes=card.querySelector('textarea');
 if(v.revision||v.native||v.pitchMatched){const tag=document.createElement('div');tag.className='revision-tag';tag.textContent=v.id===window.DROP_REVIEW.selected?'SELECTED · IN THE CINEMATIC':v.softMix?'NEW · SOFTER BOWING & MIX':v.targetMatched?'NEW · GENERATED AT D5':v.pitchMatched?'MATCHED PITCH · LONGER RELEASE':v.native?'NEW ELEVENLABS PERFORMANCE':`REVISION · FROM TAKE ${v.derivedFrom}`;card.prepend(tag);}
 function renderStar(){const on=!!saved[v.id]?.favorite;star.setAttribute('aria-pressed',on);star.textContent=on?'★':'☆';}
 renderStar();notes.value=saved[v.id]?.notes||'';
 star.addEventListener('click',()=>{saved[v.id]={...saved[v.id],favorite:!saved[v.id]?.favorite};renderStar();persist();summary();});
 notes.addEventListener('input',()=>{saved[v.id]={...saved[v.id],notes:notes.value};persist();});
 card.querySelector('.mix').addEventListener('click',()=>play(v,'mix'));card.querySelector('.solo').addEventListener('click',()=>play(v,'solo'));
 $('#cards').append(card);
}
async function play(v,nextMode){
 const token=++request;player.pause();active=v;mode=nextMode;player.src=v[mode];player.currentTime=0;player.volume=Number($('#volume').value);
 document.querySelectorAll('.card').forEach(c=>c.classList.toggle('active',c.dataset.id===v.id));
 $('#now-title').textContent=`${v.id==='baseline'?'Reference':v.id} — ${v.title}`;
 const timing=v.preview??preview;
 $('#now-detail').textContent=mode==='mix'?`Scene mix · drop at ${cueTime(timing.dropAt)} · flight at ${cueTime(timing.flightAt)}`:'Isolated sound · begins immediately';
 $('.marker.drop').style.left=`${100*timing.dropAt/timing.length}%`;
 $('.marker.flight').style.left=`${100*timing.flightAt/timing.length}%`;
 $('.stage-note').textContent=v.id==='baseline'?'Reference: the current dawn phrase and its original musical pause, without an added string cue.':`Preview mix: strings enter at DROP as dawn fades over ${timing.dawnFade} seconds. ${v.targetMatched?'Fresh reference-guided performance generated at D5, with no local pitch shift and a 2.5-second release. ':v.pitchMatched?'Fresh performance tuned to 03C’s register, fading away over 2.5 seconds. ':v.native?'Fresh performance at its generated pitch and speed. ':v.revision?'This longer version extends the preview before flight. ':''}${v.softMix?'Strings sit 6 dB lower than earlier auditions, with a gentler bright edge. ':''}A ${timing.silence}-second musical pause precedes flight. These auditions do not change the game.`;
 $('#timeline').classList.toggle('solo',mode==='solo');$('#status').textContent='Loading…';$('#toggle').disabled=false;$('#stop').disabled=false;update();
 try{await player.play();if(token===request)$('#status').textContent='';}catch(e){if(token===request&&e.name!=='AbortError')$('#status').textContent='Could not play this clip. Check that the audio folder is beside this page, then try again.';}
}
function update(){
 const timing=active?.preview??preview;
 const t=player.currentTime||0,d=Number.isFinite(player.duration)?player.duration:(mode==='mix'?timing.length:active?.processing?.seconds??3.25);
 $('#fill').style.width=`${Math.min(100,t/d*100)}%`;$('#clock').textContent=`${format(t)} / ${format(d)}`;
 $('#toggle').textContent=player.paused?'Play':'Pause';
 let phase=!active?'READY':player.ended?'FINISHED':player.paused?'PAUSED':mode==='solo'?'SOUND ONLY':t<timing.dropAt?'DAWN':t<timing.dropAt+0.4?'DROP':t<timing.flightAt-timing.silence?'EMPTY LEDGE':t<timing.flightAt?'MUSICAL PAUSE':'FLIGHT';
 $('#phase').textContent=phase;$('#phase').classList.toggle('at-drop',phase==='DROP');
}
player.addEventListener('timeupdate',update);for(const event of ['loadedmetadata','play','pause','ended'])player.addEventListener(event,update);
player.addEventListener('error',()=>{$('#status').textContent='Audio could not be loaded. Open this page through the project server, or keep its audio folder beside it.';});
$('#toggle').addEventListener('click',()=>{if(!active)return;if(player.paused){if(player.ended)player.currentTime=0;player.play().catch(()=>{$('#status').textContent='Playback could not start. Try selecting the take again.';});}else player.pause();});
$('#stop').addEventListener('click',()=>{request++;player.pause();player.currentTime=0;update();$('#status').textContent='';});
$('#volume').addEventListener('input',()=>player.volume=Number($('#volume').value));
$('#baseline').addEventListener('click',()=>play({id:'baseline',title:'Current dawn phrase',mix:'audio/baseline-mix.mp3'},'mix'));
function feedback(){return 'Drop sound review\n\n'+variants.filter(v=>saved[v.id]?.favorite||saved[v.id]?.notes).map(v=>`${saved[v.id]?.favorite?'★ ':''}${v.id} — ${v.title}\n${saved[v.id]?.notes||'Favorited'}`).join('\n\n');}
$('#copy').addEventListener('click',async()=>{const text=feedback();try{await navigator.clipboard.writeText(text);$('#status').textContent='Feedback copied. Paste it into our conversation.';}catch{$('#feedback').hidden=false;$('#feedback').value=text;$('#feedback').select();$('#status').textContent='Select and copy the feedback below.';}});
$('#download').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([feedback()],{type:'text/plain'}));const a=document.createElement('a');a.href=url;a.download='drop-sound-feedback.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
summary();update();
