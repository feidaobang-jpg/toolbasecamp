const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const out=process.argv[2];fs.mkdirSync(out,{recursive:true});
 const b=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 try {
 const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];
 p.on('pageerror',e=>errors.push(String(e)));
 await p.addInitScript(()=>CanvasRenderingContext2D.prototype.roundRect=undefined);
 await p.goto('http://127.0.0.1:8765/public/html/game/tank-3d/index.html?qa=1');await p.waitForFunction(()=>window.tankQa);
 await p.keyboard.press('Enter');await p.waitForTimeout(3500);
 await p.evaluate(()=>{tankQa.world.demoMode=true;window.samples=[];let last=performance.now();function tick(t){samples.push(t-last);last=t;window.sampleFrame=requestAnimationFrame(tick);}sampleFrame=requestAnimationFrame(tick);});
 await p.keyboard.down('KeyJ');await p.keyboard.down('KeyW');await p.waitForTimeout(3000);await p.keyboard.up('KeyW');
 await p.evaluate(()=>tankQa.W.spawnPowerup(tankQa.world,'star'));await p.waitForTimeout(2000);
 await p.keyboard.press('KeyC');await p.keyboard.down('KeyD');await p.waitForTimeout(3000);await p.keyboard.up('KeyD');await p.keyboard.up('KeyJ');
 const perf=await p.evaluate(()=>{cancelAnimationFrame(sampleFrame);const a=samples.slice(1).sort((a,b)=>a-b),r=tankQa.view.renderer,g=r.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {fps:a.length*1000/a.reduce((s,v)=>s+v,0),median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],over50:a.filter(v=>v>50).length,frames:a.length,renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),dpr:r.getPixelRatio(),buffer:[g.drawingBufferWidth,g.drawingBufferHeight],drawCalls:r.info.render.calls,triangles:r.info.render.triangles,recording:false};});
 // Check repeated effects do not increase geometry buffers after warmup.
 const memory=await p.evaluate(()=>{const q=tankQa;q.view.effect({type:'freeze'});q.view.update(.6);const before=q.view.renderer.info.memory.geometries;for(let i=0;i<100;i++){q.view.effect({type:'freeze'});q.view.update(.6);}return {before,after:q.view.renderer.info.memory.geometries};});assert.equal(memory.after,memory.before);
 await p.evaluate(()=>{const q=tankQa;Object.assign(q.world,q.W.createWorld(19070));q.W.startWorld(q.world);q.view.reset();q.view.relayout();q.world.demoMode=true;const chunks=[],rec=new MediaRecorder(document.querySelector('canvas').captureStream(30),{mimeType:'video/webm;codecs=vp8'});rec.ondataavailable=e=>chunks.push(e.data);window.stopRecording=()=>new Promise(resolve=>{rec.onstop=async()=>resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));rec.stop();});rec.start();});
 await p.keyboard.down('KeyW');await p.keyboard.down('KeyJ');await p.waitForTimeout(2000);
 await p.evaluate(()=>tankQa.W.spawnPowerup(tankQa.world,'helmet'));await p.waitForTimeout(1500);await p.screenshot({path:path.join(out,'powerup-realtime.png')});
 await p.keyboard.press('KeyC');await p.waitForTimeout(1500);await p.keyboard.up('KeyW');await p.keyboard.up('KeyJ');
 fs.writeFileSync(path.join(out,'powerup-realtime.webm'),Buffer.from(await p.evaluate(()=>stopRecording())));
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'realtime.json'),JSON.stringify({perf,memory,errors,browser:b.version(),capture:'realtime-automation',audio:'none'},null,2));console.log(JSON.stringify({perf,memory,errors}));
 } finally {await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
