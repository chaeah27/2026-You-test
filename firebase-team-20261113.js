import {installYurifV2} from './experiment-v2-controller.js?v=gsr-cloud-maps-20261118';
import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signInAnonymously,signOut} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js';
import {getFirestore,collection,doc,getDoc,getDocFromServer,getDocs,onSnapshot,writeBatch,setDoc,serverTimestamp,query,where} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';

const firebaseConfig = {
 apiKey:"AIzaSyDvznaucP4wjG70pqo_lJLMfs4OPM1PUsE",
 authDomain:"eureka-research-test.firebaseapp.com",
 projectId:"eureka-research-test",
 storageBucket:"eureka-research-test.firebasestorage.app",
 messagingSenderId:"118967907122",
 appId:"1:118967907122:web:a76478464cb19312145d2b"
};
const app=initializeApp(firebaseConfig);
const auth=getAuth(app),store=getFirestore(app);
const types=['journal','sessions','equipment','results','references','sensoryEnvironments','experimenters','labRuns','journalBoard','dashboardNotes','protocolNotes','surveyTemplates'];
const choices=[
 ['home','연구 소개'],['protocol','실험 설계'],['equipment','장비 소개'],['journal','연구 일지 소개'],
 ['lab','실험 방법'],['sessions','실험 세션 소개'],['analysis','분석 결과'],['references','참고자료']
];
const $=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state={member:null,unsubs:[],cache:{},pending:new Set(),queued:null,writeJob:null,busy:false,ready:false,started:false,guestUnsub:null,publicDoc:{sections:{}}};
window.yurifCloud={ready:false,status:'연결 중',initialData:null,queueSave};
installYurifV2({auth,store});

function show(screen){
 for(const id of ['entry-screen','participant-screen','login-screen','guest-screen','workspace'])$(id).hidden=id!==screen;
 if(screen!=='workspace')document.body.classList.remove('yurif-workspace-active');
 else document.body.classList.add('yurif-workspace-active');
}
function error(message){$('auth-message').textContent=message||''}
function friendly(e){
 const code=e?.code||'';
 if(code==='auth/invalid-credential'||code==='auth/wrong-password'||code==='auth/user-not-found')return '이메일이나 비밀번호를 확인해 주세요.';
 if(code==='auth/too-many-requests')return '로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.';
 if(code==='permission-denied')return '접근 권한이 없습니다. 관리자에게 계정 승인 상태와 보안 규칙을 확인해 주세요.';
 return '요청에 실패했습니다: '+(e?.message||String(e));
}
$('go-admin').addEventListener('click',()=>{show('login-screen');$('login-email').focus()});
$('go-guest').addEventListener('click',()=>{show('guest-screen');watchPublic()});
document.querySelectorAll('[data-go-back]').forEach(b=>b.addEventListener('click',()=>show('entry-screen')));
$('login-form').addEventListener('submit',async e=>{
 e.preventDefault();error('로그인 확인 중…');
 const btn=$('login-submit');btn.disabled=true;
 try{await signInWithEmailAndPassword(auth,$('login-email').value.trim(),$('login-password').value)}
 catch(ex){error(friendly(ex))}
 finally{btn.disabled=false;$('login-password').value=''}
});
$('logout').addEventListener('click',async()=>{cleanup();await signOut(auth);show('entry-screen')});
$('open-admin-settings').addEventListener('click',()=>{if(state.member?.role==='admin'){show('workspace');$('admin-drawer').hidden=false;renderAdmin();renderTeamMemberManager()}});
$('close-admin-settings').addEventListener('click',()=>$('admin-drawer').hidden=true);
$('admin-publish').addEventListener('click',publish);
$('guest-refresh').addEventListener('click',()=>{watchPublic(true)});

function cleanup(){
 deactivateGsrSharing();
 window.yurifV2?.deactivateResearch();
 state.unsubs.forEach(fn=>fn());state.unsubs=[];state.cache={};state.pending.clear();state.started=false;state.ready=false;state.member=null;
 window.yurifCloud.ready=false;window.yurifCloud.initialData=null;
 clearTimeout(timer);state.queued=null;
 $('workspace').hidden=true;$('admin-drawer').hidden=true;
}
onAuthStateChanged(auth,async user=>{
 if(user?.isAnonymous){if(!$('participant-screen').hidden)return;show('entry-screen');return}
 if(!user){if(state.ready)cleanup();return}
 if(state.started)return;
 state.started=true;error('관리자·연구원 권한 확인 중…');
 try{
  const snap=await getDoc(doc(store,'members',user.uid));
  const member=snap.exists()?snap.data():null;
  if(!member?.active||!['admin','researcher'].includes(member.role)){
   if(researcherSigningUp){state.started=false;return}
   await signOut(auth);state.started=false;
   show('login-screen');error('아직 승인된 연구팀 계정이 아닙니다. Firestore members 문서의 UID, role, active를 확인해 주세요.');return;
  }
  state.member=member;
  try{const publicSnapshot=await getDoc(doc(store,'publicContent','site'));state.publicDoc=publicSnapshot.exists()?publicSnapshot.data():{sections:{}}}catch(ex){state.publicDoc={sections:{}}}
  $('cloud-user').textContent=user.email||'연구원';
  $('open-admin-settings').hidden=member.role!=='admin';
  error('공동 연구 기록 불러오는 중…');
  const loaded={};
  await Promise.all(types.map(async type=>{
   const snapshot=await getDocs(collection(store,'teamData',type,'items'));
   const entries=snapshot.docs.map(d=>d.data().value).filter(x=>x&&typeof x==='object');
   state.cache[type]=new Map(entries.map(x=>[String(x.id),JSON.stringify(stripForCloud(x))]));
   loaded[type]=entries;
  }));
  window.yurifCloud.initialData=loaded;window.yurifCloud.ready=true;state.ready=true;window.yurifCloud.status='공동 데이터 연결됨';
  await loadWorkspace();
  window.yurifV2?.activateResearch();
  show('workspace');
  activateGsrSharing();
  $('cloud-status').textContent='공동 데이터 연결됨';
  if(member.role==='admin'){renderAdmin();renderTeamMemberManager()}
  for(const type of types){
   const unsub=onSnapshot(collection(store,'teamData',type,'items'),snapshot=>{
    if(state.pending.has(type))return;
    const data=snapshot.docs.map(d=>d.data().value).filter(x=>x&&typeof x==='object');
    const nextCache=new Map(data.map(x=>[String(x.id),JSON.stringify(stripForCloud(x))]));
    const previous=state.cache[type]||new Map();
    const changed=nextCache.size!==previous.size||[...nextCache].some(([id,value])=>previous.get(id)!==value);
    if(!changed)return;
    state.cache[type]=nextCache;
    if(window.yurifCloudApply)window.yurifCloudApply(type,data);
   },e=>{$('cloud-status').textContent='동기화 오류: '+friendly(e)});
   state.unsubs.push(unsub);
  }
 }catch(ex){state.started=false;show('login-screen');error('공동 저장소 연결 실패: '+friendly(ex));}
});

