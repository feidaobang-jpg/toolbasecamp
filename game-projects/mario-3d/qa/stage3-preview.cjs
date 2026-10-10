// Third-stage preview QA: real UI, local browser simulation, GPU timing, and game-only audio/video.
// Isolated mechanic/flow checks explicitly relocate the player; this is not a normal enemy playthrough.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const url=process.env.QA_URL||'http://127.0.0.1:8953/html/game/mario-3d/index.html?level=1-3&test=1&q=high';
const out=process.env.QA_OUT||path.resolve(__dirname,'../media-kit/releases/v2.5.0-preview1/qa');
const checks=[],performanceRows=[];
const check=(name,ok,data)=>{checks.push({name,ok,data});assert(ok,name+': '+JSON.stringify(data));};
const position=async(p,x=36.5,y=5)=>p.evaluate(({x,y})=>{const q=__MARIO_TEST__;Object.assign(q.world.player,{x,y,z:0,vx:0,vy:0,vz:0,grounded:true,inv:999});q.view.snap=true;q.step(1);},{x,y});
const start=async p=>{await p.locator('#menu [data-act=start]').click();await p.evaluate(()=>{__MARIO_TEST__.manual(true);__MARIO_TEST__.skipCard();});};
const photograph=async(p,file)=>{await p.evaluate(()=>{__MARIO_TEST__.world.player.inv=0;__MARIO_TEST__.step(0);});await p.screenshot({path:path.join(out,file)});};
// Toy allows its runtime inside the official shell; keep actual iframe geometry for UI checks.
async function openRuntime(page){
 await page.goto(url,{waitUntil:'networkidle'});
 if(!/www\.bilibili\.com\/toy\//.test(url))return page;
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('iframe')).some(f=>/bilibilitoy\.com/.test(f.src)));
 const frame=page.frames().find(f=>/bilibilitoy\.com/.test(f.url()));
 const entry=new URL(frame.url());entry.searchParams.set('test','1');entry.searchParams.set('level','1-3');entry.searchParams.set('q','high');await frame.goto(entry.href,{waitUntil:'networkidle'});
 return new Proxy(page,{get(target,key){if(['locator','evaluate','waitForFunction'].includes(key))return frame[key].bind(frame);if(key==='reload')return()=>frame.goto(entry.href,{waitUntil:'networkidle'});const value=target[key];return typeof value==='function'?value.bind(target):value;}});
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--use-angle=d3d11']});
 const errors=[];
 try{
  const c=await b.newContext({viewport:{width:1280,height:720}});let p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
  // Tap only this game's audio output, without microphone/system audio permissions.
  await p.addInitScript(()=>{const original=AudioNode.prototype.connect;AudioNode.prototype.connect=function(destination,...rest){const result=original.call(this,destination,...rest);if(destination===this.context.destination){const sink=this.context.createMediaStreamDestination();original.call(this,sink);window.__qaGameAudio=sink;}return result;};});
  p=await openRuntime(p);await p.waitForFunction(()=>window.__marioReady&&window.__MARIO_TEST__);
  const selector=p.locator('#menu [data-opt=level]');
  // v2.6.0 起共四关：1-3 之后是 1-4 城堡
  for(const label of ['1-3 树冠','1-4 城堡','1-1 地面','1-2 地下']){check('direct selection label '+label,(await selector.innerText()).includes(label));await selector.click();}
  check('level selector cycles back to 1-3',(await selector.innerText()).includes('1-3 树冠'));
  await p.locator('#menu [data-control-mode=show]').click();
  await p.screenshot({path:path.join(out,'menu.png')});await start(p);
  check('direct start at third stage',await p.evaluate(()=>__MARIO_TEST__.world.levelId==='1-3'&&__MARIO_TEST__.world.time===300));
  await position(p);
  const fire=await p.locator('[data-hold=fire]').evaluate(e=>({opacity:getComputedStyle(e).opacity,aria:e.getAttribute('aria-disabled'),label:e.innerText}));
  // 主线 30147c57 起火球键固定显示「火球」，未吃火焰花时只用 aria-disabled 标记
  check('J remains solid and marked unavailable',fire.opacity==='1'&&fire.aria==='true'&&fire.label.includes('火球'),fire);
  for(let i=0;i<5;i++){
   if(i)await p.keyboard.press('c');await position(p);await p.evaluate(()=>__MARIO_TEST__.step(100));
   await photograph(p,'treetops-view-'+i+'.png');
   check('preset renders stage 1-3 '+i,await p.evaluate(()=>__MARIO_TEST__.world.levelId==='1-3'&&__MARIO_TEST__.renderInfo().calls>0));
  }
  // Checkpoint death and menu restart target the same stage.
  await position(p,79,7);await p.evaluate(()=>__MARIO_TEST__.step(1));
  check('third-stage checkpoint is saved',await p.evaluate(()=>__MARIO_TEST__.session.checkpoint==='1-3'));
  await p.evaluate(()=>{__MARIO_TEST__.world.player.y=-10;__MARIO_TEST__.step(700);__MARIO_TEST__.skipCard();});
  check('fall respawns at treetop checkpoint',await p.evaluate(()=>__MARIO_TEST__.world.levelId==='1-3'&&__MARIO_TEST__.world.player.y===7&&__MARIO_TEST__.world.player.x>75));
  await p.locator('#btn-pause').click();await p.locator('#pause [data-act=restart]').click();await p.evaluate(()=>__MARIO_TEST__.skipCard());
  check('restart returns to third-stage start',await p.evaluate(()=>__MARIO_TEST__.world.levelId==='1-3'&&__MARIO_TEST__.world.player.x===3));
  // Animated views and frame timings with the same GPU. Viewport simulation is not physical phone performance.
  if(!process.env.QA_SKIP_PERF)for(const size of [{width:1280,height:720},{width:844,height:390}]){
   await p.setViewportSize(size);await p.waitForTimeout(100);
   for(let i=0;i<5;i++){
    if(i)await p.keyboard.press('c');await position(p);await p.evaluate(()=>{__MARIO_TEST__.manual(false);__MARIO_TEST__.perfStart();});
    await p.keyboard.down('e');await p.waitForTimeout(4100);await p.keyboard.up('e');
    const row=await p.evaluate(()=>{const q=__MARIO_TEST__,raw=q.perfStop(),frames=raw.frames.slice().sort((a,b)=>a-b),sum=frames.reduce((a,b)=>a+b,0);q.manual(true);return{preset:q.state().camera,frames:frames.length,fps:frames.length*1000/sum,p95:frames[Math.floor(frames.length*.95)],slow50:frames.filter(x=>x>50).length,render:q.renderInfo()};});
    performanceRows.push({viewport:size,quality:'high',...row});check('continuous rotating view stays playable '+size.width+'/'+row.preset,row.frames>30&&row.fps>=(size.width===1280?50:30),row);
   }
  }
  for(const size of [{width:844,height:390},{width:390,height:844}]){
   await p.setViewportSize(size);await p.waitForTimeout(150);await position(p);
   await p.locator('#btn-pause').click();const before=await p.evaluate(()=>({level:__MARIO_TEST__.world.levelId,x:__MARIO_TEST__.world.player.x}));
   for(const mode of ['hide','show'])await p.locator('#pause [data-control-mode='+mode+']').click();
   check('mode switch preserves third stage '+size.width,await p.evaluate(s=>__MARIO_TEST__.world.levelId===s.level&&__MARIO_TEST__.world.player.x===s.x,before));
   await p.locator('#pause [data-act=resume]').click();await p.evaluate(()=>__MARIO_TEST__.step(1));
   const buttons=await p.locator('#touch [data-hold]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{opacity:getComputedStyle(e).opacity,w:r.width,h:r.height,x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
   check('phone buttons opaque, equal and inside viewport '+size.width,buttons.length===4&&buttons.every(e=>e.opacity==='1'&&Math.abs(e.w-buttons[0].w)<.1&&Math.abs(e.h-buttons[0].h)<.1&&e.x>=0&&e.y>=0&&e.right<=size.width+.1&&e.bottom<=size.height+.1),buttons);
   await p.screenshot({path:path.join(out,'phone-'+size.width+'.png')});
  }
  for(let i=0;i<5&&(await p.evaluate(()=>__MARIO_TEST__.state().camera))!=='oblique';i++)await p.keyboard.press('c');
  await position(p,77.5,7);await p.evaluate(()=>__MARIO_TEST__.step(50));await photograph(p,'winged-koopa.png');
  const lift=await p.evaluate(()=>({x:__MARIO_TEST__.world.rt.lifts[1].x+1.5,y:__MARIO_TEST__.world.rt.lifts[1].y}));await position(p,lift.x,lift.y);await p.evaluate(()=>{__MARIO_TEST__.world.player.onLift=__MARIO_TEST__.world.rt.lifts[1];__MARIO_TEST__.step(120);});await photograph(p,'moving-platforms.png');
  await position(p,149,0);await p.evaluate(()=>__MARIO_TEST__.step(60));await photograph(p,'final-castle.png');
  // A short moving/jumping sample includes this game's music and effects.
  await p.setViewportSize({width:1280,height:720});
  await p.reload({waitUntil:'networkidle'});await p.waitForFunction(()=>window.__marioReady);await start(p);
  for(let i=0;i<5&&(await p.evaluate(()=>__MARIO_TEST__.state().camera))!=='side';i++)await p.keyboard.press('c');
  await position(p,36,5);await p.evaluate(()=>{__MARIO_TEST__.world.player.z=2;__MARIO_TEST__.world.player.inv=0;__MARIO_TEST__.session.settings.demo=true;__MARIO_TEST__.manual(false);});
  await p.evaluate(()=>{const stream=document.querySelector('#screen').captureStream(30);for(const t of window.__qaGameAudio.stream.getAudioTracks())stream.addTrack(t);window.__qaChunks=[];window.__qaRecorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus'});__qaRecorder.ondataavailable=e=>{if(e.data.size)__qaChunks.push(e.data);};__qaRecorder.start();});
  await p.keyboard.press('i');await p.keyboard.down('d');await p.waitForTimeout(180);await p.keyboard.down('k');await p.waitForTimeout(520);await p.keyboard.up('d');await p.keyboard.down('a');await p.waitForTimeout(140);await p.keyboard.up('a');await p.keyboard.up('k');await p.waitForTimeout(450);
  check('recorded real sprint jump lands on high canopy',await p.evaluate(()=>__MARIO_TEST__.world.mode==='play'&&__MARIO_TEST__.world.player.y===9&&__MARIO_TEST__.world.player.grounded));
  await p.keyboard.press('c');await p.keyboard.down('e');await p.waitForTimeout(2100);await p.keyboard.up('e');await p.waitForTimeout(300);
  const recorded=await p.evaluate(async()=>{await new Promise(resolve=>{__qaRecorder.onstop=resolve;__qaRecorder.stop();});const blob=new Blob(__qaChunks,{type:'video/webm'}),buffer=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<buffer.length;i+=16384)binary+=String.fromCharCode(...buffer.subarray(i,i+16384));return{base64:btoa(binary),audioTracks:__qaRecorder.stream.getAudioTracks().length,state:__MARIO_TEST__.state()};});
  fs.writeFileSync(path.join(out,'motion-with-game-audio.webm'),Buffer.from(recorded.base64,'base64'));delete recorded.base64;
  check('capture contains game audio',recorded.audioTracks===1,recorded);
  await p.evaluate(()=>__MARIO_TEST__.manual(true));check('no browser runtime errors',errors.length===0,errors);
  // Fresh portrait title starts in the logical landscape layout, before gameplay.
  const mobile=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});let mp=await mobile.newPage();
  mp=await openRuntime(mp);await mp.waitForFunction(()=>window.__marioReady);await mp.screenshot({path:path.join(out,'portrait-menu.png')});
  const rotation=await mp.evaluate(()=>getComputedStyle(document.querySelector('#stage')).transform);
  check('portrait title is already rotated landscape',rotation!=='none',rotation);await mobile.close();await c.close();
  const resultPath=process.env.QA_SKIP_PERF?'media-results.json':'preview-results.json';
  fs.writeFileSync(path.join(out,resultPath),JSON.stringify({url,browser:b.version(),method:'Edge GPU; controlled player relocations for mechanic checks; timings with real-time animation, phone is viewport simulation only; short capture uses demo invulnerability, retaining real movement/jump input',checks,performance:performanceRows,errors},null,2));
  console.log(JSON.stringify({passed:checks.length,performance:performanceRows.map(x=>({viewport:x.viewport.width,preset:x.preset,fps:+x.fps.toFixed(1),p95:+x.p95.toFixed(2),slow50:x.slow50})),out},null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
