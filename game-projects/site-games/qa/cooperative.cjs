// Two independent browser sessions with real menu, keyboard, touch-mode and room actions.
// qa=1 hooks are read-only except the explicitly marked transition/fixture checks.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const base=process.env.GAMES_BASE||'http://127.0.0.1:8923/',out=process.env.GAMES_OUT||path.resolve('game-projects/site-games/media-kit/releases/coop-hub1/captures');
fs.mkdirSync(out,{recursive:true});
const games=(process.env.GAMES_ONLY||'tank,jackal,cadillacs,starship').split(','),paths={tank:'tank-3d',jackal:'jackal-stage1-3d',cadillacs:'cadillacs-stage1-3d',starship:'starship-defense'};
const results=[];const check=(g,name,ok,detail)=>{results.push({game:g,name,ok,detail});console.log(ok?'PASS':'FAIL',g,name,JSON.stringify(detail||{}));if(!ok)throw Error(g+' '+name);};
async function sample(p,g){return p.evaluate(g=>{
 if(g==='tank'){const q=__TANK_TEST__;return {slots:q.coop.room?.players.length,frame:q.world?.f,players:q.world?.seats?.map((s,i)=>({slot:i,x:s.tank?.x,y:s.tank?.y,hp:s.state.hp})),paused:q.state().paused,states:q.coop.stateCount};}
 const q=__COOP_QA__,s=q.snapshot();if(g==='starship')return {slots:q.connection.room?.players.length,frame:s.epoch,players:s.humans.map(h=>({slot:h.s.slot,x:h.p[0],y:h.p[2],hp:h.s.hp,dead:h.s.dead})),paused:s.g.state==='paused',states:q.connection.stateCount,buildings:s.buildings.length,gold:s.g.gold};
 return {slots:q.connection.room?.players.length,frame:s.g.frame??s.g.frames,players:(s.players||s.actors.map(a=>a.s).filter(a=>a.side==='player')).map(a=>({slot:a.slot,x:a.x,y:a.y??a.z,z:a.z,hp:a.hp??a.armor,state:a.state})),paused:g==='jackal'?__JK_TEST__.snapshot().ui.paused:__CD_TEST__.snapshot().ui.paused,states:q.connection.stateCount};
},g);}
(async()=>{
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11']});
for(const g of games){const contexts=[],pages=[],errors=[];
try{
 for(let i=0;i<2;i++){const ctx=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}});contexts.push(ctx);const p=await ctx.newPage();pages.push(p);p.on('pageerror',e=>{errors.push(e.message);console.log('BROWSER ERROR',g,e.message);});await p.goto(base+'html/game/'+paths[g]+'/index.html?test=1&qa=1&q=low');await p.waitForFunction(g=>g==='tank'?window.__TANK_TEST__:window.__COOP_QA__,g);if(g==='tank')await p.evaluate(()=>__TANK_TEST__.manual(true));}
 const [host,guest]=pages;
 if(g==='tank')for(const p of pages)await p.evaluate(()=>__TANK_TEST__.manual(false));
 for(const p of pages)await p.locator('[data-act=coop]').click();
 if(g==='tank'){
  await host.locator('#coop-create').click();await host.waitForFunction(()=>__TANK_TEST__.coop.room);
  const code=await host.evaluate(()=>__TANK_TEST__.coop.room.code);
  await guest.locator('#coop-code').fill(code);await guest.locator('#coop-join').click();await guest.waitForFunction(()=>__TANK_TEST__.coop.room);await guest.locator('#coop-ready').click();await host.waitForFunction(()=>__TANK_TEST__.coop.room.players.every(p=>p.ready));await host.locator('#coop-start').click();await guest.waitForFunction(()=>__TANK_TEST__.coop.stateCount>10);
 }else{
  await host.locator('[data-do=create]').click();await host.waitForFunction(()=>__COOP_QA__.connection.room);
  const code=await host.evaluate(()=>__COOP_QA__.connection.room.code);await guest.locator('[data-field=code]').fill(code);await guest.locator('[data-do=join]').click();await guest.waitForFunction(()=>__COOP_QA__.connection.room);await guest.locator('[data-do=ready]').click();await host.waitForFunction(()=>__COOP_QA__.connection.room.players.every(p=>p.ready));await host.locator('[data-do=start]').click();await guest.waitForFunction(()=>__COOP_QA__.connection.stateCount>10);
 }
 if(g==='cadillacs')await host.waitForFunction(()=>__CD_TEST__.snapshot().mode==='play',null,{timeout:20000});
 else if(g==='tank')await host.waitForFunction(()=>__TANK_TEST__.world?.seats?.every(s=>s.tank));
 else if(g==='jackal')await host.waitForFunction(()=>__JK_TEST__.snapshot().mode==='play');
 await host.waitForTimeout(500);
 const before=await sample(host,g);check(g,'two independently controlled players',before.players.length>=2,before);
 await guest.keyboard.down('KeyD');await guest.keyboard.down('KeyJ');if(g==='cadillacs')await guest.keyboard.press('KeyK');await guest.waitForTimeout(1000);await guest.keyboard.up('KeyD');await guest.keyboard.up('KeyJ');await guest.waitForTimeout(200);
 const moved=await sample(host,g),mirrored=await sample(guest,g),remote=moved.players.find(p=>p.slot===1),previous=before.players.find(p=>p.slot===1);
 check(g,'guest input moves its own player on host',Math.hypot(remote.x-previous.x,(remote.z??remote.y)-(previous.z??previous.y))>.35,{before:previous,after:remote});
 const mirroredRemote=mirrored.players.find(p=>p.slot===1);
 check(g,'guest receives authoritative player state',Math.hypot(remote.x-mirroredRemote.x,(remote.z??remote.y)-(mirroredRemote.z??mirroredRemote.y))<1.5,{host:remote,guest:mirroredRemote,states:mirrored.states});
 await guest.screenshot({path:path.join(out,g+'-guest.png')});
 await guest.keyboard.press('Escape');await host.waitForTimeout(600);const paused=await sample(host,g);check(g,'guest can pause entire team',paused.paused,paused);const frozen=paused.players;await host.waitForTimeout(350);check(g,'pause freezes battlefield',JSON.stringify(frozen)===JSON.stringify((await sample(host,g)).players));
 const resume=g==='starship'?'#btnResume':'[data-act=resume]';await host.locator(resume).first().click();await host.waitForTimeout(400);check(g,'host resumes both clients',!(await sample(host,g)).paused&&!(await sample(guest,g)).paused);
 await host.keyboard.press('Escape');await host.waitForTimeout(350);const restartedBefore=await sample(host,g);const restart=g==='starship'?'#btnRestartLv':'[data-act=restart]';await host.locator(restart).first().click();await host.waitForTimeout(550);const restarted=await sample(host,g);check(g,'host restart stays in same cooperative room',restarted.slots===2&&restarted.players.length>=2&&restarted.frame!==restartedBefore.frame,restarted);
 await host.screenshot({path:path.join(out,g+'-host.png')});
 check(g,'no browser exceptions',errors.length===0,errors);
}catch(e){const states=await Promise.all(pages.map(async(p,i)=>{const s=await sample(p,g).catch(()=>({}));await p.screenshot({path:path.join(out,g+'-error-'+i+'.png')}).catch(()=>{});return s;}));results.push({game:g,name:'run',ok:false,error:e.message,states});console.log('FAIL RUN',g,e.message,JSON.stringify(states));}
finally{for(let i=0;i<contexts.length;i++){const video=pages[i]?.video();await contexts[i].close();if(video)await video.saveAs(path.join(out,g+'-'+(i?'guest':'host')+'.webm'));}}
}
await browser.close();fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify({method:'two independent headless Edge contexts, real DOM and keyboard input; video has no audio; desktop viewport simulation',results},null,2));if(results.some(r=>!r.ok))process.exitCode=1;
})();