async function loadWorkspace(){
 if(window.yurifCloudGetData){for(const type of types)window.yurifCloudApply(type,window.yurifCloud.initialData[type]||[]);return;}
 for(const src of ['adc-safety-journal-v2.js?v=eureka-name-fix','app-cloud-ready-20261113.js?v=archive-aborted-20261118','gsr-live-chart-20261113.js?v=serial-diagnostics-20261117']){
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error(src+' 파일을 불러오지 못했습니다'));document.body.append(s)});
 }
}
function stripForCloud(row){
 const copy=JSON.parse(JSON.stringify(row));
 // Raw sensor samples remain on the original measuring device.
 // Do not put unbounded physiological time series into Firestore documents.
 if(Array.isArray(copy.gsrSamples)){copy.gsrSampleCountTotal=copy.gsrSamples.length;delete copy.gsrSamples}
 if(Array.isArray(copy.gsrRawSamples)){copy.gsrRawSampleCountTotal=copy.gsrRawSamples.length;delete copy.gsrRawSamples}
 return copy;
}
let timer;
function queueSave(data){
 if(!state.ready||!state.member)return;
 state.queued=JSON.parse(JSON.stringify(data));
 clearTimeout(timer);
 timer=setTimeout(flush,450);
}
async function flush(){
 if(state.busy||!state.queued||!state.ready)return;
 state.busy=true;
 const next=state.queued;state.queued=null;
 const batches=[];
 for(const type of types){
  const rows=Array.isArray(next[type])?next[type]:[];
  const old=state.cache[type]||new Map();
  const present=new Map(rows.filter(x=>x&&x.id!=null).map(x=>[String(x.id),stripForCloud(x)]));
  const changed=[...present].filter(([id,v])=>JSON.stringify(v)!==old.get(id));
  const removed=[...old.keys()].filter(id=>!present.has(id));
  if(changed.length||removed.length){
   state.pending.add(type);
   batches.push({type,changed,removed});
  }
 }
 try{
  for(const {type,changed,removed} of batches){
   const all=[...changed.map(([id,value])=>({id,value})),...removed.map(id=>({id,deleted:true}))];
   for(let i=0;i<all.length;i+=350){
    const batch=writeBatch(store);
    for(const item of all.slice(i,i+350)){
     const ref=doc(store,'teamData',type,'items',item.id);
     if(item.deleted)batch.delete(ref);
     else {
      const bytes=JSON.stringify(item.value).length;
      if(bytes>750000)throw new Error('저장 항목 '+type+' / '+item.id+'의 크기가 너무 큽니다. JSON 백업을 먼저 다운로드해 주세요.');
      batch.set(ref,{value:item.value,updatedAt:serverTimestamp()});
     }
    }
    await batch.commit();
   }
   const latest=await getDocs(collection(store,'teamData',type,'items'));
   const records=latest.docs.map(d=>d.data().value);
   state.cache[type]=new Map(records.map(x=>[String(x.id),JSON.stringify(stripForCloud(x))]));
   state.pending.delete(type);
   if(!state.queued&&window.yurifCloudApply)window.yurifCloudApply(type,records);
  }
  $('cloud-status').textContent='공동 데이터 저장됨';
 }catch(e){
  $('cloud-status').textContent='저장 오류 — JSON 백업 권장';
  alert('공동 데이터 저장 실패: '+friendly(e)+'\n로컬 백업을 확인해 주세요.');
 }finally{
  for(const {type} of batches)state.pending.delete(type);
  state.busy=false;
  if(state.queued)setTimeout(flush,100);
 }
}
function watchPublic(force=false){
 if(state.guestUnsub&&!force)return;
 if(state.guestUnsub){state.guestUnsub();state.guestUnsub=null}
 state.guestUnsub=onSnapshot(doc(store,'publicContent','site'),snapshot=>{
  state.publicDoc=snapshot.exists()?snapshot.data():{sections:{}};
  drawPublic();
 },e=>{$('guest-list').textContent=friendly(e)});
}
function drawPublic(){
 const sections=state.publicDoc.sections||{};
 const shown=choices.filter(([id])=>sections[id]?.enabled);
 $('guest-list').innerHTML=shown.length?shown.map(([id,name])=>{
  const item=sections[id];
  return '<article class="yurif-public-card"><h3>'+safe(item.title||name)+'</h3><p>'+safe(item.body||'').replace(/\n/g,'<br>')+'</p></article>';
 }).join(''):'<div class="yurif-empty">관리자가 아직 공개한 연구 자료가 없습니다.</div>';
}
function renderAdmin(){
 const sections=state.publicDoc.sections||{};
 $('admin-sections').innerHTML=choices.map(([id,name])=>{
  const current=sections[id]||{};
  return '<div class="yurif-public-editor"><label><input type="checkbox" data-public-enable="'+id+'" '+(current.enabled?'checked':'')+'> '+name+' 공개</label>'+
  '<input data-public-title="'+id+'" maxlength="100" value="'+safe(current.title||name)+'" aria-label="'+name+' 제목">'+
  '<textarea data-public-body="'+id+'" rows="3" maxlength="4000" placeholder="일반 방문자에게 보여줄 설명문만 직접 작성하세요."></textarea></div>';
 }).join('');
 for(const [id] of choices){const ta=document.querySelector('[data-public-body="'+id+'"]');if(ta)ta.value=sections[id]?.body||''}
}
async function publish(){
 if(state.member?.role!=='admin')return;
 const sections={};
 for(const [id,name] of choices){
  const enabled=document.querySelector('[data-public-enable="'+id+'"]')?.checked||false;
  const title=document.querySelector('[data-public-title="'+id+'"]')?.value.trim()||name;
  const body=document.querySelector('[data-public-body="'+id+'"]')?.value.trim()||'';
  if(enabled&&!body){alert('공개할 '+name+' 항목의 설명문을 입력해 주세요.');return}
  sections[id]={enabled,title,body};
 }
 if(!confirm('선택한 글이 로그인하지 않은 모든 방문자에게 공개됩니다. 참가자 정보와 원시 생체 데이터를 포함하지 않았는지 확인했나요?'))return;
 const btn=$('admin-publish');btn.disabled=true;
 try{
  await setDoc(doc(store,'publicContent','site'),{sections,updatedAt:serverTimestamp()});
  state.publicDoc={sections};alert('공개 범위가 저장되었습니다.');
 }catch(e){alert('공개 설정 저장 실패: '+friendly(e))}
 finally{btn.disabled=false}
}


/* GSR raw-data sharing for authorized team members only.
 * Existing Firestore rules permit isMember() under teamData/{document=**}.
 * 200-sample chunks ensure each document stays comfortably below 1 MiB.
 */
