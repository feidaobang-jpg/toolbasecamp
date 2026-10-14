// Realtime capture of the unchanged v0.3.0 build using its QA input bot.
// Browser compositor JPEG frames keep HUD, subtitles and real timestamps.
const fs = require('fs'), path = require('path');
const {chromium}=require(process.env.PLAYWRIGHT_DIR || 'D:/project/godot/absurd-3d-daily/node_modules/playwright');
const W=__dirname, root=process.env.GAME_REPO_ROOT || path.resolve(W,'../../../../..');
const out=path.join(W,'capture'); fs.mkdirSync(out,{recursive:true});
const mode=process.argv[2] || 'full', framesDir=path.join(out,mode+'-frames');fs.mkdirSync(framesDir,{recursive:true});
let bot=fs.readFileSync(path.join(root,'game-projects/liangjian-pingan/qa/bot.browser.js'),'utf8');
if(mode==='mg') bot=bot.replace("if (p === 1) {",`if (p === 1 && !S.mgDone && !g.enemies.some(e=>e.alive && e.type==='mg' && e.nest==='A')) {
 const m=g.mgs[0];
 if(!h.mg){set('KeyJ',false);const d=goTo(m.x,m.z,1,dt);lookAlong(m.x,m.z);if(d<2)tap('KeyI');}
 else {combat(dt);S.mgTime=(S.mgTime||0)+dt;window.__mgCaptured=true;if(S.mgTime>12){tap('KeyI');S.mgDone=true;}}
 return;
 } else if (p === 1) {`);
if(mode==='street')bot=bot.replace("const t = combat(dt);\r\n      const street", "const t = combat(dt); S.streetJump=(S.streetJump||0)-dt;if(t && t.type==='mg' && S.streetJump<=0){tap('KeyK');S.streetJump=1.2;}\r\n      const street");
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--autoplay-policy=no-user-gesture-required','--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11']});
 const ctx=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{const AC=window.AudioContext; window.AudioContext=class extends AC {constructor(...a){super(...a);window.__captureAudioContext=this;}};});
 await page.goto('http://127.0.0.1:8814/html/game/gunfire-assembly/pingan/?qa=1');
 await page.waitForFunction(()=>window.__lj && document.getElementById('loading').hidden);
 await page.evaluate(mode=>{const a=__lj.app;a.noAutoPause=true;a.s.quality='high';a.s.mouseAim='drag';if(mode==='finale')a.s.startPhase=5;if(mode==='street')a.s.startPhase=4;a.applyQuality();a.ui.refresh();},mode);
 await page.keyboard.press('Enter');
 await page.evaluate(async()=>{window.__W=await import('./js/world.js'); const ac=window.__captureAudioContext;if(ac){const dest=ac.createMediaStreamDestination();const native=AudioNode.prototype.connect;AudioNode.prototype.connect=function(target,...rest){if(target===ac.destination)native.call(this,dest,...rest);return native.call(this,target,...rest);};const bus=__lj.app.audio; if(bus && bus.master)bus.master.connect(dest);window.__audioChunks=[];window.__audioRecorder=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});__audioRecorder.ondataavailable=e=>__audioChunks.push(e.data);__audioRecorder.start(1000);}});
 await page.addScriptTag({content:bot});
 const cd=await ctx.newCDPSession(page);const frames=[],events=[],pending=[];let origin=null,last=-100,active=true;
 cd.on('Page.screencastFrame',e=>{cd.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});if(!active)return;const stamp=e.metadata.timestamp;if(origin===null)origin=stamp;const t=stamp-origin;if(t-last<1/24)return;last=t;const file=String(frames.length).padStart(6,'0')+'.jpg';frames.push({t,file});pending.push(fs.promises.writeFile(path.join(framesDir,file),Buffer.from(e.data,'base64')));});
 await cd.send('Page.startScreencast',{format:'jpeg',quality:95,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
 await page.evaluate(()=>{window.__bot=__installBot();window.__botOn=true;let last=performance.now();const tick=t=>{const dt=Math.min(.05,(t-last)/1000);last=t;if(__botOn && __lj.app.state==='play')__bot(dt);requestAnimationFrame(tick);};requestAnimationFrame(tick);});
 const started=Date.now();let oldPhase=0,oldStats='',viewDone=false,mgStart=null;
 while(Date.now()-started<600000){
  await page.waitForTimeout(750);
  const s=await page.evaluate(()=>({state:__lj.app.state,phase:__lj.game.phase,t:__lj.game.t,stats:__lj.game.stats,hero:{x:__lj.game.hero.x,z:__lj.game.hero.z,weapon:__lj.game.hero.weapon,mg:__lj.game.hero.mg?.id||null},cannon:{manned:__lj.game.cannon.manned},stamp:document.querySelector('#stamp').textContent}));
  const t=frames.length?frames[frames.length-1].t:0;
  if(s.hero.mg && mgStart===null){mgStart=t;events.push({source_seconds:t,event:'I: mounted MG through normal movement and input'});}
  if(mode==='mg' && mgStart!==null && t-mgStart>14)break;
  if(mode==='street' && s.phase===5){await page.waitForTimeout(3000);break;}
  if(s.phase!==oldPhase || JSON.stringify(s.stats)!==oldStats){events.push({source_seconds:t,...s});oldPhase=s.phase;oldStats=JSON.stringify(s.stats);}
  if(mode==='full' && !viewDone && s.phase===4){await page.keyboard.press('KeyC');viewDone=true;events.push({source_seconds:t,event:'C: switch to first person; continued real combat'});}
  if(s.state==='result'){await page.waitForTimeout(9000);break;}
 }
 active=false;await cd.send('Page.stopScreencast');await Promise.all(pending);
 const final=await page.evaluate(()=>({state:__lj.app.state,stats:__lj.game.stats,title:document.querySelector('#result .title2').textContent,total:document.querySelector('#result .total').textContent}));
 const audio=await page.evaluate(async()=>{if(!window.__audioRecorder)return null;await new Promise(r=>{__audioRecorder.onstop=r;__audioRecorder.stop();});return Array.from(new Uint8Array(await new Blob(__audioChunks).arrayBuffer()));});
 if(audio)fs.writeFileSync(path.join(out,mode+'-game-audio.webm'),Buffer.from(audio));
 fs.writeFileSync(path.join(out,mode+'.json'),JSON.stringify({capture_mode:'realtime-automation',build:'v0.3.0',resolution:[1920,1080],settings:'standard durability, infinite lives, no demo/invincibility; start phase '+(mode==='finale'?5:mode==='street'?4:1),frames,events,final,errors},null,1));
 fs.writeFileSync(path.join(framesDir,'frames.ffconcat'),'ffconcat version 1.0\n'+frames.map((f,i)=>`file '${f.file}'\nduration ${Math.max(.001,(frames[i+1]?.t || f.t+.05)-f.t).toFixed(6)}\n`).join('')+`file '${frames[frames.length-1].file}'\n`);
 await browser.close();console.log(JSON.stringify({frames:frames.length,duration:last,final,errors}));
})().catch(e=>{console.error(e);process.exit(1);});
