// Fixed-step balance probes are marked as simulation; FPS/capture use the live browser clock separately.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
const out=process.env.ACID_OUT||path.join(require('node:os').tmpdir(),'acid-arena-measure');
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 try{const p=await browser.newPage({viewport:{width:1280,height:720}});await p.goto(process.env.ACID_URL||'http://127.0.0.1:8779/html/game/starship-defense/index.html?qa=1');await p.waitForFunction(()=>window.__gameQA);
 const probes=await p.evaluate(()=>{const q=__gameQA,a=q.acidArena,results=[];q.AudioSys.init();q.AudioSys.master.gain.value=0;
  const effects={sfx:q.AudioSys.sfx,noise:q.AudioSys.noise,tone:q.AudioSys.tone};q.AudioSys.sfx=q.AudioSys.noise=q.AudioSys.tone=()=>{};
  for(const strategy of ['stationary','circle','avoid']){a.start();const s=a.state,player=q.player,roundTimes=[];let prior=1,steer={x:0,z:0},minLife=3;
   for(let frame=0;frame<18000&&s.phase!=='result';frame++){
    if(s.phase==='upgrade'){roundTimes.push(s.elapsed);a.choose(s.round===1?'breach':'pierce');prior=s.round;}
    if(strategy==='circle'){const t=s.elapsed*.7,target={x:Math.cos(t)*8,z:Math.sin(t)*6},dx=target.x-player.pos.x,dz=target.z-(player.pos.z+1700),l=Math.hypot(dx,dz)||1;steer={x:dx/l,z:dz/l};}
    if(strategy==='avoid'&&frame%6===0){let best=Infinity;for(let n=0;n<17;n++){const t=n*Math.PI/8,dx=n===16?0:Math.cos(t),dz=n===16?0:Math.sin(t);let score=0;
      for(const time of [.12,.3,.5,.75]){const x=Math.max(-14,Math.min(14,player.pos.x+dx*8.8*time)),z=Math.max(-10,Math.min(10,player.pos.z+1700+dz*8.8*time));
       for(const b of s.acid){const d=Math.hypot(b.x+b.vx*time-x,b.z+b.vz*time-z);if(d<.92)score+=10000;else if(d<2.5)score+=8/(d*d);}
       score+=Math.max(0,Math.abs(x)-11)*2+Math.max(0,Math.abs(z)-7)*2;
      }
      score+=(dx-steer.x)**2*.2+(dz-steer.z)**2*.2;if(score<best){best=score;steer={x:dx,z:dz};}
     }}
    q.Input.joy={active:true,id:-1,x:-steer.x,y:-steer.z};a.update(1/60);minLife=Math.min(minLife,player.hp);
   }
   roundTimes.push(s.elapsed);results.push({strategy,phase:s.phase,round:s.round,kills:s.kills,hits:s.hits,hp:player.hp,seconds:s.elapsed,roundTimes,weakHits:s.weakHits});a.stop();q.Game.state='menu';
  }
  Object.assign(q.AudioSys,effects);return results;
 });fs.writeFileSync(path.join(out,'balance.json'),JSON.stringify({method:'fixed-step simulation; real damage and no invulnerability',probes},null,2));console.log(JSON.stringify(probes));
 await p.close();if(process.env.BALANCE_ONLY==='1')return;
 // Live measurement is separate from recording and screenshot overhead.
 for(const [width,height] of [[1280,720],[844,390]]){const page=await browser.newPage({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000});await page.goto('http://127.0.0.1:8779/html/game/starship-defense/index.html?qa=1');await page.waitForFunction(()=>window.__gameQA);
  await page.locator('#btnAcid').click();await page.locator('#btnModeStart').click();await page.locator('#acidStart').click();
  await page.evaluate(()=>{const q=__gameQA;q.AudioSys.master.gain.value=0;const a=q.acidArena;for(let round=1;round<3;round++){for(const e of a.state.enemies)a.hurt(e,100000);a.update(1/60);a.choose('pierce');}q.player.invulnerable=1000;q.CombatControls.set('fire','hold');});
  await page.waitForTimeout(2000);await page.evaluate(()=>__gameQA.startMeasure());await page.keyboard.down('KeyE');await page.waitForTimeout(8000);await page.keyboard.up('KeyE');
  const fps=await page.evaluate(()=>__gameQA.endMeasure());fs.writeFileSync(path.join(out,width+'x'+height+'-performance.json'),JSON.stringify({...fps,method:'live browser; third-round fixture; invulnerability only for continuous sampling; no recording'},null,2));console.log(JSON.stringify({viewport:[width,height],fps:fps.averageFPS,p95:fps.p95Ms,drawCalls:fps.drawCalls,renderer:fps.renderer}));await page.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
