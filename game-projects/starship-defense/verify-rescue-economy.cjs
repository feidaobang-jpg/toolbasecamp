// Actual game functions in Edge; accelerated navigation/combat plus UI clicks.
// GAME_URL and QA_OUTPUT also allow the exact Toy preview package to be checked.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const url=process.env.GAME_URL||'http://127.0.0.1:8899/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-rescue-v0.18.0/qa');
const checks=[];
const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name} ${JSON.stringify(detail)}`);};
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{const p=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
await p.addInitScript(()=>{let seed=1827;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});
await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);
await p.evaluate(()=>{window.qaSetup=()=>{const q=__gameQA;q.newGame(false);q.clearEntities(false);for(const id of ['menuOver','menuPause'])document.getElementById(id).classList.add('hidden');q.Game.state='paused';q.Game.pausedFrom='prep';q.Game.squadAlert=0;q.Game.squadCount=4;
 for(let i=0;i<4;i++){q.squadGear(i).role=['gunner','assault','medic','engineer'][i];q.spawnSquad(i);}return q;};});
for(const mouth of ['W','C','E'])for(const direction of ['in','out']){
const row=await p.evaluate(({mouth,direction})=>{const q=qaSetup(),m=q.MOUTHS.find(m=>m.id===mouth),start=direction==='in'?m.out:{x:0,z:300},end=direction==='in'?{x:0,z:300}:m.out;
 q.player.pos.set(end.x,q.groundY(end.x,end.z),end.z);q.player.mesh.position.copy(q.player.pos);
 q.squad.forEach((s,i)=>s.mesh.position.set(start.x+(i-1.5),q.groundY(start.x+(i-1.5),start.z),start.z));
 for(let i=0;i<1500;i++)q.updSquad(1/30);
 return q.squad.map(s=>({slot:s.slot,pos:s.mesh.position.toArray(),gap:s.mesh.position.distanceTo(q.player.pos)}));},{mouth,direction});
check(`${mouth}洞四兵种${direction==='in'?'进入母巢':'返回洞外'}`,row.length===4&&row.every(s=>s.gap<12),row);
}
for(const kind of ['jeep','tank','mech'])for(const direction of ['in','out']){
const row=await p.evaluate(({kind,direction})=>{const q=qaSetup();for(const s of q.squad.splice(1))q.scene.remove(s.mesh);const v=q.spawnVehicle(kind),start=direction==='in'?{x:-68,z:175}:{x:0,z:300},end=direction==='in'?{x:0,z:300}:{x:68,z:175};
 v.mesh.position.set(start.x,q.groundY(start.x,start.z),start.z);q.boardSquadVehicle(q.squad[0],v);q.player.pos.set(end.x,q.groundY(end.x,end.z),end.z);q.player.mesh.position.copy(q.player.pos);
 for(let i=0;i<2400;i++)q.updSquad(1/30);
 return{pos:v.mesh.position.toArray(),gap:v.mesh.position.distanceTo(q.player.pos),safe:q.vehicleCanStand(v,v.mesh.position.x,v.mesh.position.z)};},{kind,direction});
check(`${kind}沿弯曲洞道${direction}`,row.gap<14&&row.safe,row);
}
let row=await p.evaluate(()=>{const q=qaSetup();for(const s of q.squad.splice(1))q.scene.remove(s.mesh);const v=q.spawnVehicle('heli');v.mesh.position.set(0,0,170);q.boardSquadVehicle(q.squad[0],v);q.player.pos.set(0,-22,300);q.player.mesh.position.copy(q.player.pos);for(let i=0;i<900;i++)q.updSquad(1/30);return{pos:v.mesh.position.toArray(),ceiling:q.hiveCeiling(v.mesh.position.x,v.mesh.position.z)};});
check('直升机在洞口待命，不追到洞顶',row.pos[2]<184,row);
row=await p.evaluate(()=>{const q=qaSetup();q.Game.squadGear.forEach(g=>{g.weapon=2;g.armor=1;});q.Game.vehiclesOwned=['tank'];q.squadGear(0).vehicle='tank';const v=q.spawnVehicle('tank');q.boardSquadVehicle(q.squad[0],v);v.hp=217;
 q.player.pos.set(0,q.groundY(0,250),250);q.player.mesh.position.copy(q.player.pos);q.squad.forEach((s,i)=>{s.hp=30+i;s.mesh.position.set(i*3,0,300);});
 const gold=q.Game.gold,health=q.squad.map(s=>s.hp),ok=q.recallUnits('squad'),positions=q.squad.map(s=>s.mesh.position.toArray()),second=q.recallUnits('squad');
 return{ok,second,positions,health:q.squad.map(s=>s.hp),healthBefore:health,vehicleHp:v.hp,gear:q.squadGear(0),driver:q.squad[0].vehicle?.kind||null,goldUnchanged:q.Game.gold===gold,safe:q.squad.every(s=>!q.collideWalls(s.mesh.position.x,s.mesh.position.z,.65)&&s.mesh.position.distanceTo(q.player.pos)<20)};});
check('洞顶/洞外队友集合落到同层安全空地，保留血量装备且不刷钱',row.ok&&!row.second&&row.safe&&JSON.stringify(row.health)===JSON.stringify(row.healthBefore)&&row.vehicleHp===217&&row.gear.vehicle==='tank'&&row.gear.weapon===2&&!row.driver&&row.goldUnchanged,row);
row=await p.evaluate(()=>{const q=qaSetup();q.player.pos.set(0,q.groundY(0,290),290);q.player.mesh.position.copy(q.player.pos);q.Game.vehiclesOwned=['jeep','tank','mech','heli'];const vs=q.Game.vehiclesOwned.map(k=>q.spawnVehicle(k));vs.forEach((v,i)=>{v.hp=50+i;v.mesh.position.set(i*2,0,300);});q.boardSquadVehicle(q.squad[0],vs[1]);const ok=q.recallUnits('vehicles');return{ok,vehicles:vs.map(v=>({kind:v.kind,hp:v.hp,pos:v.mesh.position.toArray(),safe:q.vehicleCanStand(v,v.mesh.position.x,v.mesh.position.z)})),driver:q.squad[0].vehicle===vs[1],cooldown:q.Game.rescueCooldown.vehicles};});
check('四类载具从洞顶救援到洞口，保留耐久和驾驶员',row.ok&&row.vehicles.every((v,i)=>v.safe&&v.pos[2]<184&&v.hp===50+i)&&row.driver&&row.cooldown===20,row);
row=await p.evaluate(()=>{const q=qaSetup();const v=q.spawnVehicle('tank');q.enterVehicle(v);const pos=v.mesh.position.toArray();q.recallUnits('vehicles');const same=JSON.stringify(pos)===JSON.stringify(v.mesh.position.toArray());q.player.dead=true;const dead=q.recallUnits('squad');q.player.dead=false;q.operations.start('depot');const started=!!q.operations.active,operation=q.recallUnits('squad');q.operations.clear();return{same,dead,operation,started};});
check('不移动玩家正在驾驶的车，阵亡/副本时不能召回',row.same&&!row.dead&&!row.operation&&row.started,row);
// Complete actual waves in miniature to verify once-only rewards, reload and chapter rollover.
row=await p.evaluate(()=>{const q=qaSetup();q.Game.chapter=1;q.Game.level=1;q.Game.hive={loop:1,chapter:1,killed:true,queen:0};q.Game.gold=0;
 const supply=q.queenSupply();q.levelWin();const first=q.Game.gold,level=q.Game.level;q.levelWin();const duplicate=q.Game.gold-first;
 const saved=JSON.parse(JSON.stringify(q.saveData()));q.applySave(saved);q.startPrep();q.Game.state='paused';q.Game.pausedFrom='prep';const killedAfterLoad=q.Game.hive.killed;q.levelWin();const afterLoad=q.Game.gold;
 q.Game.level=10;q.Game.wave.rewarded=false;q.levelWin();const chapter=q.Game.chapter;q.startPrep();q.Game.state='paused';q.Game.pausedFrom='prep';const reset=!q.Game.hive.killed;
 const economy=[];for(const c of [1,4,6,10]){q.Game.chapter=c;q.Game.loop=1;const stipend=q.queenSupply();let removed=0;for(let l=1;l<=10;l++){const n=Math.round(8+l*1.8+c*1.6);removed+=(n-Math.round(n*.65))*q.CHAPTERS[c-1].mob.gold;}economy.push({chapter:c,earlySupply:stipend*10,lastLevelSupply:stipend,estimatedRemovedNormalDrops:removed,excludes:'elites/bosses/guards'});}
 return{supply,first,level,duplicate,killedAfterLoad,afterLoad,chapter,reset,economy};});
check('母皇补给每关一次，读档保留，跨章重置',row.supply===140&&row.first===300&&row.level===2&&row.duplicate===0&&row.killedAfterLoad&&row.afterLoad===630&&row.chapter===2&&row.reset,row);
// No direct damage hooks during these fights: natural waves, AI and bullets.
const pressures=[];
for(const chapter of [1,4,6])for(const mode of ['empty','starter','squad']){
 const result=await p.evaluate(({chapter,mode})=>{const q=__gameQA;q.newGame(false);q.Game.chapter=chapter;q.Game.level=5;q.startPrep();q.base.maxHp=q.base.hp=Math.round(2000*(1+(chapter-1)*.1));
 if(mode==='empty')for(const bd of [...q.buildings])q.damageBuilding(bd,1e9);
 if(mode==='squad'){q.Game.squadCount=4;for(let i=0;i<4;i++){q.squadGear(i).role=['gunner','assault','medic','engineer'][i];q.spawnSquad(i);}q.setSquadTask('defend');}
 q.player.dead=true;q.startBattle();let time=0;for(let i=0;i<9000;i++){const dt=1/30;q.updMonsters(dt);q.updBullets(dt);q.updBuildings(dt);q.updGate(dt);q.updSquad(dt);if(q.Game.state==='battle')q.updWave(dt);time+=dt;if(q.Game.state==='over'||q.Game.level!==5)break;}
 const result={chapter,mode,time:Math.round(time),state:q.Game.state,level:q.Game.level,base:q.base.hp,remaining:q.monsters.filter(m=>!m.dead&&!m.home).length,stalled:q.monsters.filter(m=>!m.dead&&!m.home).slice(0,2).map(m=>({kind:m.kind,pos:m.mesh.position.toArray(),target:q.monsterTargets(m)?.kind,to:q.monsterTargets(m)?.pos.toArray(),route:!!m.route,fly:m.fly,nav:m.navPath?.length}))};q.Game.state='paused';return result;},{chapter,mode});pressures.push(result);
 check(`第${chapter}章${mode}防守压力有结果`,result.state==='over'||result.level===6,result);
}
row=await p.evaluate(()=>{const q=qaSetup();q.Game.state='battle';q.damageBase(10);q.updHUD(0);const alarm=document.getElementById('baseAlert').textContent;const before=q.base.hp;q.newGame(true);q.damageBase(1e9);const immune=q.base.hp>0;q.updHUD(0);q.Game.state='paused';return{alarm,before,immune,sandbox:document.getElementById('baseAlert').textContent};});
check('基地受袭有明确警报，自由测试仍无敌',row.alarm.includes('立即回防')&&row.immune&&row.sandbox.includes('无敌'),row);
// Click both rescue actions on desktop and two touch viewports, preserving progress.
for(const viewport of [{width:1280,height:720},{width:844,height:390},{width:390,height:844}]){
 await p.setViewportSize(viewport);await p.evaluate(()=>{const q=qaSetup();q.Game.chapter=3;q.Game.level=7;q.Game.gold=1234;q.Game.state='prep';q.setDeviceMode('touch');q.updHUD(0);q.togglePause();});
 await p.locator('#recallSquad').click();await p.locator('#rescueVehicles').click();
 const ui=await p.evaluate(()=>({text:document.getElementById('rescueStatus').textContent,chapter:__gameQA.Game.chapter,level:__gameQA.Game.level,gold:__gameQA.Game.gold,color:getComputedStyle(document.getElementById('recallSquad')).backgroundColor}));
 check(`菜单救援点击 ${viewport.width}×${viewport.height}`,ui.chapter===3&&ui.level===7&&ui.gold===1234&&ui.color==='rgb(37, 99, 235)',ui);
 await p.screenshot({path:path.join(out,`rescue-${viewport.width}x${viewport.height}.png`)});
}
check('无页面脚本异常',errors.length===0,errors);
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({at:new Date().toISOString(),url,method:'Edge accelerated game simulation and real UI clicks; no physical phone test',checks,pressures},null,2));
assert.ok(checks.every(c=>c.ok),checks.filter(c=>!c.ok).map(c=>c.name).join('; '));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
