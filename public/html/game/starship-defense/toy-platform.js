import {campaignDifficulty} from './campaign-difficulty.js';
import {mountSavePanel} from './save-panel.js';
import {newSaveId} from './save-store.js';
import {cloudRecord,SaveConflict} from './cloud-save.js';
const CLOUD_KEY='chongchao_normal_v1';
const AUTO_KEY='chongchao_auto_v2',BACKUP_KEY='chongchao_previous_v2';
const PLAY_URL='https://www.bilibili.com/toy/chongchao-qianshao/index.html';
const AUTHOR='16214353',VIDEO='BV1Ujad6DEuf';

// Cache reads and serialize writes. These are application UX cooldowns, not platform quotas.
export class ToyBridge {
  constructor(sdk,now=()=>Date.now()){this.sdk=sdk;this.now=now;this.cache=new Map();this.pending=new Map();this.blockedUntil=0;this.failures=0;}
  async call(method,arg,{cacheKey,refresh=false}={}){
    const key=cacheKey||method;
    if(cacheKey&&!refresh&&this.cache.has(key))return this.cache.get(key);
    if(this.pending.has(key))return this.pending.get(key);
    if(this.now()<this.blockedUntil)throw new Error('请求暂缓，请稍后再试，本地存档不受影响');
    const p=(async()=>{
      if(!this.sdk||!await this.sdk.isSupport(method))throw new Error('当前环境不支持，请在 B站 Toy 中使用此功能');
      try{const value=await this.sdk[method](arg);if(cacheKey)this.cache.set(key,value);this.failures=0;return value;}
      catch(e){if(e&&e.code===307044){this.blockedUntil=this.now()+Math.min(120000,5000*2**this.failures++);throw new Error('平台繁忙，请稍后手动重试；本地进度已保留');}throw e;}
    })();
    this.pending.set(key,p);try{return await p;}finally{this.pending.delete(key);}
  }
}

async function loadSdk(){
  // Toy's public page embeds the game on its official isolated bilibilitoy.com origin.
  if(!['www.bilibili.com','bilibilitoy.com','www.bilibilitoy.com'].includes(location.hostname)||!location.pathname.startsWith('/toy/'))return null;
  if(window.toy)return window.toy;
  return new Promise(resolve=>{
    const script=document.createElement('script');script.src='https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js';script.async=true;
    let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);resolve(value);};
    const timer=setTimeout(()=>finish(null),7000);
    script.onload=()=>finish(window.toy||null);script.onerror=()=>finish(null);document.head.appendChild(script);
  });
}

export class ToySaveProvider {
  constructor({sdkPromise,validate,store}){
    this.id='toy';this.label='Toy 账号云存档';this.validate=validate;this.ready=sdkPromise.then(sdk=>this.bridge=new ToyBridge(sdk));
    let device=store.readRaw(store.prefix+'cloud-device');if(!device){device=newSaveId();try{store.storage?.setItem(store.prefix+'cloud-device',device);}catch{}}
    this.deviceKey='chongchao_device_'+device.replace(/[^a-zA-Z0-9]/g,'').slice(0,40);
  }
  parse(raw){
    if(!raw)return null;let r;try{r=JSON.parse(raw);}catch{throw Error('云档格式异常，原数据已保留');}
    if(![1,2].includes(r?.schema)||!this.validate(r.save)||(r.schema===2&&typeof r.revision!=='string'))throw Error('云档版本或数据不兼容，未自动覆盖任何进度');
    return r.schema===1?{...r,revision:'legacy-'+r.save.time+'-'+r.save.score}:r;
  }
  async read(){
    await this.ready;
    const values=await this.bridge.call('getCloudStorage',undefined,{cacheKey:'save-read',refresh:true});
    const current=this.parse(values[AUTO_KEY])||this.parse(values[CLOUD_KEY]);
    const devices=Object.entries(values).filter(([key])=>key.startsWith('chongchao_device_')).map(([,raw])=>this.parse(raw));
    return {current,backups:[this.parse(values[BACKUP_KEY]),this.parse(values[CLOUD_KEY]),...devices].filter(Boolean).sort((a,b)=>b.save.time-a.save.time)};
  }
  async write(save,revision){
    const {current}=await this.read();if((current?.revision||null)!==revision)throw new SaveConflict();
    const record={...cloudRecord(save),deviceKey:this.deviceKey},values={[AUTO_KEY]:JSON.stringify(record),[this.deviceKey]:JSON.stringify(record)};
    if(current)values[BACKUP_KEY]=JSON.stringify(current);
    // Toy has no compare-and-swap API. Preserve a separate device checkpoint as well
    // as the prior cloud snapshot; preflight conflicts never overwrite the shared slot.
    await this.bridge.call('setCloudStorage',values);return record;
  }
}

