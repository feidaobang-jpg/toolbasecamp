const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),out='D:/project/task-artifacts/toy3d-controls-20261006/interaction-qa';fs.mkdirSync(out,{recursive:true});
const games=(process.env.GAMES_ONLY||'tank-3d,mario-3d,jackal-stage1-3d,cadillacs-stage1-3d,starship-defense').split(','),results=[];
const check=(g,name,ok,data)=>{results.push({g,name,ok,data});console.log(ok?'PASS':'FAIL',g,name,JSON.stringify(data??''));};
async function step(p,g,n=40){await p.evaluate(({g,n})=>{const h=g==='tank-3d'?__TANK_TEST__:g==='mario-3d'?__MARIO_TEST__:g==='jackal-stage1-3d'?__JK_TEST__:g==='cadillacs-stage1-3d'?__CD_TEST__:null;if(h)h.step(n);}, {g,n});if(g==='starship-defense')await p.waitForTimeout(n*17);}
async function sample(p,g){return p.evaluate(g=>{
 const h=g==='tank-3d'?__TANK_TEST__:g==='mario-3d'?__MARIO_TEST__:g==='jackal-stage1-3d'?__JK_TEST__:g==='cadillacs-stage1-3d'?__CD_TEST__:__gameQA;
 const cam=h._cam?.cam||h.view?.camera||h.camera,f=cam.position.clone().set(0,0,-1).applyQuaternion(cam.quaternion);
 if(g==='tank-3d'){const x=h.world.player;return{x:x.x,z:x.y,heading:-x.dir*Math.PI/2,fy:f.y,fp:h.view.firstPerson()};}
 if(g==='mario-3d'){const x=h.world.player;return{x:x.x,z:x.z,heading:h.view.subjectHeading(),vx:x.vx,vz:x.vz,fy:f.y,fp:h.view.firstPerson(h.world)};}
 if(g==='jackal-stage1-3d'){const x=h.snapshot().player;return{x:x.x,z:-x.y,heading:h.subjectHeading(),fy:f.y,fp:h._cam.fpNow};}
 if(g==='cadillacs-stage1-3d'){const x=h.cheat.G.player;return{x:x.x,z:x.z,heading:h.subjectHeading(),state:x.state,fy:f.y,fp:h._cam.fp()};}
 const x=h.player;return{x:x.pos.x,z:x.pos.z,heading:x.mesh.rotation.y,fy:f.y,fp:h.getCamMode()==='first'};
},g);}
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--use-angle=d3d11']});
for(const g of games){const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out,size:{width:1280,height:720}}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
try{
await p.goto('http://127.0.0.1:8917/html/game/'+g+'/index.html?test=1&qa=1&q=low');await p.waitForFunction(()=>window.__TANK_TEST__||window.__MARIO_TEST__||window.__JK_TEST__||window.__CD_TEST__||window.__gameQA);
if(g!=='starship-defense'){
 // Reach quick modes using the menu's actual arrow navigation.
 let reached=false;for(let i=0;i<25;i++){await p.keyboard.press('ArrowDown');if(await p.evaluate(()=>!!document.activeElement?.dataset.controlMode)){reached=true;break;}}
 check(g,'arrow navigation reaches quick modes',reached);
 if(reached){for(let i=0;i<3;i++){await p.keyboard.press('ArrowRight');const value=await p.evaluate(()=>document.activeElement.dataset.controlMode);await p.keyboard.press('Enter');check(g,'keyboard selects '+value,await p.evaluate(v=>[...document.querySelectorAll('[data-control-mode]')].every(e=>(e.getAttribute('aria-pressed')==='true')===(e.dataset.controlMode===v)),value));}}
 if(g==='jackal-stage1-3d'){await p.locator('[data-opt=stage]').first().click();check(g,'fresh player selects second stage',(await p.locator('[data-opt=stage]').first().innerText()).includes('第二关'));}
 if(g==='mario-3d'){await p.locator('[data-opt=level]').first().click();check(g,'select underground stage',(await p.locator('[data-opt=level]').first().innerText()).includes('1-2'));await p.locator('[data-opt=level]').first().click();}
 await p.locator('[data-control-mode=hide]').first().click();
 if(g==='cadillacs-stage1-3d')await p.locator('[data-act=select]').first().click();
 await p.locator('[data-act=start]').first().click();
}else {
 await p.locator('#keysMenu').click();await p.locator('#combat-fire').selectOption('hold');await p.locator('#keysClose').click();
 await p.locator('#btnTest').click();await p.keyboard.press('Escape');await p.locator('[data-device-mode=touch]').click();await p.locator('#btnResume').click();
 await p.evaluate(()=>{const q=__gameQA;q.player.pos.set(50,q.groundY(50,50),50);q.camState.init=false;});
}
await p.waitForTimeout(2500);
await p.evaluate(g=>{if(g==='tank-3d'){__TANK_TEST__.manual(true);__TANK_TEST__.skipCurtain();__TANK_TEST__.world.player.invuln=999;}
if(g==='mario-3d'){__MARIO_TEST__.manual(true);__MARIO_TEST__.skipCard();__MARIO_TEST__.world.player.inv=999;}
if(g==='jackal-stage1-3d'){__JK_TEST__.manual(true);__JK_TEST__.cheat.invuln(999);}
if(g==='cadillacs-stage1-3d'){__CD_TEST__.manual(true);__CD_TEST__.cheat.skipScript();__CD_TEST__.cheat.G.player.invul=999;}},g);
await step(p,g,50);if(g==='jackal-stage1-3d')check(g,'starts selected second stage',await p.evaluate(()=>__JK_TEST__.snapshot().stage===2),await p.evaluate(()=>__JK_TEST__.snapshot().stage));
const count=g==='jackal-stage1-3d'||g==='starship-defense'?6:g==='cadillacs-stage1-3d'?4:5;
for(let i=0;i<count;i++){
 if(g==='starship-defense')await p.evaluate(i=>i===5?__gameQA.setCamMode('first'):__gameQA.setCameraView(i,false),i);
 else if(i)await p.keyboard.press('KeyC');await step(p,g,20);
 await p.keyboard.down('KeyE');await step(p,g,30);await p.keyboard.up('KeyE');
 const first=await sample(p,g);
 // Vertical drag changes actual rendered view in each preset.
 await p.mouse.move(600,280);await p.mouse.down();await p.mouse.move(600,first.fy<-.95?170:390,{steps:10});await p.mouse.up();await step(p,g,60);
 const pitched=await sample(p,g);check(g,'vertical drag preset '+i,Math.abs(Math.asin(Math.max(-1,Math.min(1,pitched.fy)))-Math.asin(Math.max(-1,Math.min(1,first.fy))))>.02,{before:first.fy,after:pitched.fy});
 if(!pitched.fp){
  for(const key of ['KeyD','KeyA']){
   await p.keyboard.down(key);await step(p,g,30);const a=await sample(p,g);await step(p,g,12);const z=await sample(p,g);await p.keyboard.up(key);
   const dx=z.x-a.x,dz=z.z-a.z,len=Math.hypot(dx,dz),sgn=g==='tank-3d'||g==='jackal-stage1-3d'?-1:1,dot=len>1e-6?(sgn*Math.sin(z.heading)*dx+sgn*Math.cos(z.heading)*dz)/len:null;
   if(len>.002)check(g,'faces movement after manual turn '+i+' '+key,dot>.75,{len,dot,heading:z.heading});
  }
 }else{
  await p.keyboard.down('KeyE');const a=await sample(p,g);await step(p,g,g==='mario-3d'?12:6);const z=await sample(p,g);await p.keyboard.up('KeyE');let d=Math.atan2(Math.sin(z.heading-a.heading),Math.cos(z.heading-a.heading));check(g,'first-person slow turn',Math.abs(d)<.35,{d});
 }
}
if(g==='mario-3d'){
 await p.keyboard.press('KeyC');await step(p,g,5);
 await p.keyboard.down('KeyD');await p.keyboard.press('KeyI');await step(p,g,72);
 let speed=await p.evaluate(()=>Math.hypot(__MARIO_TEST__.world.player.vx,__MARIO_TEST__.world.player.vz));check(g,'sprint persists after I released',speed>7,{speed});await p.keyboard.up('KeyD');await step(p,g,100);await p.keyboard.down('KeyA');await step(p,g,90);speed=await p.evaluate(()=>Math.hypot(__MARIO_TEST__.world.player.vx,__MARIO_TEST__.world.player.vz));check(g,'neutral movement clears sprint',speed<7,{speed});await p.keyboard.up('KeyA');
}
if(g==='cadillacs-stage1-3d'){
 await p.keyboard.press('KeyC');await step(p,g,2);await p.keyboard.down('KeyD');await p.keyboard.press('KeyI');await step(p,g,20);check(g,'sprint persists after I released',(await sample(p,g)).state==='run',await sample(p,g));await p.keyboard.up('KeyD');await step(p,g,20);check(g,'neutral movement clears sprint',(await sample(p,g)).state!=='run',await sample(p,g));
}
if(g!=='starship-defense'){
 await p.keyboard.press('Escape');await step(p,g,2);await p.locator('[data-control-mode=show]:visible').click();await p.setViewportSize({width:844,height:390});await p.locator('[data-act=resume]').click();await step(p,g,10);
 const rects=await p.locator('#touch .act').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return{text:e.innerText,w:r.width,h:r.height,x:r.x,y:r.y};}));
 check(g,'equal action buttons',rects.every(r=>Math.abs(r.w-rects[0].w)<1&&Math.abs(r.h-r.w)<1),rects);
 check(g,'fullscreen visible in mobile layout',await p.locator('#btn-fs').isVisible());
 await p.screenshot({path:path.join(out,g+'-mobile.png')});
 await p.keyboard.press('Escape');await step(p,g,2);await p.screenshot({path:path.join(out,g+'-menu.png')});
}
check(g,'no runtime errors',errors.length===0,errors);
}catch(e){check(g,'completed',false,e.stack);}await ctx.close();
}await b.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));process.exitCode=results.every(r=>r.ok)?0:1;})();
