const fs=require('node:fs');
const {chromium}=require(process.env.PW||'D:/project/godot/absurd-3d-daily/node_modules/playwright');
const OUT=process.env.QA_OUTPUT||'D:/project/toolbasecamp-artifacts/chongchao-conquest-20261009';
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
 const c=await b.newContext({viewport:{width:1440,height:810},recordVideo:{dir:OUT,size:{width:1440,height:810}}}),p=await c.newPage(),errors=[],requests=[];
 try{
 p.on('pageerror',e=>errors.push(e.message));p.on('requestfailed',r=>requests.push({url:r.url(),error:r.failure()}));
 await p.route('**/*',route=>{const u=route.request().url();if(!u.startsWith('http://127.0.0.1:8908/')&&!u.startsWith('data:'))return route.abort();return route.continue();});
 await p.goto('http://127.0.0.1:8908/?qa=1');await p.waitForFunction(()=>window.__ccReady&&window.__gameQA);
 await p.click('#btnVersus');await p.click('[data-vs-size="4"]');await p.click('[data-vs-ai="normal"]');
 await p.keyboard.down('KeyW');await p.waitForTimeout(6000);await p.keyboard.up('KeyW');await p.keyboard.press('KeyZ');
 await p.keyboard.down('KeyJ');await p.waitForTimeout(1600);await p.keyboard.up('KeyJ');await p.keyboard.press('KeyR');await p.waitForTimeout(2800);
 await p.screenshot({path:OUT+'/battlefield-first-person.png'});await p.keyboard.press('KeyZ');await p.keyboard.press('KeyC');
 await p.keyboard.down('KeyW');await p.waitForTimeout(5000);await p.keyboard.up('KeyW');await p.waitForTimeout(1000);
 await p.screenshot({path:OUT+'/battlefield-desktop.png'});
 const runtime=await p.evaluate(()=>({time:__gameQA.versus.state.time,calls:__gameQA.renderer.info.render.calls,geometries:__gameQA.renderer.info.memory.geometries,triangles:__gameQA.renderer.info.render.triangles,points:__gameQA.versus.state.points}));
 await p.evaluate(()=>{__gameQA.exitVersus();__gameQA.rvBreakout.start();});await p.waitForTimeout(1000);
 const rv=await p.evaluate(()=>({active:__gameQA.rvBreakout.state.active,vehicle:__gameQA.player.inVehicle?.kind,state:__gameQA.Game.state}));
 const video=p.video();await c.close();await video.saveAs(OUT+'/gameplay-realtime.webm');
 const report={source:'self-contained package',externalNetworkBlocked:true,errors,blockedOptionalRequests:requests,runtime,rv,video:{path:OUT+'/gameplay-realtime.webm',audio:'none',capture_mode:'realtime-automation',notes:'Real key inputs; QA used after gameplay for RV regression'}};
 fs.writeFileSync(OUT+'/package-smoke.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 if(!rv.active||errors.length)throw Error('Package/RV regression failed');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
