// Browser rule boundaries use explicit QA positioning/time steps; driving,
// input, pause and performance use the real RAF loop. Mobile is emulation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PW||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url=process.env.GAME_URL||'http://127.0.0.1:8809/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-town-versus-v0.30.0/qa');fs.mkdirSync(out,{recursive:true});
const results=[],pass=(name,data)=>{results.push({name,pass:true,data});console.log('PASS',name,JSON.stringify(data??''));};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
 try{
  const p=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
  await p.evaluate(()=>{localStorage.setItem('sst_save_auto','{"untouched":"campaign"}');localStorage.setItem('chongchao-rv-breakout-v1','{"legacy":true}');});
  await p.click('#btnRV');await p.click('#rvStart');await p.waitForTimeout(1000);
  const initial=await p.evaluate(()=>{const q=__gameQA,r=q.rvBreakout;return {mobs:q.monsters.length,zombies:q.monsters.every(m=>m.rvZombie),states:q.monsters.map(m=>m.mode),vehicle:!!q.player.inVehicle,hp:r.state.rv.hp};});
  assert.equal(initial.mobs,36);assert.ok(initial.zombies&&initial.vehicle);assert.ok(initial.states.every(s=>s==='idle'));pass('开局36只分区僵尸，安全街道不主动遇袭',initial);
  const z=await p.evaluate(()=>__gameQA.rvBreakout.state.rv.mesh.position.z);await p.keyboard.down('KeyW');await p.waitForTimeout(2400);await p.keyboard.up('KeyW');
  const moved=await p.evaluate(z=>Math.abs(__gameQA.rvBreakout.state.rv.mesh.position.z-z),z);assert.ok(moved>10);pass('真实W驾驶自由前进',moved);
  // Flood fill using the actual vehicle collision radius proves each service is reachable.
  const routes=await p.evaluate(()=>{const r=__gameQA.rvBreakout,step=2,seen=new Set(),queue=[[0,1524]],key=(x,z)=>x+','+z;seen.add(key(0,1524));
   for(let i=0;i<queue.length;i++){const [x,z]=queue[i];for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]]){const nx=x+dx,nz=z+dz,k=key(nx,nz);if(!seen.has(k)&&!r.blocked(nx,nz,3)){seen.add(k);queue.push([nx,nz]);}}}
   return {cells:queue.length,sites:r.sites.map(n=>({name:n.name,reachable:queue.some(([x,z])=>Math.hypot(x-n.x,z-n.z)<4)})),zones:r.zones.map(n=>({name:n.name,reachable:queue.some(([x,z])=>Math.hypot(x-n.x,z-n.z)<8)})),oldGateFree:!r.blocked(0,1640,3),houseBlocked:r.blocked(-79,1558,3)};});
  assert.ok(routes.sites.every(s=>s.reachable));assert.ok(routes.zones.every(s=>s.reachable));assert.ok(routes.oldGateFree&&routes.houseBlocked);pass('所有设施/感染区可达，真实建筑碰撞，路口无关卡门槛',routes);
  // Stop RAF gameplay while inspecting boundaries; update calls below are explicit QA.
  const facilities=await p.evaluate(()=>{const q=__gameQA,r=q.rvBreakout,s=r.state;q.Game.state='pause';
   const park=id=>{const n=r.sites.find(n=>n.id===id);s.rv.mesh.position.set(n.x,0,n.z);q.player.pos.copy(s.rv.mesh.position);s.lastPos={x:n.x,z:n.z};s.moving=false;};
   const remote=r.job('repair');s.rv.hp=700;park('garage-south');const began=r.job('repair');r.update(6.1);const repaired=s.rv.hp;
   s.scrap=500;const gear=r.job('gear');r.update(5.1);const weapon=q.Game.weaponLv.lmg;
   const gun=r.job('gun');r.update(5.1);const dmg=s.rv.cfg.dmg;
   const money=s.scrap;r.job('armor');s.rv.mesh.position.z-=2;r.update(.1);const refunded=money===s.scrap&&!s.job;
   park('fuel-west');s.fuel=0;const fuel=r.job('fuel');r.update(3.1);const tank=s.fuel;
   const wrong=r.job('gun');park('market');const food=s.food,kits=q.Game.items.medkit;r.job('food');r.job('medkit');q.player.hp=30;r.eat();
   return {remote,began,repaired,gear,weapon,gun,dmg,refunded,fuel,tank,wrong,foodDelta:s.food-food,kitsDelta:q.Game.items.medkit-kits,person:q.player.hp,inVehicle:!!q.player.inVehicle};});
  assert.equal(facilities.remote,false);assert.ok(facilities.began&&facilities.gear&&facilities.gun&&facilities.refunded&&facilities.fuel&&facilities.inVehicle);assert.equal(facilities.repaired,1150);assert.equal(facilities.weapon,1);assert.equal(facilities.wrong,false);assert.equal(facilities.tank,40);assert.equal(facilities.kitsDelta,1);assert.equal(facilities.foodDelta,0);assert.equal(facilities.person,75);pass('车内维修改装加油、驶离退款、超市购物与食物恢复',facilities);
  const aggro=await p.evaluate(()=>{const q=__gameQA,r=q.rvBreakout,m=q.monsters.find(m=>m.zone===2),home=m.homePos.clone();
   q.player.inVehicle=r.state.rv;r.state.rv.mesh.position.set(home.x,0,home.z-12);q.player.pos.copy(r.state.rv.mesh.position);r.updateMonster(m,.1);const acquired=m.mode==='chase';
   const hp=r.state.rv.hp;r.state.rv.mesh.position.copy(m.mesh.position);r.state.rv.mesh.position.z-=3;r.updateMonster(m,1.2);const hurt=r.state.rv.hp<hp;
   r.state.rv.mesh.position.set(0,0,1525);q.player.pos.copy(r.state.rv.mesh.position);for(let i=0;i<250;i++)r.updateMonster(m,.1);
   const reset=m.mode==='idle'&&m.mesh.position.distanceTo(home)<.7;
   const wallLOS=r.visible({x:-79,z:1540},{x:-79,z:1575});return {acquired,hurt,reset,wallLOS,homeDistance:m.mesh.position.distanceTo(home)};});
  assert.ok(aggro.acquired&&aggro.hurt&&aggro.reset);assert.equal(aggro.wallLOS,false);pass('视距触发、近战伤害、脱战回位及房屋遮挡视线',aggro);
  const loot=await p.evaluate(()=>{const q=__gameQA,r=q.rvBreakout,s=r.state;q.exitVehicle();q.player.pos.set(-55,0,1585);q.player.mesh.position.copy(q.player.pos);const money=s.scrap;r.interact();r.update(4.1);r.interact();r.update(4.1);const one=s.scrap-money;
   const mo=q.monsters[0];q.damageMonster(mo,9999);r.save();const d=r.read(),coins=s.scrap;q.damageMonster(mo,9999);return {one,looted:d.looted[0],defeated:d.defeated.length,unique:coins===s.scrap,kits:d.medkits,food:d.food};});
  assert.equal(loot.one,110);assert.ok(loot.looted&&loot.unique);assert.equal(loot.defeated,1);pass('搜索和击杀奖励只结算一次，背包和清区状态入存档',loot);
  await p.evaluate(()=>{__gameQA.Game.state='battle';__gameQA.rvBreakout.panel();});await p.screenshot({path:path.join(out,'town-map-panel.png')});await p.click('#rvClose');
  await p.keyboard.press('Escape');const time=await p.evaluate(()=>__gameQA.rvBreakout.state.elapsed);await p.waitForTimeout(450);assert.equal(await p.evaluate(()=>__gameQA.rvBreakout.state.elapsed),time);await p.click('#btnQuit');
  const preserved=await p.evaluate(()=>({campaign:localStorage.getItem('sst_save_auto'),old:localStorage.getItem('chongchao-rv-breakout-v1'),active:__gameQA.rvBreakout.state.active}));assert.equal(preserved.campaign,'{"untouched":"campaign"}');assert.equal(preserved.old,'{"legacy":true}');assert.equal(preserved.active,false);pass('暂停冻结，退出保全基地与旧公路存档',preserved);
  await p.reload();await p.waitForFunction(()=>window.__ccReady&&window.__gameQA);await p.click('#btnRV');await p.click('#rvContinue');
  const resumed=await p.evaluate(()=>({looted:__gameQA.rvBreakout.state.looted[0],gun:__gameQA.rvBreakout.state.gun,gear:__gameQA.rvBreakout.state.gear,mobs:__gameQA.monsters.length}));assert.ok(resumed.looted);assert.equal(resumed.gun,1);assert.equal(resumed.gear,1);assert.equal(resumed.mobs,35);pass('刷新续玩保留改装、背包、一次性奖励与已击倒僵尸',resumed);
  await p.evaluate(()=>{const q=__gameQA,r=q.rvBreakout,n=r.sites.find(n=>n.kind==='exit');r.state.rv.mesh.position.set(n.x,0,n.z);q.player.pos.copy(r.state.rv.mesh.position);r.state.lastPos={x:n.x,z:n.z};r.panel();});await p.click('#rvEvacuate');await p.waitForSelector('#rvResult:not(.hidden)');assert.match(await p.textContent('#rvResultTitle'),/成功/);pass('未搜全也可自愿撤离');
  await p.click('#rvRetry');await p.evaluate(()=>__gameQA.damageVehicle(__gameQA.rvBreakout.state.rv,99999));await p.waitForSelector('#rvResult:not(.hidden)');assert.match(await p.textContent('#rvResultTitle'),/摧毁/);pass('房车毁坏失败与重玩');
  await p.click('#rvRetry');await p.keyboard.press('Escape');await p.click('#btnRestartLv');await p.waitForFunction(()=>__gameQA.AudioSys.ctx.state==='running');pass('暂停重开音频恢复');
  await p.evaluate(()=>{const q=__gameQA;q.setDeviceMode('touch');q.setDeviceMode('desktop');q.startMeasure();});await p.keyboard.down('KeyW');await p.keyboard.down('KeyE');await p.waitForTimeout(7000);await p.keyboard.up('KeyW');await p.keyboard.up('KeyE');
  const perf=await p.evaluate(()=>__gameQA.endMeasure());delete perf.raw;pass('城镇连续移动转镜头帧时间',perf);await p.screenshot({path:path.join(out,'town-driving.png')});
  await p.keyboard.press('Escape');await p.click('#btnQuit');await p.click('#btnVersus');await p.click('[data-vs-ai="normal"]');
  const waves=await p.evaluate(()=>{const q=__gameQA,v=q.versus,s=v.state;q.Game.state='pause';for(const t of s.seats)v.clearAI(t.pid);s.time=19.99;v.update(.02);
    const first=s.units.filter(u=>u.laneMinion),split=Object.fromEntries(['blue','red'].map(t=>[t,first.filter(u=>u.team===t).length])),ids=first.map(u=>u.id);const pop=v.popOf('blue0');
    s.time=44.99;v.update(.02);return {split,pop,next:s.units.filter(u=>u.laneMinion&&!ids.includes(u.id)).length,lanes:[...new Set(first.map(u=>u.side))],profiles:[...new Set(first.map(u=>u.prof))]};});
  assert.deepEqual(waves.split,{blue:9,red:9});assert.equal(waves.pop,0);assert.equal(waves.next,18);assert.equal(waves.lanes.length,3);pass('首波20秒、每25秒三路自动兵线且不占付费人口',waves);
  const growth=await p.evaluate(()=>{const q=__gameQA,v=q.versus,s=v.state,h=q.player,seat=v.seat('blue0');const before={gold:seat.gold,hp:h.maxHp};let count=0;
   for(const u of [...s.units].filter(u=>u.team==='red')){h.pos.copy(u.mesh.position);v.damage(u,9999,'blue','hero','blue0');count++;}
   const lv=seat.level,max=h.maxHp,xp=seat.xp,earned=seat.gold-before.gold;const snap=v.snapshot();h.dead=true;v.heroDown(h,'red','red0');h.reset(h.cls);v.respawned(h);
   const respawn={lv:seat.level,hp:h.hp,max:h.maxHp};return {before,count,lv,max,xp,earned,snapshot:snap.seats.find(s=>s.id==='blue0'),respawn};});
  assert.ok(growth.earned>0&&growth.lv>1&&growth.max>growth.before.hp);assert.equal(growth.respawn.lv,growth.lv);assert.equal(growth.respawn.hp,growth.max);assert.equal(growth.snapshot.lv,growth.lv);pass('击杀金币/经验、真实等级血量、阵亡保留等级及同步字段',growth);
  await p.evaluate(()=>{__gameQA.Game.state='battle';});await p.waitForTimeout(250);await p.screenshot({path:path.join(out,'versus-level.png')});
  await p.evaluate(()=>{__gameQA.exitVersus();__gameQA.startVersusAI('normal',4);});const fresh=await p.evaluate(()=>({seats:__gameQA.versus.state.seats.map(s=>s.level),heroes:__gameQA.coopHumans.length}));assert.equal(fresh.heroes,8);assert.ok(fresh.seats.every(l=>l===1));pass('4对4八座位独立等级，重开清零',fresh);
  const sync=await p.evaluate(()=>{const v=__gameQA.versus,s=v.state,d=v.snapshot();d.seats[0].lv=5;d.seats[0].xp=23;s.role='guest';v.apply(d);return {level:v.seat('blue0').level,xp:v.seat('blue0').xp,max:v.heroOfSeat('blue0').maxHp};});assert.equal(sync.level,5);assert.equal(sync.xp,23);assert.equal(sync.max,176);pass('客机同步等级经验与生命上限',sync);
  assert.deepEqual(errors,[]);await p.close();pass('桌面无页面脚本异常');
  const m=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'}),mobileErrors=[];m.on('pageerror',e=>mobileErrors.push(e.message));
  await m.goto(url+'?qa=1');await m.waitForFunction(()=>window.__ccReady&&window.__gameQA);await m.click('#btnRV');await m.click('#rvStart');
  assert.ok(await m.evaluate(()=>document.getElementById('stage').style.transform.includes('rotate(90deg)')));await m.tap('#vI');await m.waitForTimeout(200);assert.equal(await m.evaluate(()=>!!__gameQA.player.inVehicle),false);await m.tap('#vO');await m.waitForSelector('#rvPanel:not(.hidden)');await m.click('#rvClose');
  await m.screenshot({path:path.join(out,'town-mobile-portrait.png')});await m.setViewportSize({width:844,height:390});await m.waitForTimeout(300);await m.screenshot({path:path.join(out,'town-mobile-landscape.png')});
  const modes=await m.evaluate(()=>{const q=__gameQA,t=q.rvBreakout.state.elapsed;q.setDeviceMode('desktop');const a=!q.isTouch;q.setDeviceMode('touch');return {desktop:a,touch:q.isTouch,progress:t===q.rvBreakout.state.elapsed};});assert.ok(modes.desktop&&modes.touch&&modes.progress);assert.deepEqual(mobileErrors,[]);pass('手机横竖屏模拟、实际互动/设施按钮与双向操作切换',modes);await m.close();
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,limitations:['浏览器触屏/视口模拟，未做手机真机验收','规则边界有QA传送与加速时钟，不冒称完整人工试玩']},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);fs.writeFileSync(path.join(out,'failure.txt'),String(e.stack));process.exitCode=1;});
