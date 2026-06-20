'use strict';

const K={cache:'m3u_cache_v2',sett:'m3u_sett_v2',favs:'m3u_favs_v1',hist:'m3u_hist_v1',lastCh:'m3u_lastch'};
const ACCENTS=[
  {n:'Purple',v:'#7c6fff',d:'rgba(124,111,255,.28)',g:'rgba(124,111,255,.15)'},
  {n:'Blue',v:'#4f9fff',d:'rgba(79,159,255,.28)',g:'rgba(79,159,255,.15)'},
  {n:'Teal',v:'#00d4aa',d:'rgba(0,212,170,.28)',g:'rgba(0,212,170,.15)'},
  {n:'Pink',v:'#ff5f9e',d:'rgba(255,95,158,.28)',g:'rgba(255,95,158,.15)'},
  {n:'Orange',v:'#ff8c42',d:'rgba(255,140,66,.28)',g:'rgba(255,140,66,.15)'},
  {n:'Green',v:'#4ecb71',d:'rgba(78,203,113,.28)',g:'rgba(78,203,113,.15)'},
];

let allChannels=[],filtered=[],currentCh=null,currentCat='all',searchQ='',sortMode='custom',gridView=false;
let hls=null,srcName='',srcUrl=null,dragSrcId=null,ctxCh=null,uiTimer=null;
let retryTimer=null,retryCount=0,sleepTimerInt=null,sleepEnd=null,hlsErrHandled=false,ccEnabled=false;
let xtVod=false,xtSeries=false;
let settings={autoPlay:false,rememberVol:true,autoRetry:true,retryDelay:10,showInfo:false,accent:0,vol:1};
let favorites=new Set(),history=[];

const stor={
  get:k=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):null;}catch{return null;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{}},
  del:k=>{try{localStorage.removeItem(k);}catch{}}
};

function loadSett(){const s=stor.get(K.sett);if(s)settings={...settings,...s};}
function saveSett(){stor.set(K.sett,settings);}
function loadFavs(){const f=stor.get(K.favs);if(f)favorites=new Set(f);}
function saveFavs(){stor.set(K.favs,[...favorites]);}
function loadHist(){history=stor.get(K.hist)||[];}
function saveHist(){stor.set(K.hist,history.slice(0,30));}
function isFav(ch){return favorites.has(ch.url);}
function toggleFav(ch){isFav(ch)?favorites.delete(ch.url):favorites.add(ch.url);saveFavs();buildCats();renderChannels();}
function addHistory(ch){history=[ch.url,...history.filter(u=>u!==ch.url)].slice(0,30);saveHist();}
function removeHistory(url){history=history.filter(u=>u!==url);saveHist();buildCats();renderChannels();}
function saveCache(chs,name,url){stor.set(K.cache,{channels:chs,name,url:url||null,at:Date.now()});}
function loadCache(){return stor.get(K.cache);}
function clearCacheData(){[K.cache,K.lastCh].forEach(k=>stor.del(k));}
function timeAgo(ts){const s=Math.floor((Date.now()-ts)/1000);if(s<60)return 'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago';}
const isMobile=()=>window.innerWidth<768;
const esc=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ── Mobile sidebar ──────────────────────────
function openSidebar(){
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sb-back').classList.add('show');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sb-back').classList.remove('show');
  // also hide mobile search bar
  document.getElementById('swrap').classList.remove('show');
}

document.getElementById('hambtn').addEventListener('click',openSidebar);
document.getElementById('sb-back').addEventListener('click',closeSidebar);

// ── Mobile search toggle ─────────────────────
// On mobile, toggling search also opens/closes the sidebar drawer
document.getElementById('srchbtn').addEventListener('click',()=>{
  const sw=document.getElementById('swrap');
  const wasShown=sw.classList.contains('show');
  sw.classList.toggle('show');
  if(!wasShown){
    document.getElementById('sinput').focus();
    if(isMobile())openSidebar();
  }else{
    // close: clear search so sidebar shows all channels next time
    searchQ='';
    document.getElementById('sinput').value='';
    renderChannels();
  }
});

// ── Mobile "channel list" button in ibar ─────
function updateMobileListBtn(){
  document.getElementById('ib-list').style.display=isMobile()?'flex':'none';
}
document.getElementById('ib-list').addEventListener('click',openSidebar);
window.addEventListener('resize',updateMobileListBtn);

// ── M3U Parser ──────────────────────────────
function parseM3U(text){
  const lines=text.split(/\r?\n/),out=[];
  let cur=null;
  for(const raw of lines){
    const line=raw.trim();if(!line)continue;
    if(line.startsWith('#EXTINF:')){cur=parseExtInf(line);}
    else if(line.startsWith('#')){}
    else if(cur){cur.url=line;cur.id=out.length;out.push(cur);cur=null;}
    else{const name=decodeURIComponent(line.split('/').pop().split('?')[0])||'Ch '+(out.length+1);out.push({id:out.length,name,logo:'',group:'Uncategorized',url:line,duration:-1});}
  }return out;
}
function parseExtInf(line){
  const ch={name:'',logo:'',group:'Uncategorized',duration:-1};
  const dm=line.match(/#EXTINF:\s*(-?\d+)/);if(dm)ch.duration=parseInt(dm[1]);
  let m;const re=/(\S+?)="([^"]*)"/g;
  while((m=re.exec(line))!==null){
    if(m[1]==='tvg-logo')ch.logo=m[2];
    if(m[1]==='tvg-name')ch.tvgName=m[2];
    if(m[1]==='group-title')ch.group=m[2]||'Uncategorized';
  }
  const nm=line.match(/,(.+)$/);if(nm)ch.name=nm[1].trim();
  if(!ch.name)ch.name=ch.tvgName||'Channel';
  return ch;
}

