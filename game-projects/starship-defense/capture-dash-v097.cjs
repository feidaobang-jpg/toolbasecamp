// v0.9.7 media: realtime clip of dashing out of a bug swarm, then helicopter Y/H altitude.
// Keyboard input in a real-time page; the swarm and the helicopter are placed via ?qa=1 hooks (scripted staging).
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases',process.env.RELEASE||'web-dash-v0.9.7'),captures=path.join(release,'captures');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
(async()=>{
 fs.mkdirSync(captures,{recursive:true});
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
 const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:captures,size:{width:1280,height:720}}});
 const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const t0=Date.now(),marks=[];const mark=d=>marks.push({at:+((Date.now()-t0)/1000).toFixed(1),d});
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(600);
 await p.keyboard.press('Enter');await p.waitForTimeout(800);
 const swarm=()=>p.evaluate(()=>{const q=__gameQA,P=q.player;for(let i=0;i<9;i++){const a=i/9*Math.PI*2,r=3.2+Math.random()*1.5;const m=q.spawnMonster('mob',P.pos.x+Math.sin(a)*r,P.pos.z+Math.cos(a)*r,{quiet:true});m.emerge=0;m.atkCd=.6+Math.random()*.5;}});
 await p.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.squad.forEach(s=>s.mesh.position.set(-30,0,-30));q.setCamMode('third',false);q.setCameraView(0,false);
   q.player.pos.set(0,q.groundY(0,30),30);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;});
 mark('surrounded by a ring of bugs');await swarm();
 await p.keyboard.down('KeyJ');await p.waitForTimeout(1600);
 mark('W + K: dash out of the ring');await p.keyboard.down('KeyW');await p.keyboard.press('KeyK');await p.waitForTimeout(900);await p.keyboard.up('KeyW');
 await p.keyboard.down('KeyQ');await p.waitForTimeout(1300);await p.keyboard.up('KeyQ');
 mark('turn back and shoot');await p.waitForTimeout(1800);
 mark('second dash sideways (D + Space) after the cooldown');await p.keyboard.down('KeyD');await p.keyboard.press('Space');await p.waitForTimeout(700);await p.keyboard.up('KeyD');
 await p.waitForTimeout(1500);await p.keyboard.up('KeyJ');
 const hp=await p.evaluate(()=>({hp:Math.round(__gameQA.player.hp),max:__gameQA.player.maxHp}));
 mark('helicopter: Y up, H down');
 await p.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.Game.vehiclesOwned.push('heli');const v=q.spawnVehicle('heli');const P=q.player.pos;v.mesh.position.set(P.x,0,P.z+4);v.alt=2;q.enterVehicle(v);q.setCamYaw(v.yaw);});
 await p.waitForTimeout(900);await p.keyboard.down('KeyY');await p.waitForTimeout(1600);await p.keyboard.up('KeyY');await p.waitForTimeout(500);
 await p.keyboard.down('KeyH');await p.waitForTimeout(1400);await p.keyboard.up('KeyH');await p.waitForTimeout(700);
 mark('end');
 const video=p.video();await ctx.close();const src=await video.path();const dst=path.join(captures,'dash-swarm-heli.webm');fs.renameSync(src,dst);
 await b.close();
 const info={file:'captures/dash-swarm-heli.webm',capture_mode:'realtime-automation',staging:'bug ring and helicopter placed through ?qa=1 hooks; all player actions are real keyboard input',hp_after_swarm:hp,marks,errors};
 fs.writeFileSync(path.join(release,'capture-dash.json'),JSON.stringify(info,null,1));console.log(JSON.stringify(info,null,1));
})().catch(e=>{console.error(e);process.exit(1);});
