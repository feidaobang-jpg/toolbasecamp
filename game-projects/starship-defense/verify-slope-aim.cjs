// Actual bundled browser runtime: hill traversal and nearest-player targeting.
const {chromium}=require(process.env.PW||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const url=process.env.GAME_URL||'http://127.0.0.1:8963/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-slope-aim-v0.37.1/qa');
const baseline=process.env.BASELINE==='1';
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--mute-audio']});
 const results=[];
 try{for(const shape of ['desktop','landscape','portrait']){
  const touch=shape!=='desktop',viewport=touch?(shape==='portrait'?{width:390,height:844}:{width:844,height:390}):{width:1280,height:720};
  const context=await browser.newContext({viewport,hasTouch:touch,isMobile:touch});
  const page=await context.newPage(),errors=[],forbidden=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\/api\/game\/saves|\/html\/auth\//.test(r.url()))forbidden.push(r.url());});
  await page.goto(url+(url.includes('?')?'&':'?')+'qa=1');
  let f=page;
  if(process.env.TOY_PREVIEW==='1'){
   await page.locator('iframe').first().waitFor();f=await(await page.locator('iframe').first().elementHandle()).contentFrame();
   await f.goto(f.url()+(f.url().includes('?')?'&':'?')+'qa=1');
  }
  await f.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  await f.locator('#btnStart').click();
  const checks=await f.evaluate(()=>{
   const q=__gameQA,tests={};q.Game.state='prep';q.clearEntities(true);q.Input.reset();q.Input.releaseMouseLook();q.CombatControls.set('fire','hold');
   if(q.AudioSys.master)q.AudioSys.master.gain.value=0;
   const reset=(x,z)=>{q.clearEntities(true);q.Input.reset();q.player.dead=false;q.player.inVehicle=null;q.player.hp=q.player.maxHp;q.player.pos.set(x,q.groundY(x,z),z);q.player.mesh.position.copy(q.player.pos);q.player.vy=0;q.player.onGround=true;q.player.stuckT=0;q.setCamYaw(0);};
   tests.hills=[[-43,84],[43,114],[-42,49],[0,150],[-40,160],[50,55]].map(([x,z])=>({x,z,h:q.groundY(x,z)}));
   tests.walk=[];
   for(const hill of q.fortress.hillForts){
    reset(hill.x,hill.z-29);q.setCameraView(0,false);q.setCamYaw(0);q.Input.keys.up=true;
    for(let i=0;i<110;i++)q.updPlayer(.04);q.Input.reset();
    const pos=q.player.pos.toArray(),slope=q.slopeSpeed(q.groundY,hill.x,hill.z-20,0,1);
    tests.walk.push({pos,inside:!q.collideWalls(hill.x,hill.z,.5),reached:pos[2]>hill.z-4&&pos[1]>=hill.h-.05,slope});
   }
   reset(0,90);q.CombatControls.set('aim','auto');
   const spawn=(x,z,kind='mob')=>{const m=q.spawnMonster(kind,x,z,{quiet:true});m.emerge=0;m.mesh.position.set(x,q.groundY(x,z),z);m.hp=m.maxHp=1000;return m;};
   const near=spawn(3,87),far=spawn(0,102,'boss');far.elite=true;far.aimBias=100;
   const probe=()=>q.player.pos.clone().add(q.player.pos.clone().set(0,1.35,0));
   const aim=()=>q.playerAim(probe(),40).mo;
   tests.views=[];for(let view=0;view<4;view++){q.setCameraView(view,false);q.setCamYaw(0);tests.views.push(aim()===near);}
   // A different player's position, not camera alignment or entity iteration order, determines priority.
   q.player.pos.set(0,0,101);tests.moved=aim()===far;q.player.pos.set(0,0,90);
   q.Input.network={autoAim:true,yaw:0,edges:[]};tests.network=aim()===near;
   q.Input.network.autoAim=false;tests.networkManual=aim()===null;q.Input.network=null;
   near.dead=true;tests.dead=aim()===far;near.dead=false;near.emerge=1;tests.emerging=aim()===far;near.emerge=0;
   tests.outOfRange=q.playerAim(probe(),2).mo===null;
   if(!q.isTouch){q.CombatControls.set('aim','manual');tests.manual=aim()===null;q.CombatControls.set('aim','auto');}
   q.setCameraView(0,false);q.setCamYaw(0);near.mesh.position.set(3,0,87);far.mesh.position.set(0,0,102);q.player.fireCd=0;q.Input.keys.J=true;q.CombatControls.press('KeyJ');
   for(let i=0;i<90;i++){q.updPlayer(1/120);q.updBullets(1/120);}q.Input.reset();
   tests.damage={near:1000-near.hp,far:1000-far.hp};
   // Same entry point is used by vehicle and grenade auto-aim.
   reset(0,90);const n=spawn(3,87),b=spawn(0,103,'boss');
   const vehicle=q.spawnVehicle('jeep');q.enterVehicle(vehicle);vehicle.mesh.position.set(0,0,90);q.player.pos.copy(vehicle.mesh.position);q.player.fireCd=0;q.Input.keys.J=true;q.CombatControls.press('KeyJ');
   q.updPlayer(.01);tests.vehicle=q.bullets.some(bullet=>bullet.vel.x>0&&bullet.vel.z<0);q.Input.reset();q.exitVehicle();
   reset(0,90);spawn(3,87);spawn(0,103,'boss');q.player.grenadeCd=0;q.throwGrenade();tests.grenade=q.bullets.some(bullet=>bullet.vel.x>0&&bullet.vel.z<0);
   reset(-43,60);q.setCameraView(0,false);q.setCamYaw(0);q.camState.init=false;q.updCamera(1);q.renderer.render(q.scene,q.camera);
   q.Game.state='paused';tests.accountForms=document.querySelectorAll('#saveAccount,#savePassword,#saveLoginForm').length;
   return tests;
  });
  await page.screenshot({path:path.join(out,shape+'-hill.png')});
  results.push({shape,viewport,checks,errors,forbidden});fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({baseline,physicalPhone:false,results},null,2));
  if(!baseline){
   assert.ok(checks.hills.every(h=>Math.abs(h.h-2)<.01),JSON.stringify(checks.hills));
   assert.ok(checks.walk.every(w=>w.reached&&w.inside&&w.slope<1),JSON.stringify(checks.walk));
   assert.ok(checks.views.every(Boolean)&&checks.moved&&checks.network&&checks.networkManual&&checks.dead&&checks.emerging&&checks.outOfRange&&checks.manual!==false,JSON.stringify(checks));
   assert.ok(checks.damage.near>0&&checks.damage.far===0,JSON.stringify(checks.damage));
   assert.ok(checks.vehicle&&checks.grenade,JSON.stringify({vehicle:checks.vehicle,grenade:checks.grenade}));
   assert.equal(checks.accountForms,0);assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
  }
  console.log(JSON.stringify({shape,checks,errors}));await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
