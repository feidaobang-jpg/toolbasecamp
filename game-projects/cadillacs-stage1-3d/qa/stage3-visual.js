// 第三关实时移动/转镜头、性能与原声采集；先用标注夹具跳过开场战斗。
const fs=require('fs');const {launch,BASE,out,sleep}=require('./lib');let b;
const stats=a=>{a=a.slice().sort((x,y)=>x-y);return {samples:a.length,fps:1000/(a.reduce((x,y)=>x+y,0)/a.length),median:a[Math.floor(a.length/2)],p95:a[Math.floor(a.length*.95)],over50:a.filter(v=>v>50).length};};
(async()=>{
 b=await launch();const mobile=process.argv.includes('--mobile'),record=process.argv.includes('--record')&&!mobile,p=await b.newPage({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile}),runs=[],errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>{localStorage.setItem('cd3d-stage1:stage','2');});
 await p.goto(BASE+'?test=1&seed=33&q='+(mobile?'low':'high'));await sleep(1600);await p.locator('[data-act=select]').first().click();await p.keyboard.press('Enter');await sleep(400);
 await p.evaluate(()=>{const C=__CD_TEST__.cheat,G=C.G;G.pending=[];C.killAll();G.waveOn=false;G.wave=1;G.road.called=true;});
 await p.waitForFunction(()=>__CD_TEST__.snapshot().road.mounted);
 if(mobile)await p.evaluate(()=>document.querySelector('#pause [data-control-mode=show]').click());
 if(record)await p.evaluate(()=>__CD_TEST__.startCapture(30));
 for(let cam=0;cam<4;cam++){
   await p.evaluate(cam=>{__CD_TEST__.setCamera(cam);const R=__CD_TEST__.cheat.G.road;R.hp=180;R.invul=8;},cam);
   await p.keyboard.down('KeyD');await sleep(400);await p.keyboard.up('KeyD');
   await p.keyboard.down('KeyE');await sleep(250);await p.evaluate(()=>__CD_TEST__.perfStart());await sleep(cam===3?6800:4500);await p.keyboard.up('KeyE');
   const perf=await p.evaluate(()=>__CD_TEST__.perfStop()),info=await p.evaluate(()=>__CD_TEST__.renderInfo());
   runs.push({camera:cam,frames:stats(perf.frames),work:stats(perf.work),renderer:info,snapshot:await p.evaluate(()=>__CD_TEST__.snapshot())});
   console.log('VIEW',cam,JSON.stringify(runs.at(-1).frames));await p.screenshot({path:out('stage3-'+(mobile?'mobile':'desktop')+'-view'+cam+'.png')});
 }
 // 回默认侧视记录Boss出场、落点与撞击。
 await p.evaluate(()=>{const T=__CD_TEST__,G=T.cheat.G;T.setCamera(0);G.road.x=286;G.road.baseX=286;G.road.hp=180;G.road.invul=3;});
 await sleep(2800);await p.keyboard.down('KeyW');await sleep(1100);await p.keyboard.up('KeyW');await p.keyboard.press('KeyJ');await sleep(1500);
 await p.screenshot({path:out('stage3-'+(mobile?'mobile':'desktop')+'-boss.png')});
 if(record){const data=await p.evaluate(()=>__CD_TEST__.stopCapture());fs.writeFileSync(out('stage3-realtime.webm'),Buffer.from(data,'base64'));}
 if(mobile){await p.setViewportSize({width:390,height:844});await sleep(700);await p.screenshot({path:out('stage3-mobile-driving-portrait.png')});}
 fs.writeFileSync(out('stage3-visual-'+(record?'record':mobile?'mobile':'desktop')+'.json'),JSON.stringify({method:'Realtime Edge hardware renderer, keyboard movement and a full horizontal turn in each preset. Setup and Boss distance use explicit fixtures; phone viewport simulation, not a real phone. Recording run timing is excluded from performance conclusions.',viewport:mobile?[844,390]:[1280,720],quality:mobile?'low':'high',recording:record,runs,errors},null,2));
 await b.close();if(errors.length)process.exitCode=1;
})().catch(async e=>{console.error(e);if(b)await b.close();process.exitCode=1;});