async function loadFromText(text,name,url){
  showLoad('Parsing playlist…');await tick();
  const chs=parseM3U(text);hideLoad();
  if(!chs.length){showWErr('No channels found.');return;}
  saveCache(chs,name,url||null);
  initApp(chs,name,url||null,false);
}
async function loadFromUrl(url){
  showLoad('Fetching playlist…');setProg('Connecting…');
  const proxies=[u=>u,u=>`https://corsproxy.io/?${encodeURIComponent(u)}`,u=>`https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`];
  let text=null;
  for(let i=0;i<proxies.length;i++){
    setProg(i===0?'Direct connection…':'CORS proxy…');
    try{const r=await fetch(proxies[i](url),{signal:AbortSignal.timeout(15000)});if(!r.ok)continue;const t=await r.text();if(t&&(t.includes('#EXTM3U')||t.includes('#EXTINF')||t.trim().startsWith('http'))){text=t;break;}}catch{}
  }
  hideLoad();
  if(!text){showWErr('Could not fetch playlist. Try uploading the file directly.');return;}
  const name=(() => { try { return new URL(url).pathname.split('/').pop()||url; } catch { return url; } })();
  await loadFromText(text,name,url);
}

function initApp(chs,name,url,fromCache){
  allChannels=chs;srcName=name;srcUrl=url;
  document.getElementById('welcome').style.display='none';
  document.getElementById('app').classList.add('visible');
  document.getElementById('stat-n').textContent=chs.length.toLocaleString();
  document.getElementById('cpill').classList.toggle('show',fromCache);
  updateMobileListBtn();
  updateSpPl();buildCats();renderChannels();
}
function updateSpPl(){
  document.getElementById('sp-plname').textContent=srcName||'Unnamed playlist';
  const c=loadCache();
  document.getElementById('sp-plmeta').textContent=c?`${allChannels.length.toLocaleString()} channels · ${timeAgo(c.at)}`:`${allChannels.length.toLocaleString()} channels`;
}
function buildCats(){
  const counts={};allChannels.forEach(c=>{counts[c.group]=(counts[c.group]||0)+1;});
  const groups=Object.keys(counts).sort();
  const el=document.getElementById('cats');el.innerHTML='';
  const mk=(label,cat,count)=>{
    const b=document.createElement('button');
    b.className='catbtn'+(cat===currentCat?' on':'');b.dataset.cat=cat;
    b.innerHTML=`${esc(label)}<span class="catcount">${count}</span>`;
    b.addEventListener('click',()=>{document.querySelectorAll('.catbtn').forEach(x=>x.classList.remove('on'));b.classList.add('on');currentCat=cat;renderChannels();});
    return b;
  };
  el.appendChild(mk('All','all',allChannels.length));
  const hc=history.map(u=>allChannels.find(c=>c.url===u)).filter(Boolean);
  if(hc.length)el.appendChild(mk('🕐 History','history',hc.length));
  const fc=allChannels.filter(c=>isFav(c)).length;
  if(fc)el.appendChild(mk('★ Favs','favs',fc));
  groups.slice(0,80).forEach(g=>el.appendChild(mk(g,g,counts[g])));
}
function renderChannels(){
  const list=document.getElementById('chlist');
  const q=searchQ.toLowerCase();
  let arr;
  if(currentCat==='history')arr=history.map(u=>allChannels.find(c=>c.url===u)).filter(Boolean).filter(c=>!q||c.name.toLowerCase().includes(q)||c.group.toLowerCase().includes(q));
  else arr=allChannels.filter(c=>{
    const catOk=currentCat==='all'?true:currentCat==='favs'?isFav(c):c.group===currentCat;
    return catOk&&(!q||c.name.toLowerCase().includes(q)||c.group.toLowerCase().includes(q));
  });
  if(sortMode==='az')arr=[...arr].sort((a,b)=>a.name.localeCompare(b.name));
  else if(sortMode==='za')arr=[...arr].sort((a,b)=>b.name.localeCompare(a.name));
  else if(sortMode==='group')arr=[...arr].sort((a,b)=>a.group.localeCompare(b.group)||a.name.localeCompare(b.name));
  else if(sortMode==='fav')arr=[...arr].sort((a,b)=>(isFav(b)?1:0)-(isFav(a)?1:0));
  filtered=arr;
  document.getElementById('sbcount').textContent=arr.length.toLocaleString()+' channels';
  if(!arr.length){list.innerHTML='<div class="noresult"><div class="noresult-icon">🔍</div>No channels found</div>';return;}
  list.innerHTML='';
  const frag=document.createDocumentFragment();
  arr.forEach((ch,idx)=>{
    const el=document.createElement('div');
    el.className='chi'+(currentCh?.id===ch.id?' on':'');
    el.style.animationDelay=Math.min(idx*5,150)+'ms';
    el.dataset.id=ch.id;el.draggable=!isMobile();
    const fav=isFav(ch);
    el.innerHTML=`
      <div class="chi-drag"><svg viewBox="0 0 24 24" fill="currentColor" opacity=".5"><circle cx="9" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg></div>
      ${ch.logo?`<div class="chi-logo"><img src="${esc(ch.logo)}" loading="lazy" onerror="this.parentNode.innerHTML='📺'"/></div>`:'<div class="chi-logo">📺</div>'}
      <div class="chi-info"><div class="chi-name">${esc(ch.name)}</div><div class="chi-grp">${esc(ch.group)}</div></div>
      <div class="chi-right">${ch.duration<=0?'<span class="chi-live">LIVE</span>':''}<button class="chi-favbtn${fav?' on':''}">${fav?'★':'☆'}</button></div>`;
    el.querySelector('.chi-favbtn').addEventListener('click',e=>{e.stopPropagation();toggleFav(ch);});
    el.addEventListener('click',()=>{playChannel(ch);if(isMobile())closeSidebar();});
    el.addEventListener('contextmenu',e=>{e.preventDefault();openCtx(e,ch);});
    el.addEventListener('dragstart',e=>{dragSrcId=ch.id;e.dataTransfer.effectAllowed='move';setTimeout(()=>el.classList.add('dragging'),0);});
    el.addEventListener('dragend',()=>{el.classList.remove('dragging','drop-above','drop-below');dragSrcId=null;});
    el.addEventListener('dragover',e=>{e.preventDefault();if(dragSrcId===ch.id)return;document.querySelectorAll('.chi').forEach(x=>x.classList.remove('drop-above','drop-below'));const mid=el.getBoundingClientRect().top+el.getBoundingClientRect().height/2;el.classList.add(e.clientY<mid?'drop-above':'drop-below');});
    el.addEventListener('dragleave',()=>el.classList.remove('drop-above','drop-below'));
    el.addEventListener('drop',e=>{e.preventDefault();if(dragSrcId===null||dragSrcId===ch.id)return;reorder(dragSrcId,ch.id,el.classList.contains('drop-above'));el.classList.remove('drop-above','drop-below');});
    frag.appendChild(el);
  });
  list.appendChild(frag);
}

