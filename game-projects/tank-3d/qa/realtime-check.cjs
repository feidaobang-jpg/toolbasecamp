const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
const out=process.argv[2];fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
const c=await b.newContext({viewport:{width:1280,height:720},});
const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(String(e)));
await p.route('**/main.js*',async r=>{const v=await r.fetch();await r.fulfill({response:v,body:await v.text()+'\nimport * as W from "./world.js"; window.qa={world,view,W};'});});
await p.route('**/scene.js*',async r=>{const v=await r.fetch();await r.fulfill({response:v,body:(await v.text()).replace('new THREE.WebGLRenderer({','new THREE.WebGLRenderer({ preserveDrawingBuffer: true,')});});
await p.goto('http://127.0.0.1:8765/public/html/game/tank-3d/index.html');await p.waitForFunction(()=>window.qa);
await p.evaluate(()=>{const chunks=[];const recorder=new MediaRecorder(document.querySelector('canvas').captureStream(30),{mimeType:'video/webm;codecs=vp8'});recorder.ondataavailable=e=>chunks.push(e.data);window.stopCapture=()=>new Promise(r=>{recorder.onstop=async()=>r(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));recorder.stop();});recorder.start();});
await p.keyboard.press('Enter');await p.waitForTimeout(3800);
// Targeted lifecycle checks use explicit QA hooks, then restore a fresh world for the real-time sample.
const lifecycle=await p.evaluate(()=>{const {world:w,W}=qa;const run=s=>{for(let i=0;i<s*60;i++)W.stepWorld(w,{dir:-1,fire:false},1/60);w.events.length=0;};w.enemies=[];w.spawning=[];w.spawnTimer=999;
for(let i=0;i<5;i++){if(!w.player)run(3);w.player.shield=0;W.qa.killPlayer(w);run(2);if(!w.player)throw Error('No respawn');if(w.player.shield<=0)throw Error('No protection');}
run(5);if(w.player.shield>0)throw Error('Shield never expires');w.demoMode=true;const id=w.player.id;W.qa.killPlayer(w);if(w.player?.id!==id)throw Error('Demo kill');w.demoMode=false;W.qa.killPlayer(w);if(w.player)throw Error('Normal kill');
Object.assign(w,W.createWorld(275));W.startWorld(w);return {deaths:5,respawn:true,protectionExpires:true,demoToggle:true};});
await p.waitForTimeout(1000);await p.keyboard.down('KeyW');await p.keyboard.down('KeyJ');await p.waitForTimeout(1800);await p.keyboard.up('KeyW');
await p.screenshot({path:path.join(out,'realtime-battle.png')});
const perf=await p.evaluate(()=>new Promise(resolve=>{const samples=[];let last=performance.now(),start=last;function tick(t){samples.push(t-last);last=t;if(t-start<8000)return requestAnimationFrame(tick);const a=samples.slice(1).sort((a,b)=>a-b),g=qa.view.renderer.getContext(),ext=g.getExtension('WEBGL_debug_renderer_info');resolve({fps:samples.length*1000/(t-start),median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],over50:a.filter(v=>v>50).length,renderer:ext?g.getParameter(ext.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),drawCalls:qa.view.renderer.info.render.calls,triangles:qa.view.renderer.info.render.triangles,dpr:devicePixelRatio,buffer:[g.drawingBufferWidth,g.drawingBufferHeight],recording:true});}requestAnimationFrame(tick);}));
await p.keyboard.press('KeyE');await p.keyboard.down('KeyD');await p.waitForTimeout(1800);await p.keyboard.up('KeyD');await p.keyboard.up('KeyJ');await p.screenshot({path:path.join(out,'realtime-top.png')});await p.keyboard.press('KeyC');await p.waitForTimeout(1500);
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'realtime-qa.json'),JSON.stringify({lifecycle,perf,errors,browser:b.version(),capture:'realtime-automation',audio:'none'},null,2));
fs.writeFileSync(path.join(out,'realtime-play.webm'),Buffer.from(await p.evaluate(()=>stopCapture())));await c.close();await b.close();console.log({lifecycle,perf,errors});
})().catch(e=>{console.error(e);process.exit(1)});