export function setupToyPlatform(game,{sdkPromise}={}){
  const $=id=>document.getElementById(id),status=text=>{$('platformStatus').textContent=text;};
  const sdkReady=sdkPromise||loadSdk();let sdk=null,bridge=new ToyBridge(null),rankAt=0;
  const support=new Set();
  const describe=d=>d?`${campaignDifficulty(d.difficulty).name} · 周目${d.loop} · 第${d.chapter}章第${d.level}关 · ${Math.floor(d.score)}分 · ${new Date(d.time).toLocaleString('zh-CN')}`:'尚无存档';
  const error=e=>{
    const message=e&&e.message||'';
    if(/toy id not available|toy_context_unavailable/i.test(message))status('Toy 预览暂不提供作品身份，云存档和排行榜请在审核后的正式试玩页使用');
    else if(/unauthori[sz]ed|not logged|登录/i.test(message))status('请先在 B站登录，再使用云存档或提交成绩；本地游戏可以继续');
    else if(/denied|cancel/i.test(message))status('已取消，本地存档和游戏不受影响');
    else status(/[\u4e00-\u9fff]/.test(message)?message.replace(/^\[ToySDK\]\s*/,''):'平台服务暂不可用，请稍后再试；本地进度不受影响');
  };
  async function action(button,fn){button.disabled=true;try{await fn();}catch(e){error(e);}finally{button.disabled=false;}}
  const toyEnvironment=!!sdkPromise||(['www.bilibili.com','bilibilitoy.com','www.bilibilitoy.com'].includes(location.hostname)&&location.pathname.startsWith('/toy/'));
  const saves=mountSavePanel(game,{storage:game.store.storage,toyProvider:toyEnvironment?new ToySaveProvider({sdkPromise:sdkReady,validate:game.validate,store:game.store}):null});
  if($('rankTools'))$('rankTools').hidden=!toyEnvironment;
  $('rankRead').onclick=()=>action($('rankRead'),async()=>{
    const refresh=Date.now()-rankAt>60000;
    const rows=await bridge.call('getRankList',{board:1,period:'all',limit:20},{cacheKey:'ranks',refresh});rankAt=Date.now();
    $('rankList').replaceChildren();
    for(const row of rows){const li=document.createElement('li');li.textContent=`第${row.rank}名 ${row.nickname} · ${row.score}分`;$('rankList').appendChild(li);}
    status(rows.length?'普通通关积分总榜 · 短时间内重复打开会复用结果':'榜单暂无成绩，完成普通关卡后可自愿提交');
  });
  $('rankSubmit').onclick=()=>action($('rankSubmit'),async()=>{
    if(game.isTest())throw new Error('自由测试与调试成绩不参与排行榜');
    const score=Number(localStorage.getItem(game.prefix+'rank-best'))||0;
    if(!Number.isInteger(score)||score<=0||score>16777215)throw new Error('请先在普通模式完成一关，再提交最佳成绩');
    if(score<=Number(localStorage.getItem(game.prefix+'rank-submitted')||0))throw new Error('这一成绩已经提交，取得更高分后再来');
    await bridge.call('submitScore',{board:1,score});localStorage.setItem(game.prefix+'rank-submitted',String(score));
    bridge.cache.delete('ranks');status('通关成绩已提交：'+score+'分');
  });
  // Navigation must be called directly from a gesture; capability detection is done beforehand.
  function visit(type,id,url){if(sdk&&support.has('navigate'))sdk.navigate({type,id}).catch(error);else window.open(url,'_blank','noopener,noreferrer');}
  $('authorVisit').onclick=()=>visit('space',AUTHOR,'https://space.bilibili.com/'+AUTHOR);
  $('videoVisit').onclick=()=>visit('video',VIDEO,'https://www.bilibili.com/video/'+VIDEO);
  $('toyShare').onclick=()=>{
    if(sdk&&support.has('share'))sdk.share({path:'index.html'}).catch(error);
    else if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(PLAY_URL).then(()=>status('试玩链接已复制，可发给朋友'),error);
    else status('试玩地址：'+PLAY_URL);
  };
  sdkReady.then(async value=>{
    sdk=value;bridge=new ToyBridge(value);if(!value)return;
    for(const method of ['navigate','share'])try{if(await sdk.isSupport(method))support.add(method);}catch(_e){}
    try{const author=await bridge.call('getAuthorProfile',undefined,{cacheKey:'author'});if(author.status==='ok')$('authorInfo').textContent='作者：'+author.data.nickname+' · 万物皆可游戏';}catch(_e){}
  });
  return saves;
}