function reorder(srcId,tgtId,before){
  const si=allChannels.findIndex(c=>c.id===srcId);const[moved]=allChannels.splice(si,1);
  const ti=allChannels.findIndex(c=>c.id===tgtId);allChannels.splice(before?ti:ti+1,0,moved);
  sortMode='custom';document.getElementById('sort-label').textContent='Custom';
  document.querySelectorAll('.sortopt').forEach(o=>o.classList.toggle('on',o.dataset.sort==='custom'));
  saveCache(allChannels,srcName,srcUrl);renderChannels();
}

// ── Context menu ────────────────────────────
function openCtx(e,ch){
  ctxCh=ch;const fav=isFav(ch);
  document.getElementById('ctx-fav').childNodes[document.getElementById('ctx-fav').childNodes.length-1].textContent=fav?' Remove from Favorites':' Add to Favorites';
  document.getElementById('ctx-history').style.display=history.includes(ch.url)?'flex':'none';
  const ctx=document.getElementById('ctx');
  ctx.style.left=Math.min(e.clientX,window.innerWidth-200)+'px';
  ctx.style.top=Math.min(e.clientY,window.innerHeight-200)+'px';
  ctx.classList.add('open');
}
document.addEventListener('click',e=>{if(!e.target.closest('#ctx'))closeCtx();});
document.getElementById('ctx-fav').addEventListener('click',()=>{if(ctxCh)toggleFav(ctxCh);closeCtx();});
document.getElementById('ctx-top').addEventListener('click',()=>{if(!ctxCh)return;const i=allChannels.findIndex(c=>c.id===ctxCh.id);if(i>0){const[m]=allChannels.splice(i,1);allChannels.unshift(m);saveCache(allChannels,srcName,srcUrl);renderChannels();}closeCtx();});
document.getElementById('ctx-history').addEventListener('click',()=>{if(ctxCh)removeHistory(ctxCh.url);closeCtx();});
document.getElementById('ctx-copy').addEventListener('click',()=>{if(ctxCh)navigator.clipboard.writeText(ctxCh.url).catch(()=>{});closeCtx();});
document.getElementById('ctx-play').addEventListener('click',()=>{if(ctxCh)playChannel(ctxCh);closeCtx();});
function closeCtx(){document.getElementById('ctx').classList.remove('open');ctxCh=null;}

// ── Sort ────────────────────────────────────
document.getElementById('sortbtn').addEventListener('click',e=>{e.stopPropagation();document.getElementById('sortdd').classList.toggle('open');});
document.querySelectorAll('.sortopt').forEach(o=>o.addEventListener('click',()=>{sortMode=o.dataset.sort;document.getElementById('sort-label').textContent=o.textContent.trim();document.querySelectorAll('.sortopt').forEach(x=>x.classList.toggle('on',x===o));document.getElementById('sortdd').classList.remove('open');renderChannels();}));
document.addEventListener('click',e=>{if(!e.target.closest('.sort-wrap'))document.getElementById('sortdd').classList.remove('open');});

// ── List / Grid ─────────────────────────────
document.getElementById('vbtn-list').addEventListener('click',()=>setView(false));
document.getElementById('vbtn-grid').addEventListener('click',()=>setView(true));
function setView(grid){gridView=grid;document.getElementById('chlist').classList.toggle('grid',grid);document.getElementById('vbtn-list').classList.toggle('on',!grid);document.getElementById('vbtn-grid').classList.toggle('on',grid);}

