// Browser regression for blank-area drag, rotated coordinates and cancellation.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const root=process.cwd(), out=path.join(root,'game-projects/site-games/qa/out/drag-look1');fs.mkdirSync(out,{recursive:true});
const games=['tank-3d','mario-3d','jackal-stage1-3d','cadillacs-stage1-3d','journey-west-3d','hop-fox-3d'];
const results=[];const check=(game,name,ok,detail)=>{results.push({game,name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${game} ${name} ${JSON.stringify(detail)||''}`)};
async function read(p,g){return p.evaluate(g=>{
 if(g==='tank-3d'||g==='mario-3d'){const h=g==='tank-3d'?__TANK_TEST__:__MARIO_TEST__,s=h.state();return {yaw:s.yawOffset,paused:s.paused,overlay:s.overlay,progress:g==='tank-3d'?s.run:s.session,touch:s.display.touchOn,rotated:s.display.rotated};}
 if(g==='jackal-stage1-3d'||g==='cadillacs-stage1-3d'){let s=(g==='jackal-stage1-3d'?__JK_TEST__:__CD_TEST__).snapshot();return {yaw:g==='jackal-stage1-3d'?s.cam.yaw:s.ui.yawOff,paused:s.ui.paused,overlay:s.ui.overlay,touch:s.ui.display.touchOn,rotated:s.ui.display.rotated};}
 return {yaw:g==='journey-west-3d'?__CAMERA_QA__.view.yaw:__CAMERA_QA__.view.yaw,touch:!document.getElementById('touch').hidden};
},g)}
(async()=>{const b=await chromium.launch({channel:'msedge',args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11']});
for(const g of (process.env.GAMES_ONLY?process.env.GAMES_ONLY.split(','):games))for(const portrait of [false,true]){
 const label=g+(portrait?' portrait':' landscape'),ctx=await b.newContext({viewport:portrait?{width:390,height:844}:{width:844,height:390},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36'}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
 await p.goto((process.env.GAMES_BASE||'http://127.0.0.1:8785/html/game/')+g+'/index.html?test=1&q=low');await p.waitForTimeout(700);
 const hooks=await p.evaluate(()=>!!(window.__TANK_TEST__||window.__MARIO_TEST__||window.__JK_TEST__||window.__CD_TEST__||window.__CAMERA_QA__));if(!hooks)throw Error('missing hooks '+errors.join(','));
 await p.locator('[data-control-mode=show]').first().click();
 if(g==='cadillacs-stage1-3d'){await p.locator('[data-act=select]').first().click();await p.locator('[data-act=start]').click();}
 else await p.locator(g==='journey-west-3d'||g==='hop-fox-3d'?'#start':'[data-act=start]').first().click();
 await p.waitForTimeout(2700);
 if(g==='tank-3d')await p.evaluate(()=>{__TANK_TEST__.manual(true);__TANK_TEST__.skipCurtain();});
 if(g==='mario-3d')await p.evaluate(()=>{__MARIO_TEST__.manual(true);__MARIO_TEST__.skipCard();});
 if(g==='jackal-stage1-3d')await p.evaluate(()=>{__JK_TEST__.manual(true);__JK_TEST__.step(300);});
 if(g==='cadillacs-stage1-3d')await p.evaluate(()=>{__CD_TEST__.manual(true);__CD_TEST__.step(300);});
 let s=await read(p,g);check(label,'phone mode',s.touch,s);if(portrait)check(label,'landscape transform',await p.locator('#stage,#game').first().evaluate(e=>getComputedStyle(e).transform!=='none'));
 const screen=(x,y)=>portrait?{x:390-y,y:x}:{x,y};
 const from=screen(530,145),to=screen(650,145);const cdp=await ctx.newCDPSession(p);
 const send=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts.map((v,i)=>({...v,id:i+1,radiusX:3,radiusY:3,force:1}))});
 let before=s.yaw;await send('touchStart',[from]);await send('touchMove',[to]);await send('touchEnd',[]);await p.waitForTimeout(100);let after=await read(p,g);
 check(label,'drag rotates',Math.abs(after.yaw-before)>.2,{before,after:after.yaw});
 // Camera-button press must reset any captured drag, without requiring pointerup.
 const camera=g==='journey-west-3d'?'#touch-camera':g==='hop-fox-3d'?'#recenter':'#btn-cam-t';
 before=after.yaw;await p.locator(camera).click();
 if(g==='jackal-stage1-3d')await p.evaluate(()=>__JK_TEST__.step(1));
 if(g==='cadillacs-stage1-3d')await p.evaluate(()=>__CD_TEST__.step(1));
 await p.waitForTimeout(120);
 // Desktop mouse in selected phone layout must work too.
 before=(await read(p,g)).yaw;await p.mouse.move(from.x,from.y);await p.mouse.down();await p.mouse.move(to.x,to.y,{steps:5});await p.mouse.up();await p.waitForTimeout(60);after=await read(p,g);
 check(label,'mouse phone drag',Math.abs(after.yaw-before)>.2,{before,after:after.yaw});
 if(g==='tank-3d')await p.evaluate(()=>__TANK_TEST__.step(1));if(g==='mario-3d')await p.evaluate(()=>__MARIO_TEST__.step(1));if(g==='jackal-stage1-3d')await p.evaluate(()=>__JK_TEST__.step(1));if(g==='cadillacs-stage1-3d')await p.evaluate(()=>__CD_TEST__.step(1));
 await p.screenshot({path:path.join(out,label.replaceAll(' ','-')+'.png')});

 // Real browser multi-touch: joystick, camera and action held together.
 await p.evaluate(g=>{const h=g==='tank-3d'?window.__TANK_TEST__:g==='mario-3d'?window.__MARIO_TEST__:g==='jackal-stage1-3d'?window.__JK_TEST__:window.__CD_TEST__;h?.manual(false);},g);
 await p.evaluate(()=>{const c=document.querySelector('canvas');const chunks=[];window.__qaRecorder=new MediaRecorder(c.captureStream(25),{mimeType:'video/webm'});__qaRecorder.ondataavailable=e=>chunks.push(e.data);window.__qaVideo=()=>new Promise(resolve=>{__qaRecorder.onstop=async()=>resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));__qaRecorder.stop();});__qaRecorder.start();});
 const center=async selector=>{const r=await p.locator(selector).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2}};
 const joy=await center(g==='journey-west-3d'||g==='hop-fox-3d'?'#stick':'#joy-base');
 const action=await center(g==='tank-3d'?'[data-hold=fire]':g==='mario-3d'?'[data-hold=jump]':g==='jackal-stage1-3d'?'#btn-fire':g==='cadillacs-stage1-3d'?'#btn-jump':g==='journey-west-3d'?'[data-action=dash]':'[data-hold=KeyK]');
 const gameplay=()=>p.evaluate(g=>{
  if(g==='tank-3d'){let s=__TANK_TEST__.state();return {pos:s.player.x+','+s.player.y,action:__TANK_TEST__.world.bullets.length,input:s.stick.axis};}
  if(g==='mario-3d'){let s=__MARIO_TEST__.state();return {pos:s.player.x+','+s.player.z,action:s.player.y,input:s.joy};}
  if(g==='jackal-stage1-3d'){let s=__JK_TEST__.snapshot();return {pos:s.player.x+','+s.player.y,action:s.mgShots,input:s.input};}
  if(g==='cadillacs-stage1-3d'){let s=__CD_TEST__.snapshot();return {pos:s.player.x+','+s.player.z,action:s.player.y,input:s.input.stick};}
  let w=__CAMERA_QA__.world,p=w.player||w.hero;return {pos:p.x+','+(p.z||0),action:g==='journey-west-3d'?p.dashCd:p.y};
 },g);
 let gameBefore=await gameplay();before=(await read(p,g)).yaw;
 await send('touchStart',[joy,from,action]);await send('touchMove',[{x:joy.x+(portrait?0:(g==='tank-3d'?-35:35)),y:joy.y+(portrait?(g==='tank-3d'?-35:35):0)},to,action]);
 await p.waitForTimeout(200);let during=await gameplay();after=await read(p,g);
 check(label,'three touches rotate',Math.abs(after.yaw-before)>.2);
 check(label,'action has game effect',during.action!==gameBefore.action,{before:gameBefore.action,after:during.action});
 await p.waitForTimeout(200);let moved=await gameplay();check(label,'joystick moves player',moved.pos!==gameBefore.pos,{before:gameBefore.pos,after:moved.pos,input:moved.input});
 await send('touchEnd',[]);await p.waitForTimeout(200);
 const bytes=await p.evaluate(()=>__qaVideo());fs.writeFileSync(path.join(out,label.replaceAll(' ','-')+'.webm'),Buffer.from(bytes));
 // Pausing in the middle of a drag discards capture and no motion leaks through.
 await p.mouse.move(from.x,from.y);await p.mouse.down();await p.keyboard.press('Escape');
 if(g==='jackal-stage1-3d')await p.evaluate(()=>__JK_TEST__.step(1));if(g==='cadillacs-stage1-3d')await p.evaluate(()=>__CD_TEST__.step(1));
 before=(await read(p,g)).yaw;await p.mouse.move(to.x,to.y,{steps:4});await p.mouse.up();after=await read(p,g);
 check(label,'pause cancels drag',Math.abs(after.yaw-before)<.01,{before,after:after.yaw});
 const modes=p.locator('[data-control-mode=hide]:visible');check(label,'mode settings reachable while paused',await modes.count()>0);
 if(await modes.count()){
 await modes.first().click();check(label,'switch phone to desktop',!(await read(p,g)).touch);
 await p.locator('[data-control-mode=show]:visible').first().click();check(label,'switch desktop to phone',(await read(p,g)).touch);
 await p.locator('[data-control-mode=auto]:visible').first().click();check(label,'restore auto',(await read(p,g)).touch);
 }
 check(label,'no runtime errors',errors.length===0,errors);
 }catch(e){check(label,'completed',false,e.message)}finally{await ctx.close()}
}
await b.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));process.exitCode=results.every(x=>x.ok)?0:1;
})();
