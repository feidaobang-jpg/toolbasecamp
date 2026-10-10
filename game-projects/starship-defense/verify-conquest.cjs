// Run with a local static server; QA mutations isolate rules, real inputs verify controls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PW||'D:/project/godot/absurd-3d-daily/node_modules/playwright');
const URL=process.env.GAME_URL||'http://127.0.0.1:8907/html/game/starship-defense/index.html';
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-conquest-v0.32.0/qa');
fs.mkdirSync(OUT,{recursive:true});const results=[],errors=[];
const pass=(name,data)=>{results.push({name,data});console.log('PASS',name,JSON.stringify(data??''));};
(async()=>{
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}}),p=await context.newPage();
 p.on('pageerror',e=>errors.push(e.message));
 await p.goto(URL+'?qa=1&test=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);
 const initial=await p.evaluate(()=>({weapons:Object.keys(__gameQA.WEAPONS),tank:__gameQA.VEHICLES.tank.hp}));
 await p.click('#btnVersus');await p.click('[data-vs-ai="normal"]');await p.waitForTimeout(500);
 let state=await p.evaluate(()=>{const q=__gameQA,v=q.versus;return {active:v.active,units:v.state.units.length,vehicles:q.vehicles.length,weapons:Object.keys(q.WEAPONS),hp:q.player.maxHp,flags:getComputedStyle(document.getElementById('bfFlags')).display,seat:v.seat('blue0'),level:q.Game.weaponLv};});
 assert.equal(state.units,16);assert.equal(state.vehicles,8);assert.equal(state.weapons.length,8);assert.equal(state.hp,100);assert.equal(state.flags,'flex');assert.equal(state.seat.gold,undefined);assert.equal(state.seat.xp,undefined);assert.deepEqual(state.level,{});pass('Conquest setup: 3 objectives, 16 infantry, 8 vehicles, fixed equipment; no economy/XP',state);
 // Actual keyboard firing, reload and aim.
 await p.keyboard.down('KeyJ');await p.waitForTimeout(600);await p.keyboard.up('KeyJ');
 const ammo=await p.evaluate(()=>__gameQA.player.bfAmmo.plasma);assert.ok(ammo<30&&ammo>0);
 await p.keyboard.press('KeyR');await p.waitForTimeout(100);assert.ok(await p.evaluate(()=>!!__gameQA.player.bfReload));
 await p.waitForFunction(()=>!__gameQA.player.bfReload);assert.equal(await p.evaluate(()=>__gameQA.player.bfAmmo.plasma),30);
 await p.keyboard.press('KeyZ');await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>__gameQA.getCamMode()),'first');
 assert.equal(await p.evaluate(()=>__gameQA.camera.fov),52);await p.screenshot({path:path.join(OUT,'first-person.png')});
 await p.keyboard.press('KeyZ');pass('Keyboard firing consumes magazine; R reloads; Z enters aimed first person',{ammo});
 // Every kit and its weapons: menu routes and real shots, including single-shot rocket reload.
 for(const [kit,index] of [['assault',0],['support',1],['medic',2],['engineer',3],['recon',4]]){
   await p.evaluate(()=>{const q=__gameQA;q.player.pos.set(0,0,767);q.player.invulnerable=30;q.versusTogglePanel('units');});
   await p.locator('#vsGrid .vs-card').nth(index).click();assert.equal(await p.evaluate(()=>__gameQA.player.bfKit),kit);
   await p.click('#vsClose');
   const weapons=await p.evaluate(()=>[...__gameQA.Game.weapons]);
   for(const id of weapons){await p.evaluate(id=>{__gameQA.selectWeapon(id);__gameQA.player.fireCd=0;},id);await p.keyboard.down('KeyJ');await p.waitForTimeout(120);await p.keyboard.up('KeyJ');
     const n=await p.evaluate(id=>({n:__gameQA.player.bfAmmo[id],mag:__gameQA.WEAPONS[id].mag,reload:!!__gameQA.player.bfReload}),id);assert.ok(n.n<n.mag||n.reload,`${kit}/${id} did not shoot`);
   }
 }
 pass('All 5 kits and 8 weapons selected through menu and fired with keyboard');
 await p.keyboard.press('KeyL');await p.keyboard.press('Tab');await p.keyboard.press('ArrowRight');const focus=await p.evaluate(()=>document.getElementById('vsPanel').contains(document.activeElement));assert.ok(focus);await p.keyboard.press('Escape');assert.ok(await p.locator('#vsPanel').evaluate(e=>e.classList.contains('hidden')));pass('Deployment panel supports Tab/arrows and Escape');
 // Isolated authoritative capture, contest, bleed, friendly fire, armor and respawn checks.
 const rules=await p.evaluate(()=>{
   const q=__gameQA;q.startVersusAI('normal',1);q.Game.state='paused';const v=q.versus,h=q.player,enemy=q.coopHumans.find(x=>x.team==='red');
   v.state.units.forEach(u=>u.dead=true);q.vehicles.forEach(x=>{x.bfAIStart=Infinity;x.bfDriver=null;});
   const point=v.state.points[0];h.pos.set(point.x,0,point.z);enemy.pos.set(0,0,1037);h.invulnerable=100;
   for(let i=0;i<210;i++)v.update(.05);const captured=point.owner;
   enemy.pos.copy(h.pos);const before=point.progress;v.update(.1);const contested=point.contested&&point.progress===before;
   enemy.pos.set(0,0,1037);v.state.points[1].owner='blue';v.state.points[1].progress=1;const tickets=v.team('red').tickets;for(let i=0;i<61;i++)v.update(.05);const bleed=tickets-v.team('red').tickets;
   const max=h.maxHp;h.invulnerable=0;v.damage(h,99,'blue','hero','blue0');const friendly=h.hp===max;
   const tank=q.vehicles.find(x=>x.kind==='tank'&&x.team==='red'),hp=tank.hp;v.damage(tank,100,'blue','hero','blue0');const rifleDamage=hp-tank.hp;v.damage(tank,100,'blue','hero','blue0',true);const rocketDamage=hp-rifleDamage-tank.hp;
   const blocked=v.chooseSpawn(h,'C')===false;v.chooseSpawn(h,'A');v.chooseKit(h,'engineer');const pending=v.seat('blue0').pendingKit;v.damage(h,1000,'red','hero','red0');const down=h.dead&&h.respawnT===8;
   for(let i=0;i<170;i++)q.versusSimStep(.05);const respawn={alive:!h.dead,kit:h.bfKit,hp:h.maxHp,distance:Math.hypot(h.pos.x-point.x,h.pos.z-point.z)};
   return {captured,contested,bleed,friendly,rifleDamage,rocketDamage,blocked,pending,down,respawn};
 });
 assert.equal(rules.captured,'blue');assert.ok(rules.contested&&rules.bleed>=2&&rules.friendly&&rules.blocked&&rules.down);assert.equal(rules.rifleDamage,2.5);assert.equal(rules.rocketDamage,100);assert.equal(rules.pending,'engineer');assert.ok(rules.respawn.alive&&rules.respawn.distance<12);assert.equal(rules.respawn.kit,'engineer');assert.equal(rules.respawn.hp,100);pass('Capture/contest/ticket bleed, armor, friendly fire, kit-on-respawn and owned spawn validation',rules);
 const support=await p.evaluate(()=>{const q=__gameQA,v=q.versus,h=q.player;h.pos.set(0,0,763);v.chooseKit(h,'medic');h.hp=40;const healed=v.support(h)&&h.hp===85;v.chooseKit(h,'engineer');const tank=q.vehicles.find(x=>x.kind==='tank'&&x.team==='blue');h.pos.copy(tank.mesh.position);tank.hp-=300;const hp=tank.hp;const repaired=v.support(h)&&tank.hp===hp+220;return {healed,repaired};});
 assert.ok(support.healed&&support.repaired);pass('Medic healing and engineer repair have actual effects',support);
 // Actual I key for all four vehicle classes, including helicopter ascent/descent.
 for(const kind of ['jeep','tank','mech','heli']){
   await p.evaluate(kind=>{const q=__gameQA;q.startVersusAI('normal',1);q.vehicles.forEach(v=>v.bfAIStart=Infinity);const v=q.vehicles.find(v=>v.team==='blue'&&v.kind===kind);q.player.pos.copy(v.mesh.position).add({x:0,y:0,z:-3});q.player.mesh.position.copy(q.player.pos);q.player.invulnerable=100;},kind);
   await p.keyboard.press('KeyI');await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>__gameQA.player.inVehicle?.kind),kind);
   await p.keyboard.down('KeyW');await p.waitForTimeout(200);await p.keyboard.up('KeyW');
   if(kind==='heli'){await p.keyboard.down('KeyK');await p.waitForTimeout(300);await p.keyboard.up('KeyK');assert.ok(await p.evaluate(()=>__gameQA.player.inVehicle.alt>1));await p.keyboard.down('KeyH');await p.waitForTimeout(400);await p.keyboard.up('KeyH');}
   await p.keyboard.press('KeyI');await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>__gameQA.player.inVehicle),null);
 }
 pass('Keyboard boarding, driving, dismounting all four vehicles; helicopter climb/descent');
 // Full match simulations prove that combat and navigation converge to a real victory.
 const matches=[];for(const size of [1,4]){await p.evaluate(size=>{__gameQA.startVersusSim('normal','normal',size);__gameQA.Game.state='paused';},size);
   for(let n=0;n<19;n++){if(await p.evaluate(()=>{for(let i=0;i<1000&&!__gameQA.versus.over;i++)__gameQA.versusSimStep(.05);return __gameQA.versus.over;}))break;}
   const r=await p.evaluate(()=>__gameQA.versus.state.result);assert.ok(r&&r.time<=901&&r.stats.blue.kills+r.stats.red.kills>0&&r.stats.blue.captures+r.stats.red.captures>0);matches.push(r);
 }pass('1v1 and 4v4 complete naturally with captures, casualties and ticket victory',matches.map(r=>({size:r.size,time:r.time,winner:r.winner,tickets:r.tickets})));
 // Touch layout, real mouse-operated touch buttons, and both directions of input-mode switching.
 await p.evaluate(()=>__gameQA.startVersusAI('normal',2));await p.keyboard.press('Escape');await p.locator('#menuPause [data-device-mode="touch"]').click();await p.click('#btnResume');
 for(const viewport of [{width:844,height:390},{width:390,height:844},{width:568,height:320}]){
   await p.setViewportSize(viewport);await p.waitForTimeout(100);
   const bounds=await p.evaluate(()=>{const ids=['vJ','vK','vU','vI','vR','vH','vZ','vC','vP','fullBtn'];return ids.map(id=>{const e=document.getElementById(id),r=e.getBoundingClientRect();return {id,visible:!!e.getClientRects().length,x:r.x,y:r.y,w:r.width,h:r.height};});});
   for(const r of bounds)assert.ok(r.visible&&r.x>=-1&&r.y>=-1&&r.x+r.w<=viewport.width+1&&r.y+r.h<=viewport.height+1,JSON.stringify(r));
   await p.screenshot({path:path.join(OUT,`touch-${viewport.width}x${viewport.height}.png`)});
 }
 await p.setViewportSize({width:844,height:390});const fireRect=await p.locator('#vJ').boundingBox();await p.mouse.move(fireRect.x+fireRect.width/2,fireRect.y+fireRect.height/2);await p.mouse.down();await p.waitForTimeout(300);await p.mouse.up();
 await p.locator('#vR').click();await p.waitForTimeout(50);assert.ok(await p.evaluate(()=>!!__gameQA.player.bfReload));
 await p.locator('#vZ').click();assert.equal(await p.evaluate(()=>__gameQA.getCamMode()),'first');
 await p.locator('#vL').click();await p.click('[data-vstab="units"]');await p.screenshot({path:path.join(OUT,'touch-deployment.png')});await p.click('#vsClose');
 const t=await p.evaluate(()=>__gameQA.versus.state.time);await p.click('#vP');await p.locator('#menuPause [data-device-mode="desktop"]').click();await p.click('#btnResume');assert.ok(await p.evaluate(t=>__gameQA.versus.state.time>=t,t));pass('Landscape/portrait/small viewport controls; touch reload/aim/deploy; desktop↔touch preserves match');
 // Return to survival restores all weapon/vehicle configuration and normal save mode.
 const restored=await p.evaluate(()=>{const q=__gameQA;q.exitVersus();q.newGame(false);return {weapons:Object.keys(q.WEAPONS),tank:q.VEHICLES.tank.hp,active:q.versus.active,state:q.Game.state,position:q.player.pos.z,style:!!q.player.mesh.userData.military};});
 assert.deepEqual(restored.weapons,initial.weapons);assert.equal(restored.tank,initial.tank);assert.ok(!restored.active&&!restored.style&&restored.position<200);pass('Campaign weapon/vehicle configs and character restored after leaving conquest',restored);
 await p.waitForTimeout(300);assert.deepEqual(errors,[]);pass('No browser script errors');
}finally{await browser.close();fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({url:URL,at:new Date().toISOString(),results,errors},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
