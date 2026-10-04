// Regresses the player flow: demolish several facilities, then return to building.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8890/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-build-return-v0.17.4');
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});const results=[];
try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:915,height:412}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);let game=page;
 if(process.env.TOY_PREVIEW==='1'){await page.locator('iframe').first().waitFor();game=await (await page.locator('iframe').first().elementHandle()).contentFrame();}
 await game.goto(game.url()+(game.url().includes('?')?'&':'?')+'qa=1');await game.waitForFunction(()=>window.__gameQA&&window.__ccReady);
 await game.locator('#btnStart').click();await game.waitForFunction(()=>__gameQA.Game.state==='prep');
 await game.evaluate(()=>{const q=__gameQA;q.clearEntities(true);q.Game.gold=5000;q.CombatControls.set('fire','hold');q.player.pos.set(0,q.groundY(0,50),50);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;q.camState.init=false;for(const z of [56,60,64])q.placeBuilding('mgTurret',0,z,0);});
 const build=async()=>{if(mobile)await game.locator('#vL').tap();else await page.keyboard.press('KeyL');await game.waitForTimeout(320);};
 const fire=async()=>{if(mobile)await game.locator('#vJ').tap();else await page.keyboard.press('KeyJ');await game.waitForTimeout(120);};
 await build();await game.locator('#buildGrid .demolish').click();console.log('entered',mobile,await game.evaluate(()=>({mode:__gameQA.place.mode,state:__gameQA.Game.state,kind:__gameQA.place.kind})),errors);await game.waitForFunction(()=>__gameQA.place.mode==='demolish');
 for(let n=2;n>=0;n--){await fire();assert.equal(await game.evaluate(()=>__gameQA.buildings.length),n,'each confirmation demolishes one facility');}
 assert.equal(await game.evaluate(()=>__gameQA.Game.gold),5450,'three half-price refunds');
 await build();const reopened=await game.locator('#buildPanel').isVisible();
 if(process.env.BASELINE==='1'){results.push({mobile,reopened,errors});await context.close();continue;}
 assert.ok(reopened,'one build action reopens menu after repeated demolition');
 assert.equal(await game.evaluate(()=>__gameQA.place.kind),null);assert.equal(await game.locator('#placeBar').isVisible(),false);
 await game.locator('#buildGrid .shopItem').filter({hasText:'自动机枪塔'}).click();await game.waitForFunction(()=>__gameQA.place.mode==='build');
 await fire();assert.equal(await game.evaluate(()=>__gameQA.buildings.length),1,'can actually build again');assert.equal(await game.evaluate(()=>__gameQA.Game.gold),5150);
 await build();await game.locator('#buildGrid .shopItem').filter({hasText:'合金围墙'}).click();await build();
 assert.ok(await game.locator('#buildPanel').isVisible(),'same action returns from an unplaced ghost');assert.equal(await game.evaluate(()=>__gameQA.Game.gold),5150,'canceling does not charge');
 await game.locator('#buildGrid .demolish').click();await page.keyboard.press('Escape');await game.waitForTimeout(80);
 assert.equal(await game.evaluate(()=>__gameQA.place.kind),null);assert.equal(await game.evaluate(()=>__gameQA.Game.state),'prep','Esc exits without pausing');
 await build();await game.locator('#buildGrid .demolish').click();await game.locator('#placeCancel').click();assert.equal(await game.evaluate(()=>__gameQA.place.kind),null,'visible cancel button works on touch too');
 await build();await page.screenshot({path:path.join(out,mobile?'mobile-build-return.png':'desktop-build-return.png')});assert.deepEqual(errors,[]);
 results.push({mobile,reopened,demolished:3,refund:450,rebuilt:true,cancelButton:true,errors});await context.close();
}fs.writeFileSync(path.join(out,process.env.BASELINE==='1'?'baseline.json':'qa.json'),JSON.stringify({url,results},null,2));console.log(JSON.stringify(results));}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