// ── Player ──────────────────────────────────
function playChannel(ch){
  currentCh=ch;addHistory(ch);stor.set(K.lastCh,ch.id);
  retryCount=0;clearRetryTimer();
  document.querySelectorAll('.chi').forEach(el=>el.classList.toggle('on',parseInt(el.dataset.id)===ch.id));
  document.getElementById('empty').style.display='none';
  document.getElementById('player').classList.add('on');
  updateInfoUI(ch);hideErr();setBuf(true);setPlaySvg(false);
  document.getElementById('live-pill').style.display=ch.duration<=0?'flex':'none';
  document.getElementById('speedbtn').classList.toggle('show',ch.duration>0);
  // reset CC + quality
  ccEnabled=false;
  document.getElementById('ctrl-cc').style.display='none';
  document.getElementById('ctrl-cc').classList.remove('cc-on');
  document.getElementById('qualitybtn').classList.remove('show');
  document.getElementById('qualitybtn').textContent='Auto';
  document.getElementById('qualitymenu').innerHTML='';
  document.getElementById('qualitymenu').classList.remove('open');
  document.getElementById('pbuf').style.width='0';
  if(hls){hls.destroy();hls=null;}
  const vid=document.getElementById('vid');
  vid.pause();vid.src='';vid.playbackRate=1;
  document.getElementById('speedbtn').textContent='1×';
  document.querySelectorAll('.speedopt').forEach(o=>o.classList.toggle('on',o.dataset.s==='1'));
  const url=ch.url,isHLS=/\.m3u8|\/live|\/stream|hls|iptv/i.test(url);
  if(Hls.isSupported()&&isHLS){
    hlsErrHandled=false;
    hls=new Hls({enableWorker:true,lowLatencyMode:true,backBufferLength:30,
      fragLoadingMaxRetry:2,manifestLoadingMaxRetry:2,levelLoadingMaxRetry:2});
    hls.loadSource(url);hls.attachMedia(vid);
    hls.on(Hls.Events.MANIFEST_PARSED,()=>{
      setBuf(false);vid.play().catch(e=>onPlayBlocked(e));
      if(hls.levels.length>1)buildQualityMenu(hls.levels);
    });
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED,(_,d)=>{
      if(d.subtitleTracks.length>0){
        hls.subtitleDisplay=true;hls.subtitleTrack=0;
        ccEnabled=true;
        document.getElementById('ctrl-cc').style.display='flex';
        document.getElementById('ctrl-cc').classList.add('cc-on');
      }
    });
    hls.on(Hls.Events.LEVEL_UPDATED,()=>updateStreamInfo());
    hls.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal&&!hlsErrHandled){hlsErrHandled=true;setBuf(false);handleStreamErr(hlsMsg(d));}});
  }else if(vid.canPlayType('application/vnd.apple.mpegurl')){
    vid.src=url;setBuf(false);vid.play().catch(e=>onPlayBlocked(e));
  }else{
    vid.src=url;setBuf(false);vid.play().catch(e=>{
      if(e?.name==='NotAllowedError')onPlayBlocked(e);else handleStreamErr('Stream format not supported');
    });
  }
  scrollIntoSb(ch.id);
}
function hlsMsg(d){if(d.type===Hls.ErrorTypes.NETWORK_ERROR)return 'Network error — channel unreachable';if(d.type===Hls.ErrorTypes.MEDIA_ERROR)return 'Media error — unsupported format';return 'Playback error';}
function onPlayBlocked(e){
  if(e?.name==='NotAllowedError'){setBuf(false);setPlaySvg(true);vwrap.classList.add('paused','ui-on');clearTimeout(uiTimer);}
}

// ── CC / Subtitles ───────────────────────────
function toggleCC(){
  ccEnabled=!ccEnabled;
  document.getElementById('ctrl-cc').classList.toggle('cc-on',ccEnabled);
  if(hls){
    hls.subtitleDisplay=ccEnabled;
    if(ccEnabled&&hls.subtitleTrack===-1)hls.subtitleTrack=0;
  }
  for(const t of vid.textTracks){
    if(t.kind==='subtitles'||t.kind==='captions')t.mode=ccEnabled?'showing':'hidden';
  }
}

// ── Quality selector ─────────────────────────
function buildQualityMenu(levels){
  const menu=document.getElementById('qualitymenu');
  const btn=document.getElementById('qualitybtn');
  menu.innerHTML='';
  const makeOpt=(label,idx)=>{
    const el=document.createElement('div');
    el.className='speedopt'+(idx===-1?' on':'');
    el.textContent=label;
    el.addEventListener('click',()=>{
      hls.currentLevel=idx;
      btn.textContent=idx===-1?'Auto':label;
      menu.querySelectorAll('.speedopt').forEach(x=>x.classList.toggle('on',x===el));
      menu.classList.remove('open');
    });
    return el;
  };
  menu.appendChild(makeOpt('Auto',-1));
  [...levels].reverse().forEach((l,ri)=>{
    const origIdx=levels.length-1-ri;
    const label=l.height?l.height+'p':Math.round(l.bitrate/1000)+'k';
    menu.appendChild(makeOpt(label,origIdx));
  });
  btn.classList.add('show');
}

// ── Buffered bar ─────────────────────────────
function updateBuffered(){
  if(!vid.duration||!isFinite(vid.duration))return;
  const b=vid.buffered;
  if(b.length>0)document.getElementById('pbuf').style.width=(b.end(b.length-1)/vid.duration*100)+'%';
}

function updateInfoUI(ch){
  ['vt','ib'].forEach(p=>{
    const le=document.getElementById(p+'-logo'),ee=document.getElementById(p+'-em');
    let img=le.querySelector('img');
    if(ch.logo){if(!img){img=document.createElement('img');img.onerror=()=>{img.remove();ee.style.display=''};le.appendChild(img);}ee.style.display='none';img.src=ch.logo;}
    else{if(img)img.remove();ee.style.display='';}
  });
  document.getElementById('vt-name').textContent=ch.name;document.getElementById('vt-grp').textContent=ch.group;
  document.getElementById('ib-name').textContent=ch.name;document.getElementById('ib-grp').textContent=ch.group;
  document.getElementById('qbadge').textContent=ch.duration<=0?'LIVE':'VOD';clearStreamInfo();
}
function updateStreamInfo(){
  if(!hls||!settings.showInfo)return;
  const lvl=hls.levels[hls.currentLevel];if(!lvl)return;
  document.getElementById('si-res').textContent=lvl.width&&lvl.height?`${lvl.width}×${lvl.height}`:'—';
  document.getElementById('si-bit').textContent=lvl.bitrate?Math.round(lvl.bitrate/1000)+'kbps':'—';
  document.getElementById('si-fps').textContent=lvl.attrs?.['FRAME-RATE']||'—';
  document.getElementById('qbadge').textContent=lvl.height?lvl.height+'p':'LIVE';
}
function clearStreamInfo(){['si-res','si-bit','si-fps'].forEach(id=>document.getElementById(id).textContent='—');}
function applyShowInfo(on){document.getElementById('stream-info').classList.toggle('show',on);}