const GSR_CHUNK=200;
// Firestore forbids arrays nested directly inside arrays. Store each ADC tuple as a map,
// then restore the original tuple shape for analysis, CSV exports and full verification.
function gsrToCloudPoint(p){
 if(!Array.isArray(p)||p.length<2||!Number.isFinite(p[0])||!Number.isFinite(p[1]))
  throw Error('ADC 원시값 형식 오류: 원본 기록을 보존하고 업로드를 중단합니다.');
 return {time:p[0],adc:p[1],phase:String(p[2]??''),segmentId:String(p[3]??'')};
}
function gsrFromCloudPoint(p){
 if(Array.isArray(p))return p; // Read-only compatibility for older stored records.
 if(p&&typeof p==='object'&&Number.isFinite(p.time)&&Number.isFinite(p.adc))
  return [p.time,p.adc,p.phase??'',p.segmentId??''];
 return null;
}
const gsrShared={
 runs:[],selected:'',points:[],chunks:[],offRuns:null,offSamples:null,
 interval:null,inflight:new Map(),verified:new Map(),notice:'',lastRender:0
};
const gsrRunRef=id=>doc(store,'teamData','gsrRunIndex','items',String(id));
const gsrChunks=collection(store,'teamData','gsrRawChunks','items');
const gsrIndex=collection(store,'teamData','gsrRunIndex','items');
function gsrPanel(){
 if(!state.ready)return '<section class="panel"><h2>팀 공유 GSR 원시자료</h2><p>연구원 로그인 후 사용할 수 있습니다.</p></section>';
 const selected=gsrShared.runs.find(r=>r.id===gsrShared.selected);
 const n=gsrShared.points.length,vals=gsrShared.points.map(p=>p[1]);
 const mean=n?(vals.reduce((x,y)=>x+y,0)/n).toFixed(2):'—';
 const status=selected?(selected.endedAt?'실험 종료':'실험 진행 중'):'실험 선택 전';
 return '<section class="panel" id="gsr-team-panel">'+
 '<div class="entry-head"><div><h2>팀 공유 GSR 원시자료 · 실시간 조회</h2><p class="muted">승인된 관리자·연구원만 접근 · Arduino ADC 원시값(0~1023, µS 아님)</p></div></div>'+
 '<div class="formgrid"><div class="field"><label>다른 컴퓨터에서 공유된 실험 선택</label><select id="gsr-team-select"><option value="">공유 실험 선택</option>'+
 gsrShared.runs.map(r=>'<option value="'+safe(r.id)+'"'+(r.id===gsrShared.selected?' selected':'')+'>'+safe(r.date||'')+' · '+safe(r.code||'실험')+' · '+safe(r.mode==='pilot'?'예비실험':r.mode==='stage1'?'1차 실험':'2차 실험')+(r.endedAt?' · 종료':' · 진행 중')+'</option>').join('')+
 '</select></div></div>'+
 (gsrShared.runs.length?'':'<p class="muted">아직 팀에 공유된 GSR 실험이 없습니다. 새 실험 중에는 약 8초 간격으로 전송을 시도하며, 기존 기록은 실험실 아카이브에서 직접 공유할 수 있습니다.</p>')+
 (selected?'<div class="gsr-live"><div><small>클라우드에 확인된 샘플</small><strong>'+n+' / '+(selected.sampleCount||0)+'</strong></div><div><small>ADC 평균</small><strong>'+mean+'</strong></div><div><small>실험 상태</small><strong>'+status+'</strong></div></div>'+
 '<div class="gsr-chart-box"><canvas id="gsr-team-chart" width="900" height="280" role="img" aria-label="공유된 GSR 원시 ADC 측정값 시간대별 그래프"></canvas></div>'+
 '<div class="actions"><button class="btn secondary" type="button" id="gsr-team-csv"'+(n?'':' disabled')+'>공유 원시값 CSV 다운로드</button></div>'+
 '<p class="muted">각 구간: '+(selected.steps||[]).map(s=>safe(s.label||'')+' '+safe(s.envName||s.name||'')).join(' · ')+'</p>':'')+
 (gsrShared.notice?'<p class="muted">'+safe(gsrShared.notice)+'</p>':'')+
 '<p class="muted">실험 진행 중 최신 데이터 반영에는 수 초가 걸릴 수 있습니다. 네트워크 장애 시 측정 컴퓨터의 원본은 별도로 유지됩니다.</p></section>';
}
window.yurifGsrSharedPanel=gsrPanel;
function drawGsrShared(){
 const canvas=document.getElementById('gsr-team-chart');if(!canvas)return;
 const ctx=canvas.getContext('2d');if(!ctx)return;
 const width=Math.max(320,Math.floor(canvas.getBoundingClientRect().width||840));
 const height=Math.max(180,Math.round(width*.34)),dpr=Math.min(devicePixelRatio||1,2);
 canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#FAFCFE';ctx.fillRect(0,0,width,height);
 const pts=gsrShared.points;
 if(!pts.length){ctx.fillStyle='#637A8C';ctx.textAlign='center';ctx.font='13px system-ui';ctx.fillText('아직 서버에서 읽은 측정값이 없습니다.',width/2,height/2);return}
 const left=47,right=14,top=15,bottom=30,W=width-left-right,H=height-top-bottom;
 const start=pts[0][0],end=Math.max(start+1,pts[pts.length-1][0]);
 const X=t=>left+W*(t-start)/(end-start),Y=v=>top+H*(1-v/1023);
 ctx.font='11px system-ui';ctx.textAlign='right';ctx.textBaseline='middle';
 for(const tick of [0,256,512,768,1023]){const y=Y(tick);ctx.strokeStyle='#DEEAF3';ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(width-right,y);ctx.stroke();ctx.fillStyle='#60778C';ctx.fillText(String(tick),left-6,y)}
 const selected=gsrShared.runs.find(r=>r.id===gsrShared.selected);
 for(const step of selected?.steps||[]){if(!step.startedAt)continue;const x=X(step.startedAt);if(x<left||x>width-right)continue;ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle='#C57E4B';ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,top+H);ctx.stroke();ctx.restore();ctx.fillStyle='#A4603B';ctx.textAlign='left';ctx.fillText(String(step.label||''),x+4,top+10)}
 ctx.beginPath();ctx.strokeStyle='#246B9A';ctx.lineWidth=1.8;
 const stride=Math.max(1,Math.ceil(pts.length/1700));
 for(let i=0;i<pts.length;i+=stride){const p=pts[i];if(i===0)ctx.moveTo(X(p[0]),Y(p[1]));else ctx.lineTo(X(p[0]),Y(p[1]))}
 const tail=pts[pts.length-1];ctx.lineTo(X(tail[0]),Y(tail[1]));ctx.stroke();
 ctx.fillStyle='#60778C';ctx.textBaseline='top';ctx.textAlign='left';ctx.fillText('0초',left,height-bottom+7);ctx.textAlign='right';ctx.fillText(((end-start)/1000).toFixed(1)+'초',width-right,height-bottom+7);
}
function refreshGsrShared(){
 const panel=document.getElementById('gsr-team-panel');if(!panel)return;
 panel.outerHTML=gsrPanel();drawGsrShared();
}
function selectGsrShared(id){
 if(gsrShared.offSamples){gsrShared.offSamples();gsrShared.offSamples=null}
 gsrShared.selected=id;gsrShared.points=[];gsrShared.notice='';
 if(!id){refreshGsrShared();return}
 const q=query(gsrChunks,where('runId','==',id));
 gsrShared.offSamples=onSnapshot(q,snapshot=>{
  const chunks=snapshot.docs.map(d=>d.data()).filter(r=>Array.isArray(r.points)).sort((a,b)=>a.index-b.index);
  const pts=[];for(const chunk of chunks)for(const encoded of chunk.points){const p=gsrFromCloudPoint(encoded);if(p)pts.push(p)}
  gsrShared.points=pts;
  refreshGsrShared();
 },e=>{gsrShared.notice='원시값 조회 실패: '+friendly(e);refreshGsrShared()});
 refreshGsrShared();
}
// Pending cloud uploads are recorded locally and retried after reconnection.
const PENDING_GSR_KEY='yurif_adc_pending_cloud_v2';
const pendingGsr=()=>{
 try{return JSON.parse(localStorage.getItem(PENDING_GSR_KEY)||'[]').filter(x=>typeof x==='string')}catch{return []}
};
function storePendingGsr(ids){
 try{localStorage.setItem(PENDING_GSR_KEY,JSON.stringify([...new Set(ids)]))}catch(e){console.warn('원시 ADC 재전송 목록 저장 실패',e)}
}
function queuePendingGsr(id){if(!id)return;storePendingGsr([...pendingGsr(),String(id)])}
function clearPendingGsr(id){storePendingGsr(pendingGsr().filter(x=>x!==String(id)))}
let retryingGsr=false;
async function retryPendingGsr(){
 if(retryingGsr||!state.ready||!navigator.onLine)return;
 retryingGsr=true;
 try{
  for(const id of pendingGsr()){
   const archive=window.yurifFindGsrRun?.(id);
   if(!archive)continue;
   let run=archive;
   if(!run.gsrSamples?.length&&window.yurifSafeAdc){
    const rows=await window.yurifSafeAdc.readRun(id);
    if(rows.length)run={...archive,gsrSamples:rows.map(x=>[x.time,x.adc,x.phase,x.segmentId])};
   }
   if(!run?.gsrSamples?.length)continue;
   try{
    await uploadGsrRun(run);
    await verifyFullGsrRun(run);
    clearPendingGsr(id);
   }catch(e){console.warn('원시 ADC 재전송 실패:',id,e?.message||e);break}
  }
 }finally{retryingGsr=false}
}
window.addEventListener('online',()=>retryPendingGsr().catch(()=>{}));
function activateGsrSharing(){
 if(gsrShared.offRuns)return;
 gsrShared.offRuns=onSnapshot(gsrIndex,snapshot=>{
  gsrShared.runs=snapshot.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.startedAt||0)-(a.startedAt||0));
  refreshGsrShared();
 },e=>{gsrShared.notice='공유 실험 목록 조회 실패: '+friendly(e);refreshGsrShared()});
 gsrShared.interval=setInterval(()=>{
  if(!state.ready||!auth.currentUser)return;
  retryPendingGsr().catch(()=>{});
  const run=window.yurifGetActiveGsrRun?.();
  if(run?.startedAt&&!run.endedAt&&Array.isArray(run.gsrSamples)&&run.gsrSamples.length)uploadGsrRun(run).catch(()=>{});
 },8000);
}
function deactivateGsrSharing(){
 if(gsrShared.offRuns){gsrShared.offRuns();gsrShared.offRuns=null}
 if(gsrShared.offSamples){gsrShared.offSamples();gsrShared.offSamples=null}
 if(gsrShared.interval){clearInterval(gsrShared.interval);gsrShared.interval=null}
 gsrShared.runs=[];gsrShared.selected='';gsrShared.points=[];gsrShared.verified.clear();
}
async function uploadGsrRun(run){
 if(!state.ready||!auth.currentUser)throw new Error('승인된 연구원 로그인 필요');
 if(!run||!run.id||!Array.isArray(run.gsrSamples))throw new Error('GSR 원시값이 존재하지 않습니다');
 const id=String(run.id);
 const previous=gsrShared.inflight.get(id);
 if(previous){await previous;return uploadGsrRun(run)}
 const task=async()=>{
  const count=run.gsrSamples.length;
  const samples=run.gsrSamples.slice(0,count);
  const last=gsrShared.verified.get(id)||{count:0,signature:''};
  const signature=JSON.stringify([run.startedAt,run.endedAt,run.steps,run.code,run.mode]);
  if(count===last.count&&signature===last.signature)return {verified:true,count};
  const firstChunk=Math.max(0,Math.floor(Math.max(0,last.count-1)/GSR_CHUNK));
  const lastChunk=Math.floor(Math.max(0,count-1)/GSR_CHUNK);
  for(let index=firstChunk;index<=lastChunk&&count;index+=1){
   const points=samples.slice(index*GSR_CHUNK,(index+1)*GSR_CHUNK);
   if(!points.length)continue;
   await setDoc(doc(store,'teamData','gsrRawChunks','items',id+'__'+String(index).padStart(5,'0')),{runId:id,index,points:points.map(gsrToCloudPoint),sampleCount:points.length});
  }
  const meta={id,code:String(run.code||'').slice(0,60),date:run.date||'',mode:run.mode,
   startedAt:run.startedAt||null,endedAt:run.endedAt||null,
   steps:(run.steps||[]).map(s=>({label:s.label||'',name:s.name||'',envName:s.envName||'',startedAt:s.startedAt||null,endedAt:s.endedAt||null})),
   sampleCount:count,updatedAt:serverTimestamp()};
  await setDoc(gsrRunRef(id),meta);
  const verified=await getDoc(gsrRunRef(id));
  const finalChunk=count?await getDoc(doc(store,'teamData','gsrRawChunks','items',id+'__'+String(lastChunk).padStart(5,'0'))):null;
  if(!verified.exists()||verified.data().sampleCount!==count||(count&&(!finalChunk?.exists()||finalChunk.data().points.length!==count-lastChunk*GSR_CHUNK)))throw new Error('서버 저장 개수 재확인 실패');
  gsrShared.verified.set(id,{count,signature});
  return {verified:true,count};
 };
 const promise=task();gsrShared.inflight.set(id,promise);
 try{return await promise}finally{if(gsrShared.inflight.get(id)===promise)gsrShared.inflight.delete(id)}
}
async function verifyFullGsrRun(run){
 if(!run?.id||!Array.isArray(run.gsrSamples))throw Error('검증할 원시 ADC 데이터가 없습니다.');
 const expected=run.gsrSamples,docs=await getDocs(query(gsrChunks,where('runId','==',String(run.id))));
 const chunks=docs.docs.map(d=>d.data()).sort((a,b)=>a.index-b.index);
 const n=Math.ceil(expected.length/GSR_CHUNK);
 if(chunks.length!==n)throw Error('서버 청크 수 불일치: '+chunks.length+' / '+n);
 let readCount=0;
 for(let i=0;i<n;i++){
  const chunk=chunks[i],start=i*GSR_CHUNK,items=expected.slice(start,start+GSR_CHUNK);
  if(chunk?.index!==i||!Array.isArray(chunk.points)||chunk.points.length!==items.length)
   throw Error('청크 '+i+' 누락 또는 개수 오류');
  for(let j=0;j<items.length;j++){
   const actual=gsrFromCloudPoint(chunk.points[j]),wanted=items[j];
   if(!Array.isArray(actual)||actual.length!==wanted.length||actual.some((value,k)=>value!==wanted[k]))
    throw Error('청크 '+i+' · '+j+' 원시값 또는 구간 분류 불일치');
  }
  readCount+=items.length;
 }
 const metadata=await getDoc(gsrRunRef(run.id));
 if(!metadata.exists()||metadata.data().sampleCount!==expected.length)throw Error('서버 인덱스와 ADC 수량 불일치');
 return {verified:true,count:readCount,chunks:n,checkedAt:Date.now()};
}
window.yurifGsrSharing={
 queuePending:queuePendingGsr,
 clearPending:clearPendingGsr,
 retryPending:retryPendingGsr,
 pending:pendingGsr,
 verifyFull:verifyFullGsrRun,
 upload:uploadGsrRun,
 status:id=>gsrShared.verified.get(id)||null
};
document.addEventListener('change',e=>{
 if(e.target.id==='gsr-team-select')selectGsrShared(e.target.value);
});
document.addEventListener('click',async e=>{
 const csv=e.target.closest('#gsr-team-csv');
 if(csv){
  const run=gsrShared.runs.find(r=>r.id===gsrShared.selected);if(!run)return;
  const lines=['timestamp_ms,iso_datetime,elapsed_seconds,segment,environment,adc_raw'];
  for(const [t,v] of gsrShared.points){
   const s=(run.steps||[]).find(x=>x.startedAt&&t>=x.startedAt&&t<(x.endedAt||run.endedAt||Infinity));
   const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
   lines.push([t,new Date(t).toISOString(),((t-run.startedAt)/1000).toFixed(3),quote(s?.label||''),quote(s?.envName||s?.name||''),v].join(','));
  }
  const file=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download='eureka-research-shared-gsr-'+(run.date||'')+'-'+(run.code||'experiment')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);return;
 }
 const b=e.target.closest('[data-gsr-share]');
 if(!b)return;
 const id=b.dataset.gsrShare;
 const run=window.yurifFindGsrRun?.(id);
 if(!run)return alert('이 컴퓨터에서 해당 실험 원본을 찾지 못했습니다.');
 if(!confirm('이 실험의 GSR 원시값 '+(run.gsrSamples?.length||0)+'개를 승인된 연구원들과 공유할까요? 참가자의 동의와 익명 코드 사용 여부를 확인해 주세요.'))return;
 b.disabled=true;b.textContent='클라우드로 전송 중…';
 try{const result=await uploadGsrRun(run);alert('서버 저장 확인 완료: GSR 원시값 '+result.count+'개. 연구원은 팀 공유 GSR 원시자료 메뉴에서 볼 수 있습니다.');}
 catch(err){alert('서버 업로드 실패: '+friendly(err)+'\n원본은 이 컴퓨터에 남아 있습니다. 다시 시도해 주세요.')}
 finally{b.disabled=false;b.textContent='팀원과 GSR 원시값 공유'}
});

