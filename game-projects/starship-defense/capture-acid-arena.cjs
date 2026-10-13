// Real-time 16:9 play capture. The script steers by observed projectile positions;
// no invulnerability, enemy damage, clock speed or round state is changed.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
const out=process.env.ACID_OUT||path.join(require('node:os').tmpdir(),'acid-arena-capture');
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--mute-audio']});
 const ctx=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}}),page=await ctx.newPage();
 try{await page.goto(process.env.ACID_URL||'http://127.0.0.1:8779/html/game/starship-defense/index.html?qa=1');await page.waitForFunction(()=>window.__gameQA);
  await page.locator('#btnAcid').click();await page.locator('#btnModeStart').click();await page.waitForTimeout(1000);await page.locator('#acidStart').click();
  const events=[];let held=[],lastPhase='',lastScreen=0;const start=Date.now();
  while(Date.now()-start<130000){const action=await page.evaluate(()=>{const q=__gameQA,s=q.acidArena.state,p=q.player;let score=Infinity,keys=[];
    for(const [dx,dz,ks] of [[0,0,[]],[-1,0,['KeyD']],[1,0,['KeyA']],[0,1,['KeyW']],[0,-1,['KeyS']],[-.707,.707,['KeyD','KeyW']],[.707,.707,['KeyA','KeyW']],[-.707,-.707,['KeyD','KeyS']],[.707,-.707,['KeyA','KeyS']]]){let n=0;
      for(const t of [.15,.35,.6]){const x=Math.max(-14,Math.min(14,p.pos.x+dx*8.8*t)),z=Math.max(-10,Math.min(10,p.pos.z+1700+dz*8.8*t));
       for(const b of s.acid){const d=Math.hypot(b.x+b.vx*t-x,b.z+b.vz*t-z);n+=d<1?10000:d<2.5?8/(d*d):0;}n+=Math.max(0,Math.abs(x)-11)*2+Math.max(0,Math.abs(z)-7)*2;
      }if(n<score){score=n;keys=ks;}}
    return {keys,phase:s.phase,round:s.round,elapsed:s.elapsed,hp:p.hp,kills:s.kills};});
   for(const k of held.filter(k=>!action.keys.includes(k)))await page.keyboard.up(k);for(const k of action.keys.filter(k=>!held.includes(k)))await page.keyboard.down(k);held=action.keys;
   if(action.phase!==lastPhase){events.push({...action,videoOffsetEstimate:(Date.now()-start)/1000});lastPhase=action.phase;}
   if(action.elapsed-lastScreen>8){await page.screenshot({path:path.join(out,'play-'+Math.floor(action.elapsed)+'.png')});lastScreen=action.elapsed;}
   if(action.phase==='upgrade'){for(const k of held)await page.keyboard.up(k);held=[];await page.waitForTimeout(800);await page.locator('[data-upgrade="'+(action.round===1?'breach':'pierce')+'"]').click();}
   if(action.phase==='result'){await page.screenshot({path:path.join(out,'result.png')});await page.waitForTimeout(1800);break;}
   await page.waitForTimeout(80);
  }
  for(const k of held)await page.keyboard.up(k);fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify({method:'Real-time automated keyboard play; predictive steering; normal damage; video silent',events},null,2));
 }finally{await ctx.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
