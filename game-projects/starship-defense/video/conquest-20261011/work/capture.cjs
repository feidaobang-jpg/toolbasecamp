// Capture the deployed game. QA is read-only; movement, kits and equipment use public controls.
const fs=require('fs'),path=require('path');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const R=__dirname,OUT=path.join(R,'capture',process.env.TAKE||'match-01');fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});const p=await context.newPage();
 const errors=[],events=[],states=[],held=new Set();let shot=null,lastSaved=0,started=Date.now();
 const keys=async wanted=>{for(const k of [...held])if(!wanted.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of wanted)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}};
 const observe=()=>p.evaluate(()=>{const q=__gameQA,v=q.versus,s=v.state,h=q.player;return {t:s.time,active:v.active,over:s.over,result:s.result,test:q.Game.testMode,pos:h.pos.toArray(),yaw:q.getCamYaw(),cam:q.getCamMode(),hp:h.hp,dead:h.dead,kit:h.bfKit,weapon:h.curWeapon,ammo:h.bfAmmo,reload:h.bfReload,grenade:h.grenadeCd,vehicle:h.inVehicle?{kind:h.inVehicle.kind,hp:h.inVehicle.hp,pos:h.inVehicle.mesh.position.toArray()}:null,stats:v.seat(s.localPid)?.stats,points:s.points?.map(x=>({id:x.id,x:x.x,z:x.z,owner:x.owner,progress:x.progress,contested:x.contested})),tickets:{blue:v.team('blue')?.tickets,red:v.team('red')?.tickets},vehicles:q.vehicles.filter(x=>!x.dead).map(x=>({kind:x.kind,team:x.team,hp:x.hp,maxHp:x.maxHp,pos:x.mesh.position.toArray()})),enemies:[...s.units,...q.coopHumans].filter(x=>!x.dead&&x.team==='red').map(x=>({x:x.pos.x,z:x.pos.z,hp:x.hp})),solids:v.state.solids?.map(x=>({x:x.x,z:x.z,hw:x.hw||x.r||0,hd:x.hd||x.r||0,top:x.top,bottom:x.bottom}))};});
 async function mark(name){const s=await observe();events.push({name,t:(Date.now()-started)/1000,game:s.t,state:s});console.log('EVENT',name,Math.round(s.t),Math.round(s.hp),s.points?.map(x=>x.id+':'+x.owner).join(' '));await p.screenshot({path:path.join(OUT,name+'.png')});}
 let cdp;
 async function startShot(name){const dir=path.join(OUT,name);fs.mkdirSync(dir,{recursive:true});shot={name,dir,frames:[],started:Date.now()};lastSaved=0;
  await p.evaluate(()=>{window.__movieChunks=[];window.__movieRec=new MediaRecorder(__movieAudio.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});__movieRec.ondataavailable=e=>__movieChunks.push(e.data);__movieRec.start(500);window.__movieAudioStart=Date.now();});
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:97,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
 }
 async function stopShot(){await cdp.send('Page.stopScreencast');const s=shot;shot=null;
  const a=await p.evaluate(async()=>{await new Promise(r=>{__movieRec.onstop=r;__movieRec.stop();});return {start:__movieAudioStart,bytes:Array.from(new Uint8Array(await new Blob(__movieChunks).arrayBuffer()))};});
  fs.writeFileSync(path.join(s.dir,'game-audio.webm'),Buffer.from(a.bytes));s.audioStart=a.start;s.duration=(Date.now()-s.started)/1000;s.finalState=await observe();delete s.dir;fs.writeFileSync(path.join(OUT,s.name,'capture.json'),JSON.stringify(s,null,2));console.log('SHOT',s.name,s.frames.length,s.duration);
 }
 // A small path planner only chooses normal directional inputs; no teleport or rule changes.
 function route(pos,goal,solids,radius){const step=5,x0=-140,z0=745,nx=57,nz=63;
  const xy=i=>({x:x0+i%nx*step,z:z0+Math.floor(i/nx)*step});
  const cell=(x,z)=>Math.max(0,Math.min(nz-1,Math.round((z-z0)/step)))*nx+Math.max(0,Math.min(nx-1,Math.round((x-x0)/step)));
  const blocked=i=>{const a=xy(i);return solids.some(s=>s.top>0&&s.bottom<2&&Math.abs(a.x-s.x)<s.hw+radius&&Math.abs(a.z-s.z)<s.hd+radius);};
  const start=cell(pos[0],pos[2]),end=cell(goal.x,goal.z),open=[start],cost=new Map([[start,0]]),prev=new Map(),closed=new Set();
  for(let n=0;n<3500&&open.length;n++){open.sort((a,b)=>cost.get(a)+Math.hypot(xy(a).x-goal.x,xy(a).z-goal.z)-cost.get(b)-Math.hypot(xy(b).x-goal.x,xy(b).z-goal.z));const a=open.shift();if(a===end){let b=end;while(prev.has(b)&&prev.get(b)!==start)b=prev.get(b);return xy(b);}closed.add(a);const c=xy(a);
   for(const d of [-nx,nx,-1,1]){const b=a+d;if(b<0||b>=nx*nz||closed.has(b)||Math.abs(xy(b).x-c.x)>step+1||b!==end&&blocked(b))continue;const k=cost.get(a)+step;if(k<(cost.get(b)??Infinity)){cost.set(b,k);prev.set(b,a);if(!open.includes(b))open.push(b);}}
  }return goal;
 }
 try{
  p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(dest,...args){if(dest instanceof AudioDestinationNode){if(!this.context.__movieDest)this.context.__movieDest=this.context.createMediaStreamDestination();window.__movieAudio=this.context.__movieDest;return connect.call(this,this.context.__movieDest,...args);}return connect.call(this,dest,...args);};});
  await p.goto(process.env.GAME_URL||'https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1',{waitUntil:'domcontentloaded',timeout:90000});await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,null,{timeout:60000});
  const assets=await p.evaluate(()=>({url:location.href,scripts:[...document.scripts].map(x=>x.src),controls:__gameQA.CombatControls.settings}));fs.writeFileSync(path.join(OUT,'build.json'),JSON.stringify(assets,null,2));
  await p.click('#keysMenu');await p.selectOption('#combat-input','keyboard');await p.click('#keysClose');
  await p.click('#btnVersus');await p.click('[data-vs-size="4"]');await p.screenshot({path:path.join(OUT,'mode-menu.png')});
  cdp=await context.newCDPSession(p);cdp.on('Page.screencastFrame',async e=>{if(shot&&e.metadata.timestamp-lastSaved>=.045){lastSaved=e.metadata.timestamp;const file=String(shot.frames.length).padStart(6,'0')+'.jpg';fs.writeFileSync(path.join(shot.dir,file),Buffer.from(e.data,'base64'));shot.frames.push({file,timestamp:e.metadata.timestamp});}await cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});});
  await p.click('[data-vs-ai="normal"]');await p.waitForFunction(()=>__gameQA.versus.active);started=Date.now();await startShot('01-opening');await mark('start-normal-4v4');
  await p.keyboard.press('KeyL');await p.click('[data-vstab="units"]');await sleep(1200);await p.locator('#vsGrid .vs-card').nth(3).click();await sleep(1600);await p.click('#vsClose');await mark('engineer-selected');
  let lastLog=0,lastGrenade=-100,boarded=false,exited=false,spawnChosen=false,aimDone=false,kitChanged=false,supportDone=false;let lastTarget='';
  const deadline=Date.now()+(Number(process.env.SHORT_SECONDS)||940)*1000;
  while(Date.now()<deadline){
   const s=await observe();if(s.over){await keys([]);await mark('real-result');await sleep(7000);break;}
   if(Date.now()-lastLog>2500){states.push({wall:(Date.now()-started)/1000,...s,solids:undefined});lastLog=Date.now();console.log('STATE',Math.round(s.t),s.pos.map(Math.round),s.hp,s.kit,s.vehicle?.kind,Math.ceil(s.tickets.blue),Math.ceil(s.tickets.red));}
   if(s.dead){await keys([]);if(!spawnChosen){const owned=s.points.find(x=>x.owner==='blue'&&!x.contested);if(owned){await p.keyboard.press('KeyL');await p.click('[data-vstab="build"]');await p.locator('#vsGrid .vs-card').nth(s.points.indexOf(owned)+1).click();await p.click('[data-vstab="units"]');await p.locator('#vsGrid .vs-card').nth(2).click();await p.click('#vsClose');spawnChosen=true;kitChanged=true;await mark('medic-and-forward-spawn');}}await sleep(400);continue;}
   let pos=s.vehicle?s.vehicle.pos:s.pos,goal;
   if(!boarded&&s.t<22){const tank=s.vehicles.find(v=>v.team==='blue'&&v.kind==='tank');if(tank){goal={x:tank.pos[0],z:tank.pos[2]};if(Math.hypot(pos[0]-goal.x,pos[2]-goal.z)<4.45){await keys([]);await p.keyboard.press('KeyI');await sleep(300);const after=await observe();boarded=!!after.vehicle;if(boarded)await mark('tank-boarded');}}}
   if(!goal){const hostile=s.points.filter(x=>x.owner!=='blue').sort((a,b)=>Math.hypot(pos[0]-a.x,pos[2]-a.z)-Math.hypot(pos[0]-b.x,pos[2]-b.z));goal=hostile[0]||s.points.find(x=>x.id==='B');}
   if(s.vehicle&&s.t>Number(process.env.DISMOUNT_AT||100)&&!exited){await keys([]);await p.keyboard.press('KeyI');exited=true;await sleep(400);await mark('dismounted-to-fight');continue;}
   if(!s.vehicle&&s.kit==='engineer'&&s.weapon!=='rpg'&&s.vehicles.some(v=>v.team==='red'&&Math.hypot(v.pos[0]-pos[0],v.pos[2]-pos[2])<70)){await p.keyboard.press('Digit2');await mark('rpg-selected');}
   if(!s.vehicle&&!aimDone&&s.enemies.some(e=>Math.hypot(e.x-pos[0],e.z-pos[2])<40)){await keys([]);await p.keyboard.press('KeyZ');await sleep(2300);await p.keyboard.press('KeyZ');await p.keyboard.press('KeyC');aimDone=true;await mark('aim-and-view');}
   if(!s.vehicle&&s.grenade<=0&&s.t-lastGrenade>18){const near=s.enemies.filter(e=>Math.hypot(e.x-pos[0],e.z-pos[2])<24).sort((a,b)=>Math.hypot(a.x-pos[0],a.z-pos[2])-Math.hypot(b.x-pos[0],b.z-pos[2]))[0];if(near){await keys([]);await p.keyboard.press('KeyU');lastGrenade=s.t;await mark('grenade-'+Math.round(s.t));}}
   if(kitChanged&&!supportDone&&s.kit==='medic'&&s.hp<75){await p.keyboard.press('KeyH');supportDone=true;await mark('medic-heal');}
   if(!s.vehicle&&s.kit==='engineer'&&s.vehicles.some(v=>v.team==='blue'&&v.hp<v.maxHp&&Math.hypot(v.pos[0]-s.pos[0],v.pos[2]-s.pos[2])<8)){await keys([]);await p.keyboard.press('KeyH');if(!events.some(e=>e.name==='engineer-repair'))await mark('engineer-repair');}
   const d=Math.hypot(pos[0]-goal.x,pos[2]-goal.z);const target=d<9?goal:route(pos,goal,s.solids||[],s.vehicle?3.1:1);
   const dx=target.x-pos[0],dz=target.z-pos[2],f=dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw),r=-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw),wanted=[];
   if(d>6){if(Math.abs(f)>1.8)wanted.push(f>0?'KeyW':'KeyS');if(Math.abs(r)>1.8)wanted.push(r>0?'KeyD':'KeyA');if(!s.vehicle&&d>25)wanted.push('ShiftLeft');}
   await keys(wanted);
   if(lastTarget!==goal.id){lastTarget=goal.id;await mark('move-to-'+goal.id+'-'+Math.round(s.t));}
   if(shot?.name==='01-opening'&&s.t>150)await stopShot();
   if(!shot&&s.t>150)await startShot('02-battle');
   await sleep(350);
  }
  await keys([]);if(shot)await stopShot();const final=await observe();fs.writeFileSync(path.join(OUT,'session.json'),JSON.stringify({at:new Date().toISOString(),normal_rules:true,gameplay_modified:false,time_scale:1,mode:'4v4: one keyboard player plus seven bots; regular additional infantry and vehicles',events,states,final,errors},null,2));
 }finally{await context.close();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
