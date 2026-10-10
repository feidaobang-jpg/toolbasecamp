// 虫族模式（实验玩法）：玩家扮演虫族攻坚人类要塞。
// 复用主世界防御体系：炮塔/小队/城门/基地自动把玩家虫与虫群当敌人，
// 虫群 AI 沿用攻防模式的目标逻辑（攻击人类设施与守军），玩家负责指挥与斩首。
import * as T from './vendor/three.module.js';

const STORE_BEST='chongchao-zerg-best-v1';
const ROUND_SECONDS=360,MAX_DEATHS=5,SWARM_CAP=52;
const COST={warrior:60,flyer:90,molt:40};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function createZergMode(a){
  const s={active:false,over:false,timeLeft:ROUND_SECONDS,biomass:0,deaths:0,bug:null,respawnT:0,
    clawCd:0,spitCd:0,sumCd:0,flyCd:0,moltCd:0,dashT:0,dashCd:0,trickle:6,hudT:0,
    prev:{squad:0,vehicle:0,building:0,baseHp:0,gateHp:0},best:null};
  let labels=null;
  const $=id=>document.getElementById(id);
  const stage=a.stage;
  function readBest(){try{const d=JSON.parse(localStorage.getItem(STORE_BEST)||'null');return d&&d.schema===1?d:null;}catch{return null;}}
  function saveBest(win){
    const old=readBest(),rec={schema:1,wins:(old?.wins||0)+(win?1:0),runs:(old?.runs||0)+1,bestTimeLeft:win?Math.max(old?.bestTimeLeft||0,Math.round(s.timeLeft)):old?.bestTimeLeft||0,updated:new Date().toISOString()};
    try{localStorage.setItem(STORE_BEST,JSON.stringify(rec));}catch{}
    s.best=rec;return rec;
  }
  s.best=readBest();

  const TOUCH_LABELS={vJ:'撕咬',vK:'酸液',vU:'召战士',vI:'召飞虫',vO:'蜕皮',vL:'冲刺'};
  function relabel(on){
    const ids=Object.keys(TOUCH_LABELS);
    if(on){labels={};for(const id of ids){const el=$(id);if(el){labels[id]=el.textContent;el.textContent=TOUCH_LABELS[id];el.setAttribute('aria-label',TOUCH_LABELS[id]);}}}
    else if(labels){for(const id of ids){const el=$(id);if(el&&labels[id]!==undefined){el.textContent=labels[id];el.setAttribute('aria-label',labels[id]);}}labels=null;}
  }

  function mouthSpot(){
    const m=a.MOUTHS[Math.floor(Math.random()*a.MOUTHS.length)];
    return {x:m.out.x+(Math.random()*6-3),z:m.out.z+(Math.random()*6-3)};
  }
  function spawnPlayerBug(){
    const spot=a.monsters().some(m=>m.zergPlayer)?{x:s.bug.mesh.position.x,z:s.bug.mesh.position.z}:mouthSpot();
    const mo=a.spawnMonster('mob',spot.x,spot.z,{quiet:true});
    mo.zergPlayer=true;mo.elite=null;if(mo.gem){mo.mesh.remove(mo.gem);mo.gem=null;}
    mo.mesh.scale.multiplyScalar(1.7);mo.radius*=1.7;mo.hitH=1.15;
    mo.hp=mo.maxHp=950;mo.dmg=60;mo.speed=9.2;mo.gold=0;mo.fly=false;mo.ranged=false;
    mo.bar.scale.divideScalar(1);mo.bar.position.y=2.4;
    mo.invuln=3;
    s.bug=mo;return mo;
  }
  function defenseLine(){
    const put=(k,x,z)=>a.placeBuilding(k,x,z,0);
    put('mgTurret',-15,-13,0);put('mgTurret',15,-13,0);put('mgTurret',-27,-13,0);put('mgTurret',27,-20,0);
    put('antiAir',20,-24,0);put('antiAir',-20,-24,0);
    put('cannonTurret',0,-26,0);put('bunker',-8,-20,0);put('sniperTurret',8,-20,0);
  }
  function garrison(){
    const roles=['gunner','gunner','rifle','medic','gunner','rifle'];
    roles.forEach((role,i)=>{a.squadGear(i).role=role;a.squadGear(i).order='defend';});
    for(let i=0;i<roles.length;i++)a.spawnSquad();
    a.Game.squadCount=a.squad.length;a.Game.squadOrder='defend';a.Game.squadAutoDefense=true;a.Game.squadAlert=3;
  }

  function start(){
    if(s.active)return;
    a.AudioSys.init();a.AudioSys.resume();
    a.bumpRun();
    a.clearEntities(true);
    const G=a.Game;
    G.testMode=false;G.difficulty='normal';G.state='battle';G.gold=0;G.score=0;
    G.loop=1;G.chapter=1;G.level=1;
    G.squadGear=[];G.vehiclesOwned=[];G.opsCompleted={};G.hive={loop:1,chapter:1,queen:1,killed:false};
    a.base.maxHp=a.baseMaxHp();a.base.hp=a.base.maxHp;a.updHPBar(a.base.bar,1);
    a.gate.dead=false;a.gate.hp=a.gate.maxHp=2500;a.updHPBar(a.gate.bar,1);a.gate.open=false;a.gate.auto=false;
    defenseLine();garrison();
    a.player.dead=true;a.player.mesh.visible=false;a.player.inVehicle=null;
    Object.assign(s,{active:true,over:false,timeLeft:ROUND_SECONDS,biomass:80,deaths:0,bug:null,respawnT:0,
      clawCd:0,spitCd:0,sumCd:0,flyCd:0,moltCd:0,dashT:0,dashCd:0,trickle:5,hudT:0});
    s.prev={squad:0,vehicle:0,building:0,baseHp:a.base.hp,gateHp:a.gate.hp};
    spawnPlayerBug();
    stage.classList.add('zerg-mode');
    $('hud').classList.add('hidden');
    $('touchUI').classList.toggle('hidden',!a.isTouch());
    relabel(a.isTouch());
    $('zergHud').classList.remove('hidden');
    $('menuMain').classList.add('hidden');$('menuPause').classList.add('hidden');$('menuOver').classList.add('hidden');
    a.showMsg('🪲 虫族模式：WASD/摇杆移动 · J 撕咬 · K 酸液 · U 召战士 · I 召飞虫 · O 蜕皮 · L 冲刺',6);
    a.showMsg('🪲 虫族模式：指挥虫群摧毁人类基地！',3.5);
    a.AudioSys.sfx('wave');
  }
  function endScreen(win,reason){
    if(s.over)return;
    s.over=true;
    a.Game.state='over';
    const rec=saveBest(win);
    $('overTitle').textContent=win?'🪲 虫族胜利！':'💀 虫群溃散';
    $('overInfo').innerHTML=`${reason}<br><br>⏳ 剩余 ${Math.max(0,Math.round(s.timeLeft))} 秒 · 🐛 存活虫群 ${a.monsters().filter(m=>!m.dead).length} · 💀 重试 ${s.deaths}/${MAX_DEATHS}<br>🧬 累计生物量 ${Math.round(s.biomass)} · 战绩 ${rec.wins}胜/${rec.runs}局 · 最快剩余 ${rec.bestTimeLeft}s`;
    $('menuOver').classList.remove('hidden');
    $('hud').classList.add('hidden');$('touchUI').classList.add('hidden');$('zergHud').classList.add('hidden');
    a.AudioSys.sfx(win?'win':'lose');
  }
  s.victory=()=>{if(!s.active)return;endScreen(true,'人类基地核心被摧毁，要塞陷落！');};
  s.defeat=reason=>{if(!s.active)return;endScreen(false,reason);};
  function stop(){
    if(!s.active)return;
    s.active=false;s.over=false;s.bug=null;
    stage.classList.remove('zerg-mode');
    relabel(false);
    $('zergHud').classList.add('hidden');
    a.clearEntities(true);
    a.player.dead=false;a.player.mesh.visible=true;
    a.Game.state='menu';
    $('menuOver').classList.add('hidden');$('menuPause').classList.add('hidden');$('menuMain').classList.remove('hidden');
  }
  s.stop=stop;
  s.restart=()=>{stop();start();};

  // 玩家虫受伤：不走 killMonster，交给本模块处理重试
  s.hurt=d=>{
    const mo=s.bug;if(!mo||mo.dead||!s.active||s.over)return;
    if(mo.invuln>0)return;
    mo.hp-=d;a.updHPBar(mo.bar,Math.max(0,mo.hp/mo.maxHp));
    mo.dmgT=.14;
    if(mo.hp<=0){
      mo.dead=true;a.spawnParticles(mo.mesh.position.clone().add(new T.Vector3(0,1,0)),0x8bf06a,14,6,.6,1.2);
      a.AudioSys.sfx('hurt');
      s.deaths++;s.bug=null;
      if(s.deaths>=MAX_DEATHS)s.defeat('母虫损失过重，虫群失去指挥溃散了…');
      else{s.respawnT=3;a.showMsg(`💀 母虫阵亡！${MAX_DEATHS-s.deaths} 次机会剩余 · 3 秒后在虫洞重生`,3);}
    }
  };

  function humansNear(pos,r){
    const list=[];
    for(const sq of a.squad)if(!sq.dead&&!sq.vehicle)list.push({pos:sq.mesh.position,obj:sq,kind:'squad',r:1});
    for(const v of a.vehicles)if(!v.dead)list.push({pos:v.mesh.position,obj:v,kind:'vehicle',r:2});
    for(const bd of a.buildings)if(!bd.dead)list.push({pos:bd.mesh.position,obj:bd,kind:'building',r:bd.radius});
    if(!a.gate.dead)list.push({pos:a.gate.mesh.position,obj:a.gate,kind:'gate',r:3});
    list.push({pos:a.base.pos,obj:a.base,kind:'base',r:4});
    return list.filter(t=>(t.pos.x-pos.x)**2+(t.pos.z-pos.z)**2<=(r+t.r)**2);
  }
  function claw(){
    const mo=s.bug;if(!mo||mo.dead)return;
    s.clawCd=.55;mo.atkCd=1;
    const hits=humansNear(mo.mesh.position,3.2);
    for(const t of hits){
      if(t.kind==='squad')a.damageSquad(t.obj,mo.dmg);
      else if(t.kind==='vehicle')a.damageVehicle(t.obj,mo.dmg);
      else if(t.kind==='building')a.damageBuilding(t.obj,mo.dmg);
      else if(t.kind==='gate')a.damageGate(mo.dmg);
      else a.damageBase(mo.dmg);
    }
    a.spawnParticles(mo.mesh.position.clone().add(new T.Vector3(0,1.1,0)),hits.length?0xffd27a:0x9adf7a,hits.length?10:4,4,.35,.8);
    a.AudioSys.sfx(hits.length?'hit':'shoot');
  }
  function spit(){
    const mo=s.bug;if(!mo||mo.dead)return;
    s.spitCd=1.1;mo.atkCd=1;
    const fwd=a.camForward();
    const from=mo.mesh.position.clone().add(new T.Vector3(0,1.2,0)).addScaledVector(fwd,.9);
    let best=null,bd=30*30;
    for(const t of humansNear(mo.mesh.position,30)){
      const d=new T.Vector3().subVectors(t.pos,mo.mesh.position);d.y=0;
      if(d.lengthSq()>bd)continue;
      if(d.normalize().dot(fwd)<.2)continue;
      bd=d.lengthSq();best=t;
    }
    const dir=best?new T.Vector3().subVectors(best.pos,from).normalize():fwd.clone();
    a.fireBullet(from,dir,{dmg:75,speed:34,range:30,spread:.02,explode:2.2,arc:true,color:0x9dff5a},false,best?best.pos.clone():null);
    a.AudioSys.sfx('grenade');
  }
  function summon(fly){
    const mo=s.bug;if(!mo||mo.dead)return;
    const cost=fly?COST.flyer:COST.warrior;
    if(s.biomass<cost){a.showMsg(`生物量不足（需 ${cost}）：撕咬人类单位与设施可得`,1.4);return;}
    if(a.monsters().length>=SWARM_CAP){a.showMsg('虫群规模到上限了，先消耗一波',1.4);return;}
    s.biomass-=cost;
    if(fly)s.flyCd=8;else s.sumCd=6;
    const p=mo.mesh.position;
    const n=fly?2:3;
    for(let i=0;i<n;i++){
      const mo2=a.spawnMonster('mob',p.x+(Math.random()*8-4),p.z+(Math.random()*8-4),fly?{ch:a.CHAPTERS[1],quiet:true}:{quiet:true});
      if(fly&&!mo2.fly){mo2.fly=true;mo2.mesh.position.y=a.flyHeight(mo2.mesh.position.x,mo2.mesh.position.z);}
    }
    a.AudioSys.sfx('buy');a.showMsg(fly?'🪽 飞虫出巢：越墙直扑设施':'🐛 战士虫出巢：扑向最近的人类目标',1.6);
  }
  function molt(){
    const mo=s.bug;if(!mo||mo.dead)return;
    if(s.biomass<COST.molt){a.showMsg(`生物量不足（需 ${COST.molt}）`,1.2);return;}
    if(mo.hp>=mo.maxHp){a.showMsg('母虫满血，不用蜕皮',1.2);return;}
    s.biomass-=COST.molt;s.moltCd=8;
    mo.hp=Math.min(mo.maxHp,mo.hp+mo.maxHp*.35);a.updHPBar(mo.bar,mo.hp/mo.maxHp);
    a.spawnParticles(mo.mesh.position.clone().add(new T.Vector3(0,1.2,0)),0x7dffa8,12,3,.7,1);
    a.AudioSys.sfx('heal');
  }

  function collectBiomass(){
    const deadSquad=a.squad.filter(x=>x.dead).length,deadVeh=a.vehicles.filter(v=>v.dead).length,deadBd=a.buildings.filter(b=>b.dead).length;
    const p=s.prev;
    s.biomass+=(deadSquad-p.squad)*25+(deadVeh-p.vehicle)*30+(deadBd-p.building)*18;
    s.biomass+=Math.max(0,p.baseHp-a.base.hp)*.6+Math.max(0,p.gateHp-a.gate.hp)*.25;
    s.prev={squad:deadSquad,vehicle:deadVeh,building:deadBd,baseHp:a.base.hp,gateHp:a.gate.hp};
  }
  function updHud(){
    const mo=s.bug;
    $('zergHud').innerHTML=
      `<b>🪲 虫族模式</b> · ⏳ ${Math.max(0,Math.ceil(s.timeLeft))}s<br>🧬 生物量 ${Math.floor(s.biomass)} · 💀 重试 ${s.deaths}/${MAX_DEATHS}<br>🏰 基地核心 ${Math.max(0,Math.round(a.base.hp/a.base.maxHp*100))}% · 城门 ${a.gate.dead?'破':Math.max(0,Math.round(a.gate.hp/a.gate.maxHp*100))+'%'}<br>🐛 虫群 ${a.monsters().filter(m=>!m.dead).length} · 母虫 ${mo&&!mo.dead?Math.max(0,Math.round(mo.hp/mo.maxHp*100))+'%':'重生中 '+Math.ceil(s.respawnT)}<br><span class="small">U 战士${s.sumCd>0?' '+Math.ceil(s.sumCd)+'s':''} · I 飞虫${s.flyCd>0?' '+Math.ceil(s.flyCd)+'s':''} · O 蜕皮${s.moltCd>0?' '+Math.ceil(s.moltCd)+'s':''} · L 冲刺${s.dashCd>0?' '+Math.ceil(s.dashCd)+'s':''}</span>`;
  }

  function update(dt){
    if(!s.active||s.over)return;
    s.timeLeft-=dt;
    if(s.timeLeft<=0){s.defeat('时间到：人类援军抵达，虫群被反推…');return;}
    collectBiomass();
    // 母虫控制
    const mo=s.bug;
    if(mo&&!mo.dead){
      mo.invuln=Math.max(0,(mo.invuln||0)-dt);
      s.clawCd-=dt;s.spitCd-=dt;s.sumCd-=dt;s.flyCd-=dt;s.moltCd-=dt;s.dashCd-=dt;s.dashT-=dt;
      const ax=a.Input.axis();
      const cs=Math.cos(a.getCamYaw()),sn=Math.sin(a.getCamYaw());
      const f=-ax.y,r=ax.x;
      const mvx=f*sn-r*cs,mvz=f*cs+r*sn;
      const moving=Math.hypot(mvx,mvz)>.01;
      const sprint=moving&&a.Input.keys.SPRINT;
      if(moving){
        const dir=new T.Vector3(mvx,0,mvz).normalize();
        a.moveMonster(mo,dir,dt,(s.dashT>0?2.1:1)*(sprint?1.4:1));
        const want=Math.atan2(dir.x,dir.z),cur=mo.mesh.rotation.y;
        const turn=Math.atan2(Math.sin(want-cur),Math.cos(want-cur));
        mo.mesh.rotation.y=cur+clamp(turn,-dt*10,dt*10);
      }
      a.visuals.animate(mo.mesh,dt,mo.atkCd>.75?'Attack':moving?'Run':'Idle',a.camera);
      if(typeof mo.mesh.userData.tick==='function')mo.mesh.userData.tick(dt,performance.now()/1000);
      mo.atkCd=Math.max(0,(mo.atkCd||0)-dt);
      if(a.Input.pop('J')&&s.clawCd<=0)claw();
      if(a.Input.pop('K')&&s.spitCd<=0)spit();
      if(a.Input.pop('U')&&s.sumCd<=0)summon(false);
      if(a.Input.pop('I')&&s.flyCd<=0)summon(true);
      if(a.Input.pop('O')&&s.moltCd<=0)molt();
      if(a.Input.pop('L')&&s.dashCd<=0){s.dashCd=6;s.dashT=1.1;a.AudioSys.sfx('jump');a.spawnParticles(mo.mesh.position.clone().add(new T.Vector3(0,.4,0)),0x6b5236,8,4,.4,1);}
      // 相机锚点：人类玩家对象仅作镜头与朝向载体；抬高到母虫背甲之上，避免第三人称镜头埋进虫体
      a.player.pos.set(mo.mesh.position.x,mo.mesh.position.y+1.8,mo.mesh.position.z);
      a.player.yaw=mo.mesh.rotation.y;
      a.player.sprinting=sprint;
    }else if(!mo){
      if(s.deaths<MAX_DEATHS){s.respawnT-=dt;if(s.respawnT<=0){spawnPlayerBug();a.showMsg('🪲 母虫重生！继续撕开防线',2);}}
    }
    // 虫洞增援：维持压力但不上涨到卡顿
    s.trickle-=dt;
    if(s.trickle<=0){
      s.trickle=14;
      if(a.monsters().length<SWARM_CAP-6){
        for(let i=0;i<2;i++){const p=mouthSpot();a.spawnMonster('mob',p.x,p.z,{emerge:true,quiet:true});}
      }
    }
    s.hudT-=dt;
    if(s.hudT<=0){s.hudT=.25;updHud();}
  }
  s.update=update;

  // 主菜单入口：放进「其他玩法」分组，排在自由测试之前，与其他独立玩法并列
  const anchor=$('btnTest');
  const row=anchor?anchor.parentNode:document.getElementById('modeRow')||document.querySelector('#menuMain .btnRow');
  if(row&&!$('btnZerg')){
    const b=document.createElement('button');
    b.className='mbtn';b.id='btnZerg';
    b.textContent='🪲 虫族模式 · 攻陷人类要塞';
    b.onclick=()=>start();
    if(anchor)row.insertBefore(b,anchor);else row.appendChild(b);
    const tip=document.createElement('div');
    tip.className='small';
    tip.textContent='虫族模式（实验）：扮演母虫带虫群攻人类要塞，限时 6 分钟；撕咬/酸液/召唤/蜕皮/冲刺五系技能，生物量靠摧毁守军与设施获取。独立战绩，不占用战役存档。';
    row.parentNode.insertBefore(tip,row.nextSibling);
  }
  return s;
}
