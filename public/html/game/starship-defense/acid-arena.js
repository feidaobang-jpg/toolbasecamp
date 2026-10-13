// Optional single-player challenge. Its clock, combat and records never write campaign saves.
export const ACID_RULES={x:0,z:-1700,halfX:14,halfZ:10,rounds:3,hits:3,hitGrace:1.35,dashCooldown:2.6};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function createAcidArena(a){
  const {THREE:T,Game,player,Input,AudioSys,scene,stage,monsters}=a,$=id=>document.getElementById(id),C=ACID_RULES;
  const s={active:false,phase:'idle',round:0,elapsed:0,enemies:[],acid:[],shots:[],upgrades:{pierce:0,breach:0,shield:0}};
  const recordKey='chongchao-acid-arena-record-v1';
  let root,acidMesh,shotMesh,shieldRing,backup,hidden=[],savedView,worldAppearance;
  const matrix=new T.Object3D(),geometries=new Set(),materials=new Set();
  const geo=g=>(geometries.add(g),g),mat=m=>(materials.add(m),m);
  const solid=color=>mat(new T.MeshLambertMaterial({color}));
  const glow=color=>mat(new T.MeshBasicMaterial({color}));
  const add=(parent,g,m,x,y,z)=>{const mesh=new T.Mesh(g,m);mesh.position.set(x,y,z);parent.add(mesh);return mesh;};
  const readRecord=()=>{try{const r=JSON.parse(localStorage.getItem(recordKey));return r&&Number.isFinite(r.best)&&r.best>0?r:null;}catch(_){return null;}};
  function mount(){
    const b=document.createElement('button');b.id='btnAcid';b.className='lobbyCard';b.dataset.mode='acid';
    b.innerHTML='<strong>酸液围场</strong><span>三轮弹幕 · 躲避与弱点反击</span>';$('btnTest').before(b);
    const host=document.createElement('div');host.innerHTML=`
      <div id="acidMenu" class="overlay menu hidden"><div class="acidCard">
        <span class="acidEyebrow">单人挑战 · 约三分钟</span><h1>酸液围场</h1>
        <p class="acidLead">躲过交叉酸液，趁虫腹发光时反击。</p>
        <div class="acidRules"><p><b>三次命中容错</b><br>生命耗尽即失败；受伤后短暂无敌，闪避可穿过酸液。</p>
        <p><b>固定朝向 · 交错喷射</b><br>金色线先预警，绿色酸液随后飞出；蓝色虫腹代表弱点开放。</p>
        <p><b>三轮递进 · 两次升级</b><br>清场后选择穿甲、贯穿或护盾；每轮基础火力也会提升。</p></div>
        <p id="acidControls" class="small"></p><p id="acidRecord" class="small"></p>
        <div class="btnRow"><button id="acidStart" class="mbtn green">进入围场</button><button id="acidBack" class="mbtn">返回主菜单</button></div>
      </div></div>
      <div id="acidHUD" class="hidden" aria-live="off"><div class="acidHudTop"><b id="acidRound"></b><span id="acidTime"></span></div><div id="acidLife"></div><div id="acidObjective"></div><div id="acidGear"></div></div>
      <div id="acidUpgrade" class="overlay menu hidden"><div class="acidCard"><span class="acidEyebrow">清场整备 · 战斗暂停</span><h1 id="acidUpgradeTitle"></h1><p class="small">本次升级仅在本局生效。下一轮基础火力 +25%，保留剩余生命。</p><div id="acidChoices"></div><button id="acidUpgradeQuit" class="mbtn">结束挑战并返回</button></div></div>
      <div id="acidResult" class="overlay menu hidden"><div class="acidCard"><span class="acidEyebrow">酸液围场</span><h1 id="acidResultTitle"></h1><p id="acidResultInfo" class="acidLead"></p><p class="small">喷射后虫腹变蓝，是集中反击的好时机。</p><div class="btnRow"><button id="acidRetry" class="mbtn green">再挑战一次</button><button id="acidResultBack" class="mbtn">返回主菜单</button></div></div></div>`;
    stage.append(...host.children);
    const style=document.createElement('style');style.textContent=`
      #acidMenu,#acidUpgrade,#acidResult{background:rgba(5,17,24,.96);padding:24px;overflow:auto;color:#e7f3ed}
      .acidCard{width:min(820px,100%);margin:auto;text-align:center}.acidCard h1{color:#dbefa4;margin:10px 0;font-size:32px}.acidEyebrow{color:#93b9ad;font-size:13px;letter-spacing:2px}.acidLead{font-size:18px;line-height:1.6;color:#c7dcd7}
      .acidRules,#acidChoices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}.acidRules p{margin:0;padding:14px;text-align:left;background:#142b32;border:1px solid #35545a;border-radius:10px;font-size:14px;line-height:1.65}.acidRules b{color:#d1e7a0}
      #acidChoices .mbtn{white-space:normal;text-align:left;margin:0;padding:18px;line-height:1.65;min-height:115px}#acidChoices b{display:block;color:#d4f49d;font-size:18px}#acidChoices span{display:block;color:#c9dce0;font-size:14px}
      #acidHUD{position:absolute;left:12px;top:12px;z-index:9;padding:10px 13px;border:1px solid #54706b;border-radius:9px;background:rgba(5,22,29,.86);color:#e2f0e6;pointer-events:none;width:310px;font-size:13px;line-height:1.6}.acidHudTop{display:flex;justify-content:space-between;gap:15px}#acidLife{font-size:20px;letter-spacing:3px;color:#a6e3c1}#acidObjective{color:#ffdd88}#acidGear{color:#a9c6cf}
      .acid-mode #hudTop,.acid-mode #hudLeft,.acid-mode #hudRight,.acid-mode #weaponBar,.acid-mode #keysHint,.acid-mode #hint,.acid-mode #interactHint,.acid-mode #jumpTxt,.acid-mode #hudBottom,.acid-mode #vU,.acid-mode #vH,.acid-mode #vO,.acid-mode #vL,.acid-mode #vR,.acid-mode #vZ,.acid-mode #vSPRINT{display:none!important}
      .acid-mode #radar,.acid-mode #saveHealth,.acid-mode #readyBtn,.acid-mode #vX,.acid-mode #menuPause .pauseCard.campaign-only,.acid-mode #menuPause [data-menu-panel="menuSavePanel"]{display:none!important}
      .acid-mode #vI[aria-disabled="true"]{display:none!important}.acid-mode #vK{display:flex!important}
      .touch-mode #acidHUD{width:245px;font-size:11px;padding:5px 9px;left:8px;top:8px}.touch-mode #acidLife{font-size:17px}
      #stage.menu-compact .acidCard h1{font-size:25px;margin:5px 0}#stage.menu-compact .acidRules,#stage.menu-compact #acidChoices{margin:8px 0;gap:8px}#stage.menu-compact .acidRules p{font-size:12px;padding:8px}#stage.menu-compact .acidLead{font-size:14px;margin:6px 0}#stage.menu-compact #acidMenu,#stage.menu-compact #acidUpgrade,#stage.menu-compact #acidResult{padding:12px 24px}#stage.menu-compact #acidChoices .mbtn{padding:10px;min-height:90px}
    `;document.head.append(style);
    b.onclick=()=>{AudioSys.init();$('menuMain').classList.add('hidden');$('acidMenu').classList.remove('hidden');const r=readRecord();$('acidRecord').textContent=r?'本机最快通关 '+r.best.toFixed(1)+' 秒 · 通关 '+r.wins+' 次':'独立挑战，不影响基地、房车和虫族进度。';$('acidControls').textContent=a.isTouch()?'左侧摇杆移动 · 右侧射击/闪避 · 获得护盾后点护盾使用':'WASD 移动 · J 射击 · K 闪避 · I 护盾 · C 视角 · Q/E 转头 · Esc 暂停';};
    $('acidStart').onclick=start;$('acidRetry').onclick=start;
    $('acidBack').onclick=()=>{$('acidMenu').classList.add('hidden');$('menuMain').classList.remove('hidden');};
    $('acidResultBack').onclick=$('acidUpgradeQuit').onclick=a.quit;
  }
  function buildWorld(){
    root=new T.Group();root.position.z=C.z;scene.add(root);
    const floor=solid(0x26383b),edge=solid(0x405052),metal=solid(0x607578),lime=glow(0xbee879);
    const plane=add(root,geo(new T.BoxGeometry(160,.5,160)),floor,0,-.3,0);plane.receiveShadow=true;
    add(root,geo(new T.BoxGeometry(31,.18,23)),solid(0x344547),0,-.02,0).receiveShadow=true;
    const rail=geo(new T.BoxGeometry(1,1,1));
    for(const side of [-1,1]){
      add(root,rail,edge,side*15.8,.15,0).scale.set(1.1,.3,25);
      add(root,rail,edge,0,.15,side*11.8).scale.set(33,.3,1.1);
      add(root,rail,lime,side*14.65,.025,0).scale.set(.1,.08,21.8);
      add(root,rail,lime,0,.025,side*10.65).scale.set(29.3,.08,.1);
      for(let n=-2;n<=2;n++){add(root,rail,metal,side*16,.85,n*5).scale.set(1.5,1.7,1.5);add(root,rail,lime,side*16,1.73,n*5).scale.set(.8,.06,.8);}
    }
    const lines=[];for(let x=-12;x<=12;x+=4)lines.push(x,.085,-10,x,.085,10);for(let z=-8;z<=8;z+=4)lines.push(-14,.085,z,14,.085,z);
    const grid=geo(new T.BufferGeometry());grid.setAttribute('position',new T.Float32BufferAttribute(lines,3));root.add(new T.LineSegments(grid,mat(new T.LineBasicMaterial({color:0x4a5c5d}))));
    const bullet=geo(new T.SphereGeometry(1,8,6));acidMesh=new T.InstancedMesh(bullet,glow(0xb8f442),256);shotMesh=new T.InstancedMesh(bullet,glow(0xffcf74),96);
    acidMesh.frustumCulled=shotMesh.frustumCulled=false;acidMesh.count=shotMesh.count=0;root.add(acidMesh,shotMesh);
    shieldRing=add(root,geo(new T.TorusGeometry(1.1,.07,6,28)),glow(0x5ce5ef),0,1,0);shieldRing.rotation.x=Math.PI/2;shieldRing.visible=false;
  }
  function start(){
    if(s.active)stop();a.prepare();backup=JSON.parse(JSON.stringify(Game));savedView=a.enterView();
    a.clearEntities(true);AudioSys.init();AudioSys.pause(false);Input.reset();
    Object.assign(Game,{state:'battle',pausedFrom:'battle',testMode:false,cls:'gunner',curWeapon:'lmg',weapons:['lmg'],weaponLv:{},hpBonus:0,items:{medkit:0},regen:false,magnet:false,score:0,gold:0,battleLedger:null,squadCount:0,vehiclesOwned:[]});
    player.reset('gunner');player.team=null;player.maxHp=player.hp=C.hits;player.fireCd=0;player.invulnerable=0;player.pos.set(0,0,C.z);player.mesh.position.copy(player.pos);player.mesh.visible=true;player.bar.visible=false;
    hidden=scene.children.filter(o=>o.visible&&!o.isLight&&o!==player.mesh&&o!==a.camera);hidden.forEach(o=>o.visible=false);
    worldAppearance={background:scene.background,fog:scene.fog};scene.background=new T.Color(0x17252b);scene.fog=new T.Fog(0x17252b,42,115);
    Object.assign(s,{active:true,phase:'battle',round:0,elapsed:0,roundTime:0,hits:0,kills:0,weakHits:0,blockedHits:0,dash:0,dashCd:0,shield:0,shieldCd:0,upgrades:{breach:0,pierce:0,shield:0},enemies:[],acid:[],shots:[]});
    buildWorld();stage.classList.add('acid-mode');for(const id of ['menuMain','menuPause','menuOver','acidMenu','acidResult','acidUpgrade'])$(id).classList.add('hidden');
    $('acidHUD').classList.remove('hidden');a.showHUD();a.showHint(null);$('msg').classList.add('hidden');nextRound();hud();
    $('btnRestartLv').textContent='重新挑战酸液围场';
  }
  function makeEnemy(x,z,index){
    const group=new T.Group();group.position.set(x,0,z);group.rotation.y=Math.atan2(-x,-z);root.add(group);
    const shell=solid(0x456c4d),dark=solid(0x1a2e2b),belly=glow(0x95bb43);
    const ball=geo(new T.SphereGeometry(1,10,8)),limb=geo(new T.CylinderGeometry(.12,.18,1,5));
    add(group,ball,shell,0,.95,0).scale.set(1.35,.82,1.2);
    for(let i=0;i<3;i++)add(group,ball,dark,0,1.35,-.6+i*.52).scale.set(1.24,.42,.34);
    const weak=add(group,ball,belly,0,.92,.95);weak.scale.set(.72,.56,.45);
    const mouth=add(group,geo(new T.TorusGeometry(.33,.13,6,10)),shell,0,1.05,1.34);
    for(const side of [-1,1])for(let i=0;i<3;i++){const leg=add(group,limb,shell,side*1.13,.42,-.65+i*.65);leg.rotation.z=side*.75;leg.scale.y=1.25;}
    for(const side of [-1,1])add(group,ball,glow(0xffd274),side*.42,1.48,.81).scale.set(.12,.12,.14);
    const bar=add(group,geo(new T.BoxGeometry(2.5,.13,.1)),glow(0xaad4b3),0,2.25,0);
    const warningGeo=geo(new T.BufferGeometry());const warning=new T.LineSegments(warningGeo,mat(new T.LineBasicMaterial({color:0xffd56a,transparent:true,opacity:.5})));warning.position.y=.12;group.add(warning);
    const hp=400+(s.round-1)*160;
    const e={acidEnemy:true,mesh:group,radius:1.1,hitH:1.05,hp,maxHp:hp,dead:false,weak:false,clock:-1-index*.85,cycle:0,warning,bar,belly,weakMesh:weak,mouth,phase:'rest',fired:0,yaw:group.rotation.y,x,z};
    // Shared automatic aim reads world coordinates; place each enemy directly in the scene.
    root.remove(group);group.position.z+=C.z;scene.add(group);monsters.push(e);s.enemies.push(e);return e;
  }
  function clearEnemies(){for(const e of s.enemies){scene.remove(e.mesh);const i=monsters.indexOf(e);if(i>=0)monsters.splice(i,1);}s.enemies=[];}
  function nextRound(){
    clearEnemies();s.round++;s.roundTime=0;s.phase='battle';s.acid=[];s.shots=[];Input.reset();Game.state='battle';AudioSys.pause(false);$('acidUpgrade').classList.add('hidden');a.showHUD();
    const spots=[[-10,14],[10,-14],[-18,-5],[18,5],[0,14]];
    spots.slice(0,s.round+2).forEach(([x,z],i)=>makeEnemy(x,z,i));hud();
  }
  function angles(e){
    const count=7+s.round*2,offset=e.cycle%2?2.8/(count-1)/2:0;
    return Array.from({length:count},(_,i)=>-1.40+i*2.8/(count-1)+offset);
  }
  function telegraph(e){
    const points=[];for(const theta of angles(e))points.push(0,.08,1.5,Math.sin(theta)*36,.08,Math.cos(theta)*36);
    e.warning.geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));e.warning.geometry.computeBoundingSphere();
  }
  function spray(e){
    for(const theta of angles(e)){
      if(s.acid.length>=256)break;const angle=e.yaw+theta,speed=5.5+s.round*.6;
      s.acid.push({x:e.x+Math.sin(e.yaw)*1.5,z:e.z+Math.cos(e.yaw)*1.5,vx:Math.sin(angle)*speed,vz:Math.cos(angle)*speed,life:7});
    }
    AudioSys.noise(.16,.07,900);AudioSys.tone(260,.12,'sawtooth',.035,-160);
  }
  function updateEnemies(dt){
    for(const e of s.enemies){if(e.dead)continue;e.clock+=dt;
      const cycleLength=7-(s.round-1)*.2;
      if(e.clock>=cycleLength){e.clock-=cycleLength;e.cycle++;e.fired=0;}
      const t=e.clock,warning=t>=0&&t<1.35,sprayPhase=t>=1.35&&t<2.10;
      const phase=warning?'warning':sprayPhase?'spray':t>=2.1&&t<4.6?'weak':'rest';
      if(phase==='warning'&&e.phase!==phase)telegraph(e);e.phase=phase;e.weak=phase==='weak';e.warning.visible=warning;
      e.belly.color.setHex(e.weak?0x64eafa:warning?0xffca62:0x91b440);e.weakMesh.scale.set(.72,.56+(e.weak?.10*Math.sin(s.elapsed*9):0),.45);
      e.mesh.rotation.y=e.yaw;e.mouth.position.z=1.34+(sprayPhase?Math.sin(t*32)*.1:0);
      if(sprayPhase){const wanted=s.round===3?2:1;while(e.fired<wanted&&t>=1.35+e.fired*.38){spray(e);e.fired++;}}
    }
  }
  function hitPlayer(){
    if(!s.active||s.phase!=='battle'||Game.state!=='battle'||player.invulnerable>0||s.dash>0)return false;
    if(s.shield>0){s.shield=0;player.invulnerable=.6;s.blockedHits++;AudioSys.sfx('heal');return false;}
    player.hp=Math.max(0,player.hp-1);s.hits++;player.invulnerable=C.hitGrace;AudioSys.sfx('hurt');a.hitFlash();hud();
    if(player.hp===0)finish(false);return true;
  }
  function hurt(e,amount){
    if(e.dead||s.phase!=='battle')return 0;
    const mul=e.weak?1.8:.3+s.upgrades.breach*.3,damage=amount*mul;e.hp=Math.max(0,e.hp-damage);e.bar.scale.x=e.hp/e.maxHp;
    if(e.weak)s.weakHits++;AudioSys.sfx('hit');
    if(e.hp===0){e.dead=true;e.mesh.visible=false;s.kills++;a.spawnParticles(e.mesh.position.clone().add(new T.Vector3(0,1,0)),0x9ce86a,12,5,.5,1);AudioSys.sfx('boom');}
    return damage;
  }
  function shield(){if(s.upgrades.shield&&s.shieldCd<=0&&s.phase==='battle'){s.shield=3;s.shieldCd=s.upgrades.shield===2?8:12;AudioSys.sfx('heal');}}
  function moveAndFire(dt){
    const axis=Input.axis(),yaw=a.getYaw(),f=-axis.y,r=axis.x,mvx=f*Math.sin(yaw)-r*Math.cos(yaw),mvz=f*Math.cos(yaw)+r*Math.sin(yaw),moving=Math.hypot(mvx,mvz)>.01;
    s.dashCd=Math.max(0,s.dashCd-dt);s.shieldCd=Math.max(0,s.shieldCd-dt);s.shield=Math.max(0,s.shield-dt);player.invulnerable=Math.max(0,player.invulnerable-dt);
    if(Input.pop('K')&&s.dashCd===0){s.dash=.20;s.dashCd=C.dashCooldown;const len=Math.hypot(mvx,mvz)||1;s.dashX=moving?mvx/len:Math.sin(yaw);s.dashZ=moving?mvz/len:Math.cos(yaw);AudioSys.sfx('jump');}
    if(Input.pop('I'))shield();if(Input.pop('C'))a.cycleView();
    const dash=s.dash>0;s.dash=Math.max(0,s.dash-dt);player.sprinting=dash;const speed=dash?26:8.8;
    player.pos.x=clamp(player.pos.x+(dash?s.dashX:mvx)*speed*dt,-C.halfX,C.halfX);player.pos.z=clamp(player.pos.z+(dash?s.dashZ:mvz)*speed*dt,C.z-C.halfZ,C.z+C.halfZ);player.pos.y=0;
    if(moving&&a.getMode()!=='first'){player.yaw=Math.atan2(mvx,mvz);delete player.lookHeading;}else if(a.getMode()==='first'||player.lookHeading!==undefined)player.yaw=yaw;
    player.mesh.position.copy(player.pos);player.mesh.rotation.y=player.yaw;
    a.visuals.animate(player.mesh,dt,moving||dash?'Run':'Idle',a.camera);
    player.anim+=dt*(dash?20:10);player.mesh.userData.legs?.forEach((leg,i)=>{leg.rotation.x=moving||dash?Math.sin(player.anim+i*Math.PI)*.65:0;});
    const from=player.pos.clone().add(new T.Vector3(0,1.15,0)),aim=a.playerAim(from,46,null);
    player.fireCd-=dt;if(Input.firing(a.automaticFireTarget(from,46,aim))&&player.fireCd<=0){
      player.fireCd=.25;const muzzle=a.playerMuzzle(aim.dir),dir=aim.target?aim.target.clone().sub(muzzle).normalize():aim.dir;
      if(s.shots.length<96)s.shots.push({x:muzzle.x,y:muzzle.y,z:muzzle.z-C.z,vx:dir.x*48,vy:dir.y*48,vz:dir.z*48,life:1.2,damage:18*(1+(s.round-1)*.25)*(1+s.upgrades.pierce*.15),pierce:s.upgrades.pierce,hit:new Set()});
      AudioSys.sfx('mg');player.muzzle.intensity=1.5;s.muzzle=.06;
    }
    s.muzzle=Math.max(0,(s.muzzle||0)-dt);player.muzzle.intensity=s.muzzle>0?1.5:0;
    shieldRing.visible=s.shield>0||player.invulnerable>0||s.dash>0;shieldRing.position.set(player.pos.x,.7,player.pos.z-C.z);shieldRing.material.color.setHex(s.shield>0?0x65e8ef:0xffffff);
  }
  // Swept collision stays reliable at the 20fps frame clamp and during a dash.
  function segmentDistance(x,z,x2,z2,cx,cz){const dx=x2-x,dz=z2-z,t=clamp(((cx-x)*dx+(cz-z)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x+dx*t-cx,z+dz*t-cz);}
  function updateProjectiles(dt){
    for(let i=s.shots.length-1;i>=0;i--){const b=s.shots[i],x=b.x,z=b.z;b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.life-=dt;
      for(const e of s.enemies){if(e.dead||b.hit.has(e)||Math.abs(b.y-1.05)>1.1||segmentDistance(x,z,b.x,b.z,e.x,e.z)>1.25)continue;hurt(e,b.damage);b.hit.add(e);if(b.pierce--<=0){b.life=0;break;}}
      if(b.life<=0)s.shots.splice(i,1);
    }
    for(let i=s.acid.length-1;i>=0;i--){const b=s.acid[i],x=b.x,z=b.z;b.x+=b.vx*dt;b.z+=b.vz*dt;b.life-=dt;
      if(segmentDistance(x,z,b.x,b.z,player.pos.x,player.pos.z-C.z)<.78){hitPlayer();b.life=0;if(s.phase==='result')break;}
      if(b.life<=0||Math.abs(b.x)>24||Math.abs(b.z)>22)s.acid.splice(i,1);
    }
  }
  function drawProjectiles(){
    for(const [mesh,list,scale] of [[acidMesh,s.acid,.30],[shotMesh,s.shots,.10]]){mesh.count=Math.min(list.length,mesh.instanceMatrix.count);for(let i=0;i<mesh.count;i++){const b=list[i];matrix.position.set(b.x,b.y??.95,b.z);matrix.rotation.y=Math.atan2(b.vx,b.vz);matrix.scale.set(scale,scale,mesh===acidMesh?.42:.55);matrix.updateMatrix();mesh.setMatrixAt(i,matrix.matrix);}mesh.instanceMatrix.needsUpdate=true;}
  }
  function upgrade(){
    s.phase='upgrade';s.acid=[];s.shots=[];drawProjectiles();Input.reset();Input.releaseMouseLook();AudioSys.pause(true);$('touchUI').classList.add('hidden');$('acidUpgradeTitle').textContent='第 '+s.round+' 轮完成 · 选择升级';
    const choices=[['breach','强击穿甲','护甲伤害从 '+Math.round((.3+s.upgrades.breach*.3)*100)+'% 提升到 '+Math.round((.6+s.upgrades.breach*.3)*100)+'%，非弱点阶段也能有效反击。'],['pierce','贯穿弹','子弹多穿透一只虫，基础伤害额外 +15%；寻找一条线上的目标。'],['shield','应急护盾',s.upgrades.shield?'护盾冷却缩短到 8 秒。':'获得护盾动作：持续 3 秒，抵挡一次命中，冷却 12 秒。']];
    $('acidChoices').replaceChildren();for(const [key,title,desc] of choices){const b=document.createElement('button');b.className='mbtn';b.dataset.upgrade=key;b.innerHTML='<b>'+title+'</b><span>'+desc+'</span>';b.onclick=()=>choose(key);$('acidChoices').append(b);}
    $('acidUpgrade').classList.remove('hidden');hud();
  }
  function choose(key){if(!s.active||s.phase!=='upgrade'||!Object.prototype.hasOwnProperty.call(s.upgrades,key))return false;s.upgrades[key]++;s.shieldCd=0;nextRound();return true;}
  function finish(win){
    if(s.phase==='result')return;s.phase='result';Game.state='over';s.acid=[];s.shots=[];Input.reset();Input.releaseMouseLook();AudioSys.pause(false);AudioSys.sfx(win?'win':'lose');
    if(win){const old=readRecord();try{localStorage.setItem(recordKey,JSON.stringify({best:Math.min(old?.best||Infinity,s.elapsed),wins:Math.min(999999,(old?.wins||0)+1)}));}catch(_){}}
    $('menuPause').classList.add('hidden');$('touchUI').classList.add('hidden');$('acidResultTitle').textContent=win?'围场突破！':'挑战结束';$('acidResultInfo').textContent=(win?'三轮全部清除':'抵达第 '+s.round+' / 3 轮')+' · '+s.elapsed.toFixed(1)+' 秒 · 击败 '+s.kills+' 只 · 剩余生命 '+player.hp+'/3';$('acidResult').classList.remove('hidden');hud();
  }
  function hud(){
    if(!s.active)return;$('acidRound').textContent='酸液围场 · 第 '+s.round+' / 3 轮';$('acidTime').textContent=Math.floor(s.elapsed/60)+':'+String(Math.floor(s.elapsed%60)).padStart(2,'0');
    $('acidLife').textContent='♥'.repeat(player.hp)+'♡'.repeat(3-player.hp)+'  '+player.hp+'/3';
    const left=s.enemies.filter(e=>!e.dead),weak=left.filter(e=>e.weak).length;
    $('acidObjective').textContent=s.phase==='upgrade'?'清场完成 · 选择升级后继续':s.phase==='result'?'挑战已结束':weak?'蓝色弱点开放 · 剩余 '+left.length+' 只':'金线预警 → 绿弹喷射 → 蓝色弱点';
    $('acidGear').textContent='火力 Lv'+s.round+' · 穿甲 '+s.upgrades.breach+' · 贯穿 '+s.upgrades.pierce+(s.upgrades.shield?' · 护盾 '+(s.shield>0?'生效':s.shieldCd>0?Math.ceil(s.shieldCd)+'s':'就绪'):'');
    $('vK').textContent=s.dashCd>0?'闪避 '+s.dashCd.toFixed(1)+'s':'闪避';$('vK').setAttribute('aria-label','短距离闪避');
    $('vI').setAttribute('aria-disabled',String(!s.upgrades.shield));$('vI').textContent=s.shieldCd>0?'护盾 '+Math.ceil(s.shieldCd)+'s':'护盾';a.syncFireButton();
  }
  function update(dt){
    if(!s.active)return;if(dt>0&&s.phase==='battle'&&Game.state==='battle'){
      s.elapsed+=dt;s.roundTime+=dt;moveAndFire(dt);updateEnemies(dt);updateProjectiles(dt);
      if(s.phase==='battle'&&s.enemies.every(e=>e.dead)){if(s.round===3)finish(true);else upgrade();}
    }
    drawProjectiles();hud();
  }
  function stop(){
    if(!s.active)return;clearEnemies();scene.remove(root);for(const g of geometries)g.dispose();for(const m of materials)m.dispose();geometries.clear();materials.clear();
    s.active=false;s.phase='idle';s.acid=[];s.shots=[];hidden.forEach(o=>o.visible=true);hidden=[];scene.background=worldAppearance.background;scene.fog=worldAppearance.fog;
    Object.assign(Game,backup);backup=null;player.reset(Game.cls);player.mesh.visible=false;stage.classList.remove('acid-mode');
    for(const id of ['acidMenu','acidHUD','acidUpgrade','acidResult'])$(id).classList.add('hidden');$('vI').removeAttribute('aria-disabled');$('vI').textContent='互动';$('vK').textContent='跳跃';$('btnRestartLv').textContent='重新开始本关';
    a.leaveView(savedView);Input.reset();AudioSys.pause(false);
  }
  mount();return {state:s,start,stop,update,hud,hitPlayer,hurt,choose,shield,finish,cameraTarget:new T.Vector3(0,0,C.z),tacticalView:{d:7,h:32},get frozen(){return s.active&&s.phase!=='battle';}};
}
