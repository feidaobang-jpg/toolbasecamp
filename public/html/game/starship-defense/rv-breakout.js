// 房车城镇生存：自由探索、场地整备、分区僵尸与独立进度。
import {TOWN,RV_SITES,RV_ZONES,buildTown,zombieFactory} from './rv-town.js';
export const RV_SAVE='chongchao-rv-town-v2';
export const RV_CFG={name:'装甲房车',hp:1400,speed:12,dmg:16,rate:.12,range:36,seatH:2.5,sfx:'mg',color:0x697782};
export const RV_ROUTE=RV_SITES;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function makeRVMesh(T){
  const g=new T.Group(),steel=new T.MeshLambertMaterial({color:0x61717d}),dark=new T.MeshLambertMaterial({color:0x182532}),glass=new T.MeshPhongMaterial({color:0x6bafbf,shininess:70}),light=new T.MeshBasicMaterial({color:0xffd894});
  const box=(sx,sy,sz,x,y,z,m=steel,parent=g)=>{const o=new T.Mesh(new T.BoxGeometry(sx,sy,sz),m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
  box(2.8,.5,6.2,0,.75,0,dark);box(2.7,2.5,4.8,0,2,-.6);box(2.6,1.9,1.8,0,1.7,2.4);box(2.25,.8,.08,0,2.15,3.31,glass);
  for(const s of [-1,1]){
    for(const z of [-2,2]){const w=new T.Mesh(new T.CylinderGeometry(.65,.65,.38,12),dark);w.rotation.z=Math.PI/2;w.position.set(s*1.48,.65,z);g.add(w);box(.06,.75,1.1,s*1.38,2.25,z<0?-1.2:2.35,glass);}
    box(.42,.32,.13,s*.9,1.15,3.34,light);box(.15,.6,4.5,s*1.4,1.1,-.6,dark);
  }
  box(2.9,.24,.28,0,.85,3.4,dark);box(2.3,.25,2,0,3.39,-1,dark);box(.55,.85,.09,.65,2,-3.05,dark);
  const turret=new T.Group();turret.position.set(0,3.48,.6);g.add(turret);box(.8,.35,.8,0,0,0,dark,turret);
  const gun=box(.18,.18,1.65,0,.22,.9,dark,turret);g.userData.turret=turret;g.userData.gun=gun;
  return g;
}

export function validRVSave(d){
  const n=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b,int=(v,a,b)=>Number.isInteger(v)&&n(v,a,b);
  return !!(d&&d.v===2&&n(d.x,TOWN.minX,TOWN.maxX)&&n(d.z,TOWN.minZ,TOWN.maxZ)&&n(d.hp,1,1800)&&n(d.fuel,0,100)&&n(d.scrap,0,99999)&&n(d.elapsed,0,86400)&&n(d.traveled,0,1e7)&&n(d.personHP,1,500)&&int(d.medkits,0,99)&&int(d.food,0,99)&&[d.gun,d.armor,d.gear].every(v=>int(v,0,2))&&Array.isArray(d.looted)&&d.looted.length===6&&d.looted.every(v=>typeof v==='boolean')&&Array.isArray(d.defeated)&&d.defeated.length<=36&&d.defeated.every(id=>RV_ZONES.some(z=>Array.from({length:z.n},(_,i)=>z.id+'-'+i).includes(id)))&&typeof d.finished==='boolean');
}
export function createRVBreakout(a){
  const {THREE:T,scene,Game,player,WORLD,AudioSys}=a,$=id=>document.getElementById(id);
  const s={active:false,over:false,rv:null,backup:null,town:null};
  function read(){try{const d=JSON.parse(localStorage.getItem(RV_SAVE));return validRVSave(d)?d:null;}catch(_e){return null;}}
  function save(){
    if(!s.active||s.over)return;const p=s.rv.mesh.position;
    const d={v:2,x:p.x,z:p.z,hp:Math.max(1,s.rv.hp),fuel:s.fuel,scrap:s.scrap+(s.job?.cost||0),elapsed:s.elapsed,traveled:s.traveled,gun:s.gun,armor:s.armor,gear:s.gear,food:s.food,medkits:Game.items.medkit,personHP:Math.max(1,player.hp),looted:[...s.looted],defeated:[...s.defeated],finished:false};
    try{localStorage.setItem(RV_SAVE,JSON.stringify(d));}catch(_e){a.showMsg('房车进度保存失败，请保持页面打开',3);}
  }
  function refresh(){
    const d=read();$('rvContinue').hidden=!d;let old=false;try{old=!!localStorage.getItem('chongchao-rv-breakout-v1');}catch(_e){}
    $('rvSaveInfo').textContent=d?'城镇进度：已搜索 '+d.looted.filter(Boolean).length+'/6 区 · 房车 '+Math.ceil(d.hp)+' 耐久':'城镇独立存档，基地防守进度保留。'+(old?'旧公路存档仍保留，新地图需开始新旅程。':'');
  }
  function mount(){
    const style=document.createElement('style');style.textContent=`
      .rv-mode .campaign-only,.rv-mode #hudTop,.rv-mode #hudRight,.rv-mode #radar,.rv-mode #weaponBar,.rv-mode #hint,.rv-mode #readyBtn,.rv-mode #webTools .mbtn:not(#menuButton):not(#fullBtn):not(#qualityBtn):not(#muteBtn):not(#personBtn),.rv-mode #vL,.rv-mode #vR,.rv-mode #vX{display:none!important}
      #rvHUD{position:absolute;left:10px;top:10px;max-width:300px;padding:8px 12px;border-radius:9px;background:rgba(8,18,29,.82);color:#e8f1f7;line-height:1.5;font-size:12px;pointer-events:none}
      #rvHUD b{color:#ffda85}#rvMeter{height:7px;background:#253848;border-radius:4px;overflow:hidden;margin:4px 0}#rvFill{height:100%;background:#5ed0b2}#rvObjective{color:#96e3e8}#rvAction{color:#ffd28c}
      #rvPanel,#rvMenu,#rvResult{background:rgba(8,18,29,.97);color:#e8f1f7}#rvPanel{width:610px;max-height:90%;overflow:auto}#rvPanel .mbtn{min-height:44px}#rvPanel .small{margin:7px 0}
      #rvMenu,#rvResult{justify-content:center;align-items:center;text-align:center}#rvMenu .small,#rvResult .small{max-width:720px}
      #rvMap{position:absolute;right:10px;top:64px;width:145px;height:148px;background:rgba(8,18,29,.86);border:1px solid #516975;border-radius:7px;pointer-events:none}
      #rvSites{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}#rvSites button{font-size:12px;min-height:44px;padding:6px 10px}
      .touch-mode #rvHUD{max-width:270px;font-size:10px;padding:5px 8px}.touch-mode #rvMap{width:115px;height:117px}.rv-mode #vO{display:block!important}.rv-mode #interactHint{max-width:400px;white-space:normal}
      @media(max-height:420px){#rvMenu,#rvResult{justify-content:flex-start;padding:12px 28px}#rvMenu h1,#rvResult h1{font-size:24px}#rvMenu .small,#rvResult .small{font-size:11px;line-height:1.5}}
    `;document.head.append(style);
    const button=document.createElement('button');button.id='btnRV';button.className='mbtn';button.textContent='🚐 房车生存 · 废弃城镇';$('btnVersus').after(button);
    const host=document.createElement('div');host.innerHTML=`
      <div id="rvMenu" class="overlay menu hidden"><h1>房车生存 · 废弃城镇</h1>
      <p class="small">开车自由探索街道、庭院与广场，随时回头，没有加油站关卡。<br>目标自选：搜索六个感染区、整备房车，或前往北侧营地撤离。</p>
      <p class="small">加油站补油；驶入修理厂黄框维修、升级车载机枪、装甲和随身武器，车内也能办理。<br>废弃超市的应急售货机用零件交换密封罐头和医疗包；搜索物资箱须下车。<br>僵尸分区活动，视距内且无遮挡才追击；跑出视距或领地后会返回原处。<br>房车毁坏即失败；人员阵亡在车内获救，损失20零件。没油仍可低速挪车。</p>
      <p id="rvSaveInfo" class="small"></p><div class="btnRow"><button id="rvContinue" class="mbtn green">继续城镇进度</button><button id="rvStart" class="mbtn green">开始城镇探索</button><button id="rvBack" class="mbtn">返回主菜单</button></div></div>
      <div id="rvHUD" class="hidden"><b>🚐 城镇自由探索</b><div id="rvStatus"></div><div id="rvMeter"><div id="rvFill"></div></div><div id="rvObjective"></div><div id="rvAction"></div><div id="rvResources"></div></div>
      <canvas id="rvMap" class="hidden" width="220" height="224" aria-label="城镇地图：油为加油站，修为修理厂，店为超市，出为撤离，红色为感染区"></canvas>
      <div id="rvPanel" class="panel hidden"><h3 id="rvPanelTitle">城镇地图与补给</h3><p id="rvPanelInfo" class="small"></p><div id="rvSites"></div><p id="rvSiteInfo" class="small"></p><div class="btnRow">
      <button id="rvRepair" class="mbtn">维修 +450耐久 · 40零件</button><button id="rvGun" class="mbtn">机枪升级</button><button id="rvArmor" class="mbtn">装甲升级</button><button id="rvGear" class="mbtn">随身武器升级</button>
      <button id="rvFuel" class="mbtn">燃料 +40% · 20零件</button><button id="rvFood" class="mbtn">密封罐头 · 12零件</button><button id="rvMedkit" class="mbtn">医疗包 · 25零件</button><button id="rvEat" class="mbtn">吃罐头 · 人员 +45生命</button><button id="rvEvacuate" class="mbtn green">结束探索并撤离</button><button id="rvClose" class="mbtn">返回探索</button></div>
      <p class="small">维修6秒、改装5秒、加油3秒。停车区内办理，无须下车；移动车辆或下车走远会取消并退款。菜单暂停，作业时战斗继续。</p></div>
      <div id="rvResult" class="overlay menu hidden"><h1 id="rvResultTitle"></h1><p id="rvResultInfo" class="small"></p><div class="btnRow"><button id="rvRetry" class="mbtn green">再探索一趟</button><button id="rvResultBack" class="mbtn">返回主菜单</button></div></div>`;
    for(const child of [...host.children])a.stage.append(child);
    for(const site of RV_SITES){const b=document.createElement('button');b.className='mbtn';b.textContent=site.name;b.dataset.site=site.id;b.onclick=()=>{s.destination=site.id;panelInfo();};$('rvSites').append(b);}
    button.onclick=()=>{AudioSys.init();refresh();$('menuMain').classList.add('hidden');$('rvMenu').classList.remove('hidden');};
    $('rvBack').onclick=()=>{$('rvMenu').classList.add('hidden');$('menuMain').classList.remove('hidden');};
    $('rvStart').onclick=()=>{if(read())a.askConfirm('新探索将替换城镇进度，其他模式存档保留。','开始新探索',()=>start());else start();};
    $('rvContinue').onclick=()=>{const d=read();if(d)start(d);else refresh();};$('rvClose').onclick=a.closePanels;
    for(const [id,kind] of [['rvRepair','repair'],['rvGun','gun'],['rvArmor','armor'],['rvGear','gear'],['rvFuel','fuel'],['rvFood','food'],['rvMedkit','medkit']])$(id).onclick=()=>job(kind);
    $('rvEat').onclick=eat;$('rvEvacuate').onclick=()=>{if(atSite()?.kind==='exit')finish(true);};$('rvRetry').onclick=()=>start();$('rvResultBack').onclick=()=>a.quit();
  }
  function start(d=null){
    if(d&&!validRVSave(d))d=null;if(s.active)stop(false);if(a.vsOn())a.exitVersus();if(!s.backup)s.backup=JSON.parse(JSON.stringify(Game));
    a.closePanels();a.hideConfirm();a.clearEntities(true);a.clearCoop();AudioSys.init();AudioSys.pause(false);a.Input.reset();
    Object.assign(Game,{state:'battle',testMode:false,loop:1,chapter:1,level:1,difficulty:'normal',weapons:['lmg','shotgun'],curWeapon:'lmg',weaponLv:{},items:{medkit:d?.medkits??2},hpBonus:0,vehiclesOwned:[],squadCount:0,squadGear:[],magnet:false,regen:false,score:0,gold:0,wave:{total:0,spawned:0,killed:0,timer:0},battleLedger:null});
    player.reset(Game.cls);player.team=null;player.dead=false;player.mesh.visible=true;player.hp=clamp(d?.personHP??player.maxHp,1,player.maxHp);
    Object.assign(s,{active:true,over:false,elapsed:d?.elapsed||0,fuel:d?.fuel??85,scrap:d?.scrap??160,gun:d?.gun||0,armor:d?.armor||0,gear:d?.gear||0,food:d?.food??2,looted:d?[...d.looted]:RV_ZONES.map(()=>false),defeated:d?[...d.defeated]:[],search:null,job:null,saveT:0,lastPos:null,traveled:d?.traveled||0,destination:'garage-south',mapT:0,moving:false});
    const keep=new Set([a.camera,player.mesh,...a.skyObjects()]);s.hidden=scene.children.filter(o=>o.visible&&!o.isLight&&!keep.has(o));s.hidden.forEach(o=>o.visible=false);
    s.sky=a.skyObjects();s.skyOffset=d?.z||TOWN.start.z;s.sky.forEach(o=>o.position.z+=s.skyOffset);s.world={...WORLD};Object.assign(WORLD,{minX:TOWN.minX,maxX:TOWN.maxX,minZ:TOWN.minZ,maxZ:TOWN.maxZ});
    s.town=buildTown(T,scene);s.zombies=zombieFactory(T);const pos=d&&!blocked(d.x,d.z,3)?d:TOWN.start;
    s.rv=a.spawnVehicle('rv');s.rv.cfg={...RV_CFG};s.rv.mesh.position.set(pos.x,0,pos.z);configure();s.rv.hp=clamp(d?.hp||s.rv.maxHp,1,s.rv.maxHp);a.updHPBar(s.rv.bar,s.rv.hp/s.rv.maxHp);a.enterVehicle(s.rv);player.pos.copy(s.rv.mesh.position);spawnResidents();
    a.faceForward();a.stage.classList.add('rv-mode');['menuMain','menuPause','menuOver','rvMenu','rvResult'].forEach(id=>$(id).classList.add('hidden'));$('rvHUD').classList.remove('hidden');$('rvMap').classList.remove('hidden');a.showHUD();a.showHint(null);
    $('btnRestartLv').textContent='🔄 重开城镇探索';s.keyHint=$('keysHint').textContent;$('keysHint').textContent='WASD 驾驶/移动 · J 射击 · I 上下车/搜索 · O 地图与设施 · H 医疗 · U 手雷 · K 跳跃 · C 视角 · Q/E 转头 · Esc 暂停';
    save();a.showMsg(a.isTouch()?'街道自由通行；点设施查看地图和服务':'街道自由通行；O 查看地图和设施服务',5);hud();
  }
  function configure(){s.rv.maxHp=RV_CFG.hp+s.armor*200;s.rv.cfg.dmg=RV_CFG.dmg*(1+s.gun*.35);s.rv.cfg.speed=s.fuel>0?RV_CFG.speed:3;Game.weaponLv.lmg=s.gear;Game.weaponLv.shotgun=s.gear;}
  function blocked(x,z,r=.8){return s.town?s.town.blocked(x,z,r):false;}
  function atSite(){if(!s.rv||player.dead)return null;const p=s.rv.mesh.position;if(!player.inVehicle&&distance(player.pos,p)>12)return null;return RV_SITES.find(n=>distance(p,n)<10.5)||null;}
  function interaction(){
    if(player.inVehicle)return {kind:'exit',label:'下车',tip:a.isTouch()?'下车搜索；设施按钮可在车内使用':'I 下车搜索；O 地图与设施服务'};
    const i=RV_ZONES.findIndex((n,i)=>!s.looted[i]&&distance(player.pos,n)<4.2);
    if(i>=0)return {kind:'rv-search',label:s.search?'取消搜索':'搜索',tip:s.search?'搜索中，离开箱子将中断':'搜索4秒：110零件、罐头、医疗包'};
    const v=s.rv;if(!v.dead&&!(v.noEnter>0)&&distance(player.pos,v.mesh.position)<5)return {kind:'vehicle',vehicle:v,label:'驾驶',tip:a.isTouch()?'点互动驾驶房车':'I 驾驶房车'};
    return {kind:'none',label:'互动',tip:a.isTouch()?'靠近物资箱搜索；设施查看地图':'靠近物资箱 I 搜索；O 查看地图'};
  }
  function interact(){if(s.search){s.search=null;return;}const zone=RV_ZONES.findIndex((n,i)=>!s.looted[i]&&distance(player.pos,n)<4.2);if(zone>=0&&!player.inVehicle){s.search={zone,t:0};a.showMsg('搜索物资中，可射击；离开箱子会中断',2);}}
  function panel(){if(s.over)return;a.Input.reset();$('rvPanel').classList.remove('hidden');a.setPanel(true);panelInfo();}
  function panelInfo(){
    const site=atSite(),dest=RV_SITES.find(n=>n.id===s.destination);$('rvPanelTitle').textContent=site?site.name:'城镇地图与随身补给';
    $('rvPanelInfo').textContent='零件 '+Math.floor(s.scrap)+' · 耐久 '+Math.ceil(s.rv.hp)+'/'+s.rv.maxHp+' · 燃料 '+Math.ceil(s.fuel)+'% · 罐头 '+s.food+' · 医疗包 '+Game.items.medkit;
    $('rvSiteInfo').textContent=site?site.kind==='market'?'建筑已废弃，备用电源维持应急售货机；库存为密封长保质期罐头与医疗包。':'停在设施标线内即可服务，车内或车旁均可。':'导航：'+dest.name+' · 直线 '+Math.ceil(distance(s.rv.mesh.position,dest))+'米。沿地图道路绕过建筑，到停车框内办理。';
    for(const b of $('rvSites').children)b.setAttribute('aria-pressed',b.dataset.site===s.destination?'true':'false');
    for(const [id,kind] of [['rvRepair','garage'],['rvGun','garage'],['rvArmor','garage'],['rvGear','garage'],['rvFuel','fuel'],['rvFood','market'],['rvMedkit','market'],['rvEvacuate','exit']])$(id).hidden=site?.kind!==kind;
    for(const [id,key,name] of [['rvGun','gun','车载机枪'],['rvArmor','armor','房车装甲'],['rvGear','gear','随身武器']]){$(id).textContent=s[key]>=2?name+' 已满级':name+' '+s[key]+'/2 → 升级 · '+(90+s[key]*50)+'零件';$(id).disabled=s[key]>=2;}
    $('rvEat').disabled=s.food<=0||player.hp>=player.maxHp;
  }
  function eat(){if(player.dead||s.food<=0||player.hp>=player.maxHp)return false;s.food--;player.hp=Math.min(player.maxHp,player.hp+45);a.updHPBar(player.bar,player.hp/player.maxHp);AudioSys.sfx('heal');save();panelInfo();return true;}
  function job(kind){
    const need={repair:'garage',gun:'garage',armor:'garage',gear:'garage',fuel:'fuel',food:'market',medkit:'market'}[kind],site=atSite();
    if(!need||s.over||player.dead)return false;if(!site||site.kind!==need){a.showMsg('请把房车开到'+({garage:'汽车修理厂',fuel:'加油站',market:'废弃超市'})[need]+'的停车框内');return false;}
    if(s.job){a.showMsg('已有作业进行中');return false;}
    if(['gun','armor','gear'].includes(kind)&&s[kind]>=2||kind==='repair'&&s.rv.hp>=s.rv.maxHp||kind==='fuel'&&s.fuel>=100||kind==='food'&&s.food>=99||kind==='medkit'&&Game.items.medkit>=99){a.showMsg('当前无需补充或已达到上限');return false;}
    const cost={repair:40,fuel:20,food:12,medkit:25}[kind]??(90+s[kind]*50);
    if(s.scrap<cost){a.showMsg('零件不足：搜索感染区物资箱或击退僵尸');return false;}s.scrap-=cost;
    if(kind==='food'||kind==='medkit'){if(kind==='food')s.food++;else Game.items.medkit++;AudioSys.sfx('buy');save();panelInfo();return true;}
    s.job={kind,cost,site:site.id,t:0,duration:kind==='repair'?6:kind==='fuel'?3:5};s.search=null;a.closePanels();save();a.showMsg('作业开始，停在原处即可；车内也可射击防卫',2);return true;
  }
  function spawnResidents(){let seq=0;RV_ZONES.forEach((zone,zi)=>{for(let i=0;i<zone.n;i++){
    const id=zone.id+'-'+i;if(s.defeated.includes(id))continue;const angle=i/zone.n*Math.PI*2,r=5+i%3*2.2;
    let x=zone.x+Math.cos(angle)*r,z=zone.z+Math.sin(angle)*r;if(blocked(x,z,.8)){x=zone.x;z=zone.z+3+i*.9;}
    const mo=a.spawnMonster('mob',x,z,{ch:a.CHAPTERS[0],quiet:true,wild:true});mo.mesh.remove(mo.bar);a.visuals.release(mo.mesh);scene.remove(mo.mesh);
    mo.mesh=s.zombies.make(seq++);mo.mesh.position.set(x,0,z);mo.mesh.add(mo.bar);mo.bar.position.y=2.9;scene.add(mo.mesh);
    Object.assign(mo,{rvZombie:true,rvId:id,zone:zi,homePos:new T.Vector3(x,0,z),mode:'idle',lost:0,hp:95+zi*14,maxHp:95+zi*14,dmg:14+zi*2,speed:3.2+zi*.13,radius:.7,hitH:1.15,ranged:false,fly:false,flightAfterExit:false,split:false,explodeOnDie:false,stealth:false,gold:0,bs:null,home:null,wild:true});a.updHPBar(mo.bar,1);
  }});}
  function target(mo){
    const p=mo.mesh.position,v=s.rv;if(!v||v.dead||mo.mode==='return')return null;
    const choices=[{pos:v.mesh.position,obj:v,kind:'vehicle',r:2.8}];if(!player.dead&&!player.inVehicle)choices.push({pos:player.pos,obj:player,kind:'player',r:1});
    const max=mo.mode==='chase'?31:23;return choices.map(t=>({...t,d2:distance(p,t.pos)**2})).filter(t=>t.d2<max*max&&distance(t.pos,mo.homePos)<48&&s.town.visible(p,t.pos)).sort((x,y)=>x.d2-y.d2)[0]||null;
  }
  function walk(mo,to,dt,speed){
    const p=mo.mesh.position,dx=to.x-p.x,dz=to.z-p.z,d=Math.hypot(dx,dz);if(d<.1)return false;const step=Math.min(d,speed*dt),ux=dx/d,uz=dz/d;
    for(const off of [0,.55,-.55,1.05,-1.05,1.55,-1.55]){const c=Math.cos(off),sn=Math.sin(off),nx=p.x+(ux*c-uz*sn)*step,nz=p.z+(uz*c+ux*sn)*step;if(!blocked(nx,nz,.75)){mo.vx=(nx-p.x)/dt;mo.vz=(nz-p.z)/dt;p.x=nx;p.z=nz;mo.mesh.rotation.y=Math.atan2(mo.vx,mo.vz);return true;}}return false;
  }
  function updateMonster(mo,dt){
    if(!mo.rvZombie)return false;mo.atkCd=Math.max(0,mo.atkCd-dt);let moving=false,attacking=false;
    if(mo.mode==='return'){const trail=mo.trail||[];while(trail.length&&distance(mo.mesh.position,trail[trail.length-1])<.6)trail.pop();moving=walk(mo,trail[trail.length-1]||mo.homePos,dt,mo.speed*1.45);mo.hp=Math.min(mo.maxHp,mo.hp+mo.maxHp*.12*dt);a.updHPBar(mo.bar,mo.hp/mo.maxHp);if(!trail.length&&distance(mo.mesh.position,mo.homePos)<.6){mo.mode='idle';mo.hp=mo.maxHp;a.updHPBar(mo.bar,1);}}
    else{const t=target(mo);if(t){if(mo.mode==='idle')mo.trail=[mo.homePos.clone()];const trail=mo.trail;if(trail&&distance(mo.mesh.position,trail[trail.length-1])>1.5)trail.push(mo.mesh.position.clone());mo.mode='chase';mo.lost=0;const reach=mo.radius+t.r+1;attacking=t.d2<reach*reach;
      if(!attacking)moving=walk(mo,t.pos,dt,mo.speed*(mo.slowT>0?.5:1));else{mo.mesh.rotation.y=Math.atan2(t.pos.x-mo.mesh.position.x,t.pos.z-mo.mesh.position.z);if(mo.atkCd<=0){mo.atkCd=1.15;if(t.kind==='vehicle')a.damageVehicle(t.obj,mo.dmg);else a.playerDamage(mo.dmg);}}}
      else if(mo.mode==='chase'){mo.lost+=dt;if(mo.lost>=1.2||distance(mo.mesh.position,mo.homePos)>45)mo.mode='return';}}
    s.zombies.animate(mo.mesh,dt,moving,attacking);return true;
  }
  function killed(mo){if(!mo.rvZombie||s.defeated.includes(mo.rvId))return;s.defeated.push(mo.rvId);s.scrap+=8;save();}
  function update(dt){
    if(!s.active||s.over)return;if(Game.msgTimer>0){Game.msgTimer-=dt;if(Game.msgTimer<=0)$('msg').classList.add('hidden');}s.elapsed+=dt;s.saveT+=dt;const p=s.rv.mesh.position,travel=distance(p,s.lastPos||p);s.lastPos={x:p.x,z:p.z};s.traveled+=travel;s.fuel=Math.max(0,s.fuel-travel*.045);s.moving=travel>dt*2;configure();
    const skyDelta=p.z-s.skyOffset;s.sky.forEach(o=>o.position.z+=skyDelta);s.skyOffset=p.z;
    if(!player.inVehicle){s.rv.fireCd-=dt;const mo=a.monsters.filter(m=>!m.dead&&m.mode==='chase'&&s.town.visible(p,m.mesh.position)).sort((x,y)=>distance(x.mesh.position,p)-distance(y.mesh.position,p))[0];
      if(mo&&distance(mo.mesh.position,p)<s.rv.cfg.range&&s.rv.fireCd<=0){s.rv.fireCd=s.rv.cfg.rate;const aim=mo.mesh.position.clone().add(new T.Vector3(0,mo.hitH,0)),dir=aim.clone().sub(p).normalize();a.vehicleAim(s.rv,dir);const from=a.vehicleMuzzle(s.rv,dir);a.fireBullet(from,aim.clone().sub(from).normalize(),{...s.rv.cfg,speed:65,color:0xffd27a},true,aim);AudioSys.sfx('mg');}}
    if(player.dead){player.respawnT-=dt;if(player.respawnT<=0){player.reset(Game.cls);s.scrap=Math.max(0,s.scrap-20);a.enterVehicle(s.rv);player.pos.copy(p);player.invulnerable=3;a.showMsg('在房车内获救，损失20零件；房车损伤保留',3);}}
    if(s.search){const q=s.search,zone=RV_ZONES[q.zone];if(player.dead||player.inVehicle||distance(player.pos,zone)>4.2)s.search=null;else if((q.t+=dt)>=4){s.looted[q.zone]=true;s.scrap+=110;s.food=Math.min(99,s.food+1);Game.items.medkit=Math.min(99,Game.items.medkit+1);s.search=null;save();AudioSys.sfx('buy');a.showMsg('获得110零件、密封罐头与医疗包，可自由前往下一区',3);}}
    if(s.job){const j=s.job,site=atSite();if(!site||site.id!==j.site||s.moving){s.scrap+=j.cost;s.job=null;save();a.showMsg('移动车辆或离开设施，作业取消并退款');}
      else if((j.t+=dt)>=j.duration){if(j.kind==='repair')s.rv.hp=Math.min(s.rv.maxHp,s.rv.hp+450);else if(j.kind==='fuel')s.fuel=Math.min(100,s.fuel+40);else{s[j.kind]++;configure();if(j.kind==='armor')s.rv.hp=Math.min(s.rv.maxHp,s.rv.hp+200);}s.job=null;a.updHPBar(s.rv.bar,s.rv.hp/s.rv.maxHp);save();AudioSys.sfx('build');a.showMsg('设施作业完成，随时出发',2);}}
    if(s.saveT>=10){s.saveT=0;save();}s.mapT-=dt;hud();
  }
  function drawMap(){
    const ctx=$('rvMap').getContext('2d'),w=220,h=224,X=x=>(x-TOWN.minX)/(TOWN.maxX-TOWN.minX)*(w-16)+8,Z=z=>h-8-(z-TOWN.minZ)/(TOWN.maxZ-TOWN.minZ)*(h-16);
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#102129';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#58615e';ctx.lineWidth=7;
    for(const x of [-112,0,112]){ctx.beginPath();ctx.moveTo(X(x),8);ctx.lineTo(X(x),h-8);ctx.stroke();}for(const z of [1525,1640,1750,1850]){ctx.beginPath();ctx.moveTo(8,Z(z));ctx.lineTo(w-8,Z(z));ctx.stroke();}
    RV_ZONES.forEach((n,i)=>{ctx.fillStyle=s.looted[i]?'#485d58':'#9c604e';ctx.beginPath();ctx.arc(X(n.x),Z(n.z),n.r*.53,0,Math.PI*2);ctx.fill();});
    ctx.font='bold 12px Microsoft YaHei';ctx.textAlign='center';for(const n of RV_SITES){ctx.fillStyle=({garage:'#ffcf79',fuel:'#77d8e4',market:'#8bdfac',exit:'#fff'})[n.kind];ctx.fillRect(X(n.x)-4,Z(n.z)-4,8,8);ctx.fillText(({garage:'修',fuel:'油',market:'店',exit:'出'})[n.kind],X(n.x)+10,Z(n.z)-4);if(s.destination===n.id){ctx.strokeStyle='#fff';ctx.lineWidth=1;ctx.strokeRect(X(n.x)-7,Z(n.z)-7,14,14);}}
    const p=s.rv.mesh.position;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(X(p.x),Z(p.z),4,0,Math.PI*2);ctx.fill();if(!player.inVehicle){ctx.fillStyle='#8fffae';ctx.fillRect(X(player.pos.x)-2,Z(player.pos.z)-2,4,4);}
  }
  function hud(){
    if(!s.active)return;const v=s.rv,site=atSite(),dest=RV_SITES.find(n=>n.id===s.destination);
    $('rvStatus').textContent='耐久 '+Math.max(0,Math.ceil(v.hp))+'/'+v.maxHp+' · 燃料 '+Math.ceil(s.fuel)+'%';$('rvFill').style.width=clamp(v.hp/v.maxHp*100,0,100)+'%';
    $('rvObjective').textContent=site?site.name+' · '+(a.isTouch()?'点设施办理':'O 办理服务'):'导航 '+dest.name+' · '+Math.ceil(distance(v.mesh.position,dest))+'米';
    $('rvAction').textContent=s.job?'设施作业 '+Math.ceil(s.job.t)+'/'+s.job.duration+'秒':s.search?'搜索物资 '+Math.ceil(s.search.t)+'/4秒':s.fuel<=0?'无油，可低速挪车至加油站':a.isTouch()?'互动上下车/搜索 · 设施查看地图':'I 上下车/搜索 · O 地图与设施';
    $('rvResources').textContent='零件 '+Math.floor(s.scrap)+' · 搜索 '+s.looted.filter(Boolean).length+'/6区 · 人员 '+Math.ceil(player.hp)+'/'+player.maxHp+' · 罐头 '+s.food+' · 医疗包 '+Game.items.medkit;
    $('vO').textContent='设施';if(s.mapT<=0){s.mapT=.15;drawMap();}
  }
  function finish(won){
    if(s.over)return;s.over=true;Game.state='over';a.Input.reset();a.closePanels();$('rvResultTitle').textContent=won?'房车成功撤离！':'房车被僵尸摧毁';
    $('rvResultInfo').textContent='探索 '+Math.round(s.traveled)+'米 · 用时 '+Math.floor(s.elapsed/60)+'分'+Math.floor(s.elapsed%60)+'秒 · 搜索 '+s.looted.filter(Boolean).length+'/6区 · 击退 '+s.defeated.length+'只僵尸 · 剩余 '+Math.floor(s.scrap)+'零件。'+(won?'下次可尝试搜全六区再撤离。':'可绕开感染区，留零件在修理厂修车。');
    $('rvResult').classList.remove('hidden');AudioSys.sfx(won?'win':'boom');try{localStorage.removeItem(RV_SAVE);}catch(_e){}refresh();
  }
  function stop(restore=true){
    if(!s.active)return;save();a.clearEntities(true);s.rv=null;s.active=false;s.over=false;s.lastPos=null;s.hidden.forEach(o=>o.visible=true);s.hidden=[];s.sky.forEach(o=>o.position.z-=s.skyOffset);s.sky=[];Object.assign(WORLD,s.world);
    s.town?.dispose();s.zombies?.dispose();s.town=null;s.zombies=null;a.stage.classList.remove('rv-mode');['rvHUD','rvMap','rvPanel','rvResult'].forEach(id=>$(id).classList.add('hidden'));$('vO').textContent='商店';$('btnRestartLv').textContent='🔄 重开本关';$('keysHint').textContent=s.keyHint;
    if(restore&&s.backup){Object.assign(Game,s.backup);s.backup=null;}player.inVehicle=null;player.mesh.visible=false;Game.state='menu';a.Input.reset();
  }
  mount();return {state:s,start,stop,save,read,refresh,update,hud,blocked,target,updateMonster,killed,interaction,interact,panel,job,eat,finish,atSite,sites:RV_SITES,zones:RV_ZONES,visible:(p,q)=>s.town.visible(p,q)};
}
