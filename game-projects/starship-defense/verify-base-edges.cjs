const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const url=process.env.GAME_URL||'http://127.0.0.1:8898/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-base-cleanup-v0.17.6');
const baseline=process.env.BASELINE==='1';
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
 try{for(const mobile of (baseline?[false]:[false,true])){
  const context=await browser.newContext({viewport:mobile?{width:915,height:412}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,...(process.env.RECORD==='1'&&!mobile?{recordVideo:{dir:out+'/video',size:{width:1280,height:720}}}:{})});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);let f=page;
  if(process.env.TOY_PREVIEW==='1'){await page.locator('iframe').first().waitFor();f=await(await page.locator('iframe').first().elementHandle()).contentFrame();}
  await f.goto(f.url()+(f.url().includes('?')?'&':'?')+'qa=1');await f.waitForFunction(()=>window.__gameQA);await f.locator('#btnStart').click();
  await f.evaluate(()=>{const q=__gameQA;q.Game.state='paused';q.player.pos.set(-24,q.groundY(-24,-43),-43);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.camState.init=false;q.updCamera(1);q.renderer.render(q.scene,q.camera);});
  await page.screenshot({path:path.join(out,(baseline?'before-':'after-')+(mobile?'mobile':'desktop')+'.jpg')});
  const checks=await f.evaluate(()=>{
   const q=__gameQA;q.clearEntities(true);q.Game.state='paused';q.CombatControls.set('fire','hold');
   const reset=(x,z)=>{q.Input.reset();q.player.pos.set(x,q.groundY(x,z),z);q.player.vy=0;q.player.onGround=true;q.player.dead=false;q.player.inVehicle=null;q.player.stuckT=0;q.setCamYaw(0);};
   const run=(x,z,key,jump,seconds=1.3)=>{reset(x,z);q.Input.keys[key]=true;if(jump)q.Input.pressed.K=true;const start=q.player.pos.toArray(),trace=[];for(let i=0;i<seconds*120;i++){q.updPlayer(1/120);if(i%12===0)trace.push(q.player.pos.toArray());}q.Input.reset();return{start,end:q.player.pos.toArray(),landed:q.player.onGround,trace};};
   const tests={};
   tests.frontWalk=run(20,-11,'up',false);tests.frontJump=run(20,-11,'up',true);
   tests.innerWalk=run(-31,-39,'left',false);tests.rampSide=run(-21,-33,'left',true);
   tests.outerJump=run(37,-30,'left',true);tests.rearJump=run(0,-61,'down',true);
   tests.cliffAscent=run(20,-7,'down',true);tests.rampAscent=run(-24,-45,'up',false,3);
   q.placeBuilding('wall',0,44,0);tests.solidWall=run(0,40,'up',false,1);tests.lowWallJump=run(0,42.5,'up',true,1);q.clearEntities(true);
   tests.mapEdge=run(109,20,'left',true,1);tests.voidRecovery=run(109,20,'left',false,3);
   reset(0,-20);q.openShop();tests.shopVisible=!document.getElementById('shopPanel').classList.contains('hidden');q.closePanels();
   reset(-2,-32);q.player.hp=40;q.updPlayer(.1);tests.healing=q.player.hp>40;
   return tests;
  });
  fs.writeFileSync(path.join(out,(baseline?'before-':'')+(mobile?'mobile':'desktop')+'-checks.json'),JSON.stringify(checks,null,2));
  if(!baseline){
   for(const name of ['frontWalk','frontJump'])assert.ok(checks[name].end[2]>-5&&checks[name].end[1]<1,name+' must leave the open front edge');
   assert.ok(checks.innerWalk.end[0]>-24&&checks.innerWalk.end[1]<6,'inner edge must descend');
   assert.ok(checks.rampSide.end[0]>-17&&checks.rampSide.end[1]<6,'ramp side must descend');
   assert.ok(checks.outerJump.end[0]>40&&checks.outerJump.end[1]<1,'outer edge must descend');
   assert.ok(checks.rearJump.end[2]<-64,'rear edge must descend');
   assert.ok(checks.cliffAscent.end[2]>-10,'cannot climb a vertical wall from below');
   assert.ok(checks.rampAscent.end[1]>9,'normal ramp ascent remains usable');
   assert.ok(checks.solidWall.end[2]<=43,'walking cannot pass through a physical wall');
   assert.ok(checks.lowWallJump.end[2]>45,'jump can clear the waist-high wall');
   assert.ok(checks.mapEdge.end[0]>110,'map edge has no coordinate clamp');
   assert.ok(checks.voidRecovery.end[2]<0&&checks.voidRecovery.end[1]>=0,'falling outside map returns safely');
   assert.ok(checks.shopVisible&&checks.healing,'functional base facilities stay usable');
   // Real input: approach and jump off the cleared front platform.
   await f.evaluate(()=>{const q=__gameQA;q.Input.reset();q.player.pos.set(20,q.groundY(20,-12),-12);q.player.mesh.position.copy(q.player.pos);q.player.vy=0;q.player.onGround=true;q.Game.state='prep';q.setCamYaw(0);q.camState.init=false;});
   if(mobile){await f.locator('#vK').tap();const b=await f.locator('#joyBase').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2-45);}else{await page.keyboard.down('KeyW');await page.keyboard.press('Space');}
   await page.waitForTimeout(1400);if(mobile)await page.mouse.up();else await page.keyboard.up('KeyW');
   const actual=await f.evaluate(()=>({position:__gameQA.player.pos.toArray(),landed:__gameQA.player.onGround}));assert.ok(actual.position[2]>-7&&actual.position[1]<2,'real input crosses edge');checks.realInput=actual;
   await page.screenshot({path:path.join(out,(mobile?'mobile':'desktop')+'-landed.jpg')});
   if(mobile){await page.setViewportSize({width:412,height:915});await f.locator('#vK').tap();await page.waitForTimeout(120);assert.ok(await f.evaluate(()=>__gameQA.player.vy>0));await page.screenshot({path:path.join(out,'portrait-jump.jpg')});}
  }
  assert.deepEqual(errors,[]);results.push({mobile,checks,errors});await context.close();
 }
 fs.writeFileSync(path.join(out,baseline?'baseline.json':'qa.json'),JSON.stringify({url,baseline,method:'Synthetic physics regression plus real keyboard/touch jump in isolated browser contexts; mobile is viewport emulation.',results},null,2));
 console.log(JSON.stringify({baseline,results:results.map(r=>({mobile:r.mobile,errors:r.errors,front:r.checks.frontJump.end,solidWall:r.checks.solidWall.end}))}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
