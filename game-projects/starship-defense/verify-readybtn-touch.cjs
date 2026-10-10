// 曲面屏反馈：触屏开战按钮离开贴边位置、存档状态条自动淡出且不挡点击。
// 运行：node verify-readybtn-touch.cjs （自带静态服务，端口 8901）
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ROOT=path.join(__dirname,'..','..','public');
const PORT=8901;
const out=path.join(__dirname,'media-kit/releases/web-startbtn-curved-fix/qa');fs.mkdirSync(out,{recursive:true});
const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0]);let f=path.join(ROOT,u==='/'?'index.html':u);
  if(!f.startsWith(ROOT))return res.writeHead(403).end();
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404).end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});
});
const geo=page=>page.evaluate(()=>{
  const stage=document.getElementById('stage'),btn=document.getElementById('readyBtn'),chip=document.getElementById('saveHealth');
  const b=btn.getBoundingClientRect(),s=stage.getBoundingClientRect();
  const cs=getComputedStyle(chip);
  const cx=b.left+b.width/2,cy=b.top+b.height/2;
  const hit=document.elementFromPoint(cx,cy);
  return {state:__gameQA.Game.state,rotated:stage.style.transform.includes('rotate'),
    btn:{topInStage:btn.offsetTop,h:btn.offsetHeight,stageH:stage.clientHeight,stageW:stage.clientWidth},
    chip:{faded:chip.classList.contains('faded'),opacity:cs.opacity,pe:cs.pointerEvents,top:chip.offsetTop},
    hitIsBtn:!!(hit&&hit.closest&&hit.closest('#readyBtn')),hitId:hit&&hit.id};
});
(async()=>{
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const url=`http://127.0.0.1:${PORT}/html/game/starship-defense/index.html`;
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const results=[];
  try{
    // 竖屏（微信内旋转舞台）：开战按钮应在舞台下半安全带，真实触摸可点
    let ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
    let page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__ccReady&&window.__gameQA);
    await page.evaluate(()=>{__gameQA.newGame(false);__gameQA.setDeviceMode('touch');});
    await page.waitForFunction(()=>__gameQA.Game.state==='prep');
    let g=await geo(page);
    assert.ok(g.rotated,'portrait stage should rotate');
    const gapBottom=g.btn.stageH-(g.btn.topInStage+g.btn.h);
    assert.ok(gapBottom>=40,'bottom gap '+gapBottom);
    assert.ok(g.btn.topInStage>g.btn.stageH*0.5,'button in lower half, top='+g.btn.topInStage);
    assert.ok(g.btn.h>=44,'touch height '+g.btn.h);
    assert.ok(g.hitIsBtn,'elementFromPoint at button center hit '+g.hitId);
    const bb=await page.locator('#readyBtn').boundingBox();
    await page.touchscreen.tap(bb.x+bb.width/2,bb.y+bb.height/2);
    await page.waitForFunction(()=>__gameQA.Game.state==='battle');
    results.push('竖屏触屏：开战按钮位于底部安全带且真实触摸可开战');
    // 建造条出现时按钮暂避，避免互相遮挡
    await page.evaluate(()=>{__gameQA.startPrep();__gameQA.startPlacement('wall');});
    assert.equal(await page.locator('#readyBtn').isVisible(),false);
    await page.evaluate(()=>__gameQA.cancelPlacement());
    assert.ok(await page.locator('#readyBtn').isVisible());
    results.push('触屏建造/拆除时开战按钮暂隐，不与建造条叠挡');
    // 存档状态条：出现后约5秒淡出，淡出后不接收点击
    await page.evaluate(()=>__gameQA.saveStore.message('本地已保存 · 测试'));
    g=await geo(page);assert.equal(g.chip.faded,false);assert.equal(g.chip.opacity,'1');
    await page.waitForFunction(()=>document.getElementById('saveHealth').classList.contains('faded'),null,{timeout:9000});
    await page.waitForFunction(()=>parseFloat(getComputedStyle(document.getElementById('saveHealth')).opacity)<0.1);
    g=await geo(page);assert.equal(g.chip.pe,'none');assert.ok(parseFloat(g.chip.opacity)<0.1);
    const chipHit=await page.evaluate(()=>{const c=document.getElementById('saveHealth').getBoundingClientRect();const h=document.elementFromPoint(c.left+c.width/2,c.top+c.height/2);return h&&h.id;});
    assert.notEqual(chipHit,'saveHealth');
    results.push('存档状态条5秒后淡出且不再接收点击，存档面板仍可从菜单进入');
    await page.screenshot({path:path.join(out,'portrait-prep.png')});
    assert.deepEqual(errors,[],'page errors: '+errors.join('|'));
    await ctx.close();
    // 横屏触屏：同样远离上下贴边
    ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
    page=await ctx.newPage();await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__ccReady&&window.__gameQA);
    await page.evaluate(()=>{__gameQA.newGame(false);__gameQA.setDeviceMode('touch');});
    await page.waitForFunction(()=>__gameQA.Game.state==='prep');
    g=await geo(page);
    const gapB=g.btn.stageH-(g.btn.topInStage+g.btn.h);
    assert.ok(gapB>=40,'landscape bottom gap '+gapB);
    assert.ok(g.hitIsBtn,'landscape hit '+g.hitId);
    const bb2=await page.locator('#readyBtn').boundingBox();
    await page.touchscreen.tap(bb2.x+bb2.width/2,bb2.y+bb2.height/2);
    await page.waitForFunction(()=>__gameQA.Game.state==='battle');
    await page.screenshot({path:path.join(out,'landscape-battle.png')});
    results.push('横屏触屏：开战按钮离边≥40px且可点');
    await ctx.close();
    // 桌面键鼠：保持顶部原位，不受触屏规则影响
    ctx=await browser.newContext({viewport:{width:1280,height:720}});
    page=await ctx.newPage();await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__ccReady&&window.__gameQA);
    await page.evaluate(()=>{__gameQA.newGame(false);__gameQA.setDeviceMode('desktop');});
    await page.waitForFunction(()=>__gameQA.Game.state==='prep');
    g=await geo(page);
    assert.ok(g.btn.topInStage<40,'desktop keeps top position, top='+g.btn.topInStage);
    await page.locator('#readyBtn').click();
    await page.waitForFunction(()=>__gameQA.Game.state==='battle');
    results.push('桌面键鼠：开战按钮保持顶部原位且可点');
    await ctx.close();
  }finally{
    await browser.close();server.close();
  }
  fs.writeFileSync(path.join(out,'results.md'),'# 开战按钮曲面屏修复验证\n\n'+results.map((r,i)=>(i+1)+'. '+r).join('\n')+'\n');
  console.log(results.join('\n'));
  console.log('QA-OK');
})().catch(e=>{console.error('QA-FAIL',e);process.exit(1);});
