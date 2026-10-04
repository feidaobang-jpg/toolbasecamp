// Regression for the reported movement/menu interaction and winged wave bugs.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-input-flight-v0.17.10/local');
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:915,height:412}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,recordVideo:process.env.RECORD==='1'?{dir:out,size:mobile?{width:915,height:412}:{width:1280,height:720}}:undefined});
 const hostPage=await context.newPage(),errors=[];hostPage.on('pageerror',e=>errors.push(e.message));let page=hostPage;
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8898/html/game/starship-defense/index.html')+'?qa=1');
 if(process.env.TOY_PREVIEW==='1'){await hostPage.locator('iframe').first().waitFor();page=await(await hostPage.locator('iframe').first().elementHandle()).contentFrame();await page.goto(page.url()+(page.url().includes('?')?'&':'?')+'qa=1');}
 await page.waitForFunction(()=>window.__gameQA&&window.__ccReady);await page.locator('#btnStart').click();
 await page.evaluate(()=>{const q=__gameQA;q.clearEntities(true);q.Game.gold=5000;q.CombatControls.set('fire','hold');});
 const flight=await page.evaluate(()=>{const q=__gameQA,ch=q.CHAPTERS[3];
  const spawn=(x,z,opts={})=>{q.spawnMonster('mob',x,z,{ch,...opts});return q.monsters.at(-1);};
  const surface=spawn(50,190,{wild:true});
  const route=spawn(0,250,{route:[{x:0,z:250}]});
  const before={surfaceFly:surface.fly,routeWings:route.mesh.userData.toy.wings?.length||0};
  before.caveFly=route.fly;
  route.mesh.position.set(50,q.groundY(50,190),190);route.route=[{x:50,z:190}];q.updMonsters(.05);
  before.afterExitFly=route.fly;before.afterExitWings=route.mesh.userData.toy.wings?.length||0;
  q.player.pos.set(route.mesh.position.x,q.groundY(route.mesh.position.x,route.mesh.position.z),route.mesh.position.z);q.player.mesh.position.copy(q.player.pos);route.mesh.position.y=q.player.pos.y;route.atkCd=1;
  q.updMonsters(.05);before.stationaryTakeoff=route.mesh.position.y>q.player.pos.y;
  q.clearEntities(true);return before;});
 // Reproduces reset while a touch is held and lostpointercapture is delayed by a webview.
 // The second press must be accepted even before the old capture event arrives.
 const reset=await page.evaluate(()=>{const q=__gameQA,el=document.getElementById('vL');
  const capture=el.setPointerCapture,has=el.hasPointerCapture,release=el.releasePointerCapture;
  el.setPointerCapture=()=>{};el.hasPointerCapture=()=>true;el.releasePointerCapture=()=>{};
  try{el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:41,pointerType:'touch',bubbles:true,cancelable:true}));
   q.Input.reset();el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:42,pointerType:'touch',bubbles:true,cancelable:true}));
   const accepted=!!q.Input.pressed.L;el.dispatchEvent(new PointerEvent('pointerup',{pointerId:41,bubbles:true}));
   const staleReleaseIgnored=!!q.Input.keys.L;el.dispatchEvent(new PointerEvent('pointerup',{pointerId:42,bubbles:true}));q.Input.reset();return{accepted,staleReleaseIgnored};
  }finally{el.setPointerCapture=capture;el.hasPointerCapture=has;el.releasePointerCapture=release;}});
 const move=async x=>page.evaluate(x=>{const q=__gameQA;q.player.pos.set(x,q.groundY(x,50),50);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);},x);
 await move(0);await hostPage.keyboard.down('KeyW');await hostPage.keyboard.press('KeyL');await hostPage.keyboard.up('KeyW');
 await page.locator('#buildPanel').waitFor({state:'visible'});await page.waitForTimeout(350);
 await page.locator('#buildGrid .shopItem').filter({hasText:'自动机枪塔'}).click();await hostPage.keyboard.press('KeyJ');await page.waitForTimeout(120);
 const built=await page.evaluate(()=>__gameQA.buildings.length);assert.equal(built,1);
 await hostPage.keyboard.press('KeyO');await page.locator('#shopPanel').waitFor({state:'visible'});await page.locator('#shopClose').click();
 await move(12);await hostPage.keyboard.press('KeyL');await page.locator('#buildPanel').waitFor({state:'visible'});await page.waitForTimeout(350);
 await page.locator('#buildGrid .shopItem').filter({hasText:'合金围墙'}).click();await hostPage.keyboard.press('KeyJ');await page.waitForTimeout(120);
 assert.equal(await page.evaluate(()=>__gameQA.buildings.length),2);assert.deepEqual(errors,[]);
 await hostPage.screenshot({path:path.join(out,mobile?'mobile.png':'desktop.png')});
 await page.evaluate(()=>{const q=__gameQA;q.cancelPlacement(true);q.clearEntities(true);q.Game.testMode=true;q.sandboxWave.enabled=false;q.Game.state='battle';q.player.invulnerable=999;q.player.pos.set(0,q.groundY(0,70),70);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);
  for(let i=0;i<12;i++){q.spawnMonster(i===11?'boss':'mob',(i%4-1.5)*7,86+Math.floor(i/4)*8,{ch:q.CHAPTERS[3],quiet:true});const m=q.monsters.at(-1);m.hp=m.maxHp=1e8;}});
 await page.waitForTimeout(1200);await hostPage.screenshot({path:path.join(out,mobile?'mobile-flight.png':'desktop-flight.png')});
 if(process.env.RECORD!=='1'){await page.evaluate(()=>__gameQA.startMeasure());await hostPage.keyboard.down('KeyE');await hostPage.keyboard.down('KeyD');await page.waitForTimeout(4000);await hostPage.keyboard.up('KeyD');await hostPage.keyboard.up('KeyE');
  const perf=await page.evaluate(()=>__gameQA.endMeasure());fs.writeFileSync(path.join(out,mobile?'mobile-performance.json':'desktop-performance.json'),JSON.stringify(perf,null,2));}
 else{await hostPage.keyboard.down('KeyE');await page.waitForTimeout(4000);await hostPage.keyboard.up('KeyE');}
 results.push({mobile,flight,reset,walkingBuild:true,switchShopAndBuild:true,errors});await context.close();
}fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
if(process.env.BASELINE!=='1')for(const r of results){assert.equal(r.flight.surfaceFly,true);assert.equal(r.flight.routeWings,2);assert.equal(r.flight.afterExitFly,true);assert.equal(r.flight.afterExitWings,2);assert.equal(r.flight.stationaryTakeoff,true);assert.equal(r.reset.accepted,true);assert.equal(r.reset.staleReleaseIgnored,true);}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
