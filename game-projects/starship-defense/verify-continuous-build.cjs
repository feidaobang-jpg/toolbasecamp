// Player input regression for repeated construction. QA teleports isolate clear sites.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8898/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-continuous-build-v0.17.5');
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
try{for(const mode of ['desktop','mobile','portrait']){
 const mobile=mode!=='desktop',viewport=mode==='portrait'?{width:412,height:915}:mobile?{width:915,height:412}:{width:1280,height:720};
 const context=await browser.newContext({viewport,hasTouch:mobile,isMobile:mobile,recordVideo:process.env.RECORD==='1'&&!mobile?{dir:out,size:viewport}:undefined});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);let game=page;
 if(process.env.TOY_PREVIEW==='1'){await page.locator('iframe').first().waitFor();game=await(await page.locator('iframe').first().elementHandle()).contentFrame();}
 await game.goto(game.url()+(game.url().includes('?')?'&':'?')+'qa=1');await game.waitForFunction(()=>window.__gameQA&&window.__ccReady);
 await game.locator('#btnStart').click();await game.waitForFunction(()=>__gameQA.Game.state==='prep');
 await game.evaluate(()=>{const q=__gameQA;q.clearEntities(true);q.Game.gold=1000;q.CombatControls.set('fire','hold');});
 const move=async x=>{await game.evaluate(x=>{const q=__gameQA;q.player.pos.set(x,q.groundY(x,50),50);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.camState.init=false;},x);await game.waitForTimeout(100);};
 const build=async()=>{if(mobile)await game.locator('#vL').tap();else await page.keyboard.press('KeyL');await game.locator('#buildPanel').waitFor({state:'visible'});await game.waitForTimeout(320);};
 const confirm=async()=>{if(mobile)await game.locator('#placeOk').tap();else await page.keyboard.press('KeyJ');await game.waitForTimeout(120);};
 await move(0);await build();await game.locator('#buildGrid .shopItem').filter({hasText:'自动机枪塔'}).click();
 for(let n=0;n<3;n++){
  await move(n*10);await confirm();
  assert.deepEqual(await game.evaluate(()=>({count:__gameQA.buildings.length,gold:__gameQA.Game.gold,kind:__gameQA.place.kind})),{count:n+1,gold:1000-(n+1)*300,kind:'mgTurret'});
  await confirm();assert.equal(await game.evaluate(()=>__gameQA.buildings.length),n+1,'same position cannot duplicate or charge');
 }
 await move(30);await confirm();assert.equal(await game.evaluate(()=>__gameQA.Game.gold),100,'insufficient funds do not charge');
 assert.match(await game.locator('#placeState').innerText(),/金币不足/);
 await page.screenshot({path:path.join(out,mode+'-continuous.png')});
 await build();await game.locator('#buildGrid .shopItem').filter({hasText:'合金围墙'}).click();await confirm();
 assert.equal(await game.evaluate(()=>__gameQA.Game.gold),0,'changing kind preserves correct price');
 await game.locator('#placeCancel').click();assert.equal(await game.evaluate(()=>__gameQA.place.kind),null);
 await game.evaluate(()=>{const q=__gameQA;q.Game.gold=1000;});await move(40);await build();await game.locator('#buildGrid .shopItem').filter({hasText:'自动机枪塔'}).click();
 await page.keyboard.press('Escape');await game.waitForTimeout(80);assert.equal(await game.evaluate(()=>__gameQA.place.kind),null);assert.equal(await game.evaluate(()=>__gameQA.Game.state),'prep');
 await build();await game.locator('#buildGrid .shopItem').filter({hasText:'自动机枪塔'}).click();
 if(mobile)await game.locator('#vO').tap();else await page.keyboard.press('KeyO');await game.locator('#shopPanel').waitFor({state:'visible'});assert.equal(await game.evaluate(()=>__gameQA.place.kind),null);await game.waitForTimeout(320);await game.locator('#shopClose').click();
 // Sandbox has the absolute 96-facility budget; campaign budgets are tested separately.
 await game.evaluate(()=>{const q=__gameQA;q.clearEntities(true);q.Game.testMode=true;for(let i=0;i<95;i++)q.placeBuilding('mgTurret',-90,-100,0);q.startPlacement('mgTurret',true);});
 await move(0);await confirm();assert.equal(await game.evaluate(()=>__gameQA.buildings.length),96);await move(10);await confirm();assert.equal(await game.evaluate(()=>__gameQA.buildings.length),96);assert.match(await game.locator('#placeState').innerText(),/96/);
 assert.deepEqual(errors,[]);results.push({mode,placements:3,overlapBlocked:true,fundsChecked:true,capChecked:true,cancel:true,switchKind:true,shop:true,errors});await context.close();
}fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify({url,results},null,2));console.log(JSON.stringify(results));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