/* Participant portal. Anonymous Firebase auth is REQUIRED.
   An entry key is a cryptographically random 128-bit bearer capability,
   not the human-readable P01 code. Never expose records to public visitors. */
let researcherSigningUp=false;
$('researcher-signup-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const email=$('signup-email').value.trim(),password=$('signup-password').value;
 const btn=$('signup-submit');btn.disabled=true;researcherSigningUp=true;
 $('signup-message').textContent='계정 생성 중…';
 try{
  const result=await createUserWithEmailAndPassword(auth,email,password);
  const uid=result.user.uid;
  $('signup-message').textContent='계정이 생성되었습니다. 관리자에게 다음 UID를 전달하세요: '+uid+' / 관리자 승인 후 로그인할 수 있습니다.';
  window.yurifLastSignupUid=uid;
  await signOut(auth);
  show('login-screen');
  $('signup-message').textContent='계정 생성 완료 · 승인 대기. 관리자에게 UID '+uid+' 를 전달해 주세요.';
 }catch(ex){$('signup-message').textContent='계정 생성 실패: '+friendly(ex)}
 finally{researcherSigningUp=false;btn.disabled=false;$('signup-password').value=''}
});
const participantState={key:'',plan:null,consent:null,answers:new Map(),adminPlans:[],adminSelected:'',adminRows:[],adminBusy:false,fields:[],preStep:1,preDraft:null,preRead:false};
const participantPlanRef=key=>doc(store,'participantAccess',key);
const participantConsentRef=key=>doc(store,'participantConsents',key);
const participantAnswerRef=(key,slot)=>doc(store,'participantAnswers',key,'items',slot);
const participantAnswersRef=key=>collection(store,'participantAnswers',key,'items');
const portalMsg=value=>{const el=$('participant-message');if(el)el.textContent=value||''};
const shortText=value=>safe(String(value||''));
const participantSurveySlots=plan=>plan?.stage==='stage1'
 ?(plan.order||[]).map((name,i)=>({slot:'s'+i,title:'감각 환경 '+(i+1)+' / '+name,env:name,index:i}))
 :[{slot:'final',title:'2차 실험 · 대화 종료 후 설문',env:'대화 종료 후',index:0}];

async function enterParticipantPortal(){
 show('participant-screen');portalMsg('');
 if(auth.currentUser&&!auth.currentUser.isAnonymous){portalMsg('이 브라우저에서는 연구원으로 로그인되어 있습니다. 연구원 로그아웃 후 참가자 모드에 입장해 주세요.');return}
 try{
  if(!auth.currentUser)await signInAnonymously(auth);
  portalMsg('입장 코드를 입력해 주세요.');
 }catch(e){portalMsg('참가자 인증 실패. Firebase Authentication에서 익명 인증을 활성화해야 합니다. '+friendly(e))}
}
$('go-participant').addEventListener('click',enterParticipantPortal);
$('participant-exit').addEventListener('click',async()=>{
 window.yurifV2?.stopParticipant();
 participantState.key='';participantState.plan=null;participantState.consent=null;participantState.answers=new Map();participantState.preStep=1;participantState.preDraft=null;participantState.preRead=false;
 $('participant-steps').innerHTML='';$('participant-access-code').value='';$('participant-entry-form').hidden=false;portalMsg('');
 // Preserve anonymous session so an accidental exit does not lock the participant out of the one-time consent record.
 show('entry-screen');
});
$('participant-entry-form').addEventListener('submit',async e=>{
 e.preventDefault();
 if(!auth.currentUser?.isAnonymous)return portalMsg('참가자 인증이 필요합니다. 연구원 계정과 별도의 브라우저에서 접속해 주세요.');
 const pasted=String($('participant-access-code').value||'').trim();
 const embeddedKey=pasted.match(/(?:임시\s*비밀번호|입장\s*코드)\s*[:：]\s*([0-9a-f]{32})/i);
 const embeddedCode=pasted.match(/참가자\s*코드\s*[:：]\s*([^\s\\]+)/i);
 const key=(embeddedKey?.[1]||pasted).trim().toLowerCase().replaceAll('-','');
 let code=$('participant-code')?.value.trim()||'';
 if(!code&&embeddedCode){code=embeddedCode[1];$('participant-code').value=code}
 if(!/^[0-9a-f]{32}$/.test(key))return portalMsg('임시 비밀번호는 32자리 영문·숫자 코드입니다. 복사한 안내문 전체가 아니라 임시 비밀번호만 붙여 넣거나, 안내문을 그대로 넣어도 자동 인식합니다.');
 if(!code)return portalMsg('참가자 코드(P01 등)도 위 칸에 입력해 주세요.');
 const btn=$('participant-enter-btn');btn.disabled=true;portalMsg('참가 정보를 확인하는 중…');
 try{
  const snap=await getDoc(participantPlanRef(key));
  if(!snap.exists()||snap.data().active!==true)throw Error('활성화된 참가 코드가 아닙니다.');
  if(snap.data().v2&&code!==snap.data().code)throw Error('참가자 코드가 등록 정보와 일치하지 않습니다. 실험 등록 화면의 참가자 코드를 확인해 주세요.');
  participantState.key=key;participantState.plan=snap.data();participantState.preStep=1;participantState.preDraft=null;participantState.preRead=false;
  const consentSnap=await getDoc(participantConsentRef(key));
  participantState.consent=consentSnap.exists()?consentSnap.data():null;
  if(participantState.consent&&participantState.consent.uid!==auth.currentUser.uid)
   throw Error('이미 다른 참가자 세션에서 사용된 입장 코드입니다. 연구원에게 문의해 주세요.');
  participantState.answers=new Map();
  if(participantState.consent?.agreed){
   const response=await getDocs(participantAnswersRef(key));
   for(const item of response.docs)participantState.answers.set(item.id,item.data());
  }
  $('participant-entry-form').hidden=true;portalMsg('참가 코드 확인 완료');
  renderParticipantSteps();
 }catch(ex){portalMsg('입장할 수 없습니다: '+friendly(ex))}
 finally{btn.disabled=false}
});
function preClean(html){
 const d=new DOMParser().parseFromString(String(html||''),'text/html');
 const ok=new Set(['B','STRONG','EM','I','U','P','DIV','BR','UL','OL','LI','H3']);
 function walk(n){
  if(n.nodeType===3)return safe(n.textContent);
  if(n.nodeType!==1)return '';
  if(['SCRIPT','STYLE','IFRAME','SVG','OBJECT'].includes(n.tagName))return '';
  const inner=Array.from(n.childNodes).map(walk).join('');
  if(!ok.has(n.tagName))return inner;
  const t=({B:'strong',I:'em',DIV:'p'}[n.tagName]||n.tagName.toLowerCase());
  return t==='br'?'<br>':'<'+t+'>'+inner+'</'+t+'>';
 }
 return Array.from(d.body.childNodes).map(walk).join('');
}

/* 1차 실험 참가자 공통 안내서 · 설문 기본 양식.
   연구원은 실제 위험, 저장 정책, 연락처를 확인하고 발급 전에 수정해야 합니다. */
