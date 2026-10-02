// Q-style regression: live movement/camera stress, model variants and screenshots.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases/web-toylook-v0.5.0'),captures=path.join(release,'captures');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/html/game/starship-defense/index.html';
(async()=>{
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const p=await b.newPage({viewport:{width:1440,height:810}}),errors=[],requests=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>requests.push(r.url()));
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.keyboard.press('Enter');await p.waitForTimeout(1000);
 await p.screenshot({path:path.join(captures,'after-base.png')});
 await p.evaluate(()=>__gameQA.setCameraView(2));await p.waitForTimeout(400);await p.screenshot({path:path.join(captures,'character.png')});
 // Normal first-wave gameplay screenshot, without health or wave shortcuts.
 await p.evaluate(()=>__gameQA.setCameraView(0));await p.keyboard.down('KeyW');await p.waitForTimeout(2700);await p.keyboard.up('KeyW');await p.keyboard.press('KeyR');
 await p.keyboard.down('KeyJ');await p.waitForTimeout(900);await p.screenshot({path:path.join(captures,'normal-play.png')});await p.keyboard.up('KeyJ');
 const variants=await p.evaluate(()=>{
   const q=__gameQA;q.clearEntities(true);q.player.pos.set(0,0,28);q.player.mesh.position.copy(q.player.pos);q.player.hp=q.player.maxHp=100000;q.base.hp=q.base.maxHp=100000;q.Game.state='battle';q.Game.wave.spawned=q.Game.wave.total=9999;q.Game.wave.done=false;q.setCameraView(2);
   const mobs=[q.spawnMonster('mob',-3,25),q.spawnMonster('mob',3,25,{elite:true}),q.spawnMonster('miniboss',-7,19),q.spawnMonster('boss',7,17)];
   for(const m of mobs){m.hp=m.maxHp=100000;m.speed=0;m.wild=false;m.atkCd=100;m.spitCd=100;m.mesh.rotation.y=0;}
   for(let i=0;i<4;i++)q.spawnSquad();
   const fly=q.visuals.bug(1,'mob',true);fly.position.set(-5,4,26);q.scene.add(fly);
   const mech=q.spawnVehicle('mech',5,29);return mobs.map(m=>({kind:m.kind,visual:m.mesh.userData.toy.kind}));
 });
 await p.waitForTimeout(300);await p.screenshot({path:path.join(captures,'toy-variants.png')});
 await p.evaluate(()=>{const q=__gameQA;q.enterVehicle(q.vehicles[0]);});await p.keyboard.down('KeyW');await p.keyboard.down('KeyJ');await p.waitForTimeout(500);await p.keyboard.up('KeyW');await p.keyboard.up('KeyJ');await p.evaluate(()=>__gameQA.exitVehicle());
 await p.evaluate(()=>{
   const q=__gameQA;q.clearEntities(true);q.player.pos.set(0,0,35);q.player.mesh.position.copy(q.player.pos);q.player.hp=q.player.maxHp=100000;q.Game.state='battle';q.Game.wave.spawned=q.Game.wave.total=9999;q.Game.wave.done=false;q.setCameraView(0);
   for(let i=0;i<48;i++){const m=q.spawnMonster('mob',(i%8-3.5)*3,43+Math.floor(i/8)*3);m.hp=m.maxHp=100000;}
   for(let i=0;i<4;i++)q.spawnSquad();
 });
 await p.waitForTimeout(1500);await p.keyboard.down('KeyJ');await p.evaluate(()=>__gameQA.startMeasure());
 for(let i=0;i<6;i++){await p.keyboard.down(i%2?'KeyA':'KeyD');await p.waitForTimeout(4800);await p.keyboard.up(i%2?'KeyA':'KeyD');await p.keyboard.press('KeyC');await p.waitForTimeout(200);}
 const movement=await p.evaluate(()=>__gameQA.endMeasure());await p.keyboard.up('KeyJ');
 const checks={variants,mechEnterDriveFireExit:await p.evaluate(()=>!__gameQA.player.inVehicle),noLegacyModelDownloads:!requests.some(x=>/\.(glb|jpg)(\?|$)/.test(x)),errors,movement};
 fs.writeFileSync(path.join(release,'style-verification.json'),JSON.stringify(checks,null,2));
 await b.close();if(errors.length||!checks.noLegacyModelDownloads||!checks.mechEnterDriveFireExit)throw Error(JSON.stringify(checks));
 console.log(JSON.stringify({errors,variants,movement:{fps:movement.averageFPS,p95:movement.p95Ms,over50ms:movement.over50ms},noLegacyModelDownloads:checks.noLegacyModelDownloads}));
})().catch(e=>{console.error(e);process.exit(1)});
