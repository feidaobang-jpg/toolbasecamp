// Real-time canvas + game-audio capture. QA stages the starting position once;
// all subsequent driving, fighting and searching run at normal RAF speed.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.join(__dirname,'media-kit/releases/web-rv-v0.28.0/capture');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 try{
  const p=await b.newPage({viewport:{width:1280,height:720}});
  await p.goto('http://127.0.0.1:8798/html/game/starship-defense/index.html?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  await p.click('#btnRV');await p.click('#rvStart');
  await p.evaluate(()=>{const q=__gameQA;q.rvBreakout.state.rv.mesh.position.z=2040;q.player.pos.z=2040;});await p.waitForTimeout(400);
  await p.evaluate(()=>{
   const q=__gameQA,stream=q.renderer.domElement.captureStream(30),dest=q.AudioSys.ctx.createMediaStreamDestination();q.AudioSys.master.connect(dest);stream.addTrack(dest.stream.getAudioTracks()[0]);
   window.__rvChunks=[];window.__rvRec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus',videoBitsPerSecond:4000000});__rvRec.ondataavailable=e=>__rvChunks.push(e.data);__rvRec.start();
  });
  await p.keyboard.down('KeyW');await p.waitForTimeout(5000);await p.keyboard.up('KeyW');await p.keyboard.press('KeyI');
  await p.screenshot({path:path.join(out,'01-arrival.png')});
  await p.evaluate(()=>{const q=__gameQA;q.__captureAxis=q.Input.axis;q.Input.axis=()=>{const dx=18-q.player.pos.x,dz=2100-q.player.pos.z,n=Math.hypot(dx,dz);return n>2?{x:-dx/n,y:-dz/n}:{x:0,y:0};};});
  await p.waitForFunction(()=>Math.hypot(__gameQA.player.pos.x-18,__gameQA.player.pos.z-2100)<3);
  await p.evaluate(()=>{__gameQA.Input.axis=__gameQA.__captureAxis;});await p.keyboard.press('KeyI');
  await p.waitForFunction(()=>__gameQA.rvBreakout.state.search>0);
  await p.waitForTimeout(8000);await p.screenshot({path:path.join(out,'02-search.png')});await p.waitForTimeout(11500);await p.screenshot({path:path.join(out,'03-loot.png')});
  const capture=await p.evaluate(async()=>{
   await new Promise(r=>{__rvRec.onstop=r;__rvRec.stop();});const blob=new Blob(__rvChunks,{type:'video/webm'});return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(blob);});
  });fs.writeFileSync(path.join(out,'rv-supply-real-time.webm'),Buffer.from(capture,'base64'));
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({video:'rv-supply-real-time.webm',method:'canvas.captureStream(30) + AudioContext master output; normal RAF; QA staged z=2040 before capture; W/I keys plus scripted movement axis to supply box',audio:'actual game BGM and effects',limitations:['Canvas capture excludes DOM HUD; separate screenshots include HUD','Automated input; not a human playthrough or phone test','Capture was not used for performance measurement']},null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
