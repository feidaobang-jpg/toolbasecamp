// Synthetic maximum-budget load; browser viewport/CPU simulation is not phone hardware.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-defense-v0.21.0/qa/performance');
const url=process.env.GAME_URL||'http://127.0.0.1:8917/html/game/starship-defense/index.html';
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const results=[];
 try{for(const [mobile,throttle] of [[false,1],[true,1],[true,4]]){
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile});
  const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  if(throttle>1){const cdp=await context.newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:throttle});}
  for(const count of [64,96]){
   await p.evaluate(count=>{
    const q=__gameQA;q.newGame(true);q.clearEntities(true);q.sandboxWave.enabled=false;q.Game.state='battle';q.CombatControls.set('fire','hold');
    q.player.pos.set(0,q.groundY(0,35),35);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.setCameraView(1,false);
    const kinds=['mgTurret','cannonTurret','teslaTurret','sniperTurret','bunker','antiAir','cryoTurret','mortarTurret'];
    for(let i=0;i<count;i++)q.placeBuilding(kinds[i%kinds.length],(i%12-5.5)*8,-50+Math.floor(i/12)*12,0);
    for(let i=0;i<48;i++){const m=q.spawnMonster('mob',(i%8-3.5)*5,85+Math.floor(i/8)*6,{ch:q.CHAPTERS[i%10],quiet:true});m.hp=m.maxHp=1e7;m.emerge=0;}
    q.Game.squadCount=4;for(let i=0;i<4;i++)q.spawnSquad(i);
   },count);
   await p.waitForTimeout(1200);await p.evaluate(()=>__gameQA.startMeasure());
   await p.keyboard.down('KeyW');await p.keyboard.down('KeyE');await p.waitForTimeout(6500);await p.keyboard.up('KeyW');await p.keyboard.up('KeyE');
   const measurement=await p.evaluate(()=>{const q=__gameQA,m=q.endMeasure();delete m.raw;return {...m,buildings:q.buildings.length,enemies:q.monsters.length};});
   await p.screenshot({path:path.join(out,(mobile?'mobile':'desktop')+'-cpu'+throttle+'-'+count+'.jpg'),quality:88});
   assert.ok(measurement.samples>50);assert.equal(measurement.buildings,count);assert.deepEqual(errors,[]);
   results.push({mobileSimulation:mobile,cpuThrottle:throttle,count,measurement,errors});
   console.log(JSON.stringify({mobile,throttle,count,fps:measurement.averageFPS,p95:measurement.p95Ms,drawCalls:measurement.drawCalls,renderer:measurement.renderer}));
  }
  await context.close();
 }}finally{await browser.close();}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({method:'Headless Edge D3D11; 48 mixed insects, 4 squad, 64/96 mixed towers; continuous W movement + E turn for 6.5s, no recording during timing',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
