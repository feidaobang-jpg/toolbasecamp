// v0.9 frame-time sampling: bigger map, tunnels and dark theme under a 48-bug moving fight.
// Desktop GPU automation only; not a phone hardware measurement.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases/web-feedback-v0.9.0');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
(async()=>{
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-gpu-vsync','--disable-frame-rate-limit']});
 const runs=[];
 for(const [theme,quality,view] of [['dark','high','third'],['dark','smooth','third'],['dark','high','first'],['toy','high','third']]){
  const c=await b.newContext({viewport:{width:1280,height:720}});const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url+'?qa=1&theme='+theme);await p.waitForFunction(()=>window.__gameQA);
  await p.evaluate(q=>{localStorage.setItem('chongchao-quality',q);},quality);await p.reload();await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(500);
  await p.evaluate(v=>{const q=__gameQA;q.newGame(true);q.sandboxSpawn('clear');q.sandboxWave.enabled=false;q.player.pos.set(0,0,40);q.player.mesh.position.copy(q.player.pos);q.setCamMode(v,false);q.setCamYaw(0);q.Game.curWeapon='laser';
    for(let i=0;i<48;i++){const m=q.spawnMonster('mob',(i%8-3.5)*4,58+Math.floor(i/8)*5,{ch:q.CHAPTERS[i%10],elite:i%7===0,quiet:true});m.hp=m.maxHp=1e7;m.emerge=0;}},view);
  await p.waitForTimeout(800);await p.keyboard.down('KeyJ');await p.evaluate(()=>__gameQA.startMeasure());
  for(let i=0;i<6;i++){await p.keyboard.down(i%2?'KeyA':'KeyD');await p.keyboard.down(i%2?'KeyQ':'KeyE');await p.waitForTimeout(2500);await p.keyboard.up(i%2?'KeyQ':'KeyE');await p.keyboard.up(i%2?'KeyA':'KeyD');}
  const m=await p.evaluate(()=>__gameQA.endMeasure());await p.keyboard.up('KeyJ');
  const live=await p.evaluate(()=>__gameQA.monsters.filter(m=>!m.dead).length);
  delete m.raw;runs.push({theme,quality,view,liveBugs:live,...m,errors});
  await c.close();
 }
 await b.close();
 const out={version:'web-feedback-v0.9.0',measured_at:new Date().toISOString(),method:'headless Edge (ANGLE D3D11, vsync off) 1280x720, 15 s laser fire while strafing and turning, 48 bugs + 4 squad (test mode); desktop GPU only, not phone hardware',runs};
 fs.writeFileSync(path.join(release,'performance.json'),JSON.stringify(out,null,1));
 console.log(JSON.stringify(runs.map(r=>({theme:r.theme,quality:r.quality,view:r.view,fps:Math.round(r.averageFPS),p95:+r.p95Ms.toFixed(1),over50:r.over50ms,draws:r.drawCalls,tris:r.triangles,bugs:r.liveBugs,renderer:r.renderer,errors:r.errors.length})),null,1));
})().catch(e=>{console.error(e);process.exit(1);});
