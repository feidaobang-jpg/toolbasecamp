// Current Edge; feature-removal/viewport emulation is not a physical S9 test.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'media-kit/releases/web-squad-ops-v0.10.0');
const url=process.env.GAME_URL||'http://127.0.0.1:8877/html/game/starship-defense/index.html';
const checks=[];const check=(name,ok,detail)=>{checks.push({name,ok:!!ok,detail});console.log((ok?'PASS ':'FAIL ')+name+(ok?'':' '+JSON.stringify(detail)));};
const run=(p,fn,arg)=>p.evaluate(fn,arg);
(async()=>{
fs.mkdirSync(path.join(dir,'captures'),{recursive:true});
const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const ctx=await b.newContext({viewport:{width:1280,height:720}}),p=await ctx.newPage(),errors=[];
p.on('pageerror',e=>errors.push(e.message));await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);
await p.keyboard.press('Enter');await p.waitForTimeout(300);
let data=await run(p,()=>{const q=__gameQA;q.Game.state='paused';q.clearEntities(true);q.Game.squadCount=2;q.spawnSquad();q.spawnSquad();q.player.pos.set(0,0,20);q.player.mesh.position.copy(q.player.pos);q.squad[0].mesh.position.set(15,0,20);q.squad[1].mesh.position.set(25,0,20);q.player.hp=q.player.maxHp;q.squad[0].hp=30;q.dropPickup(q.squad[0].mesh.position,'heal',40);q.updPickups(.016);return{hp:q.squad[0].hp,pickups:q.pickups.length,player:q.player.hp};});
check('injured teammate consumes nearby medkit, player is untouched',data.hp===70&&data.pickups===0,data);
data=await run(p,()=>{const q=__gameQA;const gold=q.Game.gold;q.dropPickup(q.squad[0].mesh.position,'gold',37);q.updPickups(.016);return{gain:q.Game.gold-gold,remaining:q.pickups.length};});
check('teammate coins enter shared wallet exactly once',data.gain===37&&data.remaining===0,data);
data=await run(p,()=>{const q=__gameQA;for(const s of q.squad)s.hp=s.maxHp;q.dropPickup(q.squad[0].mesh.position,'heal',40);q.updPickups(.016);return q.pickups.length;});check('full-health teammate leaves medkit for later',data===1,data);
data=await run(p,()=>{const q=__gameQA;q.squad[0].hp=40;q.squad[0].mesh.position.x=10;const before=q.squad[0].mesh.position.x;q.updSquad(.2);return {before,after:q.squad[0].mesh.position.x};});check('teammate moves toward a nearby needed medkit',data.after>data.before,data);
data=await run(p,()=>{const q=__gameQA;q.Game.gold=1000;const hp=q.squad[0].maxHp;const a=q.upgradeSquad(0,'weapon'),c=q.upgradeSquad(0,'armor');const save=q.saveData();q.applySave(save);return{a,c,gold:q.Game.gold,gear:q.squadGear(0),maxHp:q.squad[0].maxHp,oldHp:hp};});
check('individual weapon and armour upgrades charge once and survive loading',data.a&&data.c&&data.gold===680&&data.gear.weapon===1&&data.gear.armor===1&&data.maxHp>data.oldHp,data);
data=await run(p,()=>{const q=__gameQA;q.Game.gold=0;const before=q.squadGear(0).weapon;const ok=q.upgradeSquad(0,'weapon');q.Game.gold=100000;for(let i=0;i<7;i++)q.upgradeSquad(0,'weapon');return{ok,before,cap:q.squadGear(0).weapon,gold:q.Game.gold};});check('equipment refuses insufficient gold and caps at Lv5',!data.ok&&data.cap===5,data);
data=await run(p,()=>{const q=__gameQA;q.clearEntities(true);q.Game.gold=100000;for(let i=0;i<64;i++)q.placeBuilding('mgTurret',-90+(i%8)*7,35+Math.floor(i/8)*9,0);const blocked=q.placementCheck(0,0,0,'mgTurret');const save=q.saveData();q.applySave(save);return{n:q.buildings.length,blocked,cap:q.MAX_BUILDINGS};});check('64 facilities persist, placement refuses the 65th',data.n===64&&String(JSON.stringify(data.blocked)).includes('64'),data);
// Real keyboard capture: conflicts, cancellation, persistence, and action routing.
await run(p,()=>{__gameQA.newGame(false);__gameQA.clearEntities(false);});await p.keyboard.press('Escape');await p.locator('#keysPause').click();
await p.locator('[data-action="K"]').click();await p.keyboard.press('KeyJ');check('conflicting binding explained without overwriting',await p.locator('#keyStatus').innerText().then(t=>t.includes('已用于')));
await p.keyboard.press('KeyZ');check('new binding saved and old primary released',await run(p,()=>__gameQA.keyBindings.action('KeyZ')==='K'&&__gameQA.keyBindings.action('KeyK')!== 'K'));
await p.locator('[data-action="I"]').click();await p.keyboard.press('Escape');check('Escape cancels capture and keeps panel open',await p.locator('#keyPanel').isVisible()&&await run(p,()=>__gameQA.keyBindings.code('I')==='KeyI'));
await p.locator('#keysClose').click();await p.locator('#btnResume').click();
await run(p,()=>{const q=__gameQA;q.clearEntities(false);q.player.pos.set(0,q.groundY(0,25),25);q.player.mesh.position.copy(q.player.pos);q.player.dashCd=0;});await p.keyboard.press('KeyZ');await p.waitForTimeout(90);
check('rebound key actually starts a dash',await run(p,()=>__gameQA.player.dashCd>0));
await p.reload();await p.waitForFunction(()=>window.__gameQA);check('binding survives reload',await run(p,()=>__gameQA.keyBindings.code('K')==='KeyZ'));
await p.locator('#keysMenu').click();await p.locator('#keysReset').click();check('restore defaults restores K and space aliases',await run(p,()=>__gameQA.keyBindings.action('KeyK')==='K'&&__gameQA.keyBindings.action('Space')==='K'));await p.locator('#keysClose').click();
await run(p,()=>{const q=__gameQA;q.newGame(false);q.Game.gold=1000;q.clearEntities(false);});
for(const id of ['depot','signal','hunter']){
 data=await run(p,id=>{const q=__gameQA;const before={level:q.Game.level,chapter:q.Game.chapter,gold:q.Game.gold};const started=q.operations.start(id);q.Game.state='paused';let bosses=0,outside;
 if(id==='signal'){q.player.pos.x+=40;q.operations.update(10);outside=q.operations.active.held;q.player.pos.x-=40;}
 for(let n=0;n<100&&q.operations.active;n++){q.operations.update(1);if(!q.operations.active)break;for(const m of [...q.monsters]){if(m.kind==='miniboss')bosses++;q.damageMonster(m,1e9);}q.updMonsters(.01);}
 return{started,ended:!q.operations.active,before,level:q.Game.level,chapter:q.Game.chapter,gold:q.Game.gold,completed:q.Game.opsCompleted[id],outside,bosses,state:q.Game.state};},id);
 check(id+' has working objective, completion reward and no campaign skip',data.started&&data.ended&&data.level===data.before.level&&data.chapter===data.before.chapter&&data.gold>data.before.gold&&data.completed==='1:1',data);
 if(id==='signal')check('holdout timer stops outside beacon area',data.outside===0,data);
 if(id==='hunter')check('elite nest spawns two minibosses',data.bosses===2,data);
}
data=await run(p,()=>{const q=__gameQA;q.operations.start('depot');q.Game.state='paused';q.player.dead=true;q.operations.update(.01);return{ended:!q.operations.active,state:q.Game.state,alive:!q.player.dead,level:q.Game.level};});check('death in a side mission safely returns to base',data.ended&&data.state==='prep'&&data.alive&&data.level===1,data);
data=await run(p,()=>{const q=__gameQA;q.operations.start('hunter');q.operations.finish(false);const save=q.saveData();q.applySave(save);return{level:q.Game.level,done:q.Game.opsCompleted,active:!!q.operations.active};});check('withdrawal and loading preserve side-mission completion stamps',!data.active&&Object.keys(data.done).length===3&&data.level===1,data);
await p.screenshot({path:path.join(dir,'captures/desktop.png')});
await p.keyboard.press('Escape');await p.locator('#opsPause').click();await p.screenshot({path:path.join(dir,'captures/operations.png')});
check('desktop has no script errors',errors.length===0,errors);await ctx.close();
// Old-API, no module-network dependency, blocked storage, mobile viewport and startup failure tests.
const old=await b.newContext({viewport:{width:980,height:520},userAgent:'Mozilla/5.0 (Linux; Android 8.1.0; BBK S9) AppleWebKit/537.36 Chrome/67.0.3396.87 Safari/537.36',hasTouch:true});
await old.addInitScript(()=>{Element.prototype.replaceChildren=undefined;Object.hasOwn=undefined;window.ResizeObserver=undefined;Object.defineProperty(window,'localStorage',{get(){throw new Error('storage disabled');}});});
const op=await old.newPage(),oe=[];op.on('pageerror',e=>oe.push(e.message));await op.route('**/*.module.js',r=>r.abort());await op.goto(url+'?qa=1');await op.waitForFunction(()=>window.__gameQA&&window.__ccReady);await op.locator('#btnStart').click();await op.waitForTimeout(250);
data=await op.evaluate(()=>{const r=document.getElementById('stage').getBoundingClientRect();return{state:__gameQA.Game.state,touch:__gameQA.isTouch,width:r.width,height:r.height};});check('tablet emulation boots without module requests or modern APIs/storage',data.state==='prep'&&data.touch&&Math.abs(data.width-980)<2&&oe.length===0,{...data,errors:oe});await op.screenshot({path:path.join(dir,'captures/tablet-compat.png')});await old.close();
const phone=await b.newContext({viewport:{width:393,height:692},isMobile:true,hasTouch:true});const mp=await phone.newPage();await mp.goto(url+'?qa=1');await mp.waitForFunction(()=>window.__gameQA);await mp.locator('#btnStart').tap();await mp.waitForTimeout(250);check('portrait phone rotates and starts with controls visible',await mp.evaluate(()=>getComputedStyle(document.getElementById('stage')).transform.includes('matrix(0,')&&!document.getElementById('touchUI').classList.contains('hidden')));await mp.locator('#vP').tap();await mp.locator('#opsPause').tap();check('phone can open side-mission list',await mp.locator('#operationsPanel').isVisible());await mp.screenshot({path:path.join(dir,'captures/phone-portrait.png')});await phone.close();
const fail=await b.newPage({viewport:{width:980,height:520}});await fail.route('**/game.compat.js*',r=>r.abort());await fail.goto(url);await fail.waitForTimeout(500);check('failed script download shows centred diagnostic and retry button',await fail.locator('#assetLoad').innerText().then(t=>t.includes('下载失败')&&t.includes('重新加载')));await fail.close();
await b.close();fs.writeFileSync(path.join(dir,'squad-ops.json'),JSON.stringify({url,method:'Edge desktop + emulated tablets/phones; QA hooks used for deterministic scenario setup',checks,passed:checks.filter(x=>x.ok).length,failed:checks.filter(x=>!x.ok)},null,2));if(checks.some(x=>!x.ok))process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
