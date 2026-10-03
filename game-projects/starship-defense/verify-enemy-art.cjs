// Browser-level model, combat and rendering checks. QA spawning is explicit;
// captures show current runtime meshes, never concept art or generated imagery.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.join(__dirname,'media-kit/releases/web-friendly-enemies-v0.11.0');
const url=process.env.GAME_URL||'http://127.0.0.1:8896/html/game/starship-defense/index.html';
const captures=path.join(out,'captures');fs.mkdirSync(captures,{recursive:true});
async function stage(page){await page.evaluate(()=>{const q=__gameQA;q.newGame(true);q.clearEntities(true);q.sandboxWave.enabled=false;q.Game.state='battle';q.player.pos.set(0,q.groundY(0,48),48);q.player.mesh.position.copy(q.player.pos);q.CombatControls.set('fire','hold');
  for(let i=0;i<48;i++){const kind=i%12===11?'boss':i%12===10?'miniboss':'mob',m=q.spawnMonster(kind,(i%8-3.5)*4,63+Math.floor(i/8)*5,{ch:q.CHAPTERS[i%10],elite:kind==='mob'&&i%4===0,quiet:true});m.hp=m.maxHp=1e8;}
  for(let i=0;i<4;i++)q.spawnSquad();});}
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 try{
  const ctx=await browser.newContext({viewport:{width:1280,height:720}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  const checks=await p.evaluate(()=>{
   const q=__gameQA,v=q.visuals,models=[],fingerprints=[];
   for(let species=0;species<10;species++)for(const rank of ['mob','elite','miniboss','boss','queen']){
    const r=v.bug(1,rank,!!q.CHAPTERS[species].fly,species),again=v.bug(1,rank,!!q.CHAPTERS[species].fly,species);let finite=true,triangles=0,draws=0,top=0;
    r.traverse(o=>{if(!o.isMesh)return;draws++;const g=o.geometry;triangles+=(g.index?g.index.count:g.attributes.position.count)/3;for(const value of g.attributes.position.array)if(!Number.isFinite(value))finite=false;g.computeBoundingBox();top=Math.max(top,g.boundingBox.max.y+o.position.y);});
    const a=r.userData.toy;models.push({species,rank,form:r.userData.enemy.form,finite,triangles,draws,height:r.userData.visualHeight,top,shared:a.body.geometry===again.userData.toy.body.geometry});
    if(rank==='mob'){let h=2166136261;for(const n of new Uint8Array(a.body.geometry.attributes.position.array.buffer)){h^=n;h=Math.imul(h,16777619);}fingerprints.push(h>>>0);}
   }
   q.newGame(true);q.clearEntities(true);q.sandboxWave.enabled=false;q.Game.state='paused';
   const interactions=[];
   for(const kind of ['mob','miniboss','boss','queen']){
    const m=q.spawnMonster(kind,0,50,{ch:q.CHAPTERS[0],quiet:true});const before=m.hp;q.damageMonster(m,1);const damaged=m.hp===before-1;q.damageMonster(m,1e9);v.update(1);interactions.push({kind,damaged,dead:m.dead,removed:m.mesh.parent===null});
   }
   const split=q.spawnMonster('mob',0,60,{ch:q.CHAPTERS[5],quiet:true});q.damageMonster(split,1e9);
   const children=q.monsters.filter(m=>!m.dead);const splitChildren=children.length,splitForms=children.every(m=>m.mesh.userData.enemy.form==='seed-cluster');
   q.clearEntities(true);const elite=q.spawnMonster('mob',0,50,{ch:q.CHAPTERS[9],elite:true,affix:'tank',quiet:true});
   const markers={healthAboveHead:elite.bar.position.y>elite.mesh.userData.visualHeight,gemAboveHealth:elite.gem.position.y>elite.bar.position.y};
   const animated=v.bug(),a=animated.userData.toy;animated.position.copy(q.camera.position);a.time=0;v.animate(animated,.1,'Walk',q.camera);const walks=a.feet.some(f=>Math.abs(f.rotation.x)>.01);
   return {models,distinctMobMeshes:new Set(fingerprints).size,interactions,splitChildren,splitForms,markers,walks};
  });
  assert.equal(checks.models.length,50);assert.equal(checks.distinctMobMeshes,10);
  assert(checks.models.every(m=>m.finite&&m.shared&&m.draws<=6&&m.height>=m.top-.06),JSON.stringify(checks.models.filter(m=>!m.finite||!m.shared||m.draws>6||m.height<m.top-.06)));
  assert(checks.interactions.every(m=>m.damaged&&m.dead&&m.removed));assert.equal(checks.splitChildren,1);assert(checks.splitForms&&checks.markers.healthAboveHead&&checks.markers.gemAboveHealth&&checks.walks);
  console.log('PASS 50 species/rank variants: geometry, shared resources, animation, damage, death, split and markers');
  const runs=[];
  for(const quality of ['smooth','high']){
   await p.evaluate(q=>{localStorage.setItem('chongchao-quality',q);},quality);await p.reload();await p.waitForFunction(()=>window.__gameQA);await stage(p);await p.waitForTimeout(1200);await p.evaluate(()=>__gameQA.startMeasure());
   for(const mode of ['near','high','top','first']){await p.evaluate(m=>{__gameQA.setCameraView(m==='top'?2:m==='high'?1:0);__gameQA.setCamMode(m==='first'?'first':'third');},mode);await p.keyboard.down('KeyE');await p.keyboard.down('KeyD');await p.waitForTimeout(3300);await p.keyboard.up('KeyD');await p.keyboard.up('KeyE');}
   const perf=await p.evaluate(()=>{const q=__gameQA;return {...q.endMeasure(),live:q.monsters.filter(m=>!m.dead).length,squad:q.squad.length};});runs.push(perf);
  }
  await stage(p);await p.waitForTimeout(1300);await p.screenshot({path:path.join(captures,'battle-desktop.png')});
  assert.deepEqual(errors,[]);await ctx.close();
  const movie=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:captures,size:{width:1280,height:720}}});const mp=await movie.newPage();await mp.goto(url+'?qa=1');await mp.waitForFunction(()=>window.__gameQA);await stage(mp);await mp.keyboard.down('KeyJ');
  for(const mode of ['near','high','top','first']){await mp.evaluate(m=>{__gameQA.setCameraView(m==='top'?2:m==='high'?1:0);__gameQA.setCamMode(m==='first'?'first':'third');},mode);await mp.keyboard.down('KeyE');await mp.waitForTimeout(3500);await mp.keyboard.up('KeyE');}
  await mp.keyboard.up('KeyJ');const video=mp.video();await movie.close();fs.renameSync(await video.path(),path.join(captures,'battle-rotation.webm'));
  const mobile=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,deviceScaleFactor:1}),phone=await mobile.newPage();phone.on('pageerror',e=>errors.push(e.message));await phone.goto(url+'?qa=1');await phone.waitForFunction(()=>window.__gameQA);await phone.locator('#btnStart').tap();await stage(phone);await phone.waitForTimeout(700);await phone.screenshot({path:path.join(captures,'battle-phone.png')});
  const touch=await phone.evaluate(()=>({touch:__gameQA.isTouch,width:innerWidth,height:innerHeight,canvas:document.querySelector('canvas').width,transform:getComputedStyle(document.getElementById('stage')).transform}));assert(touch.touch);await mobile.close();
  fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({checks,runs,errors,touch,method:'Headless Edge / ANGLE D3D11, desktop GPU. 48 mixed enemies and four squadmates; actual keyboard movement and rotation in all four views. Performance excludes video capture. Phone viewport emulation, not physical phone/S9.'},null,2));
  console.log(JSON.stringify(runs.map(r=>({quality:r.quality,averageFPS:r.averageFPS,p95:r.p95Ms,over50:r.over50ms,triangles:r.triangles,drawCalls:r.drawCalls,live:r.live,renderer:r.renderer})),null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
