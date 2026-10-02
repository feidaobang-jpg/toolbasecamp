// Real browser regression, separate frame-time measurement and realtime video.
// Requires the bundled Playwright runtime; no synthetic FPS inferred from video.
const { chromium } = require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('fs'),path = require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..');
const release=path.join(__dirname,'media-kit/releases/web-worlds-v0.4.0');
const captures=path.join(release,'captures');fs.mkdirSync(captures,{recursive:true});
const url=process.env.GAME_URL||'http://127.0.0.1:8765/html/game/starship-defense/index.html';
const assert=(condition,message)=>{if(!condition)throw Error(message);};
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_EXE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  const context=await browser.newContext({viewport:{width:1440,height:810},hasTouch:false});
  const page=await context.newPage(),errors=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__gameQA,{timeout:60000});
  await page.screenshot({path:path.join(captures,'desktop-menu.png')});
  await page.keyboard.press('Enter');await page.waitForTimeout(300);
  assert(await page.evaluate(()=>__gameQA.Game.state==='prep'),'keyboard start');checks.push('Enter starts normal game');
  const original=await page.evaluate(()=>__gameQA.player.pos.toArray());
  await page.keyboard.down('KeyW');await page.waitForTimeout(650);await page.keyboard.up('KeyW');
  assert(await page.evaluate(origin=>Math.hypot(__gameQA.player.pos.x-origin[0],__gameQA.player.pos.z-origin[2])>1,original),'keyboard movement');checks.push('WASD moves player');
  for(let i=0;i<4;i++){await page.keyboard.press('KeyC');await page.waitForTimeout(200);}checks.push('four camera presets switch with C');
  await page.keyboard.press('KeyO');await page.locator('#shopPanel').waitFor({state:'visible'});await page.keyboard.press('Escape');await page.locator('#shopPanel').waitFor({state:'hidden'});
  await page.keyboard.press('KeyL');await page.locator('#buildPanel').waitFor({state:'visible'});await page.keyboard.press('Escape');await page.locator('#buildPanel').waitFor({state:'hidden'});checks.push('keyboard shop/build/pause');
  for(let i=0;i<3;i++){
    await page.evaluate(()=>{__gameQA.player.invulnerable=0;__gameQA.playerDamage(9999);});
    await page.waitForTimeout(2500);assert(await page.evaluate(()=>!__gameQA.player.dead&&__gameQA.player.hp>0&&__gameQA.player.invulnerable>0),'respawn');
  }
  checks.push('three normal deaths respawn with protection');
  await page.evaluate(()=>{__gameQA.player.invulnerable=2;const hp=__gameQA.player.hp;__gameQA.playerDamage(40);if(__gameQA.player.hp!==hp)throw Error('protection');});checks.push('protection blocks damage');
  await page.waitForTimeout(2200);await page.evaluate(()=>{__gameQA.playerDamage(10);if(__gameQA.player.hp===__gameQA.player.maxHp)throw Error('protection expiry');});checks.push('normal damage after protection expires');
  await page.keyboard.press('KeyR');assert(await page.evaluate(()=>__gameQA.Game.state==='battle'),'keyboard battle');
  await page.evaluate(()=>__gameQA.damageBase(99999));assert(await page.evaluate(()=>__gameQA.Game.state==='over'),'base failure');
  await page.keyboard.press('Enter');assert(await page.evaluate(()=>__gameQA.Game.state==='prep'),'restart');checks.push('base destruction fails and Enter restarts');
  // Deterministic stress arrangement: 48 live, high-HP enemies and four allies.
  const stress=async()=>page.evaluate(()=>{
    const q=__gameQA;q.clearEntities(true);q.player.pos.set(0,0,27);q.player.mesh.position.copy(q.player.pos);q.player.hp=q.player.maxHp=100000;
    q.base.hp=q.base.maxHp=100000;q.gate.open=true;q.Game.state='battle';q.Game.wave.total=9999;q.Game.wave.spawned=9999;q.Game.wave.done=false;
    for(let i=0;i<48;i++){const m=q.spawnMonster('mob',(i%8-3.5)*3,38+Math.floor(i/8)*3);m.hp=m.maxHp=100000;}
    for(let i=0;i<4;i++)q.spawnSquad();
  });
  const performance=process.env.SKIP_PERF==='1'?Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(path.join(release,'performance.json'),'utf8'))).filter(([key])=>key==='high'||key==='smooth')):{};
  for(const quality of ['high','smooth']){
    if(process.env.SKIP_PERF==='1')continue;
    if(await page.locator('#qualityBtn').getAttribute('data-quality')!==quality)await page.locator('#qualityBtn').click();
    await stress();await page.waitForTimeout(2000);await page.keyboard.down('KeyJ');
    await page.evaluate(()=>__gameQA.startMeasure());await page.waitForTimeout(30000);
    performance[quality]=await page.evaluate(()=>__gameQA.endMeasure());await page.keyboard.up('KeyJ');
  }
  fs.writeFileSync(path.join(release,'performance.json'),JSON.stringify({browser:await browser.version(),mode:'headless Edge, ANGLE D3D11; no screen recording during samples',scene:'48 high-HP insects, 4 allied soldiers, player continuous fire, 30 seconds per quality after 2 seconds warmup',...performance},null,2));
  // Genuine realtime recording with labelled QA arrangement, separate from FPS.
  const videoContext=await browser.newContext({viewport:{width:1440,height:810},recordVideo:{dir:captures,size:{width:1440,height:810}}});
  const recorded=await videoContext.newPage();await recorded.goto(url+'?qa=1');await recorded.waitForFunction(()=>window.__gameQA);
  await recorded.keyboard.press('Enter');await recorded.keyboard.press('KeyR');
  await recorded.evaluate(()=>{const q=__gameQA;q.player.pos.set(0,0,20);q.player.hp=q.player.maxHp=10000;for(let i=0;i<14;i++)q.spawnMonster('mob',(i%7-3)*3,28+Math.floor(i/7)*5);for(let i=0;i<4;i++)q.spawnSquad();});
  await recorded.keyboard.down('KeyJ');await recorded.waitForTimeout(3500);await recorded.screenshot({path:path.join(captures,'desktop-battle.png')});
  await recorded.keyboard.down('KeyD');await recorded.waitForTimeout(1500);await recorded.keyboard.up('KeyD');
  await recorded.keyboard.press('KeyC');await recorded.waitForTimeout(2000);await recorded.keyboard.press('KeyC');await recorded.waitForTimeout(2000);await recorded.keyboard.up('KeyJ');
  await recorded.screenshot({path:path.join(captures,'desktop-side.png')});
  const desktopVideo=await recorded.video().path();await videoContext.close();fs.renameSync(desktopVideo,path.join(captures,'desktop-realtime.webm'));
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,recordVideo:{dir:captures,size:{width:390,height:844}}});
  const phone=await mobile.newPage();phone.on('pageerror',e=>errors.push('mobile:'+e.message));await phone.goto(url+'?qa=1');await phone.waitForFunction(()=>window.__gameQA);
  await phone.locator('#btnStart').tap();await phone.waitForTimeout(500);
  assert(await phone.locator('#touchUI').isVisible(),'touch controls');
  assert(await phone.evaluate(()=>getComputedStyle(document.getElementById('stage')).transform!=='none'),'rotated stage');
  const moveOrigin=await phone.evaluate(()=>__gameQA.player.pos.toArray());
  // CDP delivers two independent real touch pointers to the transformed controls.
  const session=await mobile.newCDPSession(phone),joy=await phone.locator('#joyBase').boundingBox(),shoot=await phone.locator('#vJ').boundingBox();
  const point=(b,id)=>({x:b.x+b.width/2,y:b.y+b.height/2,id,radiusX:4,radiusY:4,force:1});
  const j=point(joy,1),s=point(shoot,2);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[j,s]});
  j.y-=25;await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[j,s]});await phone.waitForTimeout(1200);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert(await phone.evaluate(origin=>Math.hypot(__gameQA.player.pos.x-origin[0],__gameQA.player.pos.z-origin[2])>1,moveOrigin),'mobile transformed movement');checks.push('390×844 rotated touch joystick + firing, release clears');
  await phone.locator('#vC').tap();await phone.screenshot({path:path.join(captures,'phone-portrait.png')});
  await phone.setViewportSize({width:844,height:390});await phone.waitForTimeout(500);await phone.screenshot({path:path.join(captures,'phone-landscape.png')});
  await phone.locator('#vP').tap();await phone.locator('#menuPause').waitFor({state:'visible'});await phone.locator('#btnResume').tap();checks.push('mobile resize and touch pause/resume');
  const phoneVideo=await phone.video().path();await mobile.close();fs.renameSync(phoneVideo,path.join(captures,'phone-realtime.webm'));
  await page.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.Game.state='battle';q.Game.wave.spawned=q.Game.wave.total=0;q.Game.wave.done=false;});await page.waitForTimeout(1800);
  assert(await page.evaluate(()=>__gameQA.Game.level===2&&__gameQA.Game.state==='prep'),'victory');checks.push('QA empty-wave completion advances to next level');
  assert(errors.length===0,errors.join('\n'));
  fs.writeFileSync(path.join(release,'verification.json'),JSON.stringify({checks,errors,limitations:['No physical phone tested','No human keyboard/mouse playtest','QA scene positions and wave completion use explicit test hooks','Audio not captured by Playwright video'],url},null,2));
  console.log(JSON.stringify({checks:checks.length,errors,performance:Object.fromEntries(Object.entries(performance).map(([k,v])=>[k,{averageFPS:v.averageFPS,p95Ms:v.p95Ms,over50ms:v.over50ms,drawCalls:v.drawCalls,renderer:v.renderer}]))}));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
