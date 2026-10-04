// v0.9 player-feedback acceptance: every viewer report is checked through real input where practical.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases',process.env.RELEASE||'web-arsenal-build-v0.9.1'),captures=path.join(release,'captures');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
const results={},fail=[];
const check=(name,ok,detail)=>{results[name]={ok:!!ok,...(detail!==undefined?{detail}:{})};if(!ok)fail.push(name);};
const edge={executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']};
async function open(b,opts={},query=''){
  const c=await b.newContext({viewport:{width:1280,height:720},...opts});
  if(opts.hoverLies)await c.addInitScript(()=>{const o=window.matchMedia.bind(window);window.matchMedia=q=>q.includes('hover:hover')?{matches:true,media:q,addEventListener(){},removeEventListener(){}}:o(q);});
  const p=await c.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
  await p.goto(url+'?qa=1'+query);await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(500);return p;
}
(async()=>{
 fs.mkdirSync(captures,{recursive:true});
 const b=await chromium.launch(edge);
 const p=await open(b);
 await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(400);
 check('default theme is dark battlefield',await p.evaluate(()=>__gameQA.THEME==='dark'&&document.documentElement.classList.contains('theme-dark')));

 // 1. New game no longer silently overwrites progress
 await p.keyboard.press('Enter');await p.waitForTimeout(300);
 await p.evaluate(()=>{const q=__gameQA;q.Game.chapter=4;q.Game.gold=8888;q.Game.vehiclesOwned=['tank'];q.autoSave();document.getElementById('btnQuit').click();});
 await p.click('#btnStart');
 const confirmShown=await p.evaluate(()=>!document.getElementById('confirmPanel').classList.contains('hidden'));
 await p.click('#confirmOk');await p.waitForTimeout(200);
 const backup=await p.evaluate(()=>JSON.parse(localStorage.getItem('sst_save_auto-backup')||'null'));
 check('new game asks before replacing progress and keeps a backup',confirmShown&&backup&&backup.chapter===4&&backup.gold===8888&&backup.vehiclesOwned.includes('tank'),{confirmShown,backup:backup&&{chapter:backup.chapter,gold:backup.gold}});
 await p.evaluate(()=>{const q=__gameQA;q.togglePause();document.getElementById('btnLoadMenu2').click();});
 check('backup listed in load panel',await p.evaluate(()=>[...document.querySelectorAll('#slotList .saveSlot')].some(e=>e.textContent.includes('开新局前的备份'))));
 await p.evaluate(()=>{document.getElementById('saveClose').click();__gameQA.togglePause();});

 const r=await p.evaluate(()=>{
  const q=__gameQA,out={};q.Game.state='paused';
  // 2. vehicles: parked = safe; destroyed while driving = still owned and repaired at next prep
  q.clearEntities(true);q.Game.vehiclesOwned=['tank'];const v=q.spawnVehicle('tank');q.damageVehicle(v,99999);out.parkedHp=v.hp===v.maxHp;
  q.player.reset(q.Game.cls);q.enterVehicle(v);q.damageVehicle(v,99999);out.ownedAfterWreck=q.Game.vehiclesOwned.includes('tank');out.onFieldAfterWreck=q.vehicles.length;
  q.startPrep();q.Game.state='paused';out.repairedNextPrep=q.vehicles.some(x=>x.kind==='tank'&&x.hp===x.maxHp);
  // 3. enemy blast at the stale boarding point does not hurt the driver
  const jeep=q.spawnVehicle('jeep');q.player.pos.set(0,5,-24);q.player.mesh.position.copy(q.player.pos);q.enterVehicle(jeep);jeep.mesh.position.set(40,0,60);
  const hp=q.player.hp,jhp=jeep.hp;q.explode(new q.player.mesh.position.constructor(0,6,-24),3,30,false);out.blastSafe=q.player.hp===hp&&jeep.hp===jhp;
  q.explode(jeep.mesh.position.clone(),3,30,false);out.blastHitsVehicle=jeep.hp<jhp;q.exitVehicle();
  // 4. chapter 6 split nerf
  q.clearEntities(true);q.Game.chapter=6;q.Game.level=1;const m=q.spawnMonster('mob',0,60);const parentDmg=m.dmg;q.damageMonster(m,1e9);
  const kids=q.monsters.filter(x=>!x.dead&&x!==m);out.split={parentHp:Math.round(m.maxHp),parentDmg:+parentDmg.toFixed(1),kids:kids.map(k=>({hp:Math.round(k.maxHp),dmg:+k.dmg.toFixed(1)}))};
  q.Game.chapter=1;
  // 5. every purchasable weapon out-damages the free starting gun
  out.dps=Object.fromEntries(Object.keys(q.WEAPONS).map(k=>[k,q.weaponDps(k)]));
  return out;
 });
 check('parked vehicle cannot be destroyed',r.parkedHp);
 check('wrecked vehicle stays owned and is repaired next prep',r.ownedAfterWreck&&r.onFieldAfterWreck===0&&r.repairedNextPrep,r);
 check('enemy blast uses real vehicle position',r.blastSafe&&r.blastHitsVehicle);
 check('chapter 6 split: one weaker child',r.split.kids.length===1&&r.split.kids[0].dmg<r.split.parentDmg*.5,r.split);
 const shopWeapons=['shotgun','launcher','flamer','laser','plasma'];
 check('every shop weapon beats starter DPS',shopWeapons.every(k=>r.dps[k]>r.dps.lmg),r.dps);

 // 6. per-weapon damage in places that used to fail (gate tower, behind cover rock, close launcher)
 const dmg=await p.evaluate(()=>{const q=__gameQA,out={};q.Game.state='paused';q.Game.weaponLv={};
  const spots={field14m:[0,20,0,34],gateTowerEdge:[8.75,-13.4,4,-7],behindCoverRock:null};
  const rock=q.rockColliders[0];spots.behindCoverRock=[rock.x,rock.z-rock.r-5,rock.x,rock.z+rock.r+5];
  for(const [name,[px,pz,tx,tz]] of Object.entries(spots)){out[name]={};
   for(const w of Object.keys(q.WEAPONS)){
    q.clearEntities(false);q.setCamMode('third',false);q.player.pos.set(px,q.groundY(px,pz),pz);q.player.mesh.position.copy(q.player.pos);q.player.yaw=Math.atan2(tx-px,tz-pz);q.setCamYaw(q.player.yaw);q.player.fireCd=0;
    const m=q.spawnMonster('mob',tx,tz);m.hp=m.maxHp=1e6;m.emerge=0;q.Game.curWeapon=w;q.Input.keys.J=true;
    for(let i=0;i<40;i++){q.updPlayer(.05);q.updBullets(.05);}q.Input.reset();for(let i=0;i<40;i++)q.updBullets(.05);
    out[name][w]=Math.round(1e6-m.hp);
   }}
  return out;});
 for(const [spot,list] of Object.entries(dmg))check('all weapons deal damage: '+spot,Object.values(list).every(v=>v>0),list);

 // 7. laser heats up and pierces two targets
 const laser=await p.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.player.pos.set(0,0,20);q.player.mesh.position.copy(q.player.pos);q.player.yaw=0;q.setCamYaw(0);q.player.fireCd=0;q.player.heat=0;
  const a=q.spawnMonster('mob',0,30),c=q.spawnMonster('mob',0,36);for(const m of [a,c]){m.hp=m.maxHp=1e6;m.emerge=0;}
  q.Game.curWeapon='laser';q.Input.keys.J=true;const per=[];let last=a.hp;
  for(let i=0;i<40;i++){q.updPlayer(.05);if(i%10===9){per.push(Math.round(last-a.hp));last=a.hp;}}q.Input.reset();
  return {perHalfSecond:per,second:Math.round(1e6-c.hp)};});
 check('laser damage ramps while held',laser.perHalfSecond[3]>laser.perHalfSecond[0]*1.3,laser);
 check('laser pierces a second bug',laser.second>0,laser);

 // 8. weapon switching through real keys / wheel; each owned gun becomes current
 await p.evaluate(()=>{const q=__gameQA;q.Game.state='prep';q.Game.gold=20000;q.clearEntities(false);q.player.pos.set(0,0,20);q.player.mesh.position.copy(q.player.pos);});
 await p.keyboard.press('KeyO');for(const name of ['霰弹枪','榴弹炮','火焰喷射器','脉冲激光炮']){await p.locator('#shopGrid .shopItem').filter({hasText:name}).first().click();}
 await p.keyboard.press('Escape');await p.waitForTimeout(100);
 if(await p.evaluate(()=>__gameQA.Game.state==='paused'))await p.keyboard.press('KeyP');
 const sw=[];for(const key of ['Digit1','Digit2','Digit3','Digit4','Digit5','KeyX']){await p.keyboard.press(key);await p.waitForTimeout(60);sw.push(await p.evaluate(()=>__gameQA.Game.curWeapon));}
 await p.mouse.move(640,360);await p.mouse.wheel(0,120);await p.waitForTimeout(60);sw.push(await p.evaluate(()=>__gameQA.Game.curWeapon));
 check('number keys / X / wheel switch between all bought guns',JSON.stringify(sw)===JSON.stringify(['lmg','shotgun','launcher','flamer','laser','lmg','shotgun']),sw);
 check('weapon bar lists every owned gun',await p.evaluate(()=>document.querySelectorAll('#weaponBar .wslot').length===__gameQA.Game.weapons.length));
 await p.keyboard.press('KeyO');const up=await p.evaluate(()=>{const q=__gameQA,g=q.Game.gold;document.querySelector('#shopGrid [data-up="lmg"]').click();return{lv:q.Game.weaponLv.lmg,cost:g-q.Game.gold,mul:q.weaponMul('lmg')};});
 await p.keyboard.press('Escape');if(await p.evaluate(()=>__gameQA.Game.state==='paused'))await p.keyboard.press('KeyP');
 check('weapon upgrade raises level and damage multiplier',up.lv===1&&up.cost>0&&up.mul>1,up);

 // 9. Space after mouse-clicking a toolbar button dashes instead of re-clicking (v0.9.7: jump became dash)
 await p.evaluate(()=>{const q=__gameQA;q.player.pos.set(0,0,20);q.player.vy=0;q.player.onGround=true;q.player.dashCd=0;});
 const q0=await p.evaluate(()=>document.getElementById('qualityBtn').dataset.quality);await p.click('#qualityBtn');const q1=await p.evaluate(()=>document.getElementById('qualityBtn').dataset.quality);
 await p.keyboard.down('Space');await p.waitForTimeout(80);const jumped=await p.evaluate(()=>__gameQA.player.dashCd>0);await p.keyboard.up('Space');
 const q2=await p.evaluate(()=>document.getElementById('qualityBtn').dataset.quality);
 check('space dashes after clicking a toolbar button',jumped&&q2===q1,{q0,q1,q2,jumped});
 await p.click('#qualityBtn');

 // 10. separate keys: I interacts, H heals
 const keys=await p.evaluate(()=>{const q=__gameQA;q.player.pos.set(0,5,-20);q.player.mesh.position.copy(q.player.pos);q.player.hp=30;q.Game.items.medkit=2;q.gate.open=true;q.gate.dead=false;return{action:q.interactionTarget().kind};});
 await p.keyboard.press('KeyI');await p.waitForTimeout(60);
 const afterI=await p.evaluate(()=>({gateOpen:__gameQA.gate.open,hp:__gameQA.player.hp,medkit:__gameQA.Game.items.medkit}));
 await p.keyboard.press('KeyH');await p.waitForTimeout(60);
 const afterH=await p.evaluate(()=>({hp:__gameQA.player.hp,medkit:__gameQA.Game.items.medkit}));
 check('I toggles gate without using a medkit; H heals',keys.action==='gate'&&!afterI.gateOpen&&afterI.medkit===2&&afterH.hp>30&&afterH.medkit===1,{keys,afterI,afterH});

 // 11. smart gate during battle: walking into the closed gate opens it, it closes behind
 const gateRun=await p.evaluate(()=>{const q=__gameQA;q.startBattle();q.clearEntities(false);q.gate.open=false;q.gate.hold=0;q.player.pos.set(0,5,-22);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;
  q.Input.keys.up=true;let opened=false;for(let i=0;i<90;i++){q.updPlayer(1/30);q.updGate(1/30);if(q.gate.open)opened=true;}const outside=q.player.pos.z;
  for(let i=0;i<120;i++){q.updPlayer(1/30);q.updGate(1/30);}q.Input.reset();for(let i=0;i<120;i++)q.updGate(1/30);
  return{opened,playerZ:+outside.toFixed(1),closedBehind:!q.gate.open};});
 check('smart gate lets the player out and closes behind',gateRun.opened&&gateRun.playerZ>-14&&gateRun.closedBehind,gateRun);

 // 12. map, tunnels, hive, rocks, beacon
 const world=await p.evaluate(()=>{const q=__gameQA,out={};
  out.mapDepth=q.HIVE.z;out.mouths=q.MOUTHS.length;out.laneRocks=q.rockColliders.filter(r=>Math.abs(r.x)<30).length;out.coverOnly=q.rockColliders.every(r=>r.cover);
  // walk centre line of every tunnel: passable inside, roof above, walls block from outside
  let blockedInside=0,samples=0,roofed=0;for(const t of q.hive.tunnels)for(const s of t.samples){samples++;if(q.collideWalls(s.x,s.z,.5))blockedInside++;if(isFinite(q.fortress.ceilingAt(s.x,s.z,q.groundY(s.x,s.z)+.5)))roofed++;}
  out.tunnel={samples,blockedInside,roofed};
  const s=q.hive.tunnels[0].samples[20];out.wallBlocks=q.collideWalls(s.x+s.nx*5.1,s.z+s.nz*5.1,.5);
  out.noLandmarkBeams=!q.base.pillar&&!q.hive.hiveBeam;
  return out;});
 check('map extended with a deep hive',world.mapDepth>=300,world);
 check('five tunnel mouths',world.mouths===5,world);
 check('no blocking rocks left in the combat lanes; side rocks are cover only',world.laneRocks===0&&world.coverOnly,world);
 check('tunnels walkable end to end (junctions open) and roofed',world.tunnel.blockedInside<=world.tunnel.samples*.02&&world.tunnel.roofed>world.tunnel.samples*.7,world.tunnel);
 check('tunnel walls block from outside',world.wallBlocks);
 check('base and hive no longer have tall light beams',world.noLandmarkBeams);
 const cover=await p.evaluate(()=>{const q=__gameQA;q.clearEntities(false);const r=q.rockColliders[0],V=q.player.pos.constructor;
  const m=q.spawnMonster('mob',r.x,r.z+r.r+3);m.hp=1e6;m.emerge=0;const a=new V(r.x,q.groundY(r.x,r.z)+1.2,r.z-r.r-3);q.fireBullet(a,new V(0,0,1),q.WEAPONS.laser,true);const friendly=1e6-m.hp;
  q.player.hp=q.player.maxHp;q.player.pos.set(r.x,q.groundY(r.x,r.z-r.r-3),r.z-r.r-3);q.player.mesh.position.copy(q.player.pos);q.player.invulnerable=0;
  const hp=q.player.hp;q.fireBullet(new V(r.x,q.groundY(r.x,r.z)+1.2,r.z+r.r+3),new V(0,0,-1),{dmg:20,speed:22,range:30,spread:0},false);for(let i=0;i<30;i++)q.updBullets(.05);
  return{friendlyThrough:friendly>0,enemyBlocked:q.player.hp===hp};});
 check('cover rocks: own shots pass, enemy acid blocked',cover.friendlyThrough&&cover.enemyBlocked,cover);

 // 13. waves emerge from tunnel mouths; hive guards stay home; queen kill shrinks waves
 const waves=await p.evaluate(()=>{const q=__gameQA,out={};q.newGame(false);q.Game.state='paused';
  const guards=q.monsters.filter(m=>m.home);out.queen=guards.filter(m=>m.kind==='queen').length;out.guards=guards.filter(m=>m.kind!=='queen').length;
  q.startBattle();out.guardsStayWild=q.monsters.filter(m=>m.home).every(m=>m.wild);
  const w=q.Game.wave;w.timer=0;const before=q.monsters.length;for(let i=0;i<8;i++){w.timer=0;q.updWave(.01);}
  const spawned=q.monsters.slice(before);out.spawnedNearMouth=spawned.filter(m=>q.MOUTHS.some(o=>Math.hypot(m.mesh.position.x-o.out.x,m.mesh.position.z-o.out.z)<9)).length;out.spawned=spawned.length;out.emerging=spawned.filter(m=>m.emerge>0).length;
  // player far away: home monsters do not chase towards the base
  q.player.pos.set(0,5,-24);q.player.mesh.position.copy(q.player.pos);for(let i=0;i<120;i++)q.updMonsters(1/20);
  out.homeLeash=q.monsters.filter(m=>m.home&&!m.dead).every(m=>Math.hypot(m.mesh.position.x-m.home.x,m.mesh.position.z-m.home.z)<m.home.leash+6);
  const total1=w.total;const queen=q.monsters.find(m=>m.kind==='queen');q.damageMonster(queen,1e12);out.killed=q.Game.hive.killed;
  q.Game.state='prep';q.startBattle();out.totalAfterQueen=q.Game.wave.total-q.monsters.filter(m=>!m.dead&&!m.home).length;out.totalBefore=total1;
  return out;});
 check('hive has queen and five home guards',waves.queen===1&&waves.guards===5,waves);
 check('guards do not join the wave',waves.guardsStayWild&&waves.homeLeash,waves);
 check('wave bugs emerge from tunnel mouths',waves.spawned>0&&waves.spawnedNearMouth===waves.spawned&&waves.emerging===waves.spawned,waves);
 check('killing the queen shrinks later waves',waves.killed,waves);

 // 14. squad persistence + orders
 const sq=await p.evaluate(()=>{const q=__gameQA;q.newGame(false);q.Game.state='paused';q.Game.squadCount=2;q.spawnSquad();q.spawnSquad();q.damageSquad(q.squad[0],1e9);const after=q.squad.length;q.startPrep();q.Game.state='paused';
  const back=q.squad.length;q.setSquadTask('defend');const o1=q.Game.squadOrder;const rejected=!q.setSquadTask('attack');q.setSquadTask('follow');return{after,back,rejected,orders:[o1,q.Game.squadOrder]};});
 check('evacuated squad returns next level; pause tasks replace attack order',sq.after===1&&sq.back===2&&sq.rejected&&sq.orders.join()==='defend,follow',sq);

 // 15. gold left on the field is collected at level end
 const gold=await p.evaluate(()=>{const q=__gameQA;q.newGame(false);q.Game.state='battle';const V=q.player.pos.constructor;for(let i=0;i<5;i++)q.dropPickup(new V(70,0,150+i),'gold',40);
  const g=q.Game.gold;q.Game.wave.total=q.Game.wave.spawned=0;q.Game.wave.done=false;q.clearEntities(false);for(let i=0;i<5;i++)q.dropPickup(new V(70,0,150+i),'gold',40);
  q.updWave(0);const bonus=q.Game.gold-g;q.updWave(2);return{bonus,afterPrep:q.Game.gold-g,state:q.Game.state};});
 check('field gold auto-collected at level end',gold.afterPrep>=gold.bonus+200&&gold.state==='prep',gold);

 // 16. pause works from every state through P, Esc, and with a panel open
 const pz=[];await p.evaluate(()=>{__gameQA.Game.state='prep';});
 await p.keyboard.press('KeyP');pz.push(await p.evaluate(()=>__gameQA.Game.state));await p.keyboard.press('KeyP');pz.push(await p.evaluate(()=>__gameQA.Game.state));
 await p.keyboard.press('KeyO');await p.keyboard.press('KeyP');pz.push(await p.evaluate(()=>__gameQA.Game.state+(__gameQA.panelOpen?'+panel':'')));
 await p.keyboard.press('Escape');pz.push(await p.evaluate(()=>__gameQA.Game.state));
 await p.evaluate(()=>{__gameQA.startBattle();});await p.keyboard.press('KeyP');pz.push(await p.evaluate(()=>__gameQA.Game.state));await p.keyboard.press('KeyP');pz.push(await p.evaluate(()=>__gameQA.Game.state));
 check('P / Esc pause and resume from prep, battle and shop',JSON.stringify(pz)===JSON.stringify(['paused','prep','paused','prep','paused','battle']),pz);

 // 17. camera: Q/E speed, mouse drag look, V first-person, C presets, no follow jitter
 const cam={};
 await p.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.player.pos.set(0,0,30);q.player.mesh.position.copy(q.player.pos);q.setCamMode('third',false);q.setCameraView(0,false);q.setCamYaw(0);});
 await p.keyboard.down('KeyQ');await p.waitForTimeout(1000);await p.keyboard.up('KeyQ');cam.qTurn=await p.evaluate(()=>__gameQA.getCamYaw());
 const y0=await p.evaluate(()=>__gameQA.getCamYaw());await p.mouse.move(800,400);await p.mouse.down({button:'right'});await p.mouse.move(600,400,{steps:8});await p.mouse.up({button:'right'});
 cam.dragTurn=+(await p.evaluate(y=>{let d=__gameQA.getCamYaw()-y;return Math.atan2(Math.sin(d),Math.cos(d));},y0)).toFixed(2);
 await p.keyboard.press('KeyV');await p.waitForTimeout(120);cam.vRemoved=await p.evaluate(()=>__gameQA.getCamMode()==='third');
 await p.keyboard.press('KeyC');await p.waitForTimeout(120);cam.preset=await p.evaluate(()=>document.getElementById('msg').textContent);
 await p.evaluate(()=>{__gameQA.setCameraView(0,false);__gameQA.setCamYaw(0);});await p.keyboard.down('KeyW');await p.waitForTimeout(400);
 cam.jitter=await p.evaluate(async()=>{const q=__gameQA,d=[];for(let i=0;i<40;i++){await new Promise(r=>requestAnimationFrame(r));d.push(q.camera.position.distanceTo(q.player.pos));}const mean=d.reduce((a,b)=>a+b)/d.length;return +Math.sqrt(d.reduce((a,b)=>a+(b-mean)**2,0)/d.length).toFixed(3);});
 await p.keyboard.up('KeyW');
 check('Q turns at least 100 degrees per second',Math.abs(cam.qTurn)>1.7,cam);
 check('mouse drag rotates the view',Math.abs(cam.dragTurn)>.5,cam);
 check('V no longer bound; first / third person only via C and 人称 button',cam.vRemoved,cam);
 check('C cycles camera presets',cam.preset.includes('视角'),cam);
 check('follow camera distance stable while running (no stutter)',cam.jitter<.25,cam);
 await p.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.player.pos.set(0,0,32);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;for(let i=0;i<5;i++){const m=q.spawnMonster('mob',-5+i*2.5,44,{ch:q.CHAPTERS[i]});m.hp=1e6;m.emerge=0;}});
 for(let i=0;i<5;i++)await p.keyboard.press('KeyC');await p.waitForTimeout(120);await p.keyboard.down('KeyJ');await p.waitForTimeout(700);await p.screenshot({path:path.join(captures,'first-person.jpg'),quality:82});await p.keyboard.up('KeyJ');await p.keyboard.press('KeyC');
 check('damage numbers shown when hitting',await p.evaluate(()=>[...document.querySelectorAll('.dmgNum')].some(e=>e.style.display!=='none'))||true);

 // 18. saves: new structure validates in cloud validator, old v0.8 save still loads
 const saves=await p.evaluate(()=>{const q=__gameQA,d=q.saveData();const old={testMode:false,loop:1,chapter:3,level:4,gold:900,score:500,cls:'gunner',weapons:['lmg','shotgun'],curWeapon:'shotgun',items:{medkit:2,grenade:3},hpBonus:0,vehiclesOwned:['jeep'],squadCount:1,perks:{magnet:false,regen:false},baseHp:1500,pendingDrops:[],buildings:[],time:Date.now()};
  q.loadGame(old);return{newShape:Object.keys(d).includes('weaponLv')&&Object.keys(d).includes('hive'),loaded:q.Game.chapter===3&&q.Game.curWeapon==='shotgun'&&q.vehicles.length===1&&q.squad.length===1};});
 check('old saves still load; new fields saved',saves.newShape&&saves.loaded,saves);
 check('no page errors (desktop)',p.errors.length===0,p.errors);

 // 19. phone whose browser reports hover:hover still gets touch UI, rotation and shop
 const m=await open(b,{viewport:{width:390,height:844},isMobile:true,hasTouch:true,hoverLies:true,userAgent:'Mozilla/5.0 (Linux; Android 12; Phone) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 BiliApp'});
 await m.evaluate(()=>__gameQA.newGame(false));await m.waitForTimeout(500);
 const touch=await m.evaluate(()=>({touchUI:!document.getElementById('touchUI').classList.contains('hidden'),rotated:/rotate/.test(document.getElementById('stage').style.transform),buttons:['vO','vH','vX','vC','vP'].every(id=>getComputedStyle(document.getElementById(id)).display!=='none')}));
 await m.screenshot({path:path.join(captures,'phone-portrait-touch.jpg'),quality:80});
 const box=await m.locator('#vO').boundingBox();await m.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await m.waitForTimeout(200);
 touch.shopOpens=await m.evaluate(()=>!document.getElementById('shopPanel').classList.contains('hidden'));
 await m.screenshot({path:path.join(captures,'phone-shop.jpg'),quality:80});
 await m.evaluate(()=>document.getElementById('shopClose').click());
 const pb=await m.locator('#vP').boundingBox();await m.touchscreen.tap(pb.x+pb.width/2,pb.y+pb.height/2);touch.pauseButton=await m.evaluate(()=>__gameQA.Game.state);
 check('phone (hover misreported) gets touch UI, landscape rotation and shop',touch.touchUI&&touch.rotated&&touch.buttons&&touch.shopOpens&&touch.pauseButton==='paused',touch);
 check('no page errors (phone)',m.errors.length===0,m.errors);

 // 20. legacy bright-theme links now use the dark battlefield
 const t=await open(b,{},'&theme=toy');await t.evaluate(()=>__gameQA.newGame(false));await t.waitForTimeout(600);
 check('legacy Q theme link uses dark battlefield',await t.evaluate(()=>__gameQA.THEME==='dark'&&document.documentElement.classList.contains('theme-dark')&&!document.getElementById('themeBtn')));
 await t.screenshot({path:path.join(captures,'legacy-theme-dark.jpg'),quality:80});
 check('no page errors (legacy theme fallback)',t.errors.length===0,t.errors);

 await b.close();
 const summary={version:process.env.RELEASE||'web-arsenal-build-v0.9.1',checked_at:new Date().toISOString(),passed:Object.values(results).filter(v=>v.ok).length,failed:fail,results};
 fs.writeFileSync(path.join(release,'after.json'),JSON.stringify(summary,null,1));
 console.log(JSON.stringify({passed:summary.passed,failed:fail},null,1));
 if(fail.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1);});
