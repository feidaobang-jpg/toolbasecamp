// Real browser input verifies editing without triggering game actions.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8893/html/game/starship-defense/index.html';
const out=path.join(__dirname,'media-kit/releases/web-touch-layout-v0.19.1/qa');fs.mkdirSync(out,{recursive:true});
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const results=[];
  try{
    const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,recordVideo:{dir:path.join(out,'captures'),size:{width:844,height:390}}});
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__ccReady&&window.__gameQA);
    await page.evaluate(()=>{__gameQA.newGame(false);__gameQA.setDeviceMode('touch');});
    const progress=await page.evaluate(()=>({chapter:__gameQA.Game.chapter,level:__gameQA.Game.level,hp:__gameQA.player.hp,gold:__gameQA.Game.gold}));
    const box=id=>page.locator('#'+id).boundingBox();
    const point=async(x,y)=>page.evaluate(({x,y})=>{const r=document.getElementById('stage').getBoundingClientRect(),s=r.width/960,rot=innerHeight>innerWidth;const scale=rot?r.height/960:s;return rot?{x:r.right-y*scale,y:r.top+x*scale}:{x:r.left+x*scale,y:r.top+y*scale};},{x,y});
    const drag=async(id,x,y)=>{const b=await box(id),p=await point(x,y);await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(p.x,p.y,{steps:12});await page.mouse.up();};
    await page.locator('#vP').click();await page.locator('#keysPause').click();await page.locator('#touchLayoutOpen').click();
    assert.equal(await page.evaluate(()=>__gameQA.Game.state),'paused');
    const before=await box('vJ');await drag('vJ',340,280);const dragged=await box('vJ');await page.keyboard.press('ArrowLeft');const after=await box('vJ');assert.ok(Math.abs(before.x-after.x)>80);assert.ok(after.x<dragged.x-3);
    await drag('joyBase',140,215);await page.keyboard.press('KeyU');
    assert.deepEqual(await page.evaluate(()=>({keys:__gameQA.Input.keys,look:__gameQA.Input.look,joy:__gameQA.Input.joy.active})),{keys:{},look:{yaw:0,pitch:0},joy:false});
    assert.deepEqual(await page.evaluate(()=>({chapter:__gameQA.Game.chapter,level:__gameQA.Game.level,hp:__gameQA.player.hp,gold:__gameQA.Game.gold})),progress);
    results.push('Mouse drag moves individual buttons and joystick; editing freezes progress and consumes game input');
    await page.screenshot({path:path.join(out,'captures/edit-landscape.png')});
    await page.locator('#touchLayoutSave').click();const saved=await page.evaluate(()=>localStorage.getItem('chongchao-touch-layout-v1'));assert.ok(JSON.parse(saved).vJ);
    await page.locator('#keysClose').click();await page.locator('#btnResume').click();
    await page.mouse.move(after.x+after.width/2,after.y+after.height/2);await page.mouse.down();assert.equal(await page.evaluate(()=>__gameQA.Input.keys.J),true);await page.mouse.up();assert.equal(await page.evaluate(()=>__gameQA.Input.keys.J),false);
    results.push('Saved position still fires and releases; returning from editing leaves no held input');
    await page.reload();await page.waitForFunction(()=>window.__ccReady);await page.evaluate(()=>{__gameQA.newGame(false);__gameQA.setDeviceMode('touch');});
    const reloaded=await box('vJ');assert.ok(Math.abs(reloaded.x-after.x)<2);
    await page.locator('#vP').click();await page.locator('#keysPause').click();await page.locator('#touchLayoutOpen').click();await drag('vJ',560,260);await page.locator('#touchLayoutCancel').click();
    assert.equal(await page.evaluate(()=>localStorage.getItem('chongchao-touch-layout-v1')),saved);
    results.push('Reload restores device layout; cancel discards draft');
    await page.locator('#touchLayoutOpen').click();await page.setViewportSize({width:390,height:844});await drag('vK',420,255);
    assert.ok(await page.evaluate(()=>{const e=document.getElementById('vK');return e.offsetLeft>330&&e.offsetLeft<460;}));
    await drag('vH',-100,-100);assert.ok(await page.evaluate(()=>{const e=document.getElementById('vH');return e.offsetLeft>=0&&e.offsetTop>=0;}));
    await page.screenshot({path:path.join(out,'captures/edit-portrait.png')});await page.locator('#touchLayoutSave').click();
    for(const size of [{width:667,height:375},{width:1280,height:720}]){
      await page.setViewportSize(size);assert.ok(await page.evaluate(()=>['vJ','vK','vH','joyBase'].every(id=>{const e=document.getElementById(id),s=document.getElementById('stage');return e.offsetLeft>=0&&e.offsetTop>=0&&e.offsetLeft+e.offsetWidth<=s.clientWidth+1&&e.offsetTop+e.offsetHeight<=s.clientHeight+1;})));
    }
    results.push('Rotated portrait drag uses logical coordinates; saved controls stay inside narrow and desktop viewports');
    await page.locator('#touchLayoutOpen').click();await page.locator('#touchLayoutReset').click();await page.locator('#touchLayoutCancel').click();assert.ok(JSON.parse(await page.evaluate(()=>localStorage.getItem('chongchao-touch-layout-v1'))).vK);
    await page.locator('#touchLayoutOpen').click();await page.locator('#touchLayoutReset').click();await page.locator('#touchLayoutSave').click();assert.deepEqual(JSON.parse(await page.evaluate(()=>localStorage.getItem('chongchao-touch-layout-v1'))),{});assert.equal(await page.locator('#vJ').evaluate(e=>e.style.left),'');
    results.push('Restore default can be cancelled or saved; preset CSS layout is retained');
    await page.locator('#keysClose').click();await page.locator('#btnResume').click();
    const state=await page.evaluate(()=>({chapter:__gameQA.Game.chapter,level:__gameQA.Game.level}));
    await page.evaluate(()=>{__gameQA.setDeviceMode('desktop');__gameQA.setDeviceMode('touch');__gameQA.setDeviceMode('auto');});
    assert.deepEqual(await page.evaluate(()=>({chapter:__gameQA.Game.chapter,level:__gameQA.Game.level})),state);
    await page.evaluate(()=>localStorage.setItem('chongchao-touch-layout-v1','{broken'));await page.reload();await page.waitForFunction(()=>window.__ccReady);
    assert.equal(await page.locator('#vJ').evaluate(e=>e.style.left),'');
    results.push('Device mode round trip keeps progress; corrupt storage falls back safely');
    await page.locator('#keysMenu').click();await page.locator('#touchLayoutOpen').click();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>__gameQA.touchLayout.active),false);
    results.push('Editor works from main menu with keyboard navigation and Escape cancellation');
    assert.deepEqual(errors,[]);await context.close();
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({url,method:'Headless Microsoft Edge; real mouse input, touch-capable viewport simulation; no physical-phone test',passed:results,errors},null,2));
    console.log(JSON.stringify({passed:results.length,checks:results},null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
