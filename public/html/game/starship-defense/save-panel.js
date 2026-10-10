import {CloudSaveSync} from './cloud-save.js';
import {saveSignature} from './save-store.js';
import {SiteSaveProvider} from './site-save.js';
import {campaignDifficulty} from './campaign-difficulty.js';
export function mountSavePanel(game,{toyProvider,storage}={}){
  const $=id=>document.getElementById(id),store=game.store;
  let sync=null,pending=null,selected=null,token='';
  const toy=!!toyProvider,tokenKey=location.hostname.endsWith('zhengxiaohui.cn')?'auth_token':game.prefix+'site-token';
  try{token=storage?.getItem(tokenKey)||'';}catch{}
  const status=text=>{if($('cloudSaveStatus'))$('cloudSaveStatus').textContent=text;updateNotice();};
  const describe=d=>d?`${campaignDifficulty(d.difficulty).name} · 周目${d.loop} 第${d.chapter}章第${d.level}关 · 金币${Math.floor(d.gold)} · ${new Date(d.time).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}`:'尚无存档';
  let noticeTimer=0;
  function updateNotice(){
    const text=store.status+'；'+(sync?.statusText||(toy?'连接 Toy 云备份中':'登录网站账号可启用云备份'));
    if($('saveNotice'))$('saveNotice').textContent=text;
    const cloud=sync?.statusText||'',cloudLabel=/已备份/.test(cloud)?'云端已备份':/不同|另一份/.test(cloud)?'云档待选择':/失败|不可用|不兼容|异常/.test(cloud)?'云备份暂停':/登录/.test(cloud)||(!toy&&!token)?'云备份未登录':/关闭/.test(cloud)?'云备份已关闭':/发现云端/.test(cloud)?'可恢复云档':/连接/.test(cloud)?'云备份已连接':'云备份待写入';
    if($('saveHealth')){$('saveHealth').textContent=store.status.split(' · ')[0].split('：')[0]+' · '+cloudLabel;$('saveHealth').title=text;}
    if($('localSaveStatus'))$('localSaveStatus').textContent=store.status;
    // 状态条只是提醒，几秒后淡出，避免长期挡在战场画面上；存档面板仍可从菜单进入。
    const chip=$('saveHealth');
    if(chip){chip.classList.remove('faded');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>chip.classList.add('faded'),5000);}
  }
  function renderCloud(current,backups){
    if(sync)$('cloudProvider').textContent=sync.provider.label;
    const rows=[current,...backups].filter(Boolean).filter((r,i,a)=>a.findIndex(x=>x.revision===r.revision)===i);
    $('cloudChoices').replaceChildren();
    for(const [i,r] of rows.entries()){const o=document.createElement('option');o.value=r.revision;o.textContent=(i?'云端备份：':'当前云档：')+describe(r.save);$('cloudChoices').append(o);}
    selected=rows[0]||null;$('cloudLoad').classList.toggle('hidden',!selected);$('cloudChoices').hidden=!rows.length;
    $('cloudInfo').textContent='本地：'+describe(game.getSave())+'\n云端：'+describe(current?.save);
    $('cloudChoices').onchange=()=>{selected=rows.find(r=>r.revision===$('cloudChoices').value)||null;};
    updateNotice();
  }
  function connect(provider){
    sync?.destroy();sync=new CloudSaveSync({provider,store,getSave:game.getSave,validate:game.validate,isTest:game.isTest,onStatus:status,onCloud:renderCloud});
    sync.enabled=$('cloudAuto').checked;
    $('cloudProvider').textContent=provider.label;
    if(toy||token)sync.start();else status('尚未登录网站账号；本地存档可用');
  }
  function error(e){status(e.message||'操作失败；已有进度已保留');}
  async function action(button,fn){button.disabled=true;try{await fn();}catch(e){error(e);}finally{button.disabled=false;}}
  function requireNormal(){const d=game.getSave();if(game.isTest()||!game.validate(d))throw Error('请先进行单机普通游戏；联机与自由测试不读写普通云档');return d;}
  const open=()=>{game.open();updateNotice();renderCloud(sync?.current,sync?.backups||[]);};
  for(const id of ['btnPlatformMenu','platformBtn','platformBtnMenu','saveRecovery','saveHealth'])if($(id))$(id).onclick=open;
  $('platformClose').onclick=game.close;
  $('cloudRead').onclick=()=>action($('cloudRead'),async()=>{sync.paused=false;await sync.refresh();if(sync.base!==undefined)sync.checkpoint(game.getSave());});
  $('cloudAuto').checked=store.readRaw(game.prefix+'cloud-auto')!=='off';
  $('cloudAuto').onchange=()=>{sync.enabled=$('cloudAuto').checked;try{storage?.setItem(game.prefix+'cloud-auto',sync.enabled?'on':'off');}catch{}if(sync.enabled){sync.paused=false;sync.start().then(()=>sync.checkpoint(game.getSave()));}else status('自动云备份已关闭；本地自动存档继续');};
  $('cloudWrite').onclick=()=>action($('cloudWrite'),async()=>{
    const d=JSON.parse(JSON.stringify(requireNormal()));await sync.refresh();pending={save:d,revision:sync.current?.revision||null};
    $('cloudConfirm').classList.remove('hidden');$('cloudConfirmInfo').textContent='即将上传：'+describe(d)+'。当前云档：'+describe(sync.current?.save)+'。确认后保留上一份云档。';
  });
  $('cloudConfirm').onclick=()=>action($('cloudConfirm'),async()=>{
    if(!pending||game.isTest())throw Error('请重新选择普通进度');await sync.upload(pending.save,pending.revision);pending=null;$('cloudConfirm').classList.add('hidden');$('cloudConfirmInfo').textContent='';
  });
  function restore(d,record=null){
    if(game.isTest())throw Error('请退出联机或测试模式后再恢复单机存档');
    if(!game.validate(d))throw Error('备份数据不兼容，未覆盖本地进度');
    const old=game.getSave();if(old&&saveSignature(old)!==saveSignature(d)&&!store.backup(old))throw Error('无法备份当前进度，请先导出再恢复');
    if(!store.write(game.prefix+'auto',d))throw Error(store.status);
    if(record)sync.accept(record);else {sync.paused=true;status('本地备份已恢复；上传云端前请先比较进度');}
    game.load(JSON.parse(JSON.stringify(d)));game.updateContinue?.();updateNotice();
  }
  $('cloudLoad').onclick=()=>{
    if(!selected)return;const record=selected;
    game.confirm('读取 '+describe(record.save)+'？当前本地进度会先备份。','读取并继续',()=>{try{restore(record.save,record);}catch(e){error(e);}});
  };
  $('cloudBackup').onclick=()=>{try{const d=store.parse(store.readRaw(game.prefix+'cloud-backup'));if(!d)throw Error('尚无恢复前备份');game.confirm('恢复前次本地进度？当前进度仍会保留。','恢复本地备份',()=>{try{restore(d);}catch(e){error(e);}});}catch(e){error(e);}};
  $('saveExport').onclick=()=>{try{
    const d=requireNormal(),blob=new Blob([JSON.stringify({schema:1,game:'starship-defense',save:d},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='虫潮围城-存档-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status('存档文件已导出，请妥善保存');
  }catch(e){error(e);}};
  $('saveImport').onclick=()=>$('saveImportFile').click();
  $('saveImportFile').onchange=()=>action($('saveImport'),async()=>{
    const file=$('saveImportFile').files?.[0];$('saveImportFile').value='';if(!file)return;
    if(file.size>65536)throw Error('存档文件过大，请选择游戏导出的 JSON 备份');
    let envelope;try{envelope=JSON.parse(await file.text());}catch{throw Error('存档文件格式错误，未改动当前进度');}
    const d=envelope.game==='starship-defense'&&envelope.schema===1?envelope.save:null;
    if(!game.validate(d))throw Error('存档内容不兼容，未改动当前进度');
    game.confirm('导入 '+describe(d)+'？当前本地进度会先备份。','确认导入',()=>{try{restore(d);}catch(e){error(e);}});
  });
  $('saveHistory').onclick=()=>{
    const rows=store.history();$('localHistory').replaceChildren();
    for(const d of rows){const b=document.createElement('button');b.className='mbtn';b.textContent=describe(d);b.onclick=()=>game.confirm('读取这份本地历史备份？','读取备份',()=>{try{restore(d);}catch(e){error(e);}});$('localHistory').append(b);}
    if(!rows.length)$('localHistory').textContent='还没有历史备份；游玩时会保留最近三个不同进度。';
  };
  $('saveLoginToggle').hidden=toy;$('saveLogout').hidden=toy||!token;
  $('saveLoginToggle').onclick=()=>{$('saveLoginForm').hidden=!$('saveLoginForm').hidden;};
  $('saveLoginForm').onsubmit=e=>{e.preventDefault();action($('saveLoginSubmit'),async()=>{
    const account=$('saveAccount').value.trim(),password=$('savePassword').value;
    try{const result=await sync.provider.login(account,password);token=result.token;if(!token)throw Error('登录未完成');try{storage?.setItem(tokenKey,token);}catch{}connect(new SiteSaveProvider({token:()=>token,validate:game.validate}));$('saveLoginForm').hidden=true;$('saveLogout').hidden=false;}
    finally{$('savePassword').value='';}
  });};
  $('saveLogout').onclick=()=>{sync.destroy();token='';try{storage?.removeItem(tokenKey);}catch{}$('saveLogout').hidden=true;connect(new SiteSaveProvider({token:()=>token,validate:game.validate}));};
  window.addEventListener('online',()=>{if(toy||token){sync.paused=false;sync.start().then(()=>sync.checkpoint(game.getSave()));}});
  connect(toyProvider||new SiteSaveProvider({token:()=>token,validate:game.validate}));updateNotice();
  return {checkpoint:d=>{if(toy||token)sync.checkpoint(d);},localStatus:updateNotice,open,get sync(){return sync;}};
}
