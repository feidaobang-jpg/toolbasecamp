// Behavioural regressions for the viewer's laser report, cover and free-play isolation.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases/web-fortress-v0.6.0'),captures=path.join(release,'captures');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
const assert=(v,m)=>{if(!v)throw Error(m);};
(async()=>{
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const c=await b.newContext({viewport:{width:1440,height:810}}),p=await c.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);
 await p.keyboard.press('Enter');await p.evaluate(()=>{__gameQA.Game.gold=1500;});await p.keyboard.press('KeyO');
 await p.locator('#shopGrid .shopItem').filter({hasText:'脉冲激光炮'}).click();await p.keyboard.press('Escape');
 assert(await p.evaluate(()=>__gameQA.Game.curWeapon==='laser'&&__gameQA.Game.gold===0),'purchase equips laser');
 const checks=await p.evaluate(()=>{
   const q=__gameQA,result={},ok=(v,m)=>{if(!v)throw Error(m);result[m]=true;};q.Game.state='paused';
   result.laser=[];
   for(const dt of [1/60,1/30,.05]){
     let misses=0;
     for(let d=3;d<25;d+=.5){q.clearEntities(false);const m=q.spawnMonster('mob',0,d);m.mesh.position.y=15;m.radius=.8;m.hitH=1;m.hp=1000;const a=m.mesh.position.clone().set(0,16,0);q.fireBullet(a,a.clone().set(0,0,1),q.WEAPONS.laser,true);for(let i=0;i<20;i++)q.updBullets(dt);if(m.hp!==987)misses++;}
     result.laser.push({dt,misses,outOf:44});ok(misses===0,'laser hits every distance at '+dt);
   }
   for(const weapon of ['sniper','railgun']){
     q.clearEntities(false);const targets=[3,6,9].map(z=>{const m=q.spawnMonster('mob',0,z);m.mesh.position.y=15;m.hp=10000;return m;});
     const a=targets[0].mesh.position.clone().set(0,16,0);q.fireBullet(a,a.clone().set(0,0,1),q.WEAPONS[weapon],true);q.updBullets(.05);q.updBullets(.05);
     ok(weapon==='railgun'?targets.every(m=>m.hp<10000):targets[0].hp<10000&&targets[1].hp===10000,weapon+' continuous collision / ordered penetration');
   }
   q.clearEntities(true);q.player.pos.set(0,0,12);q.player.mesh.position.copy(q.player.pos);q.player.yaw=0;q.player.fireCd=0;
   const target=q.spawnMonster('mob',0,22);target.hp=target.maxHp=10000;q.Game.curWeapon='laser';q.Input.keys.J=true;
   for(let i=0;i<20;i++){q.updPlayer(.05);q.updBullets(.05);}q.Input.reset();result.heldLaserDamage=10000-target.hp;
   ok(result.heldLaserDamage>=100,'holding fire produces repeated laser damage');
   // Actual player update walks up both stairs (not teleporting to the platform).
   for(const side of [-1,1]){q.player.pos.set(side*8.75,5,-27);q.player.mesh.position.copy(q.player.pos);q.setCameraView(0);q.Input.keys.up=true;for(let i=0;i<30;i++)q.updPlayer(.04);q.Input.reset();ok(q.player.pos.y>9&&q.player.pos.z>-20,'walk up '+side+' stair');}
   const r=q.rockColliders.find(r=>!q.tooSteep(r.x,r.z));ok(q.collideWalls(r.x,r.z,.5),'rock blocks walking');ok(!q.fortress.blocked(r.x,r.z,.5,r.top+1),'high flight clears rock');
   // A laser fired through a rock must be blocked.
   q.clearEntities(false);const m=q.spawnMonster('mob',r.x,r.z+5);m.mesh.position.y=r.bottom;m.hp=10000;
   const from=m.mesh.position.clone().set(r.x,(r.bottom+r.top)/2,r.z-5);q.fireBullet(from,from.clone().set(0,0,1),q.WEAPONS.laser,true);ok(m.hp===10000,'rock blocks laser');
   for(let z=36;z<=62;z+=.5)ok(!q.collideWalls(-42,z,.5),'cave passage '+z);ok(q.collideWalls(-47,49,.5),'cave wall blocks walking');
   q.player.pos.set(30,0,34);q.player.hp=10;q.updPlayer(1);ok(q.player.hp>10,'field shelter heals');
   q.clearEntities(true);const tower=q.placeBuilding('antiAir',0,40),fly=q.spawnMonster('mob',0,50,{ch:q.CHAPTERS[3]}),ground=q.spawnMonster('mob',1,46);
   fly.hp=ground.hp=10000;q.updBuildings(.4);ok(fly.hp<10000&&ground.hp===10000,'anti-air targets flyers only');
   q.newGame(false);q.Game.gold=321;q.autoSave();const normal=localStorage.getItem('sst_save_auto');q.newGame(true);q.Game.state='paused';q.autoSave();
   ok(localStorage.getItem('sst_save_auto')===normal,'sandbox does not overwrite normal autosave');ok(!!localStorage.getItem('sst_save_sandbox_auto'),'sandbox has separate autosave');
   const hp=[q.player.hp,q.base.hp,q.gate.hp,q.vehicles[0].hp,q.squad[0].hp,q.buildings[0].hp];q.gate.open=false;
   q.playerDamage(99999);q.damageBase(99999);q.damageGate(99999);q.damageVehicle(q.vehicles[0],99999);q.damageSquad(q.squad[0],99999);q.damageBuilding(q.buildings[0],99999);
   ok(JSON.stringify(hp)===JSON.stringify([q.player.hp,q.base.hp,q.gate.hp,q.vehicles[0].hp,q.squad[0].hp,q.buildings[0].hp]),'all friendly health protected in sandbox');
   ok(q.Game.weapons.length===12&&q.vehicles.length===4&&q.squad.length===4,'sandbox weapons vehicles and allies available');
   ok(new Set(q.monsters.map(m=>m.ch.name)).size===10&&q.monsters.some(m=>m.kind==='boss')&&q.monsters.some(m=>m.kind==='miniboss')&&q.monsters.filter(m=>m.elite).length===6,'showcase contains ten species six elites and both boss ranks');
   q.Game.state='battle';q.sandboxSpawn('clear');const lv=q.Game.level;q.updWave(20);ok(q.Game.level===lv,'sandbox clearing does not advance normal campaign');
   q.applySave(JSON.parse(normal));ok(!q.Game.testMode&&q.Game.gold===321,'normal save exits sandbox');
   result.caveChecks='53 path positions and blocking wall';Object.keys(result).filter(k=>k.startsWith('cave passage')).forEach(k=>delete result[k]);return result;
 });
 await p.evaluate(()=>{const q=__gameQA;q.Game.testMode=false;q.Game.state='battle';q.clearEntities(false);q.Game.wave.spawned=q.Game.wave.total=0;q.Game.wave.done=false;q.updWave(0);q.newGame(true);});
 await p.waitForTimeout(1700);assert(await p.evaluate(()=>__gameQA.Game.state==='battle'&&__gameQA.Game.testMode&&document.getElementById('readyBtn').classList.contains('hidden')),'campaign victory callback cannot cross into a new sandbox run');
 await p.keyboard.press('KeyH');await p.locator('#sandboxPanel').waitFor({state:'visible'});
 await p.locator('#testSpecies').selectOption('9');await p.locator('#testRank').selectOption('boss');await p.locator('#testCount').selectOption('1');await p.locator('#test-selected').focus();await p.keyboard.press('Enter');
 assert(await p.evaluate(()=>__gameQA.monsters.some(m=>m.kind==='boss'&&m.ch===__gameQA.CHAPTERS[9])),'keyboard selects and spawns final boss');
 await p.keyboard.press('KeyH');await p.screenshot({path:path.join(captures,'test-panel.png')});await p.keyboard.press('Escape');
 await p.evaluate(()=>{const q=__gameQA;q.sandboxSpawn('clear');q.player.pos.set(0,0,25);q.player.mesh.position.copy(q.player.pos);q.Game.curWeapon='laser';for(let i=0;i<48;i++){const m=q.spawnMonster('mob',(i%8-3.5)*3,43+Math.floor(i/8)*4,{ch:q.CHAPTERS[i%10],elite:i%7===0});m.hp=m.maxHp=100000;}});
 await p.waitForTimeout(1800);assert(await p.evaluate(()=>__gameQA.monsters.length===48&&__gameQA.Game.testMode&&__gameQA.Game.state==='battle'),'no stale campaign callback clears sandbox');await p.keyboard.down('KeyJ');await p.evaluate(()=>__gameQA.startMeasure());
 for(let i=0;i<6;i++){await p.keyboard.down(i%2?'KeyA':'KeyD');await p.waitForTimeout(4800);await p.keyboard.up(i%2?'KeyA':'KeyD');await p.keyboard.press('KeyC');await p.waitForTimeout(200);}
 const movement=await p.evaluate(()=>({...__gameQA.endMeasure(),liveEnemies:__gameQA.monsters.filter(m=>!m.dead).length,state:__gameQA.Game.state}));assert(movement.liveEnemies===48&&movement.state==='battle','stress population remains alive throughout sampling');await p.keyboard.up('KeyJ');await p.screenshot({path:path.join(captures,'mixed-battle.png')});
 fs.writeFileSync(path.join(release,'fortress-verification.json'),JSON.stringify({checks,movement,errors,url,limitations:['Synthetic deterministic collision scenarios supplement real browser input','Desktop GPU measurements are not physical phone performance']},null,2));
 await b.close();assert(errors.length===0,errors.join('\n'));console.log(JSON.stringify({checks,movement:{fps:movement.averageFPS,p95:movement.p95Ms,over50ms:movement.over50ms},errors}));
})().catch(e=>{console.error(e);process.exit(1)});
