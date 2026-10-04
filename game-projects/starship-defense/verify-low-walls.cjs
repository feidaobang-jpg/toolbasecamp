const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const url=process.env.GAME_URL||'http://127.0.0.1:8898/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-low-walls-v0.17.8/local');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true});const results=[];
 try{for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:915,height:412}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);let f=page;
  if(process.env.TOY_PREVIEW==='1'){await page.locator('iframe').first().waitFor();f=await(await page.locator('iframe').first().elementHandle()).contentFrame();}
  await f.goto(f.url()+(f.url().includes('?')?'&':'?')+'qa=1');await f.waitForFunction(()=>window.__gameQA);await f.locator('#btnStart').click();
  const checks=await f.evaluate(()=>{
   const q=__gameQA,tests={},V=(x,y,z)=>q.player.pos.clone().set(x,y,z);
   q.Game.state='paused';q.Game.testMode=false;q.CombatControls.set('fire','hold');
   const reset=()=>{q.clearEntities(true);q.Input.reset();q.player.dead=false;q.player.inVehicle=null;q.player.hp=q.player.maxHp;q.player.pos.set(0,0,40);q.player.mesh.position.copy(q.player.pos);q.player.vy=0;q.player.onGround=true;q.player.stuckT=0;};
   reset();tests.angles=[];
   for(const angle of [0,Math.PI/6,Math.PI/4,Math.PI/2,-Math.PI/4,Math.PI*3/4]){
    const w=q.placeBuilding('wall',0,44,angle);w.mesh.updateMatrixWorld(true);
    const probe=(x,z,r)=>{const p=w.mesh.localToWorld(V(x,0,z));return q.collideWalls(p.x,p.z,r,p.y);};
    tests.angles.push({angle,inside:[-2.95,-1.5,0,1.5,2.95].every(x=>probe(x,0,.01)),outside:!probe(0,1.05,.5),end:probe(3.3,0,.5),cornerClear:!probe(3.4,.9,.5),height:Math.max(...w.mesh.children.filter(c=>c.geometry?.parameters?.height).map(c=>c.position.y+c.geometry.parameters.height/2))});
    q.damageBuilding(w,9999);
   }
   const w=q.placeBuilding('wall',0,44,Math.PI/4),c=Math.SQRT1_2;
   q.placeBuilding('wall',6*c,44-6*c,Math.PI/4);tests.seam=q.collideWalls(3*c,44-3*c,.5,0);reset();
   const shot=(friendly,height)=>{reset();const wall=q.placeBuilding('wall',0,44,Math.PI/4);q.player.pos.set(0,0,40);const from=V(0,height,friendly?40:48),dir=V(0,0,friendly?1:-1);q.fireBullet(from,dir,{dmg:20,speed:240,range:30,spread:0},friendly);q.updBullets(.05);return {hp:wall.hp,playerHp:q.player.hp,bullets:q.bullets.length};};
   tests.enemyLow=shot(false,.7);tests.enemyHigh=shot(false,1.7);tests.friendlyHigh=shot(true,1.35);tests.friendlyLow=shot(true,.7);
   reset();q.placeBuilding('wall',0,44,0);q.player.pos.set(0,0,42.6);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);
   const close=q.spawnMonster('mob',0,46,{quiet:true});close.mesh.position.set(0,0,45.5);close.emerge=0;close.hp=close.maxHp=1000;q.player.fireCd=0;q.Input.keys.J=true;q.CombatControls.press('KeyJ');
   q.Game.state='prep';for(let i=0;i<90;i++){q.updPlayer(1/120);q.updBullets(1/120);}q.Game.state='paused';tests.closeTargetDamage=1000-close.hp;
   reset();const cover=q.placeBuilding('wall',0,44,0);q.player.pos.set(0,0,42.6);q.player.mesh.position.copy(q.player.pos);
   const enemy=q.spawnMonster('mob',0,45.5,{quiet:true,wild:true});enemy.mesh.position.set(0,0,45.5);enemy.emerge=0;enemy.ranged=false;enemy.atkCd=0;enemy.home=null;enemy.route=null;enemy.fly=false;
   q.updMonsters(.05);tests.melee={hp:q.player.hp,wallHp:cover.hp,maxHp:q.player.maxHp};
   reset();q.placeBuilding('wall',0,44,0);q.player.pos.set(0,2,44);q.player.vy=-1;q.player.onGround=false;for(let i=0;i<60;i++)q.updPlayer(1/120);tests.landing=q.player.pos.y;
   tests.parapets=q.fortress.solids.filter(s=>s.parapet).map(s=>s.top-s.bottom);
   reset();q.placeBuilding('wall',0,44,Math.PI/4);q.player.pos.set(-1,0,41);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.camState.init=false;q.updCamera(1);q.renderer.render(q.scene,q.camera);
   return tests;
  });
  fs.writeFileSync(path.join(out,(mobile?'mobile':'desktop')+'-checks.json'),JSON.stringify(checks,null,2));
  for(const a of checks.angles){assert.ok(a.inside&&a.outside&&a.end&&a.cornerClear,JSON.stringify(a));assert.ok(Math.abs(a.height-1.1)<.001);}
  assert.ok(checks.seam);assert.equal(checks.enemyLow.hp,480);assert.equal(checks.enemyLow.playerHp,checks.melee.maxHp);
  assert.equal(checks.enemyHigh.hp,500);assert.ok(checks.enemyHigh.playerHp<checks.melee.maxHp);
  assert.equal(checks.friendlyHigh.bullets,1);assert.equal(checks.friendlyLow.bullets,0);
  assert.ok(checks.closeTargetDamage>0,'normal aiming hits insects at the wall foot');assert.equal(checks.melee.hp,checks.melee.maxHp);assert.ok(checks.melee.wallHp<500);assert.ok(Math.abs(checks.landing-1.1)<.01);
  assert.ok(checks.parapets.every(h=>Math.abs(h-1.1)<.001));
  await page.screenshot({path:path.join(out,(mobile?'mobile':'desktop')+'.jpg')});
  // Actual keyboard / touch joystick walking into the rotated wall at 45 degrees.
  await f.evaluate(()=>{const q=__gameQA;q.player.pos.set(0,0,40);q.player.mesh.position.copy(q.player.pos);q.player.vy=0;q.player.onGround=true;q.Input.reset();q.Game.state='prep';q.setCamYaw(0);});
  if(mobile){const b=await f.locator('#joyBase').boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2-45);}else await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);if(mobile)await page.mouse.up();else await page.keyboard.up('KeyW');
  checks.realInput=await f.evaluate(()=>__gameQA.player.pos.toArray());assert.ok(checks.realInput[2]<43,JSON.stringify(checks.realInput));assert.deepEqual(errors,[]);
  results.push({mobile,checks,errors});await context.close();
 }
 fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify({url,method:'Geometry in six rotations, seam, swept projectiles at 20 FPS, melee cover, wall-top landing; real keyboard and emulated mobile joystick.',results},null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
