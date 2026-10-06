const {chromium}=require('playwright');
const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');
let activeBrowser;
(async()=>{
  const url=process.env.LIVE_TEST_URL||'http://127.0.0.1:18765',out=path.resolve(__dirname,'../../media-kit/releases/live-v0.1.0/qa');await fs.mkdir(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  activeBrowser=browser;
  const context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/html/game/starship-defense/live.html');const frame=page.frameLocator('#game');await frame.locator('#btnStart').waitFor();
  await frame.locator('body').evaluate(()=>{const u=new URL(location.href);u.searchParams.set('qa','1');location.replace(u);});
  const f=page.frames().find(f=>f.url().includes('index.html'));await f.waitForFunction(()=>window.__ccReady&&window.__CHONGCHAO_LIVE_TEST__);
  await page.locator('#start').click();await f.waitForFunction(()=>window.__CHONGCHAO_LIVE_TEST__.session.running);await f.evaluate(()=>{const s=window.__CHONGCHAO_LIVE_TEST__.session;s.prepSeconds=1;s.roundSeconds=16;});
  await page.waitForTimeout(5000);
  const before=await f.evaluate(()=>{const q=window.__gameQA;return {state:q.Game.state,hp:q.base.hp,pos:[q.player.pos.x,q.player.pos.z],enemies:q.monsters.length,squad:q.squad.length,session:window.__CHONGCHAO_LIVE_TEST__.session.snapshot()};});console.log(JSON.stringify(before));assert.equal(before.state,'battle');assert.equal(before.squad,4);assert(before.enemies>0);
  const consolePage=await context.newPage();await consolePage.goto(url+'/html/game/starship-defense/live-console.html');await consolePage.getByRole('button',{name:'我操作 · AI辅助',exact:true}).click();await f.waitForFunction(()=>window.__CHONGCHAO_LIVE_TEST__.session.mode==='assist');
  const after=await f.evaluate(()=>({round:window.__CHONGCHAO_LIVE_TEST__.session.round,hp:window.__gameQA.base.hp}));assert.equal(after.round,1);assert(after.hp<=before.hp);
  const memory=await f.evaluate(()=>{const q=window.__gameQA;const start=q.renderer.info.memory.geometries;for(let n=0;n<4;n++){for(let i=0;i<25;i++)q.dropPickup(q.player.pos.clone(),'gold',1);q.renderer.render(q.scene,q.camera);q.updPickups(.01);}q.renderer.render(q.scene,q.camera);return{before:start,after:q.renderer.info.memory.geometries};});assert(memory.after<=memory.before+2,'拾取后GPU几何应释放');
  await consolePage.getByRole('button',{name:'模拟坦克',exact:true}).click();await f.waitForFunction(()=>window.__gameQA.vehicles.some(v=>v.kind==='tank'));
  await consolePage.getByRole('button',{name:'我主持 · AI操作',exact:true}).click();await f.waitForFunction(()=>window.__CHONGCHAO_LIVE_TEST__.session.mode==='host');
  await f.evaluate(()=>window.__gameQA.startMeasure());await page.waitForTimeout(6000);const perf=await f.evaluate(()=>window.__gameQA.endMeasure());delete perf.raw;
  await page.screenshot({path:path.join(out,'desktop-live.png')});await consolePage.screenshot({path:path.join(out,'console.png'),fullPage:true});
  const controllerChecks=await f.evaluate(()=>{const c=window.__CHONGCHAO_LIVE_TEST__,s=c.session;const a=c.event({id:'duplicate-test',type:'support',action:'shield'}),b=c.event({id:'duplicate-test',type:'support',action:'shield'});s.roundSeconds=.1;return {a,b};});assert(controllerChecks.a.ok);assert(!controllerChecks.b.ok);
  await f.waitForFunction(()=>window.__CHONGCHAO_LIVE_TEST__.session.phase==='result');await page.screenshot({path:path.join(out,'result.png')});
  await f.evaluate(()=>{window.__CHONGCHAO_LIVE_TEST__.session.resultSeconds=.1;});await f.waitForFunction(()=>window.__CHONGCHAO_LIVE_TEST__.session.round===2);
  await f.evaluate(()=>window.__gameQA.damageBase(999999));await f.waitForFunction(()=>window.__CHONGCHAO_LIVE_TEST__.session.phase==='result'&&!window.__CHONGCHAO_LIVE_TEST__.session.won);
  await f.waitForFunction(()=>window.__CHONGCHAO_LIVE_TEST__.session.round===3);
  await consolePage.getByRole('button',{name:'暂停互动',exact:true}).click();await f.waitForFunction(()=>!window.__CHONGCHAO_LIVE_TEST__.session.running);const elapsed=await f.evaluate(()=>window.__CHONGCHAO_LIVE_TEST__.session.elapsed);await page.waitForTimeout(500);assert.equal(await f.evaluate(()=>window.__CHONGCHAO_LIVE_TEST__.session.elapsed),elapsed);await consolePage.getByRole('button',{name:'继续',exact:true}).click();await f.waitForFunction(()=>window.__CHONGCHAO_LIVE_TEST__.session.running);
  // The normal campaign must still boot and keep its own save namespace.
  await page.close();await consolePage.close();const normal=await context.newPage();normal.on('pageerror',e=>errors.push(e.message));await normal.goto(url+'/html/game/starship-defense/index.html?qa=1');await normal.waitForFunction(()=>window.__ccReady);await normal.locator('#btnStart').click();await normal.waitForFunction(()=>window.__gameQA.Game.state==='prep');assert.equal(await normal.evaluate(()=>window.__CHONGCHAO_LIVE_TEST__),undefined);
  for(const viewport of [{width:844,height:390},{width:390,height:844}]){await normal.setViewportSize(viewport);await normal.evaluate(()=>window.__gameQA.setDeviceMode('touch'));await normal.waitForTimeout(300);await normal.screenshot({path:path.join(out,'normal-'+viewport.width+'.png')});}
  await fs.writeFile(path.join(out,'results.json'),JSON.stringify({before,after,perf,controllerChecks,errors,method:'Edge headless; accelerated clock for round transitions; desktop/mobile viewport simulation'},null,2));assert.deepEqual(errors,[]);await context.close();await browser.close();console.log(JSON.stringify({ok:true,out,perf}));
})().catch(async e=>{console.error(e);if(activeBrowser)await activeBrowser.close();process.exitCode=1;});
