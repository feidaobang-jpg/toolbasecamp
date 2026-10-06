import {campaignDifficulty} from './campaign-difficulty.js';
const CLOUD_KEY='chongchao_normal_v1';
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

export function setupToyPlatform(game,{sdkPromise}={}){
  const $=id=>document.getElementById(id),status=text=>{$('platformStatus').textContent=text;};
  const sdkReady=sdkPromise||loadSdk();let sdk=null,bridge=new ToyBridge(null),cloud=null,pendingSave=null,rankAt=0;
  const support=new Set();let cloudAt=0;
  const describe=d=>d?`${campaignDifficulty(d.difficulty).name} · 周目${d.loop} · 第${d.chapter}章第${d.level}关 · ${Math.floor(d.score)}分 · ${new Date(d.time).toLocaleString('zh-CN')}`:'尚无存档';
  const error=e=>{
    const message=e&&e.message||'';
    if(/toy id not available|toy_context_unavailable/i.test(message))status('Toy 预览暂不提供作品身份，云存档和排行榜请在审核后的正式试玩页使用');
    else if(/unauthori[sz]ed|not logged|登录/i.test(message))status('请先在 B站登录，再使用云存档或提交成绩；本地游戏可以继续');
    else if(/denied|cancel/i.test(message))status('已取消，本地存档和游戏不受影响');
    else status(/[\u4e00-\u9fff]/.test(message)?message.replace(/^\[ToySDK\]\s*/,''):'平台服务暂不可用，请稍后再试；本地进度不受影响');
  };
  async function action(button,fn){button.disabled=true;try{await fn();}catch(e){error(e);}finally{button.disabled=false;}}
  function parse(raw){
    const envelope=JSON.parse(raw);
    if(!envelope||envelope.schema!==1||!game.validate(envelope.save))throw new Error('云档版本或数据不兼容，已保留本地进度');
    return envelope.save;
  }
  async function readCloud(refresh=false){
    const items=await bridge.call('getCloudStorage',[CLOUD_KEY],{cacheKey:'cloud',refresh});
    cloud=items[CLOUD_KEY]?parse(items[CLOUD_KEY]):null;
    cloudAt=Date.now();
    $('cloudInfo').textContent='云端：'+describe(cloud)+'；本地：'+describe(game.getSave());
    $('cloudLoad').classList.toggle('hidden',!cloud);return cloud;
  }
  const open=()=>{game.open();status(sdk?'Toy 已连接。选择需要的功能；不会自动覆盖进度。':'本地存档可用；云存档和平台排行榜需在 B站 Toy 中登录使用。');};
  $('btnPlatformMenu').onclick=$('platformBtn').onclick=open;if($('platformBtnMenu'))$('platformBtnMenu').onclick=open;
  $('platformClose').onclick=game.close;
  $('cloudRead').onclick=()=>action($('cloudRead'),async()=>{await readCloud(Date.now()-cloudAt>60000);status('已查看云档；读取或覆盖需再点对应按钮');});
  $('cloudWrite').onclick=()=>action($('cloudWrite'),async()=>{
    const d=game.getSave();if(game.isTest()||!game.validate(d))throw new Error('请先进行普通模式游戏；自由测试进度不能上传');
    pendingSave=JSON.parse(JSON.stringify(d));await readCloud(Date.now()-cloudAt>60000);
    $('cloudConfirm').classList.remove('hidden');status('即将上传：'+describe(pendingSave)+'。确认后替换上方云档。');
  });
  $('cloudConfirm').onclick=()=>action($('cloudConfirm'),async()=>{
    if(!pendingSave||game.isTest())throw new Error('请重新选择普通进度');
    await bridge.call('setCloudStorage',{[CLOUD_KEY]:JSON.stringify({schema:1,save:pendingSave})});
    cloud=pendingSave;bridge.cache.set('cloud',{[CLOUD_KEY]:JSON.stringify({schema:1,save:cloud})});pendingSave=null;
    $('cloudConfirm').classList.add('hidden');$('cloudInfo').textContent='云端：'+describe(cloud);status('普通进度已保存到云端');
  });
  $('cloudLoad').onclick=()=>action($('cloudLoad'),async()=>{
    if(!cloud||!game.validate(cloud))throw new Error('请先查看有效云档');
    const local=game.getSave();if(local&&!local.testMode)localStorage.setItem(game.prefix+'cloud-backup',JSON.stringify(local));
    game.load(JSON.parse(JSON.stringify(cloud)));status('已读取云档，原本地进度已备份');
  });
  $('cloudBackup').onclick=()=>action($('cloudBackup'),async()=>{
    const raw=localStorage.getItem(game.prefix+'cloud-backup');
    const d=raw?JSON.parse(raw):null;if(!game.validate(d))throw new Error('还没有读取云档前的本地备份');
    game.load(d);
  });
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
}