const firstStageGuide=[
 {tag:'h3',body:'유리프 연구 참여 사전 안내서'},
 {tag:'p',body:'본 연구는 시각·청각·후각 환경의 변화에 따른 생리적 반응과 주관적 상태를 알아보기 위한 연구입니다.'},
 {tag:'h3',body:'1. 실험 진행 방법'},
 {tag:'p',body:'참가자는 실험자의 설명에 따라 시각·청각·후각 환경의 변화를 경험합니다. 연구진은 피부저항 변화를 측정하여 피부전기활동(EDA)을 분석하기 위한 자료와 심박수를 수집하며, 실험 과정에서 설문을 진행합니다. 참가자는 실험자의 안내에 협조하여 각 과정에 순차적으로 참여해 주시기 바랍니다.'},
 {tag:'h3',body:'2. 예상되는 불편 및 안전'},
 {tag:'p',body:'빛과 소리, 향기 등의 자극으로 눈의 피로, 두통, 놀람, 메스꺼움, 기침 또는 알레르기 증상이 나타날 수 있습니다. 센서 부착 부위에 일시적인 피부 자극이 생길 수도 있습니다. 평소 특정 감각 자극이 불편하거나 실험 중 이상을 느낀 경우 연구진에게 알려주세요. 심한 불편이 생기면 즉시 자극 및 측정을 중단합니다.'},
 {tag:'h3',body:'3. 참여자의 권리'},
 {tag:'p',body:'참여는 자발적입니다. 참여를 거절하거나 실험 도중 중단하여도 성적, 평가, 학교생활 또는 연구진과의 관계에서 불이익이 없습니다. 궁금한 점은 언제든 질문할 수 있으며, 중단하려면 연구진에게 말씀해 주세요. 이미 수집된 자료의 처리 및 삭제 가능 여부는 연구진에게 문의할 수 있습니다.'},
 {tag:'h3',body:'4. 연구자료 및 개인정보'},
 {tag:'p',body:'연구에서는 가급적 실명 대신 참가자 코드를 사용합니다. 실험 조건, 설문 응답, 피부저항 관련 원시 측정값, 심박수 및 동의 기록은 연구 분석에 활용됩니다. 연구 목적에 따른 개인별 결과를 공개하지 않고, 승인된 연구진에 한해 자료 접근을 제한합니다. 참가자 코드 역시 다른 정보와 결합하여 개인을 알아볼 가능성이 있으므로 안전하게 관리해야 합니다.'},
 {tag:'p',body:'자료 보관 장소·관리 방식: 개인정보 및 실험 결과는 사이트 및 실험 진행 기기에 저장되며 연구자 및 연구 관련인(예: 담당 교사)만 열람할 수 있도록 보호됩니다.'},
 {tag:'p',body:'제3자 제공·추가 활용 여부: 모든 자료 및 정보는 연구자 및 연구 관련인(예: 담당 교사)에게만 제공되며, 오로지 실험 진행 및 연구 목적으로만 활용됩니다.'},
 {tag:'h3',body:'5. 보상·문의'},
 {tag:'p',body:'실험 참여 중도 중단 시 처리: 참가자는 실험 도중 중단 의사를 밝히면 즉시 참가자 명단에서 제외되며, 관련 정보는 삭제됩니다.'},
 {tag:'p',body:'연구담당자 및 문의 연락처: 11028 한채아 / 010-8193-1967'},
 {tag:'p',body:'참가자는 연구 참여에 중요한 위험과 개인정보 처리에 대해 충분한 설명을 요청할 수 있습니다.'}
];
const firstStageGuideHtml=firstStageGuide.map(x=>'<'+x.tag+'>'+safe(x.body)+'</'+x.tag+'>').join('');
const firstStageQuestions=[
 {id:'q1',label:'향기 자극에 알레르기 또는 심한 불편을 경험한 적이 있나요?',type:'radio',options:['없음','있음','잘 모르겠음','연구진과 비공개 상담 희망'],required:true},
 {id:'q2',label:'밝은 빛이나 조명 변화로 불편을 느끼는 편인가요?',type:'radio',options:['아니요','예','잘 모르겠음','연구진과 비공개 상담 희망'],required:true},
 {id:'q3',label:'소리 자극에 불편이나 과민 반응을 경험한 적이 있나요?',type:'radio',options:['아니요','예','잘 모르겠음','연구진과 비공개 상담 희망'],required:true},
 {id:'q4',label:'피부에 센서를 부착하는 데 불편이나 우려가 있나요?',type:'radio',options:['아니요','예','잘 모르겠음','연구진과 비공개 상담 희망'],required:true},
 {id:'q5',label:'현재 몸 상태나 감각 자극과 관련하여 실험 전에 연구진에게 알릴 사항이 있나요?',type:'radio',options:['없음','있음','잘 모르겠음','연구진과 비공개 상담 희망'],required:true},
 {id:'q6',label:'지난밤 수면 시간은 대략 어느 정도였나요?',type:'select',options:['5시간 미만','5시간 이상~6시간 미만','6시간 이상~7시간 미만','7시간 이상~8시간 미만','8시간 이상','기억나지 않음','응답하지 않음'],required:false},
 {id:'q7',label:'현재 상태에 해당하는 항목을 선택해 주세요. (해당 사항이 없으면 선택하지 않아도 됩니다.)',type:'checkbox',options:['피곤함','졸림','긴장됨','두통 또는 몸의 불편함','평소와 다른 컨디션'],required:false},
 {id:'q8',label:'실험 전에 카페인 음료를 마셨나요?',type:'radio',options:['예','아니요','잘 모르겠음','응답하지 않음'],required:false},
 {id:'q9',label:'MBTI 유형을 알고 있다면 선택해 주세요. (선택 사항이며 실험 참여와 무관합니다.)',type:'select',options:['ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP','ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ','모름 / 응답하지 않음'],required:false}
];
window.yurifFirstStageInfoTemplate=()=>({
 consentHtml:firstStageGuideHtml,
 consentText:firstStageGuide.map(x=>x.body).join('\n\n'),
 preQuestions:structuredClone(firstStageQuestions)
});

function preOptions(q){return String(q.options||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,25)}
function preFieldsEditor(){
 return participantState.fields.map((q,i)=>'<div class="pre-edit-item"><label>질문 '+(i+1)+'</label><input data-pre-title="'+i+'" value="'+safe(q.label)+'" maxlength="200" placeholder="질문 내용">'+
 '<label>질문 유형</label><select data-pre-type="'+i+'">'+[['select','드롭다운'],['radio','단일 선택'],['checkbox','복수 선택'],['text','서술형']].map(a=>'<option value="'+a[0]+'" '+(q.type===a[0]?'selected':'')+'>'+a[1]+'</option>').join('')+'</select>'+
 (q.type==='text'?'':'<label>선택지 (한 줄에 하나씩)</label><textarea data-pre-options="'+i+'" rows="3">'+safe(q.options)+'</textarea>')+
 '<label class="participant-confirm"><input type="checkbox" data-pre-required="'+i+'" '+(q.required?'checked':'')+'> 필수 응답</label><button type="button" class="btn secondary" data-pre-delete="'+i+'">삭제</button></div>').join('');
}
function preBuilder(){
 const template=window.yurifFirstStageInfoTemplate?.();
 if(!participantState.fields.length&&template){
  participantState.fields=template.preQuestions.map(q=>({type:q.type,label:q.label,options:q.options.join('\n'),required:q.required}));
 }
 return '<div class="field"><label>사전 안내서 및 동의 설명문 (필수)</label><div class="pre-toolbar"><button type="button" data-pre-format="bold">굵게</button><button type="button" data-pre-format="underline">밑줄</button><button type="button" data-pre-format="insertUnorderedList">목록</button></div>'+
 '<div id="pre-rich" class="pre-rich" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="연구 목적, 절차, 예상되는 불편, 중단 권리, 자료 보관과 문의 방법을 작성해 주세요.">'+(template?.consentHtml||'')+'</div><p class="muted">1차 실험용 기본 안내문이 자동 입력되었습니다. 대괄호 항목은 실제 운영 기준으로 반드시 수정하세요.</p></div>'+
 '<div class="pre-builder"><h3>사전 설문 항목</h3><p class="muted">1차 실험용 9개 문항이 자동 입력됩니다. 질문을 추가·수정·삭제할 수 있습니다. 건강 관련 응답은 민감정보일 수 있으므로 별도 동의 및 접근 제한을 확인하세요.</p><div id="pre-editor-fields">'+preFieldsEditor()+'</div><button type="button" class="btn secondary" id="pre-add">＋ 질문 추가</button></div>';
}
window.yurifPreBuilder=preBuilder;
window.yurifPreRead=()=>{
 const el=$('pre-rich');
 const consentText=String(el?.innerText||'').trim().slice(0,15000),consentHtml=preClean(el?.innerHTML||'');
 const preQuestions=participantState.fields.map((q,i)=>({id:'q'+(i+1),label:String(q.label||'').trim().slice(0,200),type:q.type,required:!!q.required,options:q.type==='text'?[]:preOptions(q)}));
 if(!consentText)throw Error('사전 안내서를 작성해 주세요.');
 if(/\[[^\]]*(?:입력|기재|확정|여부|방법)[^\]]*\]/.test(consentText))throw Error('안내서의 대괄호로 표시된 미확정 사항을 실제 연구 운영 내용으로 수정해 주세요.');
 if(preQuestions.some(q=>!q.label||(q.type!=='text'&&q.options.length<2)))throw Error('사전 질문의 제목과 선택지 두 개 이상을 확인해 주세요.');
 return {consentText,consentHtml,preQuestions,infoVersion:new Date().toISOString()};
};
function preQuestionHtml(q,i){
 const name='pre'+i,opts=Array.isArray(q.options)?q.options:[];
 let html='';
 if(q.type==='select')html='<select name="'+name+'" '+(q.required?'required':'')+'><option value="">선택해 주세요</option>'+opts.map((v,j)=>'<option value="'+j+'">'+shortText(v)+'</option>').join('')+'</select>';
 if(q.type==='radio')html='<div class="pre-choices">'+opts.map((v,j)=>'<label><input type="radio" name="'+name+'" value="'+j+'" '+(q.required?'required':'')+'> '+shortText(v)+'</label>').join('')+'</div>';
 if(q.type==='checkbox')html='<div class="pre-choices">'+opts.map((v,j)=>'<label><input type="checkbox" name="'+name+'" value="'+j+'"> '+shortText(v)+'</label>').join('')+'</div>';
 if(q.type==='text')html='<textarea name="'+name+'" maxlength="800" rows="3" '+(q.required?'required':'')+'></textarea>';
 return '<div class="field"><label>'+shortText(q.label)+(q.required?' *':'')+'</label>'+html+'</div>';
}
document.addEventListener('click',e=>{
 const t=e.target;
 if(t.id==='pre-add'){if(participantState.fields.length>=20)return alert('질문은 최대 20개입니다.');participantState.fields.push({type:'radio',label:'',options:'동의\n비동의',required:true});$('pre-editor-fields').innerHTML=preFieldsEditor()}
 if(t.hasAttribute('data-pre-delete')){participantState.fields.splice(Number(t.dataset.preDelete),1);$('pre-editor-fields').innerHTML=preFieldsEditor()}
 if(t.hasAttribute('data-pre-format')){e.preventDefault();$('pre-rich')?.focus();document.execCommand(t.dataset.preFormat,false,null)}
});
document.addEventListener('input',e=>{
 const t=e.target;
 if(t.hasAttribute('data-pre-title'))participantState.fields[Number(t.dataset.preTitle)].label=t.value;
 if(t.hasAttribute('data-pre-options'))participantState.fields[Number(t.dataset.preOptions)].options=t.value;
});
document.addEventListener('change',e=>{
 const t=e.target;
 if(t.hasAttribute('data-pre-type')){participantState.fields[Number(t.dataset.preType)].type=t.value;$('pre-editor-fields').innerHTML=preFieldsEditor()}
 if(t.hasAttribute('data-pre-required'))participantState.fields[Number(t.dataset.preRequired)].required=t.checked;
});

