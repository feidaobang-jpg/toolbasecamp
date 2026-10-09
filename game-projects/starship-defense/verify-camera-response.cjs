// Real browser input and rendered camera vectors; mobile results are emulation.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-camera-response-v0.31.2/qa/local');
const url=process.env.GAME_URL||'http://127.0.0.1:8909/html/game/starship-defense/index.html';
const results=[];
function check(name,ok,detail){results.push({name,ok,detail});if(!ok)console.log('FAIL',name,JSON.stringify(detail));}
const angle=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
async function sample(p){return p.evaluate(()=>{const q=__gameQA,f=q.camera.position.clone().set(0,0,-1).applyQuaternion(q.camera.quaternion);return{yaw:q.getCamYaw(),forward:f.toArray(),pos:q.player.pos.toArray(),heading:q.player.yaw,pending:q.lookControl.pending};});}
async function point(p,x,y){return p.evaluate(({x,y})=>{const s=document.getElementById('stage'),m=new DOMMatrix(getComputedStyle(s).transform),r=s.getBoundingClientRect(),dx=x-s.clientWidth/2,dy=y-s.clientHeight/2;return{x:r.x+r.width/2+dx*m.a+dy*m.c,y:r.y+r.height/2+dx*m.b+dy*m.d};},{x,y});}
async function drag(p,cdp,from,to,touch){
 const a=await point(p,...from),b=await point(p,...to);
 if(touch){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/8,y:a.y+(b.y-a.y)*i/8,id:1}]});await p.waitForTimeout(16);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }else{await p.mouse.move(a.x,a.y);await p.mouse.down();for(let i=1;i<=8;i++){await p.mouse.move(a.x+(b.x-a.x)*i/8,a.y+(b.y-a.y)*i/8);await p.waitForTimeout(16);}await p.mouse.up();}
}
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
try{for(const [tag,viewport,touch] of [['desktop',{width:1280,height:720},false],['landscape',{width:844,height:390},true],['portrait',{width:390,height:844},true]]){
 const ctx=await browser.newContext({viewport,isMobile:touch,hasTouch:touch,recordVideo:process.env.RECORD==='1'?{dir:out,size:viewport}:undefined});
 const p=await ctx.newPage(),cdp=await ctx.newCDPSession(p),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});await p.locator('#btnStart').click();
 await p.evaluate(t=>{const q=__gameQA;q.setDeviceMode(t?'touch':'desktop');q.clearEntities(true);q.Game.testMode=true;q.sandboxWave.enabled=false;q.player.invulnerable=999;q.player.pos.set(0,q.groundY(0,70),70);q.player.mesh.position.copy(q.player.pos);q.CombatControls.set('fire','hold');q.AudioSys.master.gain.value=0;},touch);
 // Isolate controller timing from GPU/frame scheduling, but measure actual camera orientation.
 for(const first of [false,true]){
  const r=await p.evaluate(first=>{const q=__gameQA;q.Input.reset();q.Game.state='paused';q.setCamMode(first?'first':'third',false);q.setCamYaw(0);q.lookControl.clear();q.lookControl.queue(.4);
   const before=q.getCamYaw();let turn=0,firstStep=0;for(let i=0;i<12;i++){const d=q.lookControl.step(1/60);turn+=d;if(i===0)firstStep=d;}q.updCamera(.2);const pending=q.lookControl.pending;
   q.lookControl.clear();let key=0;for(let i=0;i<60;i++)key+=q.lookControl.step(1/60,1);q.Game.state='prep';return{turn,firstStep,pending,key};},first);
  check(`${tag} ${first?'first':'third'} drag response`,r.turn>.38&&Math.abs(r.pending)<.02,r);
  check(`${tag} ${first?'first':'third'} keyboard speed`,r.key>=(first?Math.PI:Math.PI*2)-.01,r);
 }
 for(let preset=0;preset<6;preset++){
  await p.evaluate(i=>{const q=__gameQA;q.Input.reset();if(i===5)q.setCamMode('first',false);else q.setCameraView(i,false);q.setCamYaw(0);q.Game.shake=0;},preset);await p.waitForTimeout(120);
  let a=await sample(p);await drag(p,cdp,[520,155],[650,155],touch);await p.waitForTimeout(220);let b=await sample(p);
  const right=[-a.forward[2],0,a.forward[0]],dot=b.forward[0]*right[0]+b.forward[2]*right[2];
  check(`${tag} preset ${preset} right drag`,dot>.015&&Math.abs(angle(a.yaw,b.yaw))>.55,{dot,turn:angle(a.yaw,b.yaw)});
  a=b;await drag(p,cdp,[650,155],[520,155],touch);await p.waitForTimeout(220);b=await sample(p);
  check(`${tag} preset ${preset} left drag`,angle(a.yaw,b.yaw)>.55,{turn:angle(a.yaw,b.yaw)});
  a=b;await drag(p,cdp,[560,145],[560,185],touch);await p.waitForTimeout(220);b=await sample(p);
  check(`${tag} preset ${preset} vertical drag`,Math.abs(b.forward[1]-a.forward[1])>.02,{before:a.forward,after:b.forward});
 }
 // Left-hand blank area was previously dead on phones.
 await p.evaluate(()=>{const q=__gameQA;q.Input.reset();q.setCameraView(0,false);q.setCamYaw(0);});await p.waitForTimeout(100);
 let a=await sample(p);await drag(p,cdp,[250,155],[380,155],touch);await p.waitForTimeout(220);let b=await sample(p);
 check(`${tag} left blank area responds`,Math.abs(angle(a.yaw,b.yaw))>.55,{turn:angle(a.yaw,b.yaw)});
 if(touch){
  const center=async id=>{const r=await p.locator('#'+id).boundingBox();return{x:r.x+r.width/2,y:r.y+r.height/2};};
  const joy=await center('joyBase'),fire=await center('vJ'),look=await point(p,520,155),end=await point(p,650,155),joyEnd=await point(p,110,260);
  a=await sample(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...joy,id:1},{...fire,id:2},{...look,id:3}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:joy.x+(joyEnd.x-joy.x)*i/8,y:joy.y+(joyEnd.y-joy.y)*i/8,id:1},{...fire,id:2},{x:look.x+(end.x-look.x)*i/8,y:look.y+(end.y-look.y)*i/8,id:3}]});await p.waitForTimeout(16);}
  const held=await p.evaluate(()=>({joy:__gameQA.Input.joy.active,fire:__gameQA.Input.keys.J,look:!!__gameQA.Input.touchLook}));b=await sample(p);
  check(`${tag} three-finger movement / fire / look`,held.joy&&held.fire&&held.look&&Math.abs(angle(a.yaw,b.yaw))>.1&&Math.hypot(...a.pos.map((v,i)=>v-b.pos[i]))>.1,{held,a,b});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const released=await p.evaluate(()=>({joy:__gameQA.Input.joy.active,fire:!!__gameQA.Input.keys.J,look:!!__gameQA.Input.touchLook}));
  check(`${tag} fingers release independently`,!released.joy&&!released.fire&&!released.look,released);
 }
 // Check Q/E against the actual rendered basis, including the ±pi crossing.
 for(const [key,sign] of [['KeyE',-1],['KeyQ',1]]){
  await p.evaluate(()=>{const q=__gameQA;q.Input.reset();q.setCamMode('first',false);q.setCamYaw(Math.PI-.03);});await p.waitForTimeout(80);
  a=await sample(p);await p.keyboard.down(key);await p.waitForTimeout(200);await p.keyboard.up(key);b=await sample(p);
  check(`${tag} ${key} continuous across pi`,angle(a.yaw,b.yaw)*sign>.35,{a,b});
 }
 await p.evaluate(()=>{const q=__gameQA;q.Input.look.yaw=-.8;q.lookControl.queue(.4);q.togglePause();q.togglePause();});a=await sample(p);await p.waitForTimeout(200);b=await sample(p);
 check(`${tag} pause clears queued input`,Math.abs(angle(a.yaw,b.yaw))<.001&&Math.abs(b.pending)<.001,{a,b});
 await p.evaluate(()=>{const q=__gameQA;q.Input.look.yaw=-.8;q.lookControl.queue(.4);q.setCameraView(1,false);});a=await sample(p);await p.waitForTimeout(200);b=await sample(p);
 check(`${tag} preset clears raw and queued input`,Math.abs(angle(a.yaw,b.yaw))<.001,{a,b});
 await p.evaluate(()=>{const q=__gameQA;q.Input.look.yaw=-.8;q.lookControl.queue(.4);q.setDeviceMode(q.isTouch?'desktop':'touch');});a=await sample(p);await p.waitForTimeout(150);b=await sample(p);
 check(`${tag} mode switch preserves progress and clears input`,Math.abs(angle(a.yaw,b.yaw))<.001&&Math.hypot(...a.pos.map((v,i)=>v-b.pos[i]))<.001,{a,b});
 await p.evaluate(()=>{const q=__gameQA;q.lookControl.queue(.4);q.Input.look.yaw=-.8;window.dispatchEvent(new Event('blur'));});a=await sample(p);await p.waitForTimeout(180);b=await sample(p);
 check(`${tag} blur clears input`,Math.abs(angle(a.yaw,b.yaw))<.001&&Math.abs(b.pending)<.001,{a,b});
 await p.evaluate(()=>{if(__gameQA.Game.state==='paused')__gameQA.togglePause();});a=await sample(p);await p.waitForTimeout(180);b=await sample(p);
 check(`${tag} resume after blur has no delayed turn`,Math.abs(angle(a.yaw,b.yaw))<.001,{a,b});
 await p.evaluate(()=>{const q=__gameQA;q.lookControl.queue(.4);q.Input.look.yaw=-.8;window.dispatchEvent(new Event('resize'));});a=await sample(p);await p.waitForTimeout(180);b=await sample(p);
 check(`${tag} resize clears input`,Math.abs(angle(a.yaw,b.yaw))<.001&&Math.abs(b.pending)<.001,{a,b});
 await p.evaluate(t=>__gameQA.setDeviceMode(t?'touch':'desktop'),touch);
 await p.keyboard.down('KeyW');a=await sample(p);await drag(p,cdp,[520,155],[650,155],touch);await p.keyboard.up('KeyW');b=await sample(p);
 check(`${tag} moving and turning together`,Math.hypot(...a.pos.map((v,i)=>v-b.pos[i]))>.1&&Math.abs(angle(a.yaw,b.yaw))>.1,{a,b});
 if(process.env.RECORD!=='1'){
  await p.evaluate(()=>__gameQA.startMeasure());await p.keyboard.down('KeyE');await p.keyboard.down('KeyW');await p.waitForTimeout(3500);await p.keyboard.up('KeyW');await p.keyboard.up('KeyE');
  const perf=await p.evaluate(()=>__gameQA.endMeasure());fs.writeFileSync(path.join(out,tag+'-performance.json'),JSON.stringify(perf,null,2));
 }
 await p.screenshot({path:path.join(out,tag+'.png')});check(`${tag} runtime errors`,errors.length===0,errors);
 const video=p.video();await ctx.close();if(video)await video.saveAs(path.join(out,tag+'.webm'));
 }
}finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({method:'headless Edge, real mouse / CDP touch with rotated logical coordinates; isolated controller timing; no physical phone',results},null,2));}
console.log(`${results.filter(r=>r.ok).length}/${results.length} passed`);if(process.env.BASELINE!=='1'&&results.some(r=>!r.ok))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
