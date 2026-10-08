// 房车突围：独立短路线，复用虫潮角色、虫群、子弹与操作。
export const RV_SAVE='chongchao-rv-breakout-v1';
export const RV_CFG={name:'装甲房车',hp:1400,speed:12,dmg:16,rate:.12,range:36,seatH:2.5,sfx:'mg',color:0x697782};
export const RV_ROUTE=[{z:2100,name:'废弃加油站'},{z:2720,name:'公路检查站'},{z:3340,name:'通信中继站'},{z:3980,name:'撤离隧道'}];
const START=1500,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
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
  const n=(v,a,b)=>Number.isFinite(v)&&v>=a&&v<=b;
  return !!(d&&d.v===1&&Number.isInteger(d.stage)&&n(d.stage,0,3)&&n(d.z,START,4010)&&n(d.x,-38,38)&&n(d.hp,1,1800)&&n(d.fuel,0,100)&&n(d.scrap,0,9999)&&n(d.elapsed,0,86400)&&n(d.hold,0,35)&&[d.gun,d.armor].every(v=>Number.isInteger(v)&&n(v,0,2))&&Array.isArray(d.looted)&&d.looted.length===3&&d.looted.every(v=>typeof v==='boolean')&&typeof d.finished==='boolean');
}
export function createRVBreakout(a){
  const {THREE:T,scene,Game,player,WORLD,AudioSys}=a,$=id=>document.getElementById(id);
  const s={active:false,over:false,stage:0,hold:0,elapsed:0,fuel:100,scrap:60,gun:0,armor:0,looted:[false,false,false],spawn:3,search:0,job:null,rv:null,hidden:[],sky:[],world:null,arena:null,backup:null,saveT:0};
  let cached=null;
  function read(){try{const d=JSON.parse(localStorage.getItem(RV_SAVE));return validRVSave(d)?d:null;}catch(_e){return null;}}
  function save(){if(!s.active||s.over)return;const p=s.rv.mesh.position;const d={v:1,stage:s.stage,x:p.x,z:p.z,hp:s.rv.hp,fuel:s.fuel,scrap:s.scrap+(s.job?.cost||0),elapsed:s.elapsed,hold:s.hold,gun:s.gun,armor:s.armor,looted:[...s.looted],finished:false};try{localStorage.setItem(RV_SAVE,JSON.stringify(d));}catch(_e){a.showMsg('房车进度保存失败，请保持页面打开',3);}cached=d;}
  function refresh(){cached=read();$('rvContinue').hidden=!cached||cached.finished;$('rvSaveInfo').textContent=cached&&!cached.finished?'独立进度：下一站 '+RV_ROUTE[cached.stage].name+' · 房车 '+Math.ceil(cached.hp)+' 耐久':'独立进度；基地防守存档保留。';}
  function mount(){
    const style=document.createElement('style');style.textContent=`
      .rv-mode .campaign-only,.rv-mode #hudTop,.rv-mode #hudRight,.rv-mode #radar,.rv-mode #weaponBar,.rv-mode #hint,.rv-mode #readyBtn,.rv-mode #webTools .mbtn:not(#menuButton):not(#fullBtn):not(#qualityBtn):not(#muteBtn):not(#personBtn),.rv-mode #vL,.rv-mode #vR,.rv-mode #vX{display:none!important}
      #rvHUD{position:absolute;left:10px;top:10px;max-width:290px;padding:8px 12px;border-radius:9px;background:rgba(8,18,29,.82);color:#e8f1f7;line-height:1.5;font-size:13px;pointer-events:none}
      #rvHUD b{color:#ffda85}#rvMeter{height:7px;background:#253848;border-radius:4px;overflow:hidden;margin:4px 0}#rvFill{height:100%;background:#5ed0b2}
      #rvObjective{color:#96e3e8}#rvAction{color:#ffd28c}#rvPanel,#rvMenu,#rvResult{background:rgba(8,18,29,.96);color:#e8f1f7}
      #rvPanel{width:520px}#rvPanel .mbtn{min-height:44px}#rvPanel .small{margin:8px 0}#rvMenu,#rvResult{justify-content:center;align-items:center;text-align:center}#rvMenu .small,#rvResult .small{max-width:660px}
      .touch-mode #rvHUD{max-width:260px;font-size:11px;padding:5px 9px}.rv-mode #interactHint{max-width:420px;white-space:normal}.rv-mode #vO{display:block!important}
      @media(max-height:420px){#rvMenu,#rvResult{justify-content:flex-start;padding:12px 28px}#rvMenu h1,#rvResult h1{font-size:24px;letter-spacing:1px}#rvMenu .small,#rvResult .small{font-size:11px;line-height:1.5}}
    `;document.head.append(style);
    const button=document.createElement('button');button.id='btnRV';button.className='mbtn';button.textContent='🚐 房车突围 · 短线生存';$('btnVersus').after(button);
    const host=document.createElement('div');host.innerHTML=`
      <div id="rvMenu" class="overlay menu hidden"><h1>房车突围</h1><p class="small">一辆移动基地，三个补给站，一段撤离公路。目标约 5–10 分钟。</p><p class="small">开车抵达标记站 → 停车守住 35 秒等待通行 → 下车靠近补给箱搜索 18 秒 → 修车、升级再出发。<br>搜索和维修期间虫群继续进攻；可以放弃额外物资，尽快逃走。房车毁坏即失败，人员阵亡会在房车旁复活。</p><p id="rvSaveInfo" class="small"></p><div class="btnRow"><button id="rvContinue" class="mbtn green">继续房车进度</button><button id="rvStart" class="mbtn green">开始房车突围</button><button id="rvBack" class="mbtn">返回主菜单</button></div></div>
      <div id="rvHUD" class="hidden"><b>🚐 房车突围</b><div id="rvStatus"></div><div id="rvMeter"><div id="rvFill"></div></div><div id="rvObjective"></div><div id="rvAction"></div><div id="rvResources"></div></div>
      <div id="rvPanel" class="panel hidden"><h3>房车整备</h3><p id="rvPanelInfo" class="small"></p><div class="btnRow"><button id="rvRepair" class="mbtn">维修 · 40零件</button><button id="rvGun" class="mbtn">机枪升级 · 90零件</button><button id="rvArmor" class="mbtn">装甲升级 · 90零件</button><button id="rvFuel" class="mbtn">应急燃料 · 25零件</button><button id="rvClose" class="mbtn">返回战斗</button></div><p class="small">维修需原地停留 8 秒，恢复 450 耐久；升级需 6 秒。离车过远或驾驶会取消作业并退回零件。菜单选择暂停战斗，实际作业恢复战斗。</p></div>
      <div id="rvResult" class="overlay menu hidden"><h1 id="rvResultTitle"></h1><p id="rvResultInfo" class="small"></p><div class="btnRow"><button id="rvRetry" class="mbtn green">再跑一趟</button><button id="rvResultBack" class="mbtn">返回主菜单</button></div></div>`;
    for(const child of [...host.children])a.stage.append(child);
    button.onclick=()=>{AudioSys.init();refresh();$('menuMain').classList.add('hidden');$('rvMenu').classList.remove('hidden');};
    $('rvBack').onclick=()=>{$('rvMenu').classList.add('hidden');$('menuMain').classList.remove('hidden');};
    $('rvStart').onclick=()=>{if(read()&&!read().finished)a.askConfirm('新的一趟将替换房车进度，基地存档保留。','开始新的一趟',()=>start());else start();};
    $('rvContinue').onclick=()=>{const d=read();if(d&&!d.finished)start(d);else refresh();};
    $('rvClose').onclick=a.closePanels;
    for(const [id,kind] of [['rvRepair','repair'],['rvGun','gun'],['rvArmor','armor'],['rvFuel','fuel']])$(id).onclick=()=>job(kind);
    $('rvRetry').onclick=()=>start();$('rvResultBack').onclick=()=>a.quit();
  }
  function buildArena(){
    const group=s.arena=new T.Group();group.name='rv-road';scene.add(group);
    const mats={ground:new T.MeshLambertMaterial({color:0x26323b}),road:new T.MeshLambertMaterial({color:0x17232b}),steel:new T.MeshLambertMaterial({color:0x5b6a73}),yellow:new T.MeshBasicMaterial({color:0xc3a464}),cyan:new T.MeshBasicMaterial({color:0x58bfce}),crate:new T.MeshLambertMaterial({color:0x96794f})};
    const box=(w,h,d,x,y,z,m)=>{const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.receiveShadow=true;group.add(o);return o;};
    box(600,.4,3400,0,-.25,2740,mats.ground);box(26,.08,2700,0,.01,2740,mats.road);
    const marks=new T.InstancedMesh(new T.BoxGeometry(.25,.04,5),mats.yellow,240),matrix=new T.Matrix4();
    for(let i=0;i<240;i++){matrix.makeTranslation(i%2?-10:10,.08,START-50+Math.floor(i/2)*23);marks.setMatrixAt(i,matrix);}group.add(marks);
    const rails=new T.InstancedMesh(new T.BoxGeometry(.35,1.2,22),mats.steel,240);
    for(let i=0;i<240;i++){matrix.makeTranslation(i%2?-39:39,.6,START-50+Math.floor(i/2)*23);rails.setMatrixAt(i,matrix);}group.add(rails);
    s.nodes=RV_ROUTE.map((node,i)=>{
      box(13,.12,26,20,.07,node.z,mats.steel);box(8,3,4,27,1.5,node.z+5,mats.steel);box(2,1.5,2,18,.85,node.z,mats.crate);
      const ring=new T.Mesh(new T.TorusGeometry(12,.13,6,40),mats.cyan);ring.rotation.x=Math.PI/2;ring.position.set(0,.14,node.z);group.add(ring);
      const gate=box(76,.7,.4,0,1.1,node.z+22,mats.yellow);
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d');c.fillStyle='#10202c';c.fillRect(0,0,512,128);c.fillStyle='#91e2e7';c.font='bold 48px Microsoft YaHei';c.textAlign='center';c.fillText((i+1)+' '+node.name,256,82);const tex=new T.CanvasTexture(canvas);
      const sign=new T.Mesh(new T.PlaneGeometry(14,3.5),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));sign.position.set(0,7,node.z+12);group.add(sign);
      return {ring,gate};
    });
    // Distant rock banks give the road a readable edge from every camera angle.
    const rocks=new T.InstancedMesh(new T.DodecahedronGeometry(1,0),mats.ground,200);
    for(let i=0;i<200;i++){matrix.compose(new T.Vector3((i%2?-1:1)*(47+i%5*12),2,START-80+Math.floor(i/2)*29),new T.Quaternion(),new T.Vector3(3+i%4,2+i%3,4+i%4));rocks.setMatrixAt(i,matrix);}group.add(rocks);
  }
  function start(d=null){
    if(s.active){stop(false);}if(a.vsOn())a.exitVersus();
    if(!s.backup)s.backup=JSON.parse(JSON.stringify(Game));
    a.closePanels();a.hideConfirm();a.clearEntities(true);a.clearCoop();AudioSys.init();AudioSys.pause(false);a.Input.reset();
    Object.assign(Game,{state:'battle',testMode:false,loop:1,chapter:1,level:1,difficulty:'normal',weapons:['lmg','shotgun'],curWeapon:'lmg',weaponLv:{},items:{medkit:2},hpBonus:0,vehiclesOwned:[],squadCount:0,squadGear:[],magnet:false,regen:false,score:0,gold:0,wave:{total:0,spawned:0,killed:0,timer:0},battleLedger:null});
    player.reset(Game.cls);player.team=null;player.dead=false;player.mesh.visible=true;
    Object.assign(s,{active:true,over:false,stage:d?.stage||0,hold:d?.hold||0,elapsed:d?.elapsed||0,fuel:d?.fuel??100,scrap:d?.scrap??60,gun:d?.gun||0,armor:d?.armor||0,looted:d?[...d.looted]:[false,false,false],spawn:3,search:0,job:null,saveT:0});
    const keep=new Set([a.camera,player.mesh,...a.skyObjects()]);s.hidden=scene.children.filter(o=>o.visible&&!o.isLight&&!keep.has(o));s.hidden.forEach(o=>o.visible=false);
    s.sky=a.skyObjects();s.skyOffset=d?.z||START;s.sky.forEach(o=>o.position.z+=s.skyOffset);s.world={...WORLD};Object.assign(WORLD,{minX:-39,maxX:39,minZ:START-30,maxZ:4010});buildArena();
    s.nodes.forEach((n,i)=>n.gate.visible=i>=s.stage);s.lastPos=null;
    s.rv=a.spawnVehicle('rv');s.rv.cfg={...RV_CFG};s.rv.mesh.position.set(d?.x||0,0,d?.z||START);configure();s.rv.hp=clamp(d?.hp||s.rv.maxHp,1,s.rv.maxHp);a.updHPBar(s.rv.bar,s.rv.hp/s.rv.maxHp);a.enterVehicle(s.rv);player.pos.copy(s.rv.mesh.position);
    a.faceForward();a.stage.classList.add('rv-mode');['menuMain','menuPause','menuOver','rvMenu','rvResult'].forEach(id=>$(id).classList.add('hidden'));$('rvHUD').classList.remove('hidden');a.showHUD();a.showHint(null);
    $('btnRestartLv').textContent='🔄 重开房车突围';s.keyHint=$('keysHint').textContent;$('keysHint').textContent='WASD 驾驶/移动 · J 射击 · I 上下车/搜索 · O 房车整备 · H 医疗 · U 手雷 · K 跳跃 · C 切换视角 · Q/E 转头 · Esc 暂停';
    save();a.showMsg('驶向发光路标；房车耐久归零即失败',3);hud();
  }
  function configure(){s.rv.maxHp=RV_CFG.hp+s.armor*200;s.rv.cfg.dmg=RV_CFG.dmg*(1+s.gun*.35);s.rv.cfg.speed=s.fuel>0?RV_CFG.speed:3;}
  function blocked(x,z){return x<-38||x>38||z<START-29||z>Math.min(4010,RV_ROUTE[s.stage].z+20);}
  function target(mo){
    const v=s.rv,p=v.mesh.position;if(v.dead)return null;
    const person=!player.dead&&!player.inVehicle&&distance(mo.mesh.position,player.pos)<distance(mo.mesh.position,p)*.65;
    const pos=person?player.pos:p;return {pos,obj:person?player:v,kind:person?'player':'vehicle',r:person?1:2.8,d2:distance(mo.mesh.position,pos)**2};
  }
  function interaction(){
    if(player.inVehicle)return {kind:'exit',label:'下车',tip:a.isTouch()?'点互动下车；房车仍会受袭':'I 下车；房车仍会受袭'};
    if(s.stage<3&&!s.looted[s.stage]&&distance(player.pos,{x:18,z:RV_ROUTE[s.stage].z})<7&&distance(s.rv.mesh.position,{x:0,z:RV_ROUTE[s.stage].z})<18)return {kind:'rv-search',label:s.search?'取消搜索':'搜索',tip:s.search?'正在搜索，离开箱子会中断':'靠近箱子互动：搜索 18 秒，获得 110 零件与燃料'};
    const v=s.rv;if(!v.dead&&!(v.noEnter>0)&&distance(player.pos,v.mesh.position)<5)return {kind:'vehicle',vehicle:v,label:'驾驶',tip:a.isTouch()?'点互动驾驶房车':'I 驾驶房车'};
    return {kind:'none',label:'互动',tip:a.isTouch()?'靠近补给箱搜索；房车旁点整备维修':'靠近补给箱 I 搜索；房车旁 O 整备'};
  }
  function interact(){s.search=s.search?0:.001;if(s.search)a.showMsg('搜索开始，守住房车；可以离开中断',2);}
  function panel(){if(s.over)return;a.Input.reset();$('rvPanel').classList.remove('hidden');a.setPanel(true);panelInfo();}
  function panelInfo(){
    $('rvPanelInfo').textContent=`零件 ${Math.floor(s.scrap)} · 耐久 ${Math.ceil(s.rv.hp)}/${s.rv.maxHp} · 燃料 ${Math.ceil(s.fuel)}% · 机枪 ${s.gun}/2 · 装甲 ${s.armor}/2`;
    $('rvGun').textContent=s.gun===2?'机枪已满级':'机枪升级 · '+(90+s.gun*50)+'零件';$('rvArmor').textContent=s.armor===2?'装甲已满级':'装甲升级 · '+(90+s.armor*50)+'零件';
  }
  function job(kind){
    if(s.job){a.showMsg('已有整备作业进行中');return false;}
    if(player.inVehicle||distance(player.pos,s.rv.mesh.position)>8){a.showMsg('先停车下车，站在房车旁整备');return false;}
    if((kind==='gun'&&s.gun===2)||(kind==='armor'&&s.armor===2)){a.showMsg('已达到首版升级上限');return false;}
    if(kind==='repair'&&s.rv.hp>=s.rv.maxHp||kind==='fuel'&&s.fuel>=100){a.showMsg('当前无需补充');return false;}
    const cost=kind==='repair'?40:kind==='fuel'?25:90+s[kind]*50;
    if(s.scrap<cost){a.showMsg('零件不足，沿途下车搜索补给箱');return false;}
    s.scrap-=cost;s.job={kind,cost,t:0,duration:kind==='repair'?8:6};s.search=0;a.closePanels();a.showMsg('整备开始，守住房车直到完成',2);save();return true;
  }
  function spawnSwarm(count=3){
    const p=s.rv.mesh.position;
    for(let i=0;i<count&&a.monsters.length<36;i++){
      const n=Math.floor(s.elapsed)+i,side=i%2?-1:1,x=clamp(p.x+side*(15+Math.random()*16),-35,35),z=clamp(p.z+(i===0?28:-25),START-25,4005);
      const ch=a.CHAPTERS[Math.min(3,s.stage)],mo=a.spawnMonster('mob',x,z,{ch,quiet:true});
      mo.hp=mo.maxHp=70+s.stage*24;mo.dmg=12+s.stage*3;mo.speed=7.2+s.stage*.6;mo.ranged=n%7===0;mo.flightAfterExit=false;mo.split=false;mo.explodeOnDie=false;mo.stealth=false;mo.gold=0;a.updHPBar(mo.bar,1);
    }
  }
  function update(dt){
    if(!s.active||s.over)return;if(Game.msgTimer>0){Game.msgTimer-=dt;if(Game.msgTimer<=0)$('msg').classList.add('hidden');}s.elapsed+=dt;s.saveT+=dt;
    const p=s.rv.mesh.position,travel=distance(p,s.lastPos||p);s.lastPos={x:p.x,z:p.z};s.fuel=Math.max(0,s.fuel-travel*.034-dt*.008);configure();
    const skyDelta=p.z-s.skyOffset;s.sky.forEach(o=>o.position.z+=skyDelta);s.skyOffset=p.z;
    // Parked mobile base defends itself with its existing turret; driving uses the player's normal vehicle weapon.
    if(!player.inVehicle){s.rv.fireCd-=dt;const mo=a.monsters.filter(m=>!m.dead).sort((x,y)=>distance(x.mesh.position,p)-distance(y.mesh.position,p))[0];
      if(mo&&distance(mo.mesh.position,p)<s.rv.cfg.range&&s.rv.fireCd<=0){s.rv.fireCd=s.rv.cfg.rate;const aim=mo.mesh.position.clone().add(new T.Vector3(0,mo.hitH,0)),dir=aim.clone().sub(p).normalize();a.vehicleAim(s.rv,dir);const from=a.vehicleMuzzle(s.rv,dir);a.fireBullet(from,aim.clone().sub(from).normalize(),{...s.rv.cfg,speed:65,color:0xffd27a},true,aim);AudioSys.sfx('mg');}}
    if(player.dead){player.respawnT-=dt;if(player.respawnT<=0){player.reset(Game.cls);player.pos.set(clamp(p.x+4,-36,36),0,p.z-3);player.mesh.position.copy(player.pos);player.invulnerable=3;a.showMsg('在房车旁复活；房车损伤保留',2);}}
    const near=s.stage<3&&distance(p,{x:0,z:RV_ROUTE[s.stage].z})<17;
    if(near&&travel<dt*2){s.hold=Math.min(35,s.hold+dt);if(s.hold>=35){s.fuel=Math.min(100,s.fuel+25);s.rv.hp=Math.min(s.rv.maxHp,s.rv.hp+100);a.updHPBar(s.rv.bar,s.rv.hp/s.rv.maxHp);s.nodes[s.stage].gate.visible=false;s.stage++;s.hold=0;s.search=0;save();a.showMsg('通行已恢复：补充燃料，驶向 '+RV_ROUTE[s.stage].name,3);}}
    if(s.search){if(player.dead||player.inVehicle||s.stage>=3||distance(player.pos,{x:18,z:RV_ROUTE[s.stage].z})>7){s.search=0;}else{s.search+=dt;if(s.search>=18){s.looted[s.stage]=true;s.scrap+=110;s.fuel=Math.min(100,s.fuel+15);Game.items.medkit++;s.search=0;AudioSys.sfx('buy');save();a.showMsg('搜索完成：+110 零件、燃料、医疗包',2);}}}
    if(s.job){const j=s.job;if(player.dead||player.inVehicle||distance(player.pos,p)>8){s.scrap+=j.cost;s.job=null;a.showMsg('整备取消，零件已退回');save();}else if((j.t+=dt)>=j.duration){if(j.kind==='repair')s.rv.hp=Math.min(s.rv.maxHp,s.rv.hp+450);else if(j.kind==='fuel')s.fuel=Math.min(100,s.fuel+35);else{s[j.kind]++;configure();if(j.kind==='armor')s.rv.hp=Math.min(s.rv.maxHp,s.rv.hp+200);}a.updHPBar(s.rv.bar,s.rv.hp/s.rv.maxHp);s.job=null;AudioSys.sfx('build');save();a.showMsg('房车整备完成',2);}}
    s.spawn-=dt;if(s.spawn<=0){s.spawn=(near||s.search||s.job)?3.4:5;spawnSwarm(near?4:3);}
    for(const mo of [...a.monsters])if(distance(mo.mesh.position,p)>90){a.visuals.release(mo.mesh);scene.remove(mo.mesh);a.monsters.splice(a.monsters.indexOf(mo),1);}
    if(s.stage===3&&p.z>=RV_ROUTE[3].z-8)finish(true);
    if(s.saveT>=10){s.saveT=0;save();}hud();
  }
  function hud(){
    if(!s.active)return;const v=s.rv,node=RV_ROUTE[s.stage],p=v.mesh.position,dist=distance(p,{x:0,z:node.z});
    $('rvStatus').textContent=`耐久 ${Math.max(0,Math.ceil(v.hp))}/${v.maxHp} · 燃料 ${Math.ceil(s.fuel)}%`;$('rvFill').style.width=clamp(v.hp/v.maxHp*100,0,100)+'%';
    $('rvObjective').textContent=`${s.stage+1}/4 ${node.name} · ${Math.ceil(dist)}米${s.stage<3&&dist<17?' · 停车通行 '+Math.ceil(s.hold)+'/35秒':''}`;
    $('rvAction').textContent=s.job?'整备 '+Math.ceil(s.job.t)+'/'+s.job.duration+'秒':s.search?'搜索 '+Math.ceil(s.search)+'/18秒':s.fuel<=0?'燃料耗尽：仍可慢速挪车，停车整备补油':(a.isTouch()?'互动上下车/搜索 · 整备按钮修车':'I 上下车/搜索 · O 房车整备');
    $('rvResources').textContent=`零件 ${Math.floor(s.scrap)} · 机枪${s.gun}/2 装甲${s.armor}/2 · ${Math.floor(s.elapsed/60)}:${String(Math.floor(s.elapsed%60)).padStart(2,'0')}${player.inVehicle?'':' · 人员 '+Math.ceil(player.hp)+'/'+player.maxHp}`;
    $('vO').textContent='整备';
  }
  function finish(won){
    if(s.over)return;s.over=true;Game.state='over';a.Input.reset();a.closePanels();$('rvResultTitle').textContent=won?'房车成功撤离！':'房车被虫潮吞没';
    $('rvResultInfo').textContent=`行驶 ${Math.round(s.rv.mesh.position.z-START)}米 · 用时 ${Math.floor(s.elapsed/60)}分${Math.floor(s.elapsed%60)}秒 · 搜索 ${s.looted.filter(Boolean).length}/3站 · 剩余耐久 ${Math.max(0,Math.ceil(s.rv.hp))}。${won?'可以尝试少停车、更快撤离。':'重新开始一趟，优先留零件修车。'}`;
    $('rvResult').classList.remove('hidden');AudioSys.sfx(won?'win':'boom');try{localStorage.removeItem(RV_SAVE);}catch(_e){}refresh();
  }
  function stop(restore=true){
    if(!s.active)return;save();a.clearEntities(true);s.rv=null;s.active=false;s.over=false;s.lastPos=null;
    s.hidden.forEach(o=>o.visible=true);s.hidden=[];s.sky.forEach(o=>o.position.z-=s.skyOffset);s.sky=[];Object.assign(WORLD,s.world);
    scene.remove(s.arena);s.arena.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){m?.map?.dispose();m?.dispose();}});s.arena=null;
    a.stage.classList.remove('rv-mode');['rvHUD','rvPanel','rvResult'].forEach(id=>$(id).classList.add('hidden'));$('vO').textContent='商店';$('btnRestartLv').textContent='🔄 重开本关';$('keysHint').textContent=s.keyHint;
    if(restore&&s.backup){Object.assign(Game,s.backup);s.backup=null;}player.inVehicle=null;player.mesh.visible=false;Game.state='menu';a.Input.reset();
  }
  mount();return {state:s,start,stop,save,read,refresh,update,hud,blocked,target,interaction,interact,panel,job,finish,spawnSwarm};
}
