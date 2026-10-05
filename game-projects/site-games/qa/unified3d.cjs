// Real DOM input, rendered model headings, and actual AudioContext clocks.
// Lock-screen signal is visibilitychange simulation; this is not a physical phone test.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const out=process.env.GAMES_OUT||path.resolve('game-projects/site-games/qa/out/unified3d1');fs.mkdirSync(out,{recursive:true});
const base=process.env.GAMES_BASE||'http://127.0.0.1:8916/html/game/';
const games=(process.env.GAMES_ONLY||'tank-3d,mario-3d,cadillacs-stage1-3d,jackal-stage1-3d,journey-west-3d,hop-fox-3d,starship-defense').split(',');
const results=[];function check(game,name,ok,detail){results.push({game,name,ok,detail});console.log(ok?'PASS':'FAIL',game,name,detail===undefined?'':JSON.stringify(detail));}
async function settle(p){await p.evaluate(()=>{window.__TANK_TEST__?.step(60);window.__MARIO_TEST__?.step(120);window.__JK_TEST__?.step(60);window.__CD_TEST__?.step(60);});await p.waitForTimeout(200);}
async function subject(p,g){return p.evaluate(g=>{
 if(g==='starship-defense')return __gameQA.player.mesh.rotation.y;
 if(g==='jackal-stage1-3d')return __JK_TEST__.subjectHeading();
 if(g==='cadillacs-stage1-3d')return __CD_TEST__.subjectHeading();
 return (g==='tank-3d'?__TANK_TEST__.view:g==='mario-3d'?__MARIO_TEST__.view:__CAMERA_QA__.view).subjectHeading();
},g);}
async function audio(p){return p.evaluate(()=>window.__audioContexts.map(c=>({state:c.state,time:c.currentTime,decoded:c.qaDecoded||0,sources:c.qaSources||0})));}
const delta=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--ignore-gpu-blocklist','--use-angle=d3d11']});
 for(const g of games){const ctx=await browser.newContext({viewport:{width:1280,height:720}}),p=await ctx.newPage(),errors=[],failed=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.status()>=400)failed.push([r.status(),r.url()]);});
 await p.addInitScript(()=>{const Base=window.AudioContext;window.__audioContexts=[];window.AudioContext=class extends Base{constructor(...args){super(...args);__audioContexts.push(this);const decode=this.decodeAudioData.bind(this);this.decodeAudioData=(...args)=>decode(...args).then(b=>{this.qaDecoded=(this.qaDecoded||0)+1;return b;});const create=this.createBufferSource.bind(this);this.createBufferSource=()=>{const s=create(),start=s.start.bind(s);s.start=(...args)=>{this.qaSources=(this.qaSources||0)+1;return start(...args);};return s;};}};});
 try{
 await p.goto(base+g+'/index.html?test=1&qa=1&q=low');await p.waitForFunction(()=>window.__TANK_TEST__||window.__MARIO_TEST__||window.__JK_TEST__||window.__CD_TEST__||window.__CAMERA_QA__||window.__gameQA);
 if(g==='starship-defense'){await p.locator('#btnTest').click();}
 else{await p.locator('[data-control-mode=hide]').first().click();if(g==='cadillacs-stage1-3d')await p.locator('[data-act=select]').first().click();await p.locator(['journey-west-3d','hop-fox-3d'].includes(g)?'#start':'[data-act=start]').first().click();}
 await p.waitForTimeout(3000);
 await p.evaluate(g=>{if(g==='tank-3d'){__TANK_TEST__.manual(true);__TANK_TEST__.skipCurtain();__TANK_TEST__.world.player.invuln=99999;}if(g==='mario-3d'){__MARIO_TEST__.manual(true);__MARIO_TEST__.skipCard();}if(g==='jackal-stage1-3d'){__JK_TEST__.manual(true);__JK_TEST__.cheat.invuln(999);}if(g==='cadillacs-stage1-3d'){__CD_TEST__.manual(true);__CD_TEST__.cheat.skipScript();__CD_TEST__.cheat.G.player.invul=99999;}if(g==='hop-fox-3d')__CAMERA_QA__.begin();if(g==='journey-west-3d')__CAMERA_QA__.world.player.invulnerable=999;},g);await settle(p);
 const selected=await p.evaluate(()=>{const nodes=[...document.querySelectorAll('[data-control-mode],[data-device-mode]')];const selected=nodes.filter(e=>e.getAttribute('aria-pressed')==='true'),other=nodes.find(e=>e.getAttribute('aria-pressed')==='false');return {count:selected.length,bg:selected[0]&&getComputedStyle(selected[0]).backgroundColor,other:other&&getComputedStyle(other).backgroundColor};});check(g,'visible selected mode',selected.count>0&&selected.bg!==selected.other,selected);
 // Each preset turns an actual body/head/turret, not merely a camera variable.
 const count=await p.evaluate(g=>g==='starship-defense'?6:g==='jackal-stage1-3d'?6:g==='cadillacs-stage1-3d'?4:g==='tank-3d'?5:g==='mario-3d'?5:g==='journey-west-3d'?5:__CAMERA_QA__.view.cameraCount,g);
 for(let i=0;i<count;i++){
 if(g==='starship-defense'){await p.evaluate(i=>i===5?__gameQA.setCamMode('first'):__gameQA.setCameraView(i,false),i);}
 else if(i){await p.keyboard.press('KeyC');await settle(p);}
 const before=await subject(p,g);await p.keyboard.down('KeyE');await settle(p);await p.waitForTimeout(400);await p.keyboard.up('KeyE');await settle(p);
 const after=await subject(p,g);check(g,'rendered subject turns preset '+i,Number.isFinite(after)&&Math.abs(delta(before,after))>.04,{before,after});
 }
 if(g==='cadillacs-stage1-3d'){
  await p.keyboard.down('KeyJ');await p.evaluate(()=>__CD_TEST__.step(1));await p.keyboard.up('KeyJ');
  const before=await subject(p,g),state=await p.evaluate(()=>__CD_TEST__.cheat.G.player.state);
  await p.keyboard.down('KeyE');await p.evaluate(()=>__CD_TEST__.step(8));await p.keyboard.up('KeyE');const after=await subject(p,g);
  check(g,'attack animation also follows look',state==='attack'&&Math.abs(delta(before,after))>.04,{state,before,after});
  await p.evaluate(()=>__CD_TEST__.step(60));
 }
 const beforePause=await audio(p);check(g,'audio unlocked',beforePause.some(c=>c.state==='running'),beforePause);
 await p.keyboard.press('Escape');await settle(p);await p.waitForTimeout(200);const paused1=await audio(p);await p.waitForTimeout(350);const paused2=await audio(p);
 check(g,'manual pause freezes audio',paused1.length>0&&paused1.every((c,i)=>c.state==='suspended'&&Math.abs(c.time-paused2[i].time)<.005),{paused1,paused2});
 // Switching modes while paused must keep audio paused and not restart this run.
 const selector=g==='starship-defense'?'[data-device-mode=touch]':'[data-control-mode=show]';await p.locator(selector+':visible').first().click();await p.waitForTimeout(100);check(g,'paused menu stays silent',(await audio(p)).every(c=>c.state==='suspended'));
 await p.evaluate(()=>window.__qaRun=window.__TANK_TEST__?.world||window.__MARIO_TEST__?.world||window.__CD_TEST__?.cheat.G||window.__JK_TEST__?.state||window.__CAMERA_QA__?.world||window.__gameQA?.player);
 for(const value of g==='starship-defense'?['auto','desktop','touch']:['auto','hide','show']){
  const attr=g==='starship-defense'?'data-device-mode':'data-control-mode';await p.locator(`[${attr}=${value}]:visible`).first().click();
  check(g,'selected mode '+value,await p.evaluate(({attr,value})=>[...document.querySelectorAll(`[${attr}]`)].every(e=>(e.getAttribute('aria-pressed')==='true')===(e.getAttribute(attr)===value)),{attr,value}));
 }
 check(g,'mode switch preserves current run',await p.evaluate(()=>window.__qaRun===(window.__TANK_TEST__?.world||window.__MARIO_TEST__?.world||window.__CD_TEST__?.cheat.G||window.__JK_TEST__?.state||window.__CAMERA_QA__?.world||window.__gameQA?.player)));
 await p.screenshot({path:path.join(out,g+'-selected.png')});
 if(g==='starship-defense')await p.evaluate(()=>__gameQA.togglePause());else await p.locator(['journey-west-3d','hop-fox-3d'].includes(g)?'#start':'[data-act=resume]').first().click();await settle(p);await p.waitForTimeout(300);check(g,'continue resumes audio',(await audio(p)).some(c=>c.state==='running'));
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await settle(p);await p.waitForTimeout(250);check(g,'hidden screen freezes audio',(await audio(p)).every(c=>c.state==='suspended'));
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await p.waitForTimeout(250);check(g,'return stays paused',(await audio(p)).every(c=>c.state==='suspended'));
 if(['mario-3d','cadillacs-stage1-3d','jackal-stage1-3d'].includes(g)){const a=await audio(p);check(g,'original recordings decoded and played',a.some(c=>c.decoded>=3&&c.sources>=1),a);}
 check(g,'no runtime or resource errors',!errors.length&&!failed.length,{errors,failed});
 }catch(e){check(g,'completed',false,e.message);}await ctx.close();
 }
 await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));process.exitCode=results.every(r=>r.ok)?0:1;
})();
