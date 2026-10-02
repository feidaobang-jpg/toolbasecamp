// Browser collision/geometry validation plus current-build gameplay footage.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.argv[2],url=process.argv[3]||'http://127.0.0.1:8765/public/html/game/tank-3d/index.html';
(async()=>{
 fs.mkdirSync(out,{recursive:true});const b=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});const results=[];
 try {for(const mobile of [false,true]){
  const p=await b.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,locale:'zh-CN'}),errors=[];
  p.on('pageerror',e=>errors.push(String(e)));p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await p.route('**/scene.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+'\nwindow.collisionThree=THREE;'});});
  await p.route('**/main.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:await r.text()+'\nwindow.collisionAudio=audio;'});});
  await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.tankQa);await p.locator('#start').click();await p.waitForTimeout(3400);await p.keyboard.press('Escape');
  const geometry=await p.evaluate(()=>{
    const {world:w,view:v,W}=tankQa,T=collisionThree;w.enemies=[];w.spawning=[];w.bullets=[];w.rosterIndex=w.roster.length;
    w.grid.fill(W.STEEL);for(const x of [12,13])for(const z of [12,13])w.grid[z*W.N+x]=W.EMPTY;
    Object.assign(w.player,{x:13,z:13,dir:0,shield:0});v.reset();v.relayout();v.update(.3);let checks=0;
    for(const level of [0,1,2,3])for(let dir=0;dir<4;dir++){
      w.level=level;W.turnTank(w,w.player,dir);v.update(1/60);
      const box=new T.Box3().setFromObject(v.scene.getObjectByName('tank-'+w.player.id));
      if(box.min.x<-.981||box.max.x>.981||box.min.z<-.981||box.max.z>.981)throw Error('Mesh crosses collision bounds '+JSON.stringify({level,dir,min:box.min,max:box.max}));checks++;
    }
    const template=w.player;w.player=null;
    for(const [i,type]of ['basic','fast','power','armor'].entries()){
      const enemy={...template,id:900+i,type,team:'enemy'};w.enemies=[enemy];v.reset();v.update(.3);v.update(.3);
      for(let dir=0;dir<4;dir++){
        W.turnTank(w,enemy,dir);v.update(1/60);const box=new T.Box3().setFromObject(v.scene.getObjectByName('tank-'+enemy.id));
        if(box.min.x<-.981||box.max.x>.981||box.min.z<-.981||box.max.z>.981)throw Error('Enemy mesh crosses bounds '+type+':'+dir);checks++;
      }
    }
    // Validate instanced visible walls against the collision grid after every level change.
    for(let stage=1;stage<=50;stage++){
      Object.assign(w,W.createWorld(77,stage));v.reset();v.relayout();v.update(.5);
      const wallMeshes=v.scene.children.filter(m=>m.isInstancedMesh&&m.count===W.N*W.N);
      for(let i=0;i<w.grid.length;i++){
        const visible=wallMeshes.filter(m=>{const a=m.instanceMatrix.array,o=i*16;return Math.abs(a[o])+Math.abs(a[o+5])+Math.abs(a[o+10])>0;}).length;
        if(visible!==Number(w.grid[i]===W.BRICK||w.grid[i]===W.STEEL))throw Error('Visible/collision wall mismatch '+stage+':'+i);
      }
    }
    Object.assign(w,W.createWorld(77));W.startWorld(w);W.stepWorld(w,{dir:-1,fire:false},.81);w.enemies=[];w.spawning=[];w.rosterIndex=w.roster.length;w.demoMode=true;
    Object.assign(w.player,{x:5,z:19,dir:1,shield:0});v.reset();v.relayout();v.update(.3);
    return {modelBoundsChecks:checks,stageWallLayouts:50};
  });
  await p.keyboard.press('Escape');
  // Measure without recording, while pressing into the brick column and turning along it.
  await p.evaluate(()=>{window.frameSamples=[];let last=performance.now();function tick(t){frameSamples.push(t-last);last=t;window.perfRaf=requestAnimationFrame(tick);}perfRaf=requestAnimationFrame(tick);});
  if(mobile){
    const cdp=await p.context().newCDPSession(p),point=await p.evaluate(()=>{const r=document.querySelector('#stick').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2+35};});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});await p.waitForTimeout(1500);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }else{await p.keyboard.down('KeyD');await p.waitForTimeout(1500);await p.keyboard.up('KeyD');}
  const stopped=await p.evaluate(()=>tankQa.world.player.x);assert.ok(stopped>5.01&&stopped<=6-.98+1e-6);
  await p.keyboard.down('KeyW');await p.waitForTimeout(1500);await p.keyboard.up('KeyW');await p.keyboard.press('KeyC');
  await p.keyboard.down('KeyD');await p.waitForTimeout(1500);await p.keyboard.up('KeyD');
  const perf=await p.evaluate(()=>{cancelAnimationFrame(perfRaf);const a=frameSamples.slice(1).sort((a,b)=>a-b),r=tankQa.view.renderer,g=r.getContext(),e=g.getExtension('WEBGL_debug_renderer_info');return {fps:a.length*1000/a.reduce((s,x)=>s+x,0),median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],over50:a.filter(x=>x>50).length,frames:a.length,renderer:e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER),dpr:r.getPixelRatio(),buffer:[g.drawingBufferWidth,g.drawingBufferHeight],drawCalls:r.info.render.calls,triangles:r.info.render.triangles,recording:false};});
  // Actual canvas + game-audio recording, after performance sampling.
  await p.evaluate(async()=>{await collisionAudio.unlock();const stream=document.querySelector('canvas').captureStream(30);for(const t of collisionAudio.capture.stream.getAudioTracks())stream.addTrack(t);const chunks=[],rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus'});rec.ondataavailable=e=>chunks.push(e.data);window.endCapture=()=>new Promise(resolve=>{rec.onstop=async()=>resolve(Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())));rec.stop();});rec.start();});
  await p.keyboard.down('KeyD');await p.waitForTimeout(1000);await p.keyboard.up('KeyD');
  await p.screenshot({path:path.join(out,mobile?'phone-wall.png':'desktop-wall.png')});
  await p.keyboard.down('KeyJ');await p.keyboard.down('KeyD');await p.waitForTimeout(1600);await p.keyboard.up('KeyJ');await p.keyboard.up('KeyD');
  await p.keyboard.press('KeyC');await p.waitForTimeout(600);
  // Rebuild a fort with the player standing in a destroyed wall cell; drive out and see it restore.
  await p.evaluate(()=>{const {world:w,W,view:v}=tankQa;w.grid.fill(W.EMPTY);w.gridVersion++;w.bullets=[];Object.assign(w.player,{x:12,z:23.3,dir:0});W.qa.applyPowerup(w,{type:'shovel',x:12,z:23.3});v.relayout();});
  await p.waitForTimeout(800);await p.keyboard.down('KeyW');await p.waitForTimeout(800);await p.keyboard.up('KeyW');await p.waitForTimeout(500);
  await p.screenshot({path:path.join(out,mobile?'phone-fort.png':'desktop-fort.png')});
  fs.writeFileSync(path.join(out,mobile?'phone-collision.webm':'desktop-collision.webm'),Buffer.from(await p.evaluate(()=>endCapture())));
  const fort=await p.evaluate(()=>({pending:tankQa.world.pendingBaseWall.length,z:tankQa.world.player.z}));assert.equal(fort.pending,0);assert.ok(fort.z<22);
  assert.deepEqual(errors,[]);results.push({mobile,geometry,stopped,fort,perf,errors});await p.close();
 }
 fs.writeFileSync(path.join(out,'browser.json'),JSON.stringify({url,browser:b.version(),captureMode:'realtime-automation',audio:'game',results},null,2));console.log(JSON.stringify(results));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exit(1);});
