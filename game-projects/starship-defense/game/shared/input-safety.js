// Public player text is shown only after Toy has explicitly approved that exact text.
// Approvals stay in memory; stored nicknames and text from other clients are untrusted.
const SDK_URL='https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';
const DEFAULT_NAMES=new Set(['玩家','坦克手']);
const DEFAULT_ROOMS=new Set(['合作房间','玩家的房间','坦克手的房间']);
export const anonymousPlayerName=slot=>Number.isInteger(slot)&&slot>=0&&slot<8?'玩家'+(slot+1):'玩家';
function builtInText(text){return DEFAULT_NAMES.has(text)||DEFAULT_ROOMS.has(text)||/^玩家[1-8]$/.test(text)||/^合作房间 · \d{6}$/.test(text);}
const records=new Map(),listeners=new Set();
const jobs=[];
let activeChecks=0;
let loading=null;
function runLimited(check){
  return new Promise(resolve=>{
    const deadline=Date.now()+8000;
    jobs.push(async()=>{if(Date.now()>=deadline){resolve(null);return;}try{resolve(await check());}catch{resolve(null);}});
    drain();
  });
}
function drain(){
  while(activeChecks<3&&jobs.length){activeChecks++;const job=jobs.shift();void job().finally(()=>{activeChecks--;drain();});}
}
export function isToyTextEnvironment(){
  return typeof window!=='undefined'&&(!!window.toy||typeof location!=='undefined'&&/^(www\.bilibili\.com|(?:www\.)?bilibilitoy\.com)$/.test(location.hostname)&&location.pathname.startsWith('/toy/'));
}
function timeout(promise,ms=8000){
  let timer;
  return Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),ms);})]).finally(()=>clearTimeout(timer));
}
async function sdk(){
  if(typeof window==='undefined')return null;
  if(window.toy)return window.toy;
  if(!isToyTextEnvironment())return null;
  if(!loading)loading=new Promise(resolve=>{
    let script=document.querySelector('script[src="'+SDK_URL+'"]');
    if(!script){script=document.createElement('script');script.src=SDK_URL;script.async=true;document.head.appendChild(script);}
    const finish=()=>resolve(window.toy||null);
    script.addEventListener('load',finish,{once:true});script.addEventListener('error',()=>resolve(null),{once:true});
  });
  const value=await timeout(loading);
  if(!value)loading=null;
  return value;
}
export function onPublicTextChecked(listener){listeners.add(listener);return()=>listeners.delete(listener);}
export function isPublicTextApproved(text){
  const record=records.get(text);
  return !!record&&record.expires>Date.now()&&record.result?.passed===true;
}
export async function checkPublicText(text,scene='nickname'){
  if(typeof text!=='string'||!text.trim()||new TextEncoder().encode(text).length>16384)return {passed:false,status:'rejected'};
  const old=records.get(text);
  if(old?.pending)return old.pending;
  if(old&&old.expires>Date.now())return old.result;
  if(records.size>=256){for(const [key,value] of records)if(!value.pending){records.delete(key);break;}if(records.size>=256)return {passed:false,status:'unavailable'};}
  const record={expires:0,result:null,pending:null};
  records.set(text,record);
  record.pending=(async()=>{
    let result={passed:false,status:'unavailable'};
    try{
      const api=await sdk();
      if(api&&typeof api.checkInputSafety==='function'&&typeof api.isSupport==='function'&&await timeout(Promise.resolve(api.isSupport('checkInputSafety')))){
        const response=await timeout(runLimited(()=>timeout(Promise.resolve(api.checkInputSafety({text,scene})))));
        if(response?.status==='ok'&&response.passed===true)result={passed:true,status:'ok'};
        else if(response?.status==='rejected')result={passed:false,status:'rejected'};
      }
    }catch{}
    record.result=result;record.expires=Date.now()+(result.status==='unavailable'?5000:300000);record.pending=null;
    // Bound memory even when a malicious peer keeps changing names.
    if(records.size>256)for(const [key,value] of records){if(!value.pending&&key!==text){records.delete(key);if(records.size<=256)break;}}
    for(const listener of listeners){try{listener(text,result);}catch{}}
    return result;
  })();
  return record.pending;
}
export function publicText(text,fallback='玩家',allowCheck=false){
  if(typeof text!=='string'||!text)return fallback;
  // Literal labels and bounded server-generated names contain no player input.
  if(builtInText(text))return text;
  if(isPublicTextApproved(text))return text;
  // Outside Toy, only literal built-in labels may be displayed. Never accept arbitrary text.
  if(!isToyTextEnvironment())return DEFAULT_NAMES.has(text)||DEFAULT_ROOMS.has(text)?text:fallback;
  // Anonymous readers show a fixed fallback without requesting a logged-in API.
  if(allowCheck)void checkPublicText(text,'display_text');
  return fallback;
}
export async function preparePublicIdentity(name,roomName,create,anonymous=false){
  if(anonymous)return {passed:true,name:'',roomName:create?'':null,anonymous:true};
  const nickname=String(name||'玩家').trim().slice(0,12)||'玩家';
  const room=create?String(roomName||'').trim().slice(0,32):null;
  if(!isToyTextEnvironment()){
    if(!builtInText(nickname))return {passed:false,field:'name',status:'unavailable',message:'此环境暂不支持自定义昵称，请勾选匿名联机；单机与匿名联机无需游戏内登录'};
    if(room&&!builtInText(room))return {passed:false,field:'roomName',status:'unavailable',message:'此环境暂不支持自定义房间名，请留空或勾选匿名联机'};
    return {passed:true,name:nickname,roomName:room,anonymous:false};
  }
  for(const [field,text,scene,label] of [['name',nickname,'nickname','昵称'],...(create?[['roomName',room,'room_name','房间名称']]:[])]){
    if(!text||builtInText(text))continue;
    const result=await checkPublicText(text,scene);
    if(!result.passed)return {passed:false,field,status:result.status,message:result.status==='rejected'?label+'未通过安全检测，请换一个再试':label+'暂时无法完成安全检测；自定义名称需登录B站，也可勾选匿名联机直接游玩'};
  }
  return {passed:true,name:nickname,roomName:room,anonymous:false,customText:!builtInText(nickname)||!!room&&!builtInText(room)};
}
// Each visit starts anonymously; a cached custom name must not become a login gate.
export function installAnonymousControls(toggle,name,room,onChange=()=>{}){
  let profileName='';
  const update=()=>{
    name.dataset.identityRevision=String(Number(name.dataset.identityRevision||0)+1);
    // Public names come from the server or a checked official profile, never free input.
    if(!profileName)toggle.checked=true;
    name.readOnly=room.readOnly=true;
    room.value='';
    if(toggle.checked){profileName='';name.value='玩家';}else name.value=profileName;
    name.placeholder='默认匿名；也可主动使用B站昵称';
    room.placeholder='系统自动生成房间名称';
  };
  toggle.checked=true;update();toggle.addEventListener('change',()=>{update();onChange();});
  for(const input of [name,room])input.addEventListener('input',()=>{update();onChange();});
  return nickname=>{
    if(typeof nickname!=='string'||!isPublicTextApproved(nickname))return false;
    profileName=nickname;toggle.checked=false;update();return true;
  };
}
// Load capability ahead of the click so the profile request retains the player's gesture.
export function installNicknameButton(button,input,status,onUse=()=>{}){
  button.hidden=!isToyTextEnvironment();button.disabled=true;
  if(button.hidden)return;
  let api=null;
  void sdk().then(async value=>{
    if(value&&typeof value.getUserProfile==='function'&&typeof value.isSupport==='function'&&await timeout(Promise.resolve(value.isSupport('getUserProfile')))){
      api=value;button.dataset.profileReady='1';button.disabled=input.disabled;
    }
  }).catch(()=>{});
  button.addEventListener('click',async()=>{
    if(!api||input.disabled)return;
    const before=input.value,revision=input.dataset.identityRevision;button.disabled=true;
    try{
      const profile=await api.getUserProfile();
      const name=typeof profile?.nickname==='string'?profile.nickname.trim().slice(0,12):'';
      if(!name){status('未获得B站昵称，可继续使用默认名称');return;}
      const checked=await checkPublicText(name,'nickname');
      if(input.value!==before||input.disabled||input.dataset.identityRevision!==revision)return;
      if(!checked.passed){if(!input.readOnly)input.value='';status(checked.status==='rejected'?'B站昵称未通过安全检测；可继续匿名联机':'暂时无法检测B站昵称；可继续匿名联机');return;}
      onUse(name);input.value=name;status('已填入B站昵称；创建或加入房间时使用，房间名称由系统生成');
    }catch{status('未获得B站昵称，可继续使用默认名称');}
    finally{button.disabled=input.disabled;}
  });
}
// Names in battle snapshots and result tables must not bypass lobby moderation.
export function protectSnapshotText(value,depth=0,allowCheck=false){
  if(!value||typeof value!=='object'||depth>24)return value;
  for(const [key,item] of Object.entries(value)){
    if(typeof item==='string'&&/^(name|nickname|roomName|playerName|message|msg|toast|banner|reason|title|text)$/.test(key))value[key]=publicText(item,/name/i.test(key)?'玩家':'',allowCheck);
    else if(item&&typeof item==='object')protectSnapshotText(item,depth+1,allowCheck);
  }
  return value;
}
