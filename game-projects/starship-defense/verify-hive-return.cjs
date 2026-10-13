// Exercise the shipped runtime: all three galleries, returning uphill, real input and saves.
const {chromium}=require(process.env.PW||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const url=process.env.GAME_URL||'http://127.0.0.1:8964/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-shallow-hive-v0.37.2/qa');
const baseline=process.env.BASELINE==='1';
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--mute-audio']});const results=[];
 try{for(const shape of ['desktop','landscape','portrait']){
  const touch=shape!=='desktop',viewport=touch?(shape==='portrait'?{width:390,height:844}:{width:844,height:390}):{width:1280,height:720};
  const context=await browser.newContext({viewport,hasTouch:touch,isMobile:touch,...(process.env.RECORD==='1'?{recordVideo:{dir:out,size:viewport}}:{})});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+(url.includes('?')?'&':'?')+'qa=1');let f=page;
  if(process.env.TOY_PREVIEW==='1'){await page.locator('iframe').first().waitFor();f=await(await page.locator('iframe').first().elementHandle()).contentFrame();await f.goto(f.url()+(f.url().includes('?')?'&':'?')+'qa=1');}
  await f.waitForFunction(()=>window.__gameQA&&window.__ccReady);await f.locator('#btnStart').click();
  const checks=await f.evaluate(()=>{
   const q=__gameQA;q.Game.state='paused';q.Game.pausedFrom='prep';q.clearEntities(true);q.Input.reset();q.Input.releaseMouseLook();q.CombatControls.set('fire','hold');q.setCameraView(0,false);
   const result={depth:-q.groundY(0,q.HIVE.z),routes:[],waves:[],minSpeed:1,maxSlope:0};
   const set=(x,z)=>{q.player.pos.set(x,q.groundY(x,z),z);q.player.mesh.position.copy(q.player.pos);q.player.vy=0;q.player.onGround=true;q.player.dead=false;q.player.inVehicle=null;q.player.stuckT=0;};
   const walk=points=>{let ticks=0,failed=null;for(const to of points){let tries=0;while(Math.hypot(to.x-q.player.pos.x,to.z-q.player.pos.z)>.45&&tries++<500){q.setCamYaw(Math.atan2(to.x-q.player.pos.x,to.z-q.player.pos.z));q.Input.keys={up:true};q.updPlayer(1/60);ticks++;}if(tries>=500){failed={to,at:q.player.pos.toArray()};break;}}q.Input.reset();return{seconds:ticks/60,failed,end:q.player.pos.toArray()};};
   for(const tunnel of q.hive.tunnels){
    const mouth=q.MOUTHS.find(m=>m.id===tunnel.id),points=tunnel.samples.filter((_,i)=>i%4===0).concat([{x:0,z:298}]);set(mouth.out.x,mouth.out.z);
    const inward=walk(points),outward=walk([...points].reverse().concat([mouth.out]));
    result.routes.push({id:tunnel.id,inward,outward,clearance:Math.min(...tunnel.samples.map(s=>q.hiveCeiling(s.x,s.z)-q.groundY(s.x,s.z)))});
    for(const s of tunnel.samples){result.minSpeed=Math.min(result.minSpeed,q.slopeSpeed(q.groundY,s.x,s.z,-s.tx,-s.tz));const gradient=(q.groundY(s.x+s.tx*.6,s.z+s.tz*.6)-q.groundY(s.x-s.tx*.6,s.z-s.tz*.6))/1.2;result.maxSlope=Math.max(result.maxSlope,Math.atan(Math.abs(gradient))*180/Math.PI);}
   }
   set(0,-28);for(const mouth of q.MOUTHS){q.clearEntities(true);const mo=q.spawnMonster(mouth.main?'boss':'mob',0,299,{quiet:true,route:q.hiveRoute(mouth.id)});for(let i=0;i<3600&&mo.route;i++)q.updMonsters(1/30);result.waves.push({id:mouth.id,exited:!mo.route,pos:mo.mesh.position.toArray()});}
   q.clearEntities(true);const saved=JSON.parse(JSON.stringify(q.saveData()));q.applySave(saved);result.savePreserved=q.Game.chapter===saved.chapter&&q.Game.level===saved.level&&q.Game.gold===saved.gold;
   // A legacy vertical coordinate settles onto the new floor without losing progress.
   set(0,298);q.player.pos.y=-22;q.updPlayer(1/60);result.legacyFloor=q.player.pos.y;
   set(0,233);q.setCameraView(0,false);q.setCamYaw(Math.PI);q.camState.init=false;q.updCamera(1);q.renderer.render(q.scene,q.camera);
   return result;
  });
  await page.screenshot({path:path.join(out,shape+'-return.png')});
  // Real keyboard / virtual joystick input during normal animation frames, after a QA position fixture.
  await f.evaluate(()=>{const q=__gameQA;q.Game.state='prep';q.player.invulnerable=100;q.setCamYaw(Math.PI);window.__returnStart={z:q.player.pos.z,t:performance.now()};});
  if(!touch)await page.keyboard.down('w');
  else {const rect=await f.locator('#joyBase').boundingBox();if(!rect)throw new Error('Joystick missing');await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();const rotated=shape==='portrait';await page.mouse.move(rect.x+rect.width/2+(rotated?rect.width*.34:0),rect.y+rect.height/2-(rotated?0:rect.height*.34));}
  await page.waitForTimeout(3000);if(!touch)await page.keyboard.up('w');else await page.mouse.up();
  checks.realInput=await f.evaluate(()=>{const q=__gameQA;const r={distance:__returnStart.z-q.player.pos.z,seconds:(performance.now()-__returnStart.t)/1000,y:q.player.pos.y};q.Game.state='paused';return r;});
  results.push({shape,viewport,checks,errors});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({baseline,physicalPhone:false,results},null,2));
  if(!baseline){assert.equal(checks.depth,4);assert.ok(checks.minSpeed>.95&&checks.maxSlope<3.6);assert.ok(checks.routes.every(r=>!r.inward.failed&&!r.outward.failed&&r.clearance>6));assert.ok(checks.waves.every(w=>w.exited));assert.ok(checks.savePreserved);assert.equal(checks.legacyFloor,-4);assert.ok(checks.realInput.distance>12,JSON.stringify(checks.realInput));assert.deepEqual(errors,[]);}
  console.log(JSON.stringify({shape,checks,errors}));await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