// ── Auto-retry ──────────────────────────────
function handleStreamErr(msg){
  setBuf(false);
  if(settings.autoRetry&&retryCount<3){
    retryCount++;let sec=settings.retryDelay;
    const ve=document.getElementById('verr');ve.classList.add('on');
    document.getElementById('verr-icon').textContent='🔄';
    document.getElementById('verr-title').textContent=`Auto-retrying (${retryCount}/3)`;
    document.getElementById('verr-msg').textContent=msg;
    document.getElementById('verr-countdown').style.display='block';
    document.getElementById('verr-prog-wrap').style.display='block';
    document.getElementById('verr-prog-fill').style.width='100%';
    document.getElementById('btn-cancel-retry').style.display='block';
    document.getElementById('btn-retry').style.display='none';
    const upd=()=>{document.getElementById('verr-countdown').textContent=sec+'s';document.getElementById('verr-prog-fill').style.width=((sec/settings.retryDelay)*100)+'%';};
    upd();retryTimer=setInterval(()=>{sec--;if(sec<=0){clearRetryTimer();hideErr();if(currentCh)playChannel(currentCh);}else upd();},1000);
  }else showErr(msg);
}
function clearRetryTimer(){clearInterval(retryTimer);retryTimer=null;document.getElementById('verr-countdown').style.display='none';document.getElementById('verr-prog-wrap').style.display='none';document.getElementById('btn-cancel-retry').style.display='none';document.getElementById('btn-retry').style.display='block';document.getElementById('verr-icon').textContent='⚠️';document.getElementById('verr-title').textContent='Playback failed';}

// ── Sleep timer ─────────────────────────────
function setSleepTimer(minutes){clearSleepTimer();if(!minutes)return;sleepEnd=Date.now()+minutes*60000;updateSleepDisplay();sleepTimerInt=setInterval(()=>{if(Date.now()>=sleepEnd){clearSleepTimer();document.getElementById('vid').pause();showErr('Sleep timer ended — playback paused');}else updateSleepDisplay();},1000);}
function clearSleepTimer(){clearInterval(sleepTimerInt);sleepTimerInt=null;sleepEnd=null;document.getElementById('sleep-display').classList.remove('show');document.querySelectorAll('.sleep-preset').forEach(b=>b.classList.remove('on'));}
function updateSleepDisplay(){const rem=Math.max(0,sleepEnd-Date.now()),m=Math.floor(rem/60000),s=Math.floor((rem%60000)/1000);document.getElementById('sleep-txt').textContent=m+':'+(String(s).padStart(2,'0'));document.getElementById('sleep-display').classList.add('show');}
document.getElementById('sleep-display').addEventListener('click',()=>clearSleepTimer());

// ── Video events ────────────────────────────
const vid=document.getElementById('vid');
const vwrap=document.getElementById('vwrap');
function showUI(){vwrap.classList.add('ui-on');clearTimeout(uiTimer);uiTimer=setTimeout(()=>{if(!vid.paused)vwrap.classList.remove('ui-on');},3500);}
vwrap.addEventListener('mousemove',()=>{if(!isMobile())showUI();});
vwrap.addEventListener('mouseleave',()=>{if(!isMobile()&&!vid.paused)vwrap.classList.remove('ui-on');});

let lastTouchTime=0;
vwrap.addEventListener('touchend',e=>{
  if(e.target.closest('.cbtn,.bigplay,.prog,.speedwrap'))return;
  e.preventDefault();
  const now=Date.now();
  if(now-lastTouchTime<300){togglePlay();lastTouchTime=0;return;}
  lastTouchTime=now;
  if(vwrap.classList.contains('ui-on')){clearTimeout(uiTimer);uiTimer=setTimeout(()=>vwrap.classList.remove('ui-on'),3500);}
  else showUI();
},{passive:false});

vwrap.addEventListener('click',e=>{if(!isMobile()&&(e.target===vid||e.target===vwrap||e.target.classList.contains('vlay')))togglePlay();});
vwrap.addEventListener('dblclick',e=>{if(!isMobile()&&!e.target.closest('.cbtn,.bigplay,.prog,.speedwrap'))toggleFS();});