function renderParticipantSteps(){
 const root=$('participant-steps'),plan=participantState.plan,consent=participantState.consent;
 if(!root||!plan)return;
 if(!consent){
  const step=participantState.preStep||1;
  const indicator='<div class="pre-steps-progress" aria-label="사전 참여 절차"><span class="'+(step===1?'current':'')+'">1. 안내서</span><span class="'+(step===2?'current':'')+'">2. 사전 설문</span><span class="'+(step===3?'current':'')+'">3. 연구 참여 동의</span></div>';
  if(step===1){
   root.innerHTML='<section class="panel"><h2>사전 안내서</h2>'+indicator+
    '<p class="muted">연구의 목적과 예상되는 불편, 참여자의 권리 및 자료 처리에 대한 설명을 읽어주세요.</p>'+
    '<div class="participant-consent-copy">'+(plan.consentHtml?preClean(plan.consentHtml):shortText(plan.consentText).replace(/\n/g,'<br>'))+'</div>'+
    '<label class="participant-confirm"><input type="checkbox" id="participant-read-check" '+(participantState.preRead?'checked':'')+'> 안내서를 읽고 연구 목적·절차·중단 권리를 확인했습니다.</label>'+
    '<div class="actions"><button type="button" class="btn" id="participant-info-next">확인하고 다음 단계</button><button type="button" class="btn secondary" id="participant-decline">참여하지 않음</button></div></section>';
   return;
  }
  if(step===2){
   const questions=Array.isArray(plan.preQuestions)?plan.preQuestions:[];
   root.innerHTML='<section class="panel"><h2>사전 설문</h2>'+indicator+
    '<p class="muted">실험 전 안전 확인 및 현재 상태에 관한 질문입니다. 선택 문항은 응답하지 않아도 됩니다. 안전 관련 우려가 있다면 연구진에게 별도로 알려주세요.</p>'+
    '<form id="pre-response">'+(questions.length?questions.map(preQuestionHtml).join(''):'<p>추가 사전 설문 문항이 없습니다.</p>')+
    '<div class="actions"><button type="button" class="btn secondary" id="participant-pre-back">이전 단계</button><button type="submit" class="btn">설문 확인하고 다음 단계</button></div></form></section>';
   restoreParticipantDraft(root,plan);
   return;
  }
  root.innerHTML='<section class="panel"><h2>연구 참여 동의</h2>'+indicator+
   '<p>사전 안내서와 사전 설문을 확인했습니다. 아래 내용을 읽고 연구 참여 여부를 선택해 주세요.</p>'+
   '<div class="participant-consent-copy"><p>본인은 연구 목적과 기본 절차, 생리적 측정 및 설문, 예상되는 불편과 위험, 자료 수집·이용 및 보관에 관한 설명을 확인했습니다.</p>'+
   '<p>참여 여부는 자발적으로 결정하며, 참여하지 않거나 진행 중 중단하여도 불이익이 없음을 이해했습니다. 연구 참여 및 안내받은 범위의 연구자료 수집·이용에 동의하는 경우에만 아래 동의 버튼을 선택합니다.</p>'+
   '<p class="muted">보호자 동의 또는 별도의 개인정보·민감정보 동의가 필요한 경우 연구진이 추가로 확인해야 하며, 이 화면만으로 대체되지 않습니다.</p></div>'+
   '<div class="actions"><button type="button" class="btn secondary" id="participant-consent-back">이전 단계</button>'+
   '<button type="button" class="btn" id="participant-agree">동의하고 실험 준비</button>'+
   '<button type="button" class="btn secondary" id="participant-decline">동의하지 않음</button></div></section>';
  return;
 }
 if(!consent.agreed){
  root.innerHTML='<section class="panel"><h2>동의하지 않음</h2><p>동의하지 않았으므로 실험 설문을 진행하지 않습니다. 참여를 원하지 않는다는 이유로 불이익이 없어야 합니다.</p></section>';return;
 }
 if(plan.v2){window.yurifV2?.renderParticipant({key:participantState.key,plan,consent});return;}
 const slots=participantSurveySlots(plan),next=slots.find(x=>!participantState.answers.has(x.slot));
 if(!next){
  root.innerHTML='<section class="panel"><h2>모든 설문 완료</h2><p>응답이 서버에 저장되었습니다. 연구원의 안내를 따라 주세요.</p>'+
   '<p class="muted">총 '+slots.length+'개 설문 응답 완료</p></section>';return;
 }
 const completed=slots.filter(x=>participantState.answers.has(x.slot)).length;
 root.innerHTML='<section class="panel"><h2>'+shortText(next.title)+'</h2>'+
  '<p>진행 상태: '+completed+' / '+slots.length+' 완료</p>'+
  (plan.stage==='stage1'?'<p>해당 감각 환경 체험을 마친 뒤 아래 설문에 답하고 다음 단계로 넘어가세요.</p>':'<p>전체 대화가 끝난 후에만 아래 설문에 응답해 주세요.</p>')+
  '<form id="participant-survey-form"><div class="field"><label>'+shortText(plan.valenceQuestion||'현재 느끼는 쾌·불쾌 정도 (1 매우 불쾌 ~ 9 매우 쾌적)')+'</label>'+
  '<input name="valence" type="number" min="1" max="9" step="1" required></div>'+
  '<div class="field"><label>'+shortText(plan.arousalQuestion||'현재 각성 수준 (1 매우 낮음 ~ 9 매우 높음)')+'</label>'+
  '<input name="arousal" type="number" min="1" max="9" step="1" required></div>'+
  (plan.stage==='stage2'?'<div class="field"><label>'+shortText(plan.likingQuestion||'대화 상대에 대한 호감 정도 (1 매우 낮음 ~ 9 매우 높음)')+'</label><input name="liking" type="number" min="1" max="9" step="1" required></div>':'')+
  '<label class="participant-confirm"><input type="checkbox" name="finished" value="yes" required> '+(plan.stage==='stage1'?'위 감각 환경의 체험을 마친 후 응답했습니다.':'전체 대화를 마친 후 응답했습니다.')+'</label>'+ 
  '<div class="field"><label>추가 느낌 · 특이사항 (선택)</label><textarea name="note" maxlength="1000"></textarea></div>'+
  '<button type="submit" class="btn" id="participant-survey-save">'+(completed===slots.length-1?'최종 설문 저장':'응답 저장하고 다음 단계')+'</button></form></section>';
}
function collectParticipantDraft(form,plan){
 const result={};
 const data=new FormData(form);
 for(let i=0;i<(plan.preQuestions||[]).length;i++){
  const q=plan.preQuestions[i],values=data.getAll('pre'+i).map(String),opts=q.options||[];
  if(q.required&&!values.length)throw Error('필수 질문에 응답해 주세요: '+q.label);
  if(q.type==='text'){
   const v=String(values[0]||'').trim().slice(0,800);
   if(q.required&&!v)throw Error('필수 질문에 응답해 주세요: '+q.label);
   result[q.id]=v;
  }else{
   if(values.some(v=>!Number.isInteger(Number(v))||Number(v)<0||Number(v)>=opts.length))throw Error('선택지를 다시 확인해 주세요.');
   result[q.id]=q.type==='checkbox'?values.map(v=>opts[Number(v)]):(values.length?opts[Number(values[0])]:'');
  }
 }
 return result;
}
function restoreParticipantDraft(root,plan){
 const draft=participantState.preDraft;
 if(!draft)return;
 for(let i=0;i<(plan.preQuestions||[]).length;i++){
  const q=plan.preQuestions[i],value=draft[q.id],name='pre'+i;
  const fields=Array.from(root.querySelectorAll('[name="'+name+'"]'));
  if(q.type==='text'||q.type==='select'){
   if(fields[0])fields[0].value=q.type==='text'?(value||''):value==null||value===''?'':String((q.options||[]).indexOf(value));
  }else{
   for(const field of fields){
    const option=(q.options||[])[Number(field.value)];
    field.checked=q.type==='checkbox'?Array.isArray(value)&&value.includes(option):value===option;
   }
  }
 }
}
async function recordParticipantConsent(agreed){
 if(!participantState.plan||!participantState.key||!auth.currentUser?.isAnonymous)return;
 if(agreed&&(participantState.preStep!==3||!participantState.preRead||!participantState.preDraft))
  return portalMsg('사전 안내서와 설문을 순서대로 확인해 주세요.');
 const plan=participantState.plan;
 const data={uid:auth.currentUser.uid,agreed,preAnswers:agreed?participantState.preDraft:{},infoVersion:plan.infoVersion||'legacy',
 infoSnapshot:{consentText:plan.consentText||'',consentHtml:plan.consentHtml||'',preQuestions:plan.preQuestions||[]},createdAt:serverTimestamp()};
 const buttons=Array.from(document.querySelectorAll('#participant-agree,#participant-decline'));
 buttons.forEach(b=>b.disabled=true);
 try{
  await setDoc(participantConsentRef(participantState.key),data);
  const stored=await getDocFromServer(participantConsentRef(participantState.key));
  if(!stored.exists()||stored.data().agreed!==agreed||stored.data().uid!==auth.currentUser.uid)throw Error('Firebase 서버 동의 기록 확인 실패');
  participantState.consent=stored.data();portalMsg(agreed?'선택한 실험의 연구 참여 동의가 Firebase 서버에 저장되었습니다. 이제 ‘실험 시작하기’를 눌러 연구원에게 준비 완료를 알려 주세요.':'비동의 기록이 Firebase 서버에 저장되었습니다.');
  renderParticipantSteps();
 }catch(e){portalMsg('동의 기록 저장 실패: '+friendly(e)+' · 저장 확인 전에는 다음 단계로 진행할 수 없습니다.');buttons.forEach(b=>b.disabled=false)}
}
async function recordParticipantAnswer(form){
 if(!participantState.plan||!participantState.consent?.agreed)return;
 const next=participantSurveySlots(participantState.plan).find(x=>!participantState.answers.has(x.slot));
 if(!next)return;
 const values=Object.fromEntries(new FormData(form));
 if(values.finished!=='yes')return portalMsg('해당 실험 구간이 끝났음을 확인한 뒤 설문을 저장해 주세요.');
 const valence=Number(values.valence),arousal=Number(values.arousal),liking=values.liking==null?null:Number(values.liking);
 if(![valence,arousal].every(v=>Number.isInteger(v)&&v>=1&&v<=9)||(liking!==null&&(!Number.isInteger(liking)||liking<1||liking>9)))return portalMsg('설문 점수는 1~9 사이의 정수로 입력해 주세요.');
 const button=$('participant-survey-save');button.disabled=true;portalMsg('응답 저장 중…');
 const answer={uid:auth.currentUser.uid,slot:next.slot,environment:next.env,index:next.index,
  stage:participantState.plan.stage,finishedConfirmed:true,valence,arousal,liking:liking===null?'':liking,
  note:String(values.note||'').slice(0,1000),createdAt:serverTimestamp()};
 try{
  await setDoc(participantAnswerRef(participantState.key,next.slot),answer);
  const check=await getDoc(participantAnswerRef(participantState.key,next.slot));
  if(!check.exists()||check.data().valence!==valence||check.data().arousal!==arousal)throw Error('응답 저장 확인 실패');
  participantState.answers.set(next.slot,check.data());portalMsg('응답 '+(participantState.answers.size)+'개 저장 확인 완료');
  renderParticipantSteps();
 }catch(e){portalMsg('응답 저장 실패: '+friendly(e)+' · 저장 성공 전에는 다음 설문으로 넘어가지 않습니다.');button.disabled=false}
}
document.addEventListener('click',e=>{
 const id=e.target?.id;
 if(id==='participant-info-next'){
  if(!$('participant-read-check')?.checked)return portalMsg('안내서 확인란에 먼저 체크해 주세요.');
  participantState.preRead=true;participantState.preStep=2;portalMsg('');renderParticipantSteps();return;
 }
 if(id==='participant-pre-back'){participantState.preStep=1;portalMsg('');renderParticipantSteps();return}
 if(id==='participant-consent-back'){participantState.preStep=2;portalMsg('');renderParticipantSteps();return}
 if(id==='participant-agree')recordParticipantConsent(true);
 if(id==='participant-decline')recordParticipantConsent(false);
});
document.addEventListener('submit',e=>{
 if(e.target?.id!=='pre-response')return;
 e.preventDefault();
 if(!e.target.reportValidity())return portalMsg('필수 사전 설문에 응답해 주세요.');
 try{
  participantState.preDraft=collectParticipantDraft(e.target,participantState.plan);
  participantState.preStep=3;portalMsg('');renderParticipantSteps();
 }catch(err){portalMsg(err.message)}
});
document.addEventListener('submit',e=>{
 if(e.target?.id!=='participant-survey-form')return;
 e.preventDefault();recordParticipantAnswer(e.target);
});

