// Run with Node and PLAYWRIGHT_MODULE pointing to the installed playwright package.
// Instrumentation is injected into the test response only; the published game has no QA globals.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const [label='after',out='render-results',url='http://127.0.0.1:8765/public/html/game/mario-3d/index.html']=process.argv.slice(2);
const executablePath=process.env.BROWSER_EXECUTABLE;
async function open(browser,viewport,recordVideo){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,...(recordVideo?{recordVideo:{dir:out,size:viewport}}:{})});
  const page=await context.newPage();
  await page.route('**/main.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+'\nwindow.__renderQA={view,world};'});});
  await page.addInitScript(()=>{Element.prototype.requestFullscreen=async()=>{throw new Error('QA: windowed comparison');};});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url);await page.waitForFunction(()=>window.__renderQA);
  await page.keyboard.press('Enter');await page.waitForTimeout(800);
  assert(await page.locator('#rotate').isHidden());
  return {context,page,errors};
}
async function sample(page,duration){
  return page.evaluate(ms=>new Promise(resolve=>{const q=window.__renderQA,v=q.view,g=v.renderer.getContext(),ext=g.getExtension('WEBGL_debug_renderer_info');let last=performance.now(),start=last;const frames=[],calls=[],triangles=[];
    function tick(now){frames.push(now-last);last=now;calls.push(v.renderer.info.render.calls);triangles.push(v.renderer.info.render.triangles);if(now-start<ms)return requestAnimationFrame(tick);
      frames.sort((a,b)=>a-b);const quantile=p=>frames[Math.min(frames.length-1,Math.floor(frames.length*p))];resolve({seconds:(now-start)/1000,frames:frames.length,fps:frames.length*1000/(now-start),median_ms:quantile(.5),p95_ms:quantile(.95),over50ms:frames.filter(t=>t>50).length,max_draw_calls:Math.max(...calls),max_triangles:Math.max(...triangles),renderer:ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),pixelRatio:v.renderer.getPixelRatio(),width:g.drawingBufferWidth,height:g.drawingBufferHeight,state:q.world.status,x:q.world.player.x,z:q.world.player.z});}
    requestAnimationFrame(tick);
  }),duration);
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,executablePath});const results={label,url,browser:browser.version(),mode:'headless, DPR 1, recording disabled during timings',scenarios:[]};
  try{
    for(const viewport of [{width:1280,height:720},{width:1600,height:1317}]){
      const {context,page,errors}=await open(browser,viewport,false);
      await page.keyboard.down('KeyS');await page.waitForTimeout(470);await page.keyboard.up('KeyS');
      await page.keyboard.down('KeyD');await page.keyboard.down('KeyJ');
      const moving=await sample(page,3500);
      await page.keyboard.up('KeyD');await page.keyboard.up('KeyJ');await page.keyboard.down('KeyE');
      const orbit=await sample(page,2500);await page.keyboard.up('KeyE');
      assert.deepEqual(errors,[]);results.scenarios.push({viewport,moving,orbit,errors});await context.close();
    }
    const {context,page,errors}=await open(browser,{width:1280,height:720},true);
    await page.screenshot({path:path.join(out,label+'-ground.png')});
    await page.keyboard.down('KeyE');await page.waitForTimeout(600);await page.keyboard.up('KeyE');
    await page.screenshot({path:path.join(out,label+'-orbit.png')});
    await page.keyboard.press('KeyC');await page.keyboard.down('KeyD');await page.waitForTimeout(1100);await page.keyboard.up('KeyD');
    await page.screenshot({path:path.join(out,label+'-moving.png')});assert.deepEqual(errors,[]);
    const video=page.video();await context.close();await video.saveAs(path.join(out,label+'-motion.webm'));await video.delete();
    fs.writeFileSync(path.join(out,label+'-performance.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
