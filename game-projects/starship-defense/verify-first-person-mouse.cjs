// Real browser input verifies acquisition, free mouse aim, shooting and safe release.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PW||'D:/project/godot/absurd-3d-daily/node_modules/playwright');
const URL=process.env.GAME_URL||'http://127.0.0.1:8967/html/game/starship-defense/index.html';
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-fps-mouse-v0.36.2/qa');
fs.mkdirSync(OUT,{recursive:true});const results=[];
const pass=(name,data)=>{results.push({name,data});console.log('PASS',name,JSON.stringify(data??''));};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 const errors=[];
 const load=async({touch=false,keyboard=false,fallback=false,record=false}={})=>{
  const context=await browser.newContext({viewport:touch?{width:390,height:844}:{width:1280,height:720},hasTouch:touch,isMobile:touch,
   recordVideo:record?{dir:OUT,size:{width:1280,height:720}}:undefined});
  await context.addInitScript(({touch,keyboard,fallback})=>{
   localStorage.setItem('chongchao-person','first');
   localStorage.setItem('chongchao-device-mode',touch?'touch':'desktop');
   localStorage.setItem('chongchao-combat-controls-v1',JSON.stringify({input:keyboard?'keyboard':'mouse',aim:'manual',fire:'hold'}));
   if(fallback)Element.prototype.requestPointerLock=function(){return Promise.reject(new DOMException('Container disallows pointer lock','SecurityError'));};
  },{touch,keyboard,fallback});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(URL+(URL.includes('?')?'&':'?')+'qa=1');await page.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  return {context,page};
 };
 const locked=p=>p.evaluate(()=>document.pointerLockElement?.id||null);
 const state=p=>p.evaluate(()=>{const q=__gameQA;return {yaw:q.getCamYaw(),pitch:q.getCamPitch(),forward:q.camera.getWorldDirection(q.camera.position.clone()).toArray(),pos:q.player.pos.toArray(),gold:q.Game.gold,playing:q.Input.isPlaying(),fire:q.CombatControls.held,keys:q.Input.keys,state:q.Game.state};});
 const settle=p=>p.waitForTimeout(350);
 const unlock=p=>p.evaluate(()=>__gameQA.Input.releaseMouseLook());
 const mouseTurn=async(p,x=120,y=-50)=>{await p.mouse.move(640,360);await settle(p);const a=await state(p);await p.mouse.move(640+x,360+y,{steps:8});await settle(p);const b=await state(p);return {a,b};};
 try{
  const {context,page:p}=await load({record:true});
  await p.click('#btnStart');await p.waitForFunction(()=>document.pointerLockElement?.id==='c3d');
  await p.evaluate(()=>{const q=__gameQA;q.player.invulnerable=999;q.clearEntities(true);q.Game.testMode=true;q.sandboxWave.enabled=false;q.AudioSys.master.gain.value=0;q.player.pos.set(0,q.groundY(0,90),90);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);});
  pass('Starting in saved first-person captures the mouse',await locked(p));
  const turn=await mouseTurn(p),right=[-turn.a.forward[2],0,turn.a.forward[0]];
  const dot=turn.b.forward[0]*right[0]+turn.b.forward[2]*right[2];
  assert.ok(dot>.1);assert.ok(turn.b.pitch>turn.a.pitch+.05);assert.equal(turn.b.fire,false);
  pass('Moving the mouse without holding buttons aims right and up, without firing',{dot,pitch:turn.b.pitch-turn.a.pitch});
  await p.keyboard.down('KeyW');const before=await state(p);await p.mouse.move(950,340,{steps:10});await p.waitForTimeout(500);await p.keyboard.up('KeyW');const after=await state(p);
  assert.ok(Math.hypot(...after.pos.map((v,i)=>v-before.pos[i]))>.2);assert.notEqual(after.yaw,before.yaw);
  await p.mouse.down();assert.equal((await state(p)).fire,true);await p.mouse.up();assert.equal((await state(p)).fire,false);
  pass('Movement, free mouse aim and held left-button firing work together');
  await p.keyboard.press('Escape');await settle(p);assert.equal(await locked(p),null);assert.equal((await state(p)).state,'paused');assert.equal((await state(p)).fire,false);
  const paused=await state(p);await p.mouse.move(400,500);await settle(p);assert.equal((await state(p)).yaw,paused.yaw);
  pass('Escape releases the mouse, pauses and clears firing; unlocked movement does not turn the camera');
  await p.click('#btnResume');await p.waitForFunction(()=>document.pointerLockElement?.id==='c3d');
  const resumed=await state(p);assert.equal(resumed.gold,before.gold);assert.deepEqual(resumed.pos,after.pos);
  pass('Resume captures the mouse and preserves the current run');
  await p.keyboard.press('KeyO');await settle(p);assert.equal(await locked(p),null);assert.ok(await p.locator('#shopPanel').isVisible());
  await p.click('#shopClose');await p.waitForFunction(()=>document.pointerLockElement?.id==='c3d');
  pass('Shop releases the mouse; closing it returns to first-person control');
  await p.keyboard.press('KeyC');await settle(p);assert.equal(await locked(p),null);assert.equal((await state(p)).playing,true);
  pass('Changing to third-person releases the mouse without pausing');
   for(let i=0;i<5;i++){await p.keyboard.press('KeyC');await p.waitForTimeout(100);}await p.waitForFunction(()=>document.pointerLockElement?.id==='c3d');
  pass('Cycling back to first-person captures the mouse');
  const progress=await state(p);
  await p.evaluate(()=>__gameQA.setDeviceMode('touch'));await settle(p);assert.equal(await locked(p),null);
  const switched=await state(p);assert.equal(switched.gold,progress.gold);assert.deepEqual(switched.pos,progress.pos);assert.equal(switched.fire,false);
  await p.evaluate(()=>__gameQA.setDeviceMode('desktop'));await p.mouse.click(640,250);await p.waitForFunction(()=>document.pointerLockElement?.id==='c3d');assert.equal((await state(p)).fire,false);
  pass('Touch mode releases capture and preserves progress; a desktop recapture click does not fire');
  await p.screenshot({path:path.join(OUT,'desktop-aim.png')});
  await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await settle(p);assert.equal(await locked(p),null);assert.equal((await state(p)).state,'paused');
  await p.screenshot({path:path.join(OUT,'desktop-pause.png')});
  pass('Losing focus releases the mouse and pauses safely');
  const video=p.video();await context.close();await video.saveAs(path.join(OUT,'desktop-mouse.webm'));

  for(const mode of ['keyboard','touch','fallback']){
   const {context:c,page}=await load({keyboard:mode==='keyboard',touch:mode==='touch',fallback:mode==='fallback'});
   await page.click('#btnStart');await settle(page);assert.equal(await locked(page),null);
   await page.evaluate(()=>{__gameQA.player.invulnerable=999;__gameQA.AudioSys.master.gain.value=0;});
   if(mode==='keyboard'){
    const a=await state(page);await page.keyboard.down('KeyE');await page.waitForTimeout(300);await page.keyboard.up('KeyE');assert.notEqual((await state(page)).yaw,a.yaw);
   }else if(mode==='fallback'){
    const a=await state(page);await page.mouse.move(640,250);await page.mouse.down();await page.mouse.move(770,250,{steps:8});await page.mouse.up();await settle(page);assert.notEqual((await state(page)).yaw,a.yaw);
    assert.equal((await state(page)).fire,false);
   }else{
    const a=await state(page),cdp=await c.newCDPSession(page),box=await page.locator('#lookZone').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.5;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+70,id:1}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(page);assert.notEqual((await state(page)).yaw,a.yaw);
    await page.screenshot({path:path.join(OUT,'phone-portrait.png')});
   }
   assert.equal(await locked(page),null);pass(mode+' keeps its playable input without mouse capture');await c.close();
  }
  for(const mode of ['battlefield','resistance']){
   const {context:c,page}=await load();
   await page.click(mode==='battlefield'?'#btnVersus':'#btnResistance');await page.click(mode==='battlefield'?'[data-vs-ai="normal"]':'[data-chapter="0"]');
   await page.waitForFunction(()=>document.pointerLockElement?.id==='c3d');
   await page.evaluate(()=>{__gameQA.player.invulnerable=999;__gameQA.AudioSys.master.gain.value=0;});
   const t=await mouseTurn(page);assert.notEqual(t.a.yaw,t.b.yaw);assert.equal(t.b.fire,false);
   await page.mouse.click(640,360,{button:'right'});await settle(page);
   const sight=await page.evaluate(mode=>mode==='battlefield'?document.getElementById('vZ').getAttribute('aria-pressed')==='true':__gameQA.resistanceCampaign.state.aiming,mode);
   assert.equal(sight,true);
   await page.mouse.down();assert.equal((await state(page)).fire,true);await page.mouse.up();assert.equal((await state(page)).fire,false);
   pass(mode+' starts with captured free aim, right-button sight and held left-button fire');await c.close();
  }
  assert.deepEqual(errors,[]);pass('No browser runtime errors');
 }finally{await browser.close();fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({method:'Headless Edge, real mouse/keyboard input and CDP touch simulation; no physical phone',results,errors},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
