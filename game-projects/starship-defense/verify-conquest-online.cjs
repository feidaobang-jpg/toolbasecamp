// Real WebSocket rooms, host-authoritative equipment/capture/respawn and reconnect.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PW||'D:/project/godot/absurd-3d-daily/node_modules/playwright');
const URL=process.env.GAME_URL||'http://127.0.0.1:8907/html/game/starship-defense/index.html';
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-conquest-v0.32.0/qa');
fs.mkdirSync(OUT,{recursive:true});const results=[],errors=[];const pass=(name,data)=>{results.push({name,data});console.log('PASS',name,JSON.stringify(data??''));};
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const contexts=await Promise.all([1,2,3,4].map(()=>b.newContext({viewport:{width:1100,height:620}})));
 const [host,ally,foe,late]=await Promise.all(contexts.map(c=>c.newPage()));
 for(const [i,p] of [host,ally,foe,late].entries())p.on('pageerror',e=>errors.push(i+': '+e.message));
 async function ready(p,suffix=''){await p.goto(URL+'?qa=1&test=1'+suffix);await p.waitForFunction(()=>window.__gameQA&&window.__COOP_QA__&&window.__ccReady);}
 await ready(host);await host.click('#btnVersus');await host.click('#vsOnline');await host.selectOption('.coop-panel [data-field="capacity"]','4');await host.selectOption('.coop-panel [data-field="vsTeam"]','blue');await host.click('.coop-panel [data-do="create"]');
 await host.waitForFunction(()=>__COOP_QA__.connection.room?.code);const code=await host.evaluate(()=>__COOP_QA__.connection.room.code);
 for(const [p,team] of [[ally,'blue'],[foe,'red']]){await ready(p,'&coop='+code);await p.waitForFunction(()=>__COOP_QA__.connection.room);await p.selectOption('.coop-panel [data-field="vsTeam"]',team);await p.click('.coop-panel [data-do="ready"]');}
 await host.waitForFunction(()=>__COOP_QA__.connection.room.players.length===3&&__COOP_QA__.connection.room.players.every(p=>p.ready));await host.click('.coop-panel [data-do="start"]');
 for(const p of [host,ally,foe])await p.waitForFunction(()=>__gameQA.versus.active&&__gameQA.versus.state.time>1);
 const roster=await Promise.all([host,ally,foe].map(p=>p.evaluate(()=>({pid:__gameQA.versus.state.localPid,role:__gameQA.versus.state.role,team:__gameQA.player.team,npc:__gameQA.versus.state.role==='guest'?__gameQA.versus.state.guestUnits.size:__gameQA.versus.state.units.length,vehicles:__gameQA.vehicles.length,weapons:__gameQA.Game.weapons}))));
 assert.deepEqual(roster.map(r=>r.pid),['blue0','blue1','red0']);assert.ok(roster.every(r=>r.vehicles===8&&r.npc===16));pass('Three clients see assigned teams, synchronized infantry, vehicles and fixed kits',roster);
 await ally.keyboard.press('KeyL');await ally.click('[data-vstab="units"]');await ally.locator('#vsGrid .vs-card').nth(3).click();await ally.click('#vsClose');
 await host.waitForFunction(()=>__gameQA.versus.heroOfSeat('blue1').bfKit==='engineer');await ally.waitForFunction(()=>__gameQA.player.bfKit==='engineer'&&__gameQA.Game.weapons.includes('rpg'));
 await ally.keyboard.press('Digit2');await host.waitForFunction(()=>__gameQA.versus.heroOfSeat('blue1').curWeapon==='rpg');
 await ally.keyboard.down('KeyJ');await ally.waitForTimeout(250);await ally.keyboard.up('KeyJ');await host.waitForFunction(()=>__gameQA.versus.heroOfSeat('blue1').bfAmmo.rpg===0);
 await ally.keyboard.press('KeyR');await host.waitForFunction(()=>!!__gameQA.versus.heroOfSeat('blue1').bfReload);await ally.waitForFunction(()=>!!__gameQA.player.bfReload);
 await ally.waitForFunction(()=>__gameQA.player.bfAmmo.rpg===1&&!__gameQA.player.bfReload);pass('Guest kit and weapon choices, shot and reload are accepted by host and synchronized');
 const sync=await host.evaluate(()=>{const q=__gameQA,v=q.versus,h=v.heroOfSeat('blue1'),p=v.state.points[0];p.owner='blue';p.progress=1;h.pos.set(p.x,0,p.z);h.invulnerable=100;v.team('red').tickets=137;return {tickets:137};});
 await ally.waitForFunction(()=>__gameQA.versus.state.points[0].owner==='blue'&&__gameQA.versus.team('red').tickets===137);
 await ally.keyboard.press('KeyL');await ally.locator('#vsGrid .vs-card').nth(1).click();await ally.click('#vsClose');await host.waitForFunction(()=>__gameQA.versus.seat('blue1').spawn==='A');
 await host.evaluate(()=>{const v=__gameQA.versus,h=v.heroOfSeat('blue1');h.invulnerable=0;v.damage(h,1000,'red','hero','red0');});
 await ally.waitForFunction(()=>__gameQA.player.dead);await ally.waitForFunction(()=>!__gameQA.player.dead,null,{timeout:15000});
 const respawn=await ally.evaluate(()=>({z:__gameQA.player.pos.z,x:__gameQA.player.pos.x,hp:__gameQA.player.maxHp,kit:__gameQA.player.bfKit}));assert.ok(Math.hypot(respawn.x+72,respawn.z-884)<15);assert.equal(respawn.hp,100);assert.equal(respawn.kit,'engineer');pass('Owned flag spawn, tickets and death/respawn synchronize across actual socket',respawn);
 // Guest attempts obsolete economic actions: these must not escape into campaign handlers.
 const before=await host.evaluate(()=>({gold:__gameQA.Game.gold,squad:__gameQA.squad.length,buildings:__gameQA.buildings.length}));
 await ally.evaluate(()=>{for(const command of [{kind:'buy',type:'vehicle',id:'tank'},{kind:'squadUpgrade',slot:0,gear:'weapon'},{kind:'upgrade',id:'plasma'},{kind:'build',id:'wall',x:0,z:900,yaw:0}])__COOP_QA__.connection.send({type:'command',command});});await host.waitForTimeout(300);
 const after=await host.evaluate(()=>({gold:__gameQA.Game.gold,squad:__gameQA.squad.length,buildings:__gameQA.buildings.length}));assert.deepEqual(after,before);pass('Obsolete buy/upgrade/build commands cannot mutate conquest or campaign economy');
 await ready(late,'&coop='+code);await late.waitForFunction(()=>__gameQA.versus.active&&__gameQA.versus.state.localPid==='red1',null,{timeout:20000});await host.waitForFunction(()=>!__gameQA.versus.seat('red1').ai);
 await contexts[1].close();await host.waitForFunction(()=>__gameQA.versus.seat('blue1').ai==='normal',null,{timeout:15000});pass('Late join takes AI seat; disconnect hands seat back to AI');
 await host.evaluate(()=>{__gameQA.versus.team('red').tickets=0;__gameQA.versus.update(.05);});for(const p of [host,foe,late])await p.waitForSelector('#vsResult:not(.hidden)');
 const end=await Promise.all([host,foe,late].map(p=>p.textContent('#vsResultTitle')));assert.ok(end[0].includes('胜利')&&end[1].includes('失败')&&end[2].includes('失败'));await host.screenshot({path:path.join(OUT,'online-result.png')});pass('Ticket victory result reaches host and both enemy clients',end);
 assert.deepEqual(errors,[]);pass('No multiplayer browser errors');
}finally{await b.close();fs.writeFileSync(path.join(OUT,'online-results.json'),JSON.stringify({url:URL,at:new Date().toISOString(),results,errors},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
