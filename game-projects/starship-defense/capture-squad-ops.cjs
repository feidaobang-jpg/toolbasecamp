// Real-time media and separately sampled performance; QA staging is recorded explicitly.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'media-kit/releases/web-squad-ops-v0.10.0'),captures=path.join(root,'captures');
const url=process.env.GAME_URL||'http://127.0.0.1:8877/html/game/starship-defense/index.html';
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const runs=[];
 for(const count of [32,64]){
  const ctx=await b.newContext({viewport:{width:1280,height:720}});await ctx.addInitScript(()=>{let seed=814;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};localStorage.setItem('chongchao-quality','smooth');});
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  await p.evaluate(count=>{const q=__gameQA;q.newGame(true);q.clearEntities(true);q.sandboxWave.enabled=false;q.Game.state='battle';q.player.pos.set(0,q.groundY(0,45),45);q.player.mesh.position.copy(q.player.pos);q.Game.curWeapon='laser';for(let i=0;i<4;i++)q.spawnSquad();for(let i=0;i<count;i++)q.placeBuilding('mgTurret',-65+(i%8)*18,15+Math.floor(i/8)*10,0);for(let i=0;i<48;i++){const m=q.spawnMonster('mob',(i%8-3.5)*4,62+Math.floor(i/8)*5,{quiet:true});m.hp=m.maxHp=1e7;}},count);
  await p.waitForTimeout(1000);await p.keyboard.down('KeyJ');await p.evaluate(()=>__gameQA.startMeasure());
  for(let i=0;i<4;i++){const move=i%2?'KeyA':'KeyD',turn=i%2?'KeyQ':'KeyE';await p.keyboard.down(move);await p.keyboard.down(turn);await p.waitForTimeout(2500);await p.keyboard.up(move);await p.keyboard.up(turn);}
  const stats=await p.evaluate(()=>__gameQA.endMeasure());await p.keyboard.up('KeyJ');runs.push({facilities:count,live:await p.evaluate(()=>({buildings:__gameQA.buildings.length,bugs:__gameQA.monsters.length,squad:__gameQA.squad.length})),...stats,errors});await ctx.close();
 }
 fs.writeFileSync(path.join(root,'performance.json'),JSON.stringify({method:'Headless Edge on desktop GPU; smooth quality, 48 bugs + 4 squad, 10 seconds real keyboard strafing/firing/turning. No recording during measurements. Not a phone/S9 measurement.',runs},null,2));console.log(runs.map(r=>({facilities:r.facilities,fps:r.averageFPS,p95:r.p95Ms,over50:r.over50ms,draws:r.drawCalls,errors:r.errors})));
 const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:captures,size:{width:1280,height:720}}});
 await ctx.addInitScript(()=>{
  window.__captureAudio=null;const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(target,...args){const result=connect.call(this,target,...args);if(target===this.context.destination&&!window.__captureAudio){const sink=this.context.createMediaStreamDestination();connect.call(this,sink);const recorder=new MediaRecorder(sink.stream),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};window.__captureAudio={recorder,chunks};recorder.start();}return result;};
 });
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));const start=Date.now(),marks=[];const mark=text=>marks.push({seconds:(Date.now()-start)/1000,text});
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.keyboard.press('Enter');
 await p.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.Game.gold=8000;q.Game.squadCount=2;q.spawnSquad();q.spawnSquad();});
 await p.keyboard.press('KeyO');await p.locator('[data-t="squad"]').click();await p.locator('[data-squad-slot="0"][data-gear="weapon"]').click();await p.locator('[data-squad-slot="0"][data-gear="armor"]').click();await p.waitForTimeout(1000);mark('Individual squad equipment upgrades');await p.screenshot({path:path.join(captures,'squad-equipment.png')});await p.locator('#shopClose').click();
 await p.locator('#opsButton').click();await p.waitForTimeout(1000);await p.locator('#operationsList button').first().click();mark('Supply depot instance entered through the UI');
 await p.keyboard.down('KeyJ');await p.keyboard.down('KeyE');await p.waitForTimeout(2000);await p.keyboard.up('KeyE');await p.keyboard.down('KeyW');await p.waitForTimeout(2000);await p.keyboard.up('KeyW');await p.keyboard.press('KeyK');await p.waitForTimeout(2500);await p.keyboard.up('KeyJ');await p.screenshot({path:path.join(captures,'depot-gameplay.png')});
 await p.keyboard.press('Escape');await p.locator('#keysPause').click();await p.locator('[data-action="K"]').click();await p.keyboard.press('KeyZ');mark('Rebound dash to Z through the settings UI');await p.screenshot({path:path.join(captures,'key-settings.png')});await p.waitForTimeout(1500);
 const audio=await p.evaluate(async()=>{const a=window.__captureAudio;if(!a)return null;await new Promise(r=>{a.recorder.onstop=r;a.recorder.stop();});const blob=new Blob(a.chunks,{type:'audio/webm'});return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob);});});if(audio)fs.writeFileSync(path.join(captures,'game-audio.webm'),Buffer.from(audio,'base64'));
 const video=p.video();await ctx.close();fs.renameSync(await video.path(),path.join(captures,'squad-operations.webm'));await b.close();
 fs.writeFileSync(path.join(root,'capture.json'),JSON.stringify({capture_mode:'realtime-automation',staging:'Starting gold and two teammates provided through QA hooks; upgrades, mission entry, firing, moving and rebinding use real UI/keyboard inputs.',video:'captures/squad-operations.webm',audio:audio?'captures/game-audio.webm':null,marks,errors},null,2));
})();