function participantAdminHtml(){
 return '<section class="panel"><h2>실험 참가자 등록 및 설문 순서 설정</h2>'+
 '<p class="muted">연구용 참가자 코드(P01 등)와 추측하기 어려운 별도의 입장 코드를 발급합니다. 입장 코드를 받은 사람만 본인 설문에 접근할 수 있습니다. 실명은 입력하지 마세요.</p>'+
 '<form id="participant-plan-form"><div class="formgrid"><div class="field"><label>연구용 참가자 코드</label><input name="code" maxlength="30" required placeholder="P01"></div>'+
 '<div class="field"><label>실험 단계</label><select name="stage" id="participant-plan-stage"><option value="stage1">1차 감각 환경 실험</option><option value="stage2">2차 대화 실험</option></select></div></div>'+
 '<div class="field"><label>참가자에게 적용할 감각 환경 순서 (1차 실험 · 한 줄에 하나씩)</label><textarea name="order" rows="5" placeholder="조도 300 lx · 4000 K&#10;조용한 교실&#10;바닐라 향" required></textarea></div>'+
 preBuilder()+



 '<button type="submit" class="btn" id="participant-plan-create">참가자 등록 · 입장 코드 발급</button></form></section>'+
 '<section class="panel"><div class="entry-head"><div><h2>참가자별 설문 및 생리 측정 결과</h2><p class="muted">설문과 같은 참가자 코드의 GSR 기록을 함께 확인합니다. 구간 매칭은 환경명·시각을 검토해야 합니다.</p></div><button type="button" class="btn secondary" id="participant-admin-refresh">목록 새로고침</button></div>'+
 '<div id="participant-admin-list">'+(participantState.adminPlans.length?participantState.adminPlans.map(p=>
  '<div class="lab-archive-item"><strong>'+shortText(p.code)+'</strong> · '+(p.stage==='stage1'?'1차':'2차')+' · '+(p.order||[]).length+'개 조건'+
  '<p class="muted">상태: '+(p.active?'활성':'접근 중지')+'</p><p class="muted">입장 코드: <code>'+shortText(p.key)+'</code></p>'+
  '<div class="actions"><button type="button" class="btn secondary" data-participant-copy="'+shortText(p.key)+'">입장 코드 복사</button>'+
  '<button type="button" class="btn secondary" data-participant-results="'+shortText(p.key)+'">동의·응답·GSR 조회</button>'+(state.member?.role==='admin'&&p.active?'<button type="button" class="btn secondary" data-participant-deactivate="'+shortText(p.key)+'">참가 코드 사용 중지</button>':'')+'</div></div>').join(''):'<p class="muted">등록된 참가자가 없거나 아직 목록을 불러오지 못했습니다.</p>')+'</div>'+
 '<div id="participant-admin-results">'+(participantState.adminRows||[]).join('')+'</div></section>';
}
window.yurifParticipantAdminHtml=participantAdminHtml;
window.yurifParticipantSessionHtml=()=>'<section class="panel"><h2>참가자 설문 · GSR 통합 결과</h2><p class="muted">참가자의 사전 동의·감각 환경별 설문·GSR 원시값을 함께 확인합니다. 측정값은 보정 전 ADC입니다.</p><div class="formgrid"><div class="field"><label>참가자 선택</label><select id="participant-session-picker"><option value="">선택하세요</option>'+participantState.adminPlans.map(p=>'<option value="'+safe(p.key)+'">'+safe(p.code)+' · '+(p.stage==='stage1'?'1차':'2차')+'</option>').join('')+'</select></div></div><div id="participant-session-results" class="muted">등록된 참가자와 설문을 선택해 주세요.</div></section>';
async function refreshParticipantAdmin(){
 if(!state.ready)return;
 try{
  const snapshot=await getDocs(collection(store,'participantAccess'));
  participantState.adminPlans=snapshot.docs.map(d=>({key:d.id,...d.data()})).sort((a,b)=>String(a.code).localeCompare(String(b.code)));
  if(document.getElementById('content')&&window.yurifParticipantAdminRefreshView)window.yurifParticipantAdminRefreshView();
  const sessionPicker=$('participant-session-picker');if(sessionPicker){const prev=sessionPicker.value;sessionPicker.innerHTML='<option value="">선택하세요</option>'+participantState.adminPlans.map(p=>'<option value="'+safe(p.key)+'">'+safe(p.code)+' · '+(p.stage==='stage1'?'1차':'2차')+'</option>').join('');sessionPicker.value=prev;}
 }catch(ex){const node=$('participant-admin-list');if(node)node.textContent='참가자 목록 불러오기 실패: '+friendly(ex)}
}
window.yurifParticipantAdminLoad=refreshParticipantAdmin;
function participantAdminSelectStage(){
 const el=document.querySelector('#participant-plan-form [name=order]');
 if(!el)return;
 el.required=$('participant-plan-stage')?.value==='stage1';
 el.disabled=$('participant-plan-stage')?.value==='stage2';
 el.placeholder=el.disabled?'2차 실험은 대화 종료 후 설문 한 번만 표시됩니다.':'환경 순서대로 한 줄에 하나씩 입력하세요.';
}
document.addEventListener('change',e=>{if(e.target?.id==='participant-plan-stage')participantAdminSelectStage()});
document.addEventListener('submit',async e=>{
 if(e.target?.id!=='participant-plan-form')return;
 e.preventDefault();
 if(!state.ready||!state.member)return alert('승인된 연구원 계정으로 로그인해 주세요.');
 const d=Object.fromEntries(new FormData(e.target)),code=String(d.code||'').trim();
 const stage=d.stage==='stage2'?'stage2':'stage1';
 const order=stage==='stage1'?String(d.order||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean):['대화 종료'];
 const consentText=String($('pre-rich')?.innerText||'').trim().slice(0,15000),consentHtml=preClean($('pre-rich')?.innerHTML||'');
 if(!code||!order.length||!consentText)return alert('참가자 코드, 환경 순서, 안내서를 확인해 주세요.');
 const preQuestions=participantState.fields.map((q,i)=>({id:'q'+(i+1),label:q.label.trim().slice(0,200),type:q.type,required:q.required,options:q.type==='text'?[]:preOptions(q)}));
 if(preQuestions.some(q=>!q.label||(q.type!=='text'&&q.options.length<2)))return alert('질문 제목과 선택지(2개 이상)를 확인해 주세요.');

 if(participantState.adminPlans.some(p=>p.code===code&&p.stage===stage&&p.active))return alert('같은 참가자 코드·실험 단계가 이미 등록되어 있습니다. 기존 등록 정보를 확인해 주세요.');
 const key=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
 const plan={code,stage,order,consentText,consentHtml,preQuestions,infoVersion:new Date().toISOString(),active:true,valenceQuestion:String(d.valenceQuestion||'').slice(0,240),
  arousalQuestion:String(d.arousalQuestion||'').slice(0,240),likingQuestion:String(d.likingQuestion||'').slice(0,240),
  createdAt:serverTimestamp()};
 const button=$('participant-plan-create');button.disabled=true;
 try{
  await setDoc(participantPlanRef(key),plan);
  const check=await getDoc(participantPlanRef(key));
  if(!check.exists())throw Error('서버 저장 확인 실패');
  await refreshParticipantAdmin();
  alert('참가자 등록 완료. 입장 코드: '+key+'\n연구원 화면의 코드 복사 버튼으로 참가자에게 전달할 수 있습니다.');
 }catch(ex){alert('참가자 등록 실패: '+friendly(ex))}
 finally{button.disabled=false}
});
async function participantAdminRead(key,elementId='participant-admin-results'){
 const root=$(elementId);
 if(!root)return;
 root.textContent='동의 및 설문 응답을 불러오는 중…';
 const plan=participantState.adminPlans.find(p=>p.key===key);if(!plan)return;
 try{
  const [consentSnapshot,answerSnapshot,gsrSnapshot]=await Promise.all([
   getDoc(participantConsentRef(key)),getDocs(participantAnswersRef(key)),
   getDocs(query(gsrIndex,where('code','==',plan.code)))
  ]);
  const consent=consentSnapshot.exists()?consentSnapshot.data():null;
  const answers=new Map(answerSnapshot.docs.map(d=>[d.id,d.data()]));
  const runs=gsrSnapshot.docs.map(d=>d.data()).filter(r=>r.mode===plan.stage);
  let physiology=[];
  for(const run of runs){
   const chunkSnap=await getDocs(query(gsrChunks,where('runId','==',run.id)));
   const points=chunkSnap.docs.flatMap(d=>Array.isArray(d.data().points)?d.data().points.map(gsrFromCloudPoint).filter(Boolean):[]);
   for(const step of run.steps||[]){
    if(!step.startedAt||!step.endedAt)continue;
    const readings=points.filter(p=>Array.isArray(p)&&p[0]>=step.startedAt&&p[0]<step.endedAt);
    if(!readings.length)continue;
    physiology.push({name:step.envName||step.name||step.label,label:step.label,
      count:readings.length,mean:(readings.reduce((sum,p)=>sum+p[1],0)/readings.length).toFixed(2),
      min:Math.min(...readings.map(p=>p[1])),max:Math.max(...readings.map(p=>p[1])),run:run.id});
   }
  }
  const slots=participantSurveySlots(plan);
  root.innerHTML='<section class="panel"><h3>'+shortText(plan.code)+' · 설문·GSR 확인</h3>'+
   '<p>사전 동의: '+(!consent?'아직 응답 없음':consent.agreed?'동의':'비동의')+
   ' / 설문 완료: '+answers.size+' / '+slots.length+'</p>'+ (consent?'<div class="pre-admin-answers"><h4>사전 설문 응답</h4><p class="muted">안내서 버전: '+shortText(consent.infoVersion||'이전 버전')+'</p>'+(consent.agreed?(consent.infoSnapshot?.preQuestions||plan.preQuestions||[]).map(q=>'<p><strong>'+shortText(q.label)+'</strong>: '+shortText(Array.isArray(consent.preAnswers?.[q.id])?consent.preAnswers[q.id].join(', '):(consent.preAnswers?.[q.id]||'미응답'))+'</p>').join(''):'비동의 · 사전 응답 미수집')+'</div>':'')+

   '<div class="tablewrap"><table><thead><tr><th>구간 · 환경</th><th>설문 저장</th><th>쾌·불쾌</th><th>각성</th><th>대인 호감</th><th>GSR ADC</th></tr></thead><tbody>'+
   slots.map(slot=>{
    const answer=answers.get(slot.slot);
    const candidates=physiology.filter(p=>p.name===slot.env);
    const matched=candidates.length===1?candidates[0]:null;
    return '<tr><td>'+shortText(slot.title)+'</td><td>'+(answer?'완료':'미응답')+'</td><td>'+(answer?answer.valence:'—')+
     '</td><td>'+(answer?answer.arousal:'—')+'</td><td>'+(answer&&answer.liking!==''?answer.liking:'—')+'</td>'+
     '<td>'+(matched?'평균 '+matched.mean+' · '+matched.count+'개 (최소 '+matched.min+', 최대 '+matched.max+')':(candidates.length>1?'동일 환경의 측정 구간이 여러 개여서 수동 확인 필요':'동일 환경명으로 자동 매칭되지 않음'))+'</td></tr>';
   }).join('')+'</tbody></table></div>'+
   '<p class="muted">GSR 수치는 보정 전 ADC이며, 같은 참가자 코드와 정확히 일치하는 환경명만 자동 연결합니다. 실험 구간 시각과 설문 응답 시각을 별도로 확인하세요. 맞지 않으면 임의로 합치지 않습니다.</p>'+
   (physiology.length?'<p class="muted">연결된 GSR 구간: '+physiology.map(p=>shortText(p.label)+' '+shortText(p.name)+'(평균 '+p.mean+')').join(', ')+'</p>':'')+
   '</section>';
 }catch(ex){root.textContent='설문·GSR 조회 실패: '+friendly(ex)}
}
document.addEventListener('change',async e=>{if(e.target?.id==='participant-session-picker'&&e.target.value)await participantAdminRead(e.target.value,'participant-session-results')});
document.addEventListener('click',async e=>{
 if(e.target?.id==='participant-admin-refresh'){await refreshParticipantAdmin();return}
 const copy=e.target?.closest('[data-participant-copy]');
 if(copy){try{await navigator.clipboard.writeText(copy.dataset.participantCopy);alert('입장 코드 복사 완료')}catch{alert('입장 코드: '+copy.dataset.participantCopy)}return}
 const deactivate=e.target?.closest('[data-participant-deactivate]');
 if(deactivate&&state.member?.role==='admin'){
  const key=deactivate.dataset.participantDeactivate;
  if(!confirm('이 참가자의 입장 코드를 비활성화할까요? 이미 저장된 동의·설문 데이터는 삭제되지 않습니다.'))return;
  try{const p=participantState.adminPlans.find(x=>x.key===key);if(!p)return;
   await setDoc(participantPlanRef(key),{code:p.code,stage:p.stage,order:p.order,consentText:p.consentText,consentHtml:p.consentHtml||'',preQuestions:p.preQuestions||[],infoVersion:p.infoVersion||'legacy',active:false,valenceQuestion:p.valenceQuestion||'',arousalQuestion:p.arousalQuestion||'',likingQuestion:p.likingQuestion||'',createdAt:p.createdAt||serverTimestamp()});
   await refreshParticipantAdmin();alert('입장 코드 사용을 중지했습니다.');
  }catch(ex){alert('참가 코드 비활성화 실패: '+friendly(ex))}
  return;
 }
 const result=e.target?.closest('[data-participant-results]');
 if(result){await participantAdminRead(result.dataset.participantResults)}
});