vid.addEventListener('waiting',()=>setBuf(true));
vid.addEventListener('playing',()=>{setBuf(false);setPlaySvg(false);vwrap.classList.remove('paused');if(!isMobile())showUI();});
vid.addEventListener('canplay',()=>setBuf(false));
vid.addEventListener('pause',()=>{setPlaySvg(true);vwrap.classList.add('paused','ui-on');clearTimeout(uiTimer);});
vid.addEventListener('error',()=>{if(!hls){setBuf(false);handleStreamErr('Playback error');}});
vid.addEventListener('progress',updateBuffered);
// Native subtitle tracks: enable by default on load
vid.addEventListener('loadedmetadata',()=>{
  if(hls)return; // HLS.js handles its own subs
  let hasSubs=false;
  for(const t of vid.textTracks){
    if(t.kind==='subtitles'||t.kind==='captions'){t.mode='showing';hasSubs=true;}
  }
  if(hasSubs){ccEnabled=true;document.getElementById('ctrl-cc').style.display='flex';document.getElementById('ctrl-cc').classList.add('cc-on');}
});
vid.addEventListener('timeupdate',()=>{
  if(vid.duration&&isFinite(vid.duration)){
    const p=vid.currentTime/vid.duration;
    document.getElementById('pfill').style.width=(p*100)+'%';
    document.getElementById('pthumb').style.right=((1-p)*100)+'%';
    document.getElementById('tdisp').textContent=fmtT(vid.currentTime)+' / '+fmtT(vid.duration);
    updateBuffered();
  }else document.getElementById('tdisp').textContent='LIVE';
});
const fmtT=s=>{const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=Math.floor(s%60);return h?`${h}:${pad(m)}:${pad(sc)}`:`${m}:${pad(sc)}`;};
const pad=n=>String(n).padStart(2,'0');

// ── Controls ────────────────────────────────
function navCh(d){const i=filtered.findIndex(c=>c.id===currentCh?.id);const n=filtered[i+d];if(n){playChannel(n);scrollIntoSb(n.id);}}
function togglePlay(){vid.paused?vid.play():vid.pause();}
function toggleMute(){vid.muted=!vid.muted;document.getElementById('vol').value=vid.muted?0:vid.volume;updateVolSvg();}

function toggleFS(){
  const isFS=document.fullscreenElement||document.webkitFullscreenElement||document.mozFullScreenElement;
  if(isFS){(document.exitFullscreen||document.webkitExitFullscreen||document.mozCancelFullScreen||document.msExitFullscreen).call(document);}
  else{
    if(vid.webkitEnterFullscreen){vid.webkitEnterFullscreen();return;}
    const el=vwrap;
    (el.requestFullscreen||el.webkitRequestFullscreen||el.mozRequestFullScreen||el.msRequestFullscreen).call(el);
  }
}

document.getElementById('bigplay').addEventListener('click',togglePlay);
document.getElementById('ctrl-play').addEventListener('click',togglePlay);
document.getElementById('ctrl-prev').addEventListener('click',()=>navCh(-1));
document.getElementById('ctrl-next').addEventListener('click',()=>navCh(1));
document.getElementById('ib-prev').addEventListener('click',()=>navCh(-1));
document.getElementById('ib-next').addEventListener('click',()=>navCh(1));
document.getElementById('ctrl-mute').addEventListener('click',toggleMute);
document.getElementById('ctrl-fs').addEventListener('click',toggleFS);
document.getElementById('ctrl-cc').addEventListener('click',toggleCC);
document.getElementById('btn-retry').addEventListener('click',()=>{retryCount=0;if(currentCh)playChannel(currentCh);});
document.getElementById('btn-cancel-retry').addEventListener('click',()=>{clearRetryTimer();hideErr();});

document.getElementById('vol').addEventListener('input',e=>{vid.volume=+e.target.value;vid.muted=+e.target.value===0;if(settings.rememberVol){settings.vol=+e.target.value;saveSett();}updateVolSvg();});
document.getElementById('prog').addEventListener('click',e=>{if(vid.duration&&isFinite(vid.duration)){const r=e.currentTarget.getBoundingClientRect();vid.currentTime=((e.clientX-r.left)/r.width)*vid.duration;}});
document.getElementById('prog').addEventListener('mousemove',e=>{
  if(!vid.duration||!isFinite(vid.duration))return;
  const r=e.currentTarget.getBoundingClientRect(),pct=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));
  const tip=document.getElementById('ptip');
  tip.textContent=fmtT(pct*vid.duration);
  tip.style.left=(pct*100)+'%';
});
document.getElementById('ctrl-pip').addEventListener('click',()=>{if(document.pictureInPictureElement)document.exitPictureInPicture().catch(()=>{});else if(vid.requestPictureInPicture)vid.requestPictureInPicture().catch(()=>{});});
document.getElementById('ctrl-shot').addEventListener('click',()=>{const c=document.createElement('canvas');c.width=vid.videoWidth;c.height=vid.videoHeight;c.getContext('2d').drawImage(vid,0,0);c.toBlob(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=(currentCh?.name||'shot').replace(/[^a-z0-9]/gi,'_')+'.png';a.click();});});
document.querySelectorAll('.speedopt').forEach(o=>o.addEventListener('click',()=>{vid.playbackRate=parseFloat(o.dataset.s);document.getElementById('speedbtn').textContent=o.dataset.s+'×';document.querySelectorAll('.speedopt').forEach(x=>x.classList.toggle('on',x===o));document.getElementById('speedmenu').classList.remove('open');}));
document.getElementById('speedbtn').addEventListener('click',e=>{e.stopPropagation();document.getElementById('qualitymenu').classList.remove('open');document.getElementById('speedmenu').classList.toggle('open');});
document.getElementById('qualitybtn').addEventListener('click',e=>{e.stopPropagation();document.getElementById('speedmenu').classList.remove('open');document.getElementById('qualitymenu').classList.toggle('open');});
document.addEventListener('click',e=>{if(!e.target.closest('.speedwrap')){document.getElementById('speedmenu').classList.remove('open');document.getElementById('qualitymenu').classList.remove('open');}});

