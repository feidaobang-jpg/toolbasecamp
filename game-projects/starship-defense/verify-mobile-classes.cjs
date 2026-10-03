const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const url=process.env.GAME_URL||'http://127.0.0.1:8877/html/game/starship-defense/index.html';
(async()=>{
const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{
 const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);
 await p.keyboard.press('KeyJ');await p.waitForFunction(()=>__gameQA.Game.state==='prep');
 assert.equal(await p.locator('#touchUI').isVisible(),false);
 await p.keyboard.press('KeyL');await p.locator('#buildPanel').waitFor({state:'visible'});
 let rows=await p.locator('#buildGrid .pr').allTextContents();let costs=rows.slice(0,-1).map(v=>Number(v.replace(/\D/g,'')));
 assert.deepEqual(costs,[100,300,650,700,1000,1100,1200]);
 await p.waitForTimeout(80);let before=await p.evaluate(()=>document.activeElement.textContent);
 await p.keyboard.press('KeyD');assert.notEqual(await p.evaluate(()=>document.activeElement.textContent),before);
 await p.keyboard.press('KeyK');assert.equal(await p.locator('#buildPanel').isVisible(),false);assert.equal(await p.evaluate(()=>__gameQA.Game.state),'prep');
 await p.keyboard.press('KeyO');await p.locator('#shopPanel').waitFor({state:'visible'});await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>__gameQA.Game.state),'prep');
 await p.keyboard.press('Escape');await p.locator('#menuPause').waitFor({state:'visible'});await p.keyboard.press('KeyK');assert.equal(await p.evaluate(()=>__gameQA.Game.state),'prep');
 console.log('PASS desktop hidden touch controls, WASD navigation, J start, K/Esc return, ascending building prices');
 const cls=await p.evaluate(()=>{const q=__gameQA;q.Game.state='paused';q.clearEntities(true);q.Game.testMode=false;q.Game.weaponLv={};q.Game.cls='gunner';q.player.hp=120;q.player.dead=false;q.player.shield=0;q.player.invulnerable=0;q.player.dashInv=0;q.playerDamage(20);const gun={hp:q.player.hp,dps:q.weaponDps('lmg')};q.Game.cls='rifle';q.player.pos.set(0,q.groundY(0,25),25);q.player.mesh.position.copy(q.player.pos);q.player.dashCd=0;q.Input.pressed.K=true;q.updPlayer(.01);const rifle={cd:q.player.dashCd,dps:q.weaponDps('shotgun')};q.Game.cls='medic';q.player.hp=40;q.player.maxHp=90;q.player.dashT=0;q.player.dashCd=0;q.Game.regen=false;q.updPlayer(1);q.Game.squadCount=1;q.spawnSquad();const s=q.squad[0];s.mesh.position.copy(q.player.pos);s.mesh.position.x+=5;s.hp=40;q.updSquad(1);const heal=s.hp;s.mesh.position.x=60;q.updSquad(1);return{gun,rifle,self:q.player.hp,ally:heal,far:s.hp};});
 assert.equal(cls.gun.hp,103);assert.equal(cls.gun.dps,125);assert.equal(cls.rifle.cd,1.8);assert.equal(cls.rifle.dps,161);assert.equal(cls.self,44);assert.equal(cls.ally,44);assert.equal(cls.far,44);
 console.log('PASS class damage, armour, dash cooldown, self heal and bounded ally aura',cls);
 const grenade=await p.evaluate(()=>{const q=__gameQA;q.Input.pressed.U=true;q.updPlayer(.02);return{mapped:q.keyBindings.action('KeyU'),arcs:q.bullets.filter(b=>b.arc).length,item:!!q.ITEMS.grenade};});assert.deepEqual(grenade,{mapped:null,arcs:0,item:false});
 console.log('PASS grenade removed from inputs, combat and inventory');
 // Use actual squad movement to approach, request, pass and close the door both ways.
 const gate=await p.evaluate(()=>{const q=__gameQA;q.clearEntities(true);q.Game.cls='gunner';q.Game.state='prep';q.Game.squadCount=1;q.Game.squadOrder='follow';q.spawnSquad();const s=q.squad[0];s.mesh.position.set(0,q.groundY(0,-22),-22);s.patrol={x:0,z:22};s.patrolTimer=100;q.player.pos.set(0,q.groundY(0,30),30);q.player.mesh.position.copy(q.player.pos);q.gate.open=false;q.gate.auto=false;q.gate.hold=0;let opened=false,min=Infinity,max=-Infinity;
 for(let i=0;i<1000;i++){q.updSquad(.02);q.updSmartGate(.02);opened ||= q.gate.open;min=Math.min(min,s.mesh.position.z);max=Math.max(max,s.mesh.position.z);}
 const out={opened,closed:!q.gate.open,z:s.mesh.position.z,min,max};q.setSquadTask('defend');s.patrol={x:0,z:-26};s.patrolTimer=100;let reopen=false;
 for(let i=0;i<1000;i++){q.updSquad(.02);q.updSmartGate(.02);reopen ||= q.gate.open;}
 return{out,back:{reopen,closed:!q.gate.open,z:s.mesh.position.z}};});
 assert.ok(gate.out.opened&&gate.out.closed&&gate.out.z>-8,JSON.stringify(gate));assert.ok(gate.back.reopen&&gate.back.closed&&gate.back.z<-23,JSON.stringify(gate));console.log('PASS teammates open, traverse and close the gate in both directions',gate);
 assert.deepEqual(errors,[]);
 const phone=await b.newContext({viewport:{width:393,height:720},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/110 Mobile Safari/537.36 BiliApp'});
 await phone.addInitScript(()=>{localStorage.setItem('chongchao-touch','off');Object.defineProperty(document,'fullscreenEnabled',{get:()=>false});});
 const m=await phone.newPage();m.on('pageerror',e=>errors.push(e.message));await m.goto(url+'?qa=1');await m.waitForFunction(()=>window.__gameQA&&window.__ccReady);
 assert.equal(await m.evaluate(()=>getComputedStyle(document.getElementById('stage')).transform.startsWith('matrix(0,')),true);
 assert.equal(await m.locator('#fullBtn').isVisible(),false);assert.equal(await m.locator('#touchBtn,#vU,#vQ,#vE').count(),0);
 assert.ok(Number(await m.locator('.classCard').first().evaluate(el=>getComputedStyle(el).fontSize.replace('px','')))>=16);
 await m.locator('#btnStart').tap();await m.waitForFunction(()=>__gameQA.Game.state==='prep');assert.equal(await m.locator('#touchUI').isVisible(),true);assert.equal(await m.locator('#vK').innerText(),'冲刺');
 const yaw=await m.evaluate(()=>__gameQA.getCamYaw());let box=await m.locator('#lookZone').boundingBox();await m.mouse.move(box.x+box.width*.45,box.y+box.height*.3);await m.mouse.down();await m.mouse.move(box.x+box.width*.45,box.y+box.height*.4,{steps:8});await m.mouse.up();assert.notEqual(await m.evaluate(()=>__gameQA.getCamYaw()),yaw);
 await m.setViewportSize({width:720,height:393});await m.waitForTimeout(150);assert.equal(await m.locator('#touchUI').isVisible(),true);
 if(process.env.CAPTURE_PATH)await m.screenshot({path:process.env.CAPTURE_PATH});
 console.log('PASS Bili-style phone rotates menu despite old hidden preference, hides unavailable fullscreen, swipe look, landscape resize');
 assert.deepEqual(errors,[]);
 await phone.close();
 const denied=await b.newPage();await denied.addInitScript(()=>{Object.defineProperty(document,'fullscreenEnabled',{get:()=>true});Element.prototype.requestFullscreen=()=>Promise.reject(Error('denied'));});await denied.goto(url+'?qa=1');await denied.waitForFunction(()=>window.__ccReady);await denied.locator('#fullBtn').click();assert.equal(await denied.locator('#fullBtn').isVisible(),false);console.log('PASS rejected fullscreen hides entry');
}finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