async function renderTeamMemberManager(){
 if(state.member?.role!=='admin')return;
 const drawer=$('admin-drawer');if(!drawer)return;
 const panel=drawer.querySelector('.yurif-admin-panel');if(!panel)return;
 let section=$('team-member-manager');
 if(!section){
  section=document.createElement('section');section.id='team-member-manager';section.className='yurif-admin-members';
  panel.append(section);
 }
 section.innerHTML='<h3>연구원 계정 승인 및 관리</h3>'+
  '<p>연구원은 로그인 화면에서 이메일·비밀번호로 계정을 만들고, 생성된 UID를 관리자에게 전달합니다. UID가 정확한지 확인한 후 승인하세요.</p>'+
  '<form id="team-member-approve-form"><label for="team-member-uid">연구원 Firebase UID</label><input id="team-member-uid" required minlength="10" maxlength="128" placeholder="연구원이 전달한 UID">'+
  '<button type="submit" class="yurif-smallbtn">연구원 승인</button></form><div id="team-member-list">승인된 계정 조회 중…</div>';
 try{
  const docs=await getDocs(collection(store,'members'));
  const list=docs.docs.map(d=>({uid:d.id,...d.data()}));
  const root=$('team-member-list');if(!root)return;
  root.innerHTML=list.length?list.map(m=>'<div class="yurif-member-row"><code>'+safe(m.uid)+'</code> <strong>'+safe(m.role||'')+'</strong> '+
   (m.active?'활성':'비활성')+
   (m.role==='researcher'?'<button type="button" class="yurif-smallbtn" data-member-toggle="'+safe(m.uid)+'" data-member-active="'+(m.active?'0':'1')+'">'+(m.active?'접근 중지':'접근 재개')+'</button>':'')+'</div>').join(''):'등록된 연구팀 계정이 없습니다.';
 }catch(ex){const root=$('team-member-list');if(root)root.textContent='팀 계정 조회 실패: '+friendly(ex)}
}
document.addEventListener('submit',async e=>{
 if(e.target?.id!=='team-member-approve-form')return;
 e.preventDefault();if(state.member?.role!=='admin')return;
 const uid=$('team-member-uid').value.trim();
 if(!/^[A-Za-z0-9_-]{10,128}$/.test(uid))return alert('연구원의 Firebase UID를 확인해 주세요.');
 if(!confirm('이 UID를 승인된 연구원으로 등록할까요? UID의 소유자를 먼저 확인해 주세요.'))return;
 try{
  const existing=await getDoc(doc(store,'members',uid));
  if(existing.exists()&&existing.data().role==='admin')throw new Error('관리자 계정은 연구원으로 덮어쓸 수 없습니다.');
  await setDoc(doc(store,'members',uid),{role:'researcher',active:true});
  const check=await getDoc(doc(store,'members',uid));
  if(!check.exists()||check.data().role!=='researcher'||check.data().active!==true)throw Error('승인 결과 확인 실패');
  await renderTeamMemberManager();alert('연구원 승인 완료. 해당 연구원이 본인 계정으로 로그인할 수 있습니다.');
 }catch(ex){alert('연구원 승인 실패: '+friendly(ex))}
});
document.addEventListener('click',async e=>{
 const b=e.target?.closest('[data-member-toggle]');if(!b||state.member?.role!=='admin')return;
 const uid=b.dataset.memberToggle,active=b.dataset.memberActive==='1';
 if(!confirm('연구원 '+uid+'의 접근을 '+(active?'다시 허용':'중지')+'할까요?'))return;
 try{
  await setDoc(doc(store,'members',uid),{role:'researcher',active});
  await renderTeamMemberManager();
 }catch(ex){alert('접근 권한 변경 실패: '+friendly(ex))}
});