function updateVolSvg(){
  const mu=vid.muted||vid.volume===0,lo=!mu&&vid.volume<0.5;
  document.getElementById('vol-svg').innerHTML=mu?'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="white"/><line x1="23" y1="9" x2="17" y2="15" stroke="white"/><line x1="17" y1="9" x2="23" y2="15" stroke="white"/>':lo?'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke="white" fill="none"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="white" fill="none"/>':'<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" stroke="white" fill="none"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" stroke="white" fill="none"/>';
}
function setPlaySvg(paused){const play='<path d="M5 3l14 9L5 21V3z" fill="white"/>',pause='<rect x="6" y="4" width="4" height="16" rx="1" fill="white"/><rect x="14" y="4" width="4" height="16" rx="1" fill="white"/>';[document.getElementById('bigplay-svg'),document.getElementById('play-svg')].forEach(s=>s.innerHTML=paused?play:pause);}
function setBuf(v){document.getElementById('vbuf').classList.toggle('on',v);}
function showErr(msg){document.getElementById('verr-msg').textContent=msg;document.getElementById('verr').classList.add('on');}
function hideErr(){document.getElementById('verr').classList.remove('on');}
function scrollIntoSb(id){const el=document.querySelector(`.chi[data-id="${id}"]`);if(el)el.scrollIntoView({block:'nearest',behavior:'smooth'});}

// ── Settings panel ──────────────────────────
document.getElementById('btn-settings').addEventListener('click',openSP);
document.getElementById('sp-close').addEventListener('click',closeSP);
document.getElementById('spback').addEventListener('click',closeSP);
function openSP(){document.getElementById('spback').classList.add('open');document.getElementById('sp').classList.add('open');syncToggles();updateSpPl();}
function closeSP(){document.getElementById('spback').classList.remove('open');document.getElementById('sp').classList.remove('open');}
function syncToggles(){document.querySelectorAll('.toggle[data-key]').forEach(t=>t.classList.toggle('on',!!settings[t.dataset.key]));document.getElementById('retry-delay-row').style.display=settings.autoRetry?'flex':'none';document.getElementById('retry-delay-sel').value=settings.retryDelay;}
document.querySelectorAll('.toggle[data-key]').forEach(tog=>{tog.addEventListener('click',()=>{const k=tog.dataset.key;settings[k]=!settings[k];tog.classList.toggle('on',settings[k]);if(k==='autoRetry')document.getElementById('retry-delay-row').style.display=settings.autoRetry?'flex':'none';if(k==='showInfo')applyShowInfo(settings.showInfo);if(k==='rememberVol'&&settings.rememberVol)settings.vol=vid.volume;saveSett();});});
document.getElementById('retry-delay-sel').addEventListener('change',e=>{settings.retryDelay=parseInt(e.target.value);saveSett();});
document.querySelectorAll('.sleep-preset').forEach(btn=>btn.addEventListener('click',()=>{const m=parseInt(btn.dataset.m);document.querySelectorAll('.sleep-preset').forEach(b=>b.classList.remove('on'));if(m>0){btn.classList.add('on');setSleepTimer(m);}else clearSleepTimer();}));
document.getElementById('sp-btn-new').addEventListener('click',()=>{closeSP();goWelcome();});
document.getElementById('sp-btn-clear').addEventListener('click',()=>{clearCacheData();document.getElementById('cpill').classList.remove('show');closeSP();updateSpPl();});
document.getElementById('sp-btn-export').addEventListener('click',()=>{if(!filtered.length)return;const lines=['#EXTM3U'];filtered.forEach(ch=>{lines.push(`#EXTINF:${ch.duration}${ch.logo?` tvg-logo="${ch.logo}"`:''}${ch.group?` group-title="${ch.group}"`:''},${ch.name}`);lines.push(ch.url);});const blob=new Blob([lines.join('\n')],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(srcName||'playlist').replace(/[^a-z0-9]/gi,'_')+'_export.m3u';a.click();});

// Color accent
const cpEl=document.getElementById('colorpicker');
ACCENTS.forEach((a,i)=>{const d=document.createElement('div');d.className='cdot2'+(i===settings.accent?' on':'');d.style.background=a.v;d.title=a.n;d.addEventListener('click',()=>{settings.accent=i;saveSett();document.querySelectorAll('.cdot2').forEach((x,j)=>x.classList.toggle('on',j===i));applyAccent(i);});cpEl.appendChild(d);});
function applyAccent(i){const a=ACCENTS[i];document.documentElement.style.setProperty('--P',a.v);document.documentElement.style.setProperty('--Pd',a.d);document.documentElement.style.setProperty('--Pg',a.g);}

// ── Xtream Codes ────────────────────────────
document.getElementById('xt-tog-vod').addEventListener('click',()=>{xtVod=!xtVod;document.getElementById('xt-tog-vod').classList.toggle('on',xtVod);});
document.getElementById('xt-tog-series').addEventListener('click',()=>{xtSeries=!xtSeries;document.getElementById('xt-tog-series').classList.toggle('on',xtSeries);});
document.getElementById('btn-xt-load').addEventListener('click',()=>{
  const server=document.getElementById('xt-server').value.trim().replace(/\/+$/,'');
  const user=document.getElementById('xt-user').value.trim();
  const pass=document.getElementById('xt-pass').value.trim();
  const output=document.getElementById('xt-output').value;
  const errEl=document.getElementById('xt-err');
  if(!server||!user||!pass){errEl.textContent='Please fill in all fields';errEl.style.display='block';return;}
  try{new URL(server);}catch{errEl.textContent='Invalid server URL (include http:// and port)';errEl.style.display='block';return;}
  errEl.style.display='none';
  const url=`${server}/get.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&type=m3u_plus&output=${output}`;
  loadFromUrl(url);
});

// ── Welcome navigation ──────────────────────
function goWelcome(){
  if(hls){hls.destroy();hls=null;}
  vid.src='';vid.pause();
  currentCh=null;allChannels=[];filtered=[];searchQ='';currentCat='all';sortMode='custom';
  document.getElementById('sinput').value='';document.getElementById('urlin').value='';
  document.getElementById('url-err').style.display='none';
  document.getElementById('app').classList.remove('visible');
  document.getElementById('welcome').style.display='flex';
  document.getElementById('player').classList.remove('on');
  document.getElementById('empty').style.display='flex';
  document.getElementById('cpill').classList.remove('show');
}
document.getElementById('btn-new').addEventListener('click',goWelcome);
// tlogo intentionally has no click action

// Welcome tabs
document.querySelectorAll('.tbtn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tbtn').forEach(b=>b.classList.remove('on'));document.querySelectorAll('.tpanel').forEach(p=>p.classList.remove('on'));btn.classList.add('on');document.getElementById('tab-'+btn.dataset.tab).classList.add('on');}));
document.getElementById('filein').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>loadFromText(ev.target.result,f.name,null);r.readAsText(f,'utf-8');});
const dz=document.getElementById('dz');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('over');});
dz.addEventListener('dragleave',()=>dz.classList.remove('over'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('over');const f=e.dataTransfer.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>loadFromText(ev.target.result,f.name,null);r.readAsText(f,'utf-8');});
document.getElementById('btn-load-url').addEventListener('click',()=>{const url=document.getElementById('urlin').value.trim();if(!url){showWErr('Please enter a URL');return;}try{new URL(url);}catch{showWErr('Invalid URL');return;}document.getElementById('url-err').style.display='none';loadFromUrl(url);});
document.getElementById('urlin').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('btn-load-url').click();});
document.getElementById('xt-server').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('xt-user').focus();});
document.getElementById('xt-user').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('xt-pass').focus();});
document.getElementById('xt-pass').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('btn-xt-load').click();});

