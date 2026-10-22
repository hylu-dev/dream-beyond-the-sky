const storageKey='dream-pulse-review-v1';
let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{}
const player=document.querySelector('#player'),cards=document.querySelector('#cards'),status=document.querySelector('#status');
const save=()=>{try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{status.textContent='Browser storage is unavailable; copy your feedback before leaving.';}};
let active=null;
for(const option of window.PULSE_OPTIONS){
 const entry=saved[option.id]??={favorite:false,note:''};
 const card=document.createElement('article');card.className='card';card.dataset.id=option.id;card.classList.toggle('favorite',entry.favorite);
 card.innerHTML=`<div class="number">${option.id==='00'?'REFERENCE':option.round===1?'LAST ROUND':'ROUND 2'} · ${option.id}</div><h2>${option.title}</h2><p class="description">${option.description}</p><div class="actions"><button data-play="solo">Play pulse</button><button data-play="mix">Play in scene</button><button class="star" aria-label="Favorite ${option.title}" aria-pressed="${entry.favorite}">★</button></div><div class="timeline"><div class="progress"></div><i class="marker" hidden></i></div><div class="timing">Ready to compare</div><textarea aria-label="Notes for ${option.title}" placeholder="What works? What would you change?"></textarea>`;
 const notes=card.querySelector('textarea');notes.value=entry.note;notes.addEventListener('input',()=>{entry.note=notes.value;save();});
 card.querySelector('.star').addEventListener('click',e=>{entry.favorite=!entry.favorite;e.currentTarget.setAttribute('aria-pressed',String(entry.favorite));card.classList.toggle('favorite',entry.favorite);save();});
 for(const button of card.querySelectorAll('[data-play]'))button.addEventListener('click',async()=>{
  player.pause();for(const p of cards.querySelectorAll('.progress'))p.style.width='0';active={card,mode:button.dataset.play};player.src=option[active.mode==='mix'?'scene':'solo'];card.querySelector('.marker').hidden=active.mode!=='mix';
  status.textContent=`${option.id} — ${option.title} · ${active.mode==='mix'?'scene preview':'isolated pulse'}`;
  try{await player.play();}catch{status.textContent='Could not play this file. Check that the local preview server is running.';}
 });cards.append(card);
}
player.addEventListener('timeupdate',()=>{if(!active)return;active.card.querySelector('.progress').style.width=`${player.currentTime/(player.duration||1)*100}%`;active.card.querySelector('.timing').textContent=`${player.currentTime.toFixed(1)} / ${(player.duration||0).toFixed(1)} s${active.mode==='mix'?' · strike at 1 s':''}`;});
document.querySelector('#stop').onclick=()=>{player.pause();player.currentTime=0;status.textContent='Playback stopped.';};
document.querySelector('#copy').onclick=async()=>{const lines=['Sun pulse sound review',...window.PULSE_OPTIONS.filter(o=>saved[o.id]?.favorite||saved[o.id]?.note).map(o=>`${saved[o.id].favorite?'★ ':''}${o.id} — ${o.title}\n${saved[o.id].note}`)];try{await navigator.clipboard.writeText(lines.join('\n\n'));status.textContent='Feedback copied.';}catch{status.textContent=lines.join(' · ');}};
