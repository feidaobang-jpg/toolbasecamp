// Six-game browser regression: real camera input, phone fullscreen UI, near-edge sticks.
const {chromium}=require('playwright');
const fs=require('fs');const path=require('path');
const BASE=process.env.GAMES_BASE||'http://127.0.0.1:8773/html/game/';
const OUT=process.env.GAMES_OUT||path.resolve('game-projects/site-games/qa/out/camera-mobile');
fs.mkdirSync(OUT,{recursive:true});
const games=(process.env.GAMES_ONLY?process.env.GAMES_ONLY.split(','):['tank-3d','mario-3d','jackal-stage1-3d','journey-west-3d','hop-fox-3d','starship-defense']);
const results=[];
function check(name,ok,detail){results.push({name,ok,detail});console.log((ok?'PASS ':'FAIL ')+name+' '+JSON.stringify(detail));}
async function state(p,g){return p.evaluate(g=>{
 if(g==='tank-3d')return __TANK_TEST__.state().camera;
 if(g==='mario-3d')return __MARIO_TEST__.state().camera;
 if(g==='jackal-stage1-3d')return __JK_TEST__.snapshot().ui.camera;
 if(g==='starship-defense')return __gameQA.camera.position.toArray().map(n=>Math.round(n*100)/100).join(',');
 return __CAMERA_QA__.state().name;
},g);}
(async()=>{
const browser=await chromium.launch({channel:'msedge',args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
for(const mobile of [false,true])for(const g of games){
 const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile,...(mobile?{userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36'}:{})});
 const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{window.__fullRequests=0;Element.prototype.requestFullscreen=function(){window.__fullRequests++;return Promise.resolve();};});
 const tag=g+(mobile?' mobile':' desktop');
 try{
 await p.goto(BASE+g+'/index.html?test=1&qa=1&q=low');
 await p.waitForFunction(g=>g==='tank-3d'?!!window.__TANK_TEST__:g==='mario-3d'?!!window.__MARIO_TEST__:g==='jackal-stage1-3d'?!!window.__JK_TEST__:g==='starship-defense'?!!window.__gameQA:!!window.__CAMERA_QA__,g,{timeout:30000});
 if(g==='starship-defense'){await p.evaluate(()=>{__gameQA.newGame();});}
 else {const start=p.locator(g==='hop-fox-3d'||g==='journey-west-3d'?'#start':'[data-act=start]').first();if(mobile)await start.tap();else await start.click();}
 await p.waitForTimeout(1800);
 if(g==='jackal-stage1-3d')await p.evaluate(()=>{__JK_TEST__.manual(true);__JK_TEST__.cheat.invuln(999);__JK_TEST__.step(240,true);});
 if(g==='starship-defense')await p.evaluate(()=>{__gameQA.player.invuln=999;});
 if(g==='hop-fox-3d')await p.evaluate(()=>__CAMERA_QA__.begin());
 const seen=new Set();for(let i=0;i<5;i++){
 if(g==='starship-defense')await p.evaluate(i=>{__gameQA.setCameraView(i,false);__gameQA.updCamera(.2);},i);
 seen.add(await state(p,g));
 await p.screenshot({path:path.join(OUT,g+'-'+(mobile?'mobile':'desktop')+'-'+i+'.png')});
 if(mobile&&g!=='starship-defense'){
  const sel=g==='hop-fox-3d'?'#recenter':g==='journey-west-3d'?'#touch-camera':g==='jackal-stage1-3d'?'#btn-cam-t':'#btn-cam';await p.locator(sel).tap();
 }else if(g!=='starship-defense')await p.keyboard.press('KeyC');
 if(g==='jackal-stage1-3d')await p.evaluate(()=>__JK_TEST__.step(1,true));
 await p.waitForTimeout(160);
 }
 check(tag+' five distinct cameras',seen.size===5,[...seen]);
 if(g!=='starship-defense')check(tag+' camera cycle returns',seen.has(await state(p,g)),await state(p,g));
 const full=await p.locator('#btn-fs,.fs-btn,#full,#fullBtn').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width&&getComputedStyle(e).display!=='none').length);
 check(tag+' fullscreen UI',mobile?full===0:full>0,full);
 if(mobile){
 check(tag+' no automatic fullscreen',await p.evaluate(()=>__fullRequests===0));
 const joy=await p.locator(g==='starship-defense'?'#joyBase':g==='journey-west-3d'||g==='hop-fox-3d'?'#stick':'#joy-base').boundingBox();
 check(tag+' joystick near left',joy&&joy.x>=0&&joy.x<=8,joy);
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(350);
 check(tag+' portrait fullscreen stays hidden',await p.locator('#btn-fs:visible,.fs-btn:visible,#full:visible,#fullBtn:visible').count()===0);
 await p.setViewportSize({width:844,height:390});await p.waitForTimeout(350);
 check(tag+' rotate back keeps joystick near edge',(await p.locator(g==='starship-defense'?'#joyBase':g==='journey-west-3d'||g==='hop-fox-3d'?'#stick':'#joy-base').boundingBox()).x<=8);
 }
 check(tag+' no runtime errors',errors.length===0,errors);
 }catch(e){check(tag+' completes',false,e.message);}
 await context.close();
}
await browser.close();fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));process.exitCode=results.every(r=>r.ok)?0:1;
})();