let stmr;
document.getElementById('sinput').addEventListener('input',e=>{clearTimeout(stmr);stmr=setTimeout(()=>{searchQ=e.target.value.trim();renderChannels();},180);});

// Keyboard shortcuts
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
  if(e.code==='Space'||e.code==='KeyK'){e.preventDefault();if(currentCh)togglePlay();}
  if(e.code==='KeyM')toggleMute();
  if(e.code==='KeyF'){if(currentCh)toggleFS();}
  if(e.code==='KeyS'){if(currentCh)toggleFav(currentCh);}
  if(e.code==='KeyC'){if(document.getElementById('ctrl-cc').style.display!=='none')toggleCC();}
  if(e.code==='ArrowUp'){e.preventDefault();navCh(-1);}
  if(e.code==='ArrowDown'){e.preventDefault();navCh(1);}
  if(e.code==='ArrowLeft'){vid.volume=Math.max(0,vid.volume-.1);document.getElementById('vol').value=vid.volume;updateVolSvg();}
  if(e.code==='ArrowRight'){vid.volume=Math.min(1,vid.volume+.1);document.getElementById('vol').value=vid.volume;updateVolSvg();}
  if(e.code==='KeyJ'){if(vid.duration)vid.currentTime=Math.max(0,vid.currentTime-10);}
  if(e.code==='KeyL'){if(vid.duration)vid.currentTime=Math.min(vid.duration,vid.currentTime+10);}
  if(e.code==='Escape'){closeCtx();closeSP();closeSidebar();}
});

// Helpers
function showLoad(msg){document.getElementById('loading').classList.add('on');document.getElementById('load-txt').textContent=msg;document.getElementById('load-prog').textContent='';}
function setProg(t){document.getElementById('load-prog').textContent=t;}
function hideLoad(){document.getElementById('loading').classList.remove('on');}
function showWErr(m){const el=document.getElementById('url-err');el.textContent=m;el.style.display='block';document.querySelectorAll('.tbtn').forEach((b,i)=>b.classList.toggle('on',i===1));document.querySelectorAll('.tpanel').forEach((p,i)=>p.classList.toggle('on',i===1));}
function tick(){return new Promise(r=>setTimeout(r,30));}

// ── PWA install prompt ───────────────────────
let pwaPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();pwaPrompt=e;
  document.getElementById('btn-install').style.display='flex';
});
window.addEventListener('appinstalled',()=>{pwaPrompt=null;document.getElementById('btn-install').style.display='none';});
document.getElementById('btn-install').addEventListener('click',async()=>{
  if(!pwaPrompt)return;
  pwaPrompt.prompt();
  const{outcome}=await pwaPrompt.userChoice;
  if(outcome==='accepted')pwaPrompt=null;
  document.getElementById('btn-install').style.display='none';
});

// ── Online / offline indicator ───────────────
function showToast(msg,ms=3000){
  const t=document.getElementById('pwa-toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),ms);
}
window.addEventListener('offline',()=>showToast('📵 You are offline',5000));
window.addEventListener('online',()=>showToast('✅ Back online'));

// ── Boot ─────────────────────────────────────
(function boot(){
  loadSett();loadFavs();loadHist();
  applyAccent(settings.accent);
  if(settings.rememberVol&&settings.vol!==undefined){vid.volume=settings.vol;document.getElementById('vol').value=settings.vol;updateVolSvg();}
  if(settings.showInfo)applyShowInfo(true);
  updateMobileListBtn();
  const cache=loadCache();
  if(cache&&cache.channels&&cache.channels.length){
    srcName=cache.name||'Saved playlist';srcUrl=cache.url||null;
    initApp(cache.channels,srcName,srcUrl,true);
    setTimeout(()=>playChannel(cache.channels[0]),400);
  }
})();
