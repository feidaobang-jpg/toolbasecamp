// Current-build realtime browser capture. Playwright's video has no audio;
// record that gap explicitly instead of supplying an empty MediaRecorder stream.
// Test positioning/spawning is documented; no desktop or microphone is recorded.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const url=process.env.GAME_URL||'http://127.0.0.1:8917/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-tactics-v0.20.0/qa');
(async()=>{
 fs.mkdirSync(path.join(out,'captures'),{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:path.join(out,'captures'),size:{width:1280,height:720}}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__gameQA&&window.__ccReady);await page.locator('#btnStart').click();
  await page.evaluate(()=>{
   const q=__gameQA;q.newGame(true);q.sandboxSpawn('clear');q.sandboxWave.enabled=false;q.Game.level=5;
   q.player.pos.set(0,q.groundY(0,40),40);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.setCameraView(1,false);
   q.setSquadTask('follow');q.squad.forEach(s=>q.setSquadMemberTask(s.slot,[0,3].includes(s.slot)?'defend':'follow'));
   q.squad.forEach(s=>{const z=[0,3].includes(s.slot)?-18:37;s.mesh.position.set((s.slot-1.5)*5,q.groundY((s.slot-1.5)*5,z),z);});
   q.CombatControls.set('fire','auto');q.CombatControls.set('aim','auto');
   for(let i=0;i<18;i++){const m=q.spawnMonster('mob',(i%6-2.5)*4,62+Math.floor(i/6)*10,{ch:q.CHAPTERS[i%3===0?3:i%3===1?1:0],quiet:true});m.emerge=0;}
  });
  await page.waitForTimeout(500);await page.evaluate(()=>{__gameQA.Game.msgTimer=0;document.getElementById('msg').classList.add('hidden');});await page.screenshot({path:path.join(out,'captures','split-combat.png')});
  for(const code of ['KeyD','KeyA','KeyE','KeyQ']){await page.keyboard.down(code);await page.waitForTimeout(2200);await page.keyboard.up(code);}
  await page.locator('#tacticsButton').click();await page.waitForTimeout(500);await page.screenshot({path:path.join(out,'captures','split-orders.png')});await page.locator('#tacticsClose').click();
  await page.keyboard.press('KeyV');await page.keyboard.down('KeyE');await page.waitForTimeout(1800);await page.keyboard.up('KeyE');await page.keyboard.press('KeyV');await page.waitForTimeout(1500);
  const video=page.video();await context.close();
  const videoPath=path.join(out,'captures','tactics-realtime.webm');await video.saveAs(videoPath);await video.delete();
  const perfContext=await browser.newContext({viewport:{width:1280,height:720}}),perfPage=await perfContext.newPage();
  await perfPage.goto(url+'?qa=1');await perfPage.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  // Separate measurement, without recording or screenshots during the sample.
  await perfPage.evaluate(()=>{
   const q=__gameQA;q.newGame(true);q.sandboxSpawn('clear');q.sandboxWave.enabled=false;
   q.player.pos.set(0,0,40);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.setCameraView(1,false);
   for(let i=0;i<48;i++){const m=q.spawnMonster('mob',(i%8-3.5)*4,60+Math.floor(i/8)*5,{ch:q.CHAPTERS[i%3===0?3:i%3===1?1:0],quiet:true});m.hp=m.maxHp=1e7;m.emerge=0;}
  });
  await perfPage.waitForTimeout(1200);await perfPage.evaluate(()=>__gameQA.startMeasure());
  for(const code of ['KeyD','KeyE','KeyA','KeyQ']){await perfPage.keyboard.down(code);await perfPage.waitForTimeout(2200);await perfPage.keyboard.up(code);}
  const performance=await perfPage.evaluate(()=>__gameQA.endMeasure());
  fs.writeFileSync(path.join(out,'performance.json'),JSON.stringify({method:'headless Edge / ANGLE D3D11, 1280x720, 48 mixed bugs with fixed high HP to hold load, 4 squad, movement and view rotation; separate from capture',physical_phone:false,...performance,errors},null,2));
  fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify({capture_mode:'realtime-automation',audio:'none',hud:'included',gap:'需要在后续视频制作时补录带游戏音轨的母版；本次 WebGL captureStream 在本机返回空媒体，已用有效浏览器录像替代',test_shortcuts:'free test mode, fixed positions and nearby mixed-species spawns',file:'captures/tactics-realtime.webm',sha256:crypto.createHash('sha256').update(fs.readFileSync(videoPath)).digest('hex'),errors},null,2));
  console.log(JSON.stringify({video:videoPath,averageFPS:performance.averageFPS,p95Ms:performance.p95Ms,over50ms:performance.over50ms,drawCalls:performance.drawCalls,renderer:performance.renderer,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
