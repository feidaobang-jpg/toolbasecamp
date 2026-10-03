// v0.9.6 viewer report (2026-10-03, dynamic comment): in the Bilibili app the game opened stuck in the
// lower-right half of the screen, unrotated and unscaled. Cause: the app webview reports a 0×0 window
// while the page boots and never fires resize afterwards. Emulate that and check the stage recovers.
// TAG=before GAME_URL=<old build> only records the broken state.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases/web-webview-fix-v0.9.6'),captures=path.join(release,'captures');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html',tag=process.env.TAG||'after';
const UA='Mozilla/5.0 (Linux; Android 13; V2219A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.61 Mobile Safari/537.36 BiliApp/7.80.0';
const results={},fail=[];const check=(n,ok,d)=>{results[n]={ok:!!ok,...(d!==undefined?{detail:d}:{})};if(!ok)fail.push(n);};
// zero: which of innerWidth/innerHeight read 0 while booting; ms: how long (Infinity = never readable); fire: resize event once the size arrives
async function boot(b,{viewport={width:393,height:692},mobile=true,zero='',ms=1500,fire=false,shot}={}){
 const ctx=await b.newContext({viewport,...(mobile?{userAgent:UA,isMobile:true,hasTouch:true,deviceScaleFactor:2}:{})});
 if(zero)await ctx.addInitScript(([zero,ms,fire,vw,vh])=>{const t0=Date.now(),z=()=>ms<0||Date.now()-t0<ms;
  if(zero.includes('h'))Object.defineProperty(window,'innerHeight',{configurable:true,get(){return z()?0:vh;}});
  if(zero.includes('w'))Object.defineProperty(window,'innerWidth',{configurable:true,get(){return z()?0:vw;}});
  if(fire&&ms>=0)setTimeout(()=>window.dispatchEvent(new Event('resize')),ms+50);},[zero,ms===Infinity?-1:ms,fire,viewport.width,viewport.height]);
 const p=await ctx.newPage();p.errors=[];p.on('pageerror',e=>p.errors.push(e.message));
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(Math.max(ms===Infinity?0:ms,0)+2000);
 const st=await p.evaluate(()=>{const s=document.getElementById('stage'),r=s.getBoundingClientRect(),c=document.getElementById('c3d');
  return{rotated:/rotate/.test(s.style.transform),transform:s.style.transform||getComputedStyle(s).transform,rect:[r.left,r.top,r.width,r.height].map(v=>Math.round(v)),canvas:[c.width,c.height]};});
 if(shot)await p.screenshot({path:path.join(captures,shot+'.jpg'),quality:82});
 return{p,ctx,st};
}
const fills=(st,vp)=>Math.abs(st.rect[0])<=2&&Math.abs(st.rect[1])<=2&&Math.abs(st.rect[2]-vp.width)<=2&&Math.abs(st.rect[3]-vp.height)<=2;
const tap=async(p,sel)=>{const box=await p.locator(sel).boundingBox();if(!box)return false;await p.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await p.waitForTimeout(250);return true;};
(async()=>{
 fs.mkdirSync(captures,{recursive:true});
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
 const vp={width:393,height:692},errors=[];
 if(tag==='before'){
  const out={};
  for(const [n,o] of Object.entries({normal:{},zeroBothNoResize:{zero:'wh',shot:'before-app-webview-stuck'},zeroHeightThenResize:{zero:'h',fire:true}})){const r=await boot(b,o);out[n]=r.st;await r.ctx.close();}
  out.build=process.env.BUILD||'';fs.writeFileSync(path.join(release,'before.json'),JSON.stringify(out,null,1));console.log(JSON.stringify(out,null,1));await b.close();return;
 }
 const normal=await boot(b,{shot:'phone-portrait-normal'});errors.push(...normal.p.errors);await normal.ctx.close();
 check('normal portrait phone: rotated to landscape and fills the screen',normal.st.rotated&&fills(normal.st,vp),normal.st);
 for(const [name,o] of Object.entries({
  'webview reports 0×0 at boot, no resize event':{zero:'wh'},
  'webview reports height 0 at boot, no resize event':{zero:'h'},
  'late resize event: canvas resolution recomputed (was blurry)':{zero:'h',fire:true}})){
  const r=await boot(b,o);errors.push(...r.p.errors);await r.ctx.close();
  check(name,r.st.rotated&&fills(r.st,vp)&&r.st.canvas.join()===normal.st.canvas.join(),{got:r.st,expectCanvas:normal.st.canvas});
 }
 const never=await boot(b,{zero:'wh',ms:Infinity,shot:'phone-size-never-readable'});errors.push(...never.p.errors);await never.ctx.close();
 check('size never readable: falls back to the screen size instead of a broken layout',never.st.rotated&&fills(never.st,vp),never.st);
 // the reported case end to end: boot broken → start game → open the shop with the touch buttons
 const app=await boot(b,{zero:'wh',shot:'app-webview-menu-after'});const p=app.p;
 const started=await tap(p,'#btnStart');await p.waitForTimeout(400);
 const state=await p.evaluate(()=>__gameQA.Game.state);
 const shopVisible=await p.evaluate(()=>{const r=document.getElementById('vO').getBoundingClientRect();return r.width>0&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});
 await tap(p,'#vO');const shop=await p.evaluate(()=>{const s=document.getElementById('shopPanel'),r=s.getBoundingClientRect();return{open:!s.classList.contains('hidden'),onScreen:r.left>=-2&&r.top>=-2&&r.right<=innerWidth+2&&r.bottom<=innerHeight+2};});
 await p.screenshot({path:path.join(captures,'app-webview-shop-after.jpg'),quality:82});errors.push(...p.errors);await app.ctx.close();
 check('after the 0×0 boot: tap 开始新游戏, shop button on screen, tapping 商店 opens it',started&&state!=='menu'&&shopVisible&&shop.open&&shop.onScreen,{started,state,shopVisible,shop});
 const land=await boot(b,{viewport:{width:844,height:390},zero:'wh'});errors.push(...land.p.errors);await land.ctx.close();
 check('landscape phone with 0×0 boot: not rotated, fills the screen',!land.st.rotated&&fills(land.st,{width:844,height:390}),land.st);
 const desk=await boot(b,{viewport:{width:1280,height:720},mobile:false});errors.push(...desk.p.errors);await desk.ctx.close();
 check('desktop unchanged: no rotation, fills 1280×720',!desk.st.rotated&&fills(desk.st,{width:1280,height:720}),desk.st);
 check('no page errors',errors.length===0,errors);
 await b.close();
 const summary={version:'web-webview-fix-v0.9.6',checked_at:new Date().toISOString(),passed:Object.values(results).filter(v=>v.ok).length,failed:fail,results};
 fs.writeFileSync(path.join(release,'webview.json'),JSON.stringify(summary,null,1));console.log(JSON.stringify({passed:summary.passed,failed:fail},null,1));if(fail.length){console.log(JSON.stringify(results,null,1));process.exitCode=1;}
})().catch(e=>{console.error(e);process.exit(1);});
