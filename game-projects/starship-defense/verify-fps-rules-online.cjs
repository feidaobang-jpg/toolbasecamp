// 战地联机：客人的手动瞄准由房主按朝向、俯仰还原。需要本地静态服务和本地联机大厅（ws://127.0.0.1:8792）。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PW||'D:/project/godot/absurd-3d-daily/node_modules/playwright');
const URL=process.env.GAME_URL||'http://127.0.0.1:8961/html/game/starship-defense/index.html';
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-fps-rules-v0.34.0/qa');
fs.mkdirSync(OUT,{recursive:true});const results=[],errors=[];const pass=(name,data)=>{results.push({name,data});console.log('PASS',name,JSON.stringify(data??''));};
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const [host,guest]=await Promise.all([1,2].map(async()=>(await b.newContext({viewport:{width:1100,height:620}})).newPage()));
 for(const [i,p] of [host,guest].entries())p.on('pageerror',e=>errors.push(i+': '+e.message));
 const ready=async(p,suffix='')=>{await p.goto(URL+'?qa=1&test=1'+suffix);await p.waitForFunction(()=>window.__gameQA&&window.__COOP_QA__&&window.__ccReady);};
 await ready(host);await host.click('#btnVersus');await host.click('#vsOnline');await host.selectOption('.coop-panel [data-field="capacity"]','4');await host.selectOption('.coop-panel [data-field="vsTeam"]','blue');await host.click('.coop-panel [data-do="create"]');
 await host.waitForFunction(()=>__COOP_QA__.connection.room?.code);const code=await host.evaluate(()=>__COOP_QA__.connection.room.code);
 await ready(guest,'&coop='+code);await guest.waitForFunction(()=>__COOP_QA__.connection.room);await guest.selectOption('.coop-panel [data-field="vsTeam"]','blue');await guest.click('.coop-panel [data-do="ready"]');
 await host.waitForFunction(()=>__COOP_QA__.connection.room.players.length===2&&__COOP_QA__.connection.room.players.every(p=>p.ready));await host.click('.coop-panel [data-do="start"]');
 for(const p of [host,guest])await p.waitForFunction(()=>__gameQA.versus.active&&__gameQA.versus.state.time>1);
 // 房主一侧摆靶场：客人的英雄站定，只留一个钉住的敌方步兵在它正前方 18 米。
 const arena=()=>host.evaluate(()=>{const q=__gameQA,v=q.versus,g=v.heroOfSeat('blue1');cancelAnimationFrame(window.__pin);
   v.state.units.forEach(u=>{u.dead=true;u.mesh.visible=false;});q.vehicles.forEach(x=>{x.bfAIStart=Infinity;x.bfDriver=null;});
   for(const o of q.coopHumans){o.invulnerable=1e6;if(o!==g){o.pos.set(-60,0,1037);o.mesh.position.copy(o.pos);}}
   const e=window.__target&&v.state.units.includes(window.__target)?window.__target:v.state.units.find(u=>u.team==='red');e.dead=false;e.hp=e.maxHp=1e6;e.mesh.visible=true;window.__target=e;
   g.bfReload=null;g.bfAmmo[g.curWeapon]=q.WEAPONS[g.curWeapon].mag;g.fireCd=0;
   const pin=()=>{g.pos.set(30,0,767);g.mesh.position.copy(g.pos);e.mesh.position.set(30,0,785);if(e.pos)e.pos.copy(e.mesh.position);e.cd=999;window.__pin=requestAnimationFrame(pin);};pin();
   return q.WEAPONS[g.curWeapon].mag;});
 const read=()=>host.evaluate(()=>{const q=__gameQA,g=q.versus.heroOfSeat('blue1');return {ammo:g.bfAmmo[g.curWeapon],reload:!!g.bfReload,hp:window.__target.hp};});
 const aim=(yaw,pitch)=>guest.evaluate(([yaw,pitch])=>{const q=__gameQA;q.setCamYaw(yaw);q.setCamPitch(pitch);},[yaw,pitch]);
 const burst=async()=>{await guest.keyboard.down('KeyJ');await guest.waitForTimeout(700);await guest.keyboard.up('KeyJ');await guest.waitForTimeout(350);return read();};
 const mag=await arena();await aim(0,0);await guest.waitForTimeout(1500);
 const view=await guest.evaluate(()=>{const q=__gameQA,i=q.starshipInput();return {mode:q.getCamMode(),settings:q.CombatControls.settings,sent:{pitch:i.pitch,look:i.look,fire:i.fire,autoFire:i.autoFire,autoAim:i.autoAim}};});
 const idle=await read();
 assert.equal(view.mode,'first');assert.equal(view.settings.fire,'auto');assert.equal(view.sent.fire,false);assert.equal(view.sent.look,0);assert.equal(idle.ammo,mag);assert.equal(idle.hp,1e6);
 pass('客人默认设置（自动攻击）下不按键 1.5 秒：房主那边不替它开火，客人画面固定第一人称',{view,idle});
 const hit=await burst();assert.ok(hit.ammo<mag||hit.reload);assert.ok(hit.hp<1e6);pass('客人对准后按住 J：房主出弹并命中',hit);
 await arena();await aim(.35,0);await guest.waitForTimeout(300);const turned=await burst();assert.ok(turned.ammo<mag||turned.reload);assert.equal(turned.hp,1e6);pass('客人准星偏开 20°：出弹但不命中，房主不替它锁定',turned);
 await arena();await aim(0,.5);await guest.waitForTimeout(300);const high=await burst();assert.ok(high.ammo<mag||high.reload);assert.equal(high.hp,1e6);pass('客人抬头约 29°：子弹从目标上方飞过，说明俯仰传到了房主',high);
 await arena();await aim(0,0);await guest.waitForTimeout(300);const again=await burst();assert.ok(again.hp<1e6);pass('客人放平准星后再次命中',again);
 await guest.screenshot({path:path.join(OUT,'online-guest-first-person.png')});
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(OUT,'results-online.json'),JSON.stringify({url:URL,date:new Date().toISOString(),results,errors},null,1));
 console.log('ALL PASS',results.length);
}finally{await b.close();}
})().catch(e=>{console.error('FAIL',e.message);console.error(errors);process.exit(1);});
