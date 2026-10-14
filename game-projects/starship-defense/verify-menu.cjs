// Actual pointer gestures and player actions; no scrollTop assignments or SDK mocks.
// MENU_URL may be a website, Toy preview, or public Toy entry (with its real iframe).
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const url=process.env.MENU_URL||'http://127.0.0.1:8767/html/game/starship-defense/index.html';
const out=process.env.MENU_OUT||path.join(require('node:os').tmpdir(),'starship-menu-qa');
const sizes=process.env.MENU_SIZES?JSON.parse(process.env.MENU_SIZES):[[1280,580],[844,346],[800,390],[667,375],[390,720],[390,844],[360,640],[568,320]];
const results=[];
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});try{
 for(const [width,height] of sizes){
  const name=width+'x'+height,ctx=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000,recordVideo:{dir:out,size:{width:960,height:540}}});
  assert.deepEqual(await ctx.cookies(),[],'guest verification must start without account cookies');
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});assert(response.ok());assert(!(await response.text()).includes('__TOY_LOGIN_GATE__'));
   let frame=page.mainFrame(),iframe=null;
   if(url.includes('bilibili.com/toy/')){iframe=page.locator('iframe').first();await iframe.waitFor({state:'attached'});frame=await (await iframe.elementHandle()).contentFrame();}
   await frame.waitForFunction(()=>window.__ccReady,{},{timeout:45000});
   const visible=async selector=>{
    const p=await frame.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect();let inside=true;for(let a=e.parentElement;a;a=a.parentElement){if(a.id!=='stage'&&!/auto|hidden|scroll/.test(getComputedStyle(a).overflow))continue;const s=a.getBoundingClientRect();if(r.left<s.left-1||r.top<s.top-1||r.right>s.right+1||r.bottom>s.bottom+1)inside=false;}const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {visible:!!e.getClientRects().length,inside,unobscured:hit===e||e.contains(hit),w:r.width,h:r.height};});
    assert(p.visible&&p.inside&&p.unobscured,name+' clipped '+selector+': '+JSON.stringify(p));
   };
   await visible('#btnStart');await visible('#btnContinue');await visible('.menuTools');
   if(await frame.locator('#fullBtn').isVisible())await visible('#fullBtn');
   if(width>=800||height>=800){for(const selector of ['[data-c="gunner"]','[data-campaign-difficulty="hard"]'])await visible(selector);}
   await visible('#earlyModes summary');
   assert.equal(await frame.locator('#btnBankVersus').isVisible(),false,'early modes should be folded initially');
   await frame.locator('#earlyModes summary').focus();await page.keyboard.press('Enter');
   assert(await frame.locator('#menuMain').isVisible(),'folding modes must not start a new game');
   assert(await frame.locator('#menuMain').evaluate(e=>e.scrollHeight<=e.clientHeight+2),name+' entire menu overflows');
   for(const [button,title,next,back] of [['btnBankVersus','银行塔防对战','vsMenu','vsMenuBack'],['btnRV','房车生存','rvMenu','rvBack'],['btnZerg','虫族模式','zergMenu','zergBack'],['btnAcid','酸液围场','acidMenu','acidBack']]){
    await frame.locator('#'+button).click();assert.equal(await frame.locator('#modeTitle').innerText(),title);assert(await frame.locator('#menuMain').isVisible());
    await visible('#btnModeStart');await frame.locator('#btnModeStart').click();assert(await frame.locator('#'+next).isVisible());await frame.locator('#'+back).click();
    assert.equal(await frame.locator('#modeTitle').innerText(),'基地防守');
   }
   await frame.locator('[data-menu-panel="menuMorePanel"]').first().click();await frame.locator('#btnTest').click();assert.equal(await frame.locator('#modeTitle').innerText(),'自由测试');assert.equal(await frame.locator('#menuMorePanel').isVisible(),false);await frame.locator('#btnCampaign').click();
   await frame.locator('[data-menu-panel="menuMorePanel"]').first().click();await frame.locator('#updatesMenu').click();
   await frame.locator('#updatesPanel').waitFor({state:'visible'});
   const before=await frame.locator('#updatesPanel').evaluate(e=>e.scrollTop);
   const cdp=await ctx.newCDPSession(page);
   async function swipe(selector,down=false){
    const points=await frame.locator(selector).evaluate((e,down)=>{
     const stage=document.querySelector('#stage'),r=e.getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(stage).transform),rot=Math.abs(m.b)>.1;
     // The center is clear of the sticky close button. Both endpoints stay in panel.
     const a=rot?{x:r.left+r.width*.25,y:r.top+r.height*.48}:{x:r.left+r.width*.48,y:r.top+r.height*.78};
     const b=rot?{x:r.left+r.width*.78,y:a.y}:{x:a.x,y:r.top+r.height*.27};
     return down?[b,a]:[a,b];
    },down);
    const box=iframe?await iframe.boundingBox():{x:0,y:0};const [a,b]=points.map(p=>({x:p.x+box.x,y:p.y+box.y}));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
    for(let i=1;i<=16;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/16,y:a.y+(b.y-a.y)*i/16,id:1}]});await page.waitForTimeout(15);}
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(80);
   }
   let after=before,backScroll=before;
   if(width<1000){await swipe('#updatesPanel');after=await frame.locator('#updatesPanel').evaluate(e=>e.scrollTop);assert(after>before+30,name+' touch swipe did not scroll');
    await swipe('#updatesPanel',true);backScroll=await frame.locator('#updatesPanel').evaluate(e=>e.scrollTop);assert(backScroll<after-30,name+' reverse swipe did not scroll');
    assert(await frame.locator('#updatesPanel').isVisible(),'swipe must not close dialog');
   }else{await frame.locator('#updatesList').focus();await page.keyboard.press('PageDown');after=await frame.locator('#updatesPanel').evaluate(e=>e.scrollTop);assert(after>before);}
   await frame.locator('#updatesClose').click();
   if(width<1000){for(const selector of ['.modeScroll','.modeContent']){
    if(await frame.locator(selector).evaluate(e=>e.scrollHeight>e.clientHeight+5)){
     const title=await frame.locator('#modeTitle').innerText(),hero=await frame.locator('.classCard.sel').getAttribute('data-c');
     const initial=await frame.locator(selector).evaluate(e=>e.scrollTop);await swipe(selector);
     assert(await frame.locator(selector).evaluate(e=>e.scrollTop)>initial,name+' content swipe');
     assert.equal(await frame.locator('#modeTitle').innerText(),title,'drag selected a mode');assert.equal(await frame.locator('.classCard.sel').getAttribute('data-c'),hero,'drag selected a hero');
     await swipe(selector,true);
    }
   }}
   await frame.locator('#btnBankVersus').focus();await page.keyboard.press('Enter');assert.equal(await frame.locator('#modeTitle').innerText(),'银行塔防对战');
   await page.keyboard.press('Tab');assert(await frame.locator('#menuMain').evaluate(e=>e.contains(document.activeElement)));await frame.locator('#btnCampaign').click();
   await frame.locator('[data-menu-panel="menuSettingsPanel"]').first().click();
   for(const mode of ['desktop','touch','auto']){await frame.locator('[data-device-mode="'+mode+'"]').click();assert.equal(await frame.locator('[data-device-mode="'+mode+'"]').getAttribute('aria-pressed'),'true');}
   await frame.locator('#menuSettingsPanel [data-menu-close]').click();
   await frame.locator('#menuSettingsPanel').waitFor({state:'hidden'});
   await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   // The first screenshot is AFTER gestures (Toy iframe emulation loses touches after screenshots).
   await page.screenshot({path:path.join(out,name+'-main.png')});
   await frame.locator('#btnStart').click();if(await frame.locator('#confirmOk').isVisible())await frame.locator('#confirmOk').click();
   await frame.locator('#menuMain').waitFor({state:'hidden'});await frame.locator('#hud').waitFor({state:'visible'});
   await page.keyboard.press('Escape');await frame.locator('#menuPause').waitFor({state:'visible'});await visible('#btnResume');await visible('#btnQuit');
   const pauseColor=await frame.locator('#menuPause').evaluate(e=>getComputedStyle(e).backgroundImage);assert(!pauseColor.includes('247, 234, 208'),'cream pause regressed');
   await frame.locator('#menuPause [data-menu-panel="menuSettingsPanel"]').click();await frame.locator('#menuSettingsPanel [data-menu-close]').click();await frame.locator('#menuSettingsPanel').waitFor({state:'hidden'});assert(await frame.locator('#menuPause').isVisible());
   await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   await page.screenshot({path:path.join(out,name+'-pause.png')});await frame.locator('#btnResume').click();await frame.locator('#menuPause').waitFor({state:'hidden'});
   await page.keyboard.press('Escape');await frame.locator('#btnQuit').click();await frame.locator('#menuMain').waitFor({state:'visible'});
   await frame.locator('[data-menu-panel="menuSavePanel"]').first().click();await frame.locator('#btnLoadMenu').click();await frame.locator('#savePanel').waitFor({state:'visible'});await frame.locator('#saveClose').click();
   await frame.locator('#btnContinue').click();await frame.locator('#menuMain').waitFor({state:'hidden'});
   assert.deepEqual(errors,[]);assert.deepEqual((await ctx.cookies()).filter(c=>['SESSDATA','DedeUserID','bili_jct'].includes(c.name)),[]);
   results.push({viewport:[width,height],passed:true,touch:width<1000,authenticated:false,scroll:{before,after,back:backScroll},checks:['mode selection and back','fixed actions and utilities','touch/keyboard scrolling','input mode switching','dark pause','resume and return','local save menu and continue'],limitations:['browser simulation; physical phone not tested']});
   console.log(JSON.stringify(results[results.length-1]));
  }catch(e){await page.screenshot({path:path.join(out,name+'-failure.png')}).catch(()=>{});throw e;}
  finally{await ctx.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({url,results},null,2));}
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
