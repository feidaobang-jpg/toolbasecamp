// Regression for legacy-save walls, physical parapets and cover/fire ordering.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const url=process.env.GAME_URL||'http://127.0.0.1:8898/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-parapet-v0.17.7');
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch({channel:'msedge',headless:true}),results=[];
try{for(const mobile of [false,true]){
 const ctx=await b.newContext({viewport:mobile?{width:915,height:412}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,...(process.env.RECORD==='1'&&!mobile?{recordVideo:{dir:out+'/video',size:{width:1280,height:720}}}:{})});
 const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);let f=p;
 if(process.env.TOY_PREVIEW==='1'){await p.locator('iframe').first().waitFor();f=await(await p.locator('iframe').first().elementHandle()).contentFrame();}
 await f.goto(f.url()+(f.url().includes('?')?'&':'?')+'qa=1');await f.waitForFunction(()=>window.__gameQA);await f.locator('#btnStart').click();
 const checks=await f.evaluate(()=>{
  const q=__gameQA;q.Game.state='paused';q.CombatControls.set('fire','hold');
  const d=q.saveData();delete d.rampartRevision;d.gold=987;d.score=321;d.buildings=[...[-31,-25,-19,-13,13,19,25,31].map(x=>({k:'wall',x,z:-16,r:0,hp:300})),{k:'wall',x:0,z:44,r:0,hp:400}];q.applySave(d);q.Game.state='paused';
  const migration={walls:q.buildings.map(x=>[x.kind,x.mesh.position.x,x.mesh.position.z]),gold:q.Game.gold,score:q.Game.score,revision:q.saveData().rampartRevision};
  q.placeBuilding('wall',19,-16,0);const current=q.saveData();q.applySave(current);q.Game.state='paused';migration.newPlayerWallRetained=q.buildings.some(b=>b.kind==='wall'&&b.mesh.position.x===19);q.clearEntities(true);
  const reset=(x,z)=>{q.Input.reset();q.player.pos.set(x,q.groundY(x,z),z);q.player.vy=0;q.player.onGround=true;q.player.dead=false;q.player.inVehicle=null;q.player.invulnerable=0;q.player.shield=0;q.player.hp=q.player.maxHp;q.player.stuckT=0;q.setCamYaw(0);};
  const walk=(x,z,key,jump=false,seconds=1.3)=>{reset(x,z);q.Input.keys[key]=true;if(jump)q.Input.pressed.K=true;for(let i=0;i<120*seconds;i++)q.updPlayer(1/120);q.Input.reset();return q.player.pos.toArray();};
  const c={migration,parapets:q.fortress.solids.filter(s=>s.parapet),front:walk(20,-12,'up'),side:walk(36,-38,'left'),rear:walk(0,-60,'down'),jump:walk(20,-12,'up',true),inner:walk(-31,-39,'left'),ramp:walk(-24,-45,'up',false,3)};
  reset(20,-11.2);const from=q.player.pos.clone();from.y+=1.35;from.z+=.55;
  const mo=q.spawnMonster('mob',20,20);mo.mesh.position.set(20,0,-8);mo.hp=mo.maxHp=1000;const aim=mo.mesh.position.clone();aim.y+=mo.hitH;const before=mo.hp;q.fireBullet(from,aim.clone().sub(from),{speed:70,range:50,dmg:30},true);for(let i=0;i<100;i++)q.updBullets(1/120);c.wallFootDamage=before-mo.hp;
  const hpBeforeInput=mo.hp;q.player.fireCd=0;q.Game.state='prep';q.Input.keys.J=true;q.CombatControls.press('KeyJ');for(let i=0;i<90;i++){q.updPlayer(1/120);q.updBullets(1/120);}q.Input.reset();q.Game.state='paused';c.keyboardWallFootDamage=hpBeforeInput-mo.hp;
  q.clearEntities(true);reset(20,-11.2);const hp=q.player.hp;
  const acid=q.player.pos.clone();acid.z=-8;acid.y=10.6;const target=q.player.pos.clone();target.y=10.6;q.fireBullet(acid,target.clone().sub(acid),{speed:100,range:30,dmg:20},false);q.updBullets(.05);c.coverDamage=hp-q.player.hp;
  reset(20,-11.2);const overhead=acid.clone();overhead.y=11.3;const exposed=q.player.pos.clone();exposed.y=11.3;q.fireBullet(overhead,exposed.clone().sub(overhead),{speed:100,range:30,dmg:20},false);q.updBullets(.05);c.exposedDamage=q.player.maxHp-q.player.hp;
  q.player.reset(q.Game.cls);reset(20,-13);q.player.mesh.position.copy(q.player.pos);q.Game.shake=0;q.camState.init=false;q.updCamera(1);q.renderer.render(q.scene,q.camera);return c;
 });
 assert.deepEqual(checks.migration.walls,[['wall',0,44]]);assert.equal(checks.migration.gold,987);assert.equal(checks.migration.score,321);assert.equal(checks.migration.revision,1);assert.ok(checks.migration.newPlayerWallRetained);
 assert.equal(checks.parapets.length,5);assert.ok(checks.parapets.every(s=>Math.abs(s.top-s.bottom-1.1)<1e-6));
 assert.ok(checks.front[2]<-10.8&&checks.front[1]===9.6);assert.ok(checks.side[0]<37&&checks.rear[2]>-61);
 assert.ok(checks.jump[2]>-5&&checks.jump[1]<2);assert.ok(checks.inner[0]>-24&&checks.inner[1]<6);assert.ok(checks.ramp[1]>9);
 assert.ok(checks.wallFootDamage>0&&checks.keyboardWallFootDamage>0,'can hit enemies directly below wall with normal player aim/fire');assert.equal(checks.coverDamage,0,'parapet stops fast acid before player damage');assert.ok(checks.exposedDamage>0,'exposed upper body still takes fire');
 await f.evaluate(()=>{__gameQA.Game.state='prep';});await p.waitForTimeout(900);
 await p.screenshot({path:out+(mobile?'/mobile-parapet.jpg':'/desktop-parapet.jpg')});
 await f.evaluate(()=>{__gameQA.Game.state='prep';__gameQA.player.hp=__gameQA.player.maxHp;});
 if(mobile){const j=await f.locator('#joyBase').boundingBox();await p.mouse.move(j.x+j.width/2,j.y+j.height/2);await p.mouse.down();await p.mouse.move(j.x+j.width/2,j.y+j.height/2-45);}else await p.keyboard.down('KeyW');
 await p.waitForTimeout(600);checks.realWalk=await f.evaluate(()=>__gameQA.player.pos.toArray());assert.ok(checks.realWalk[2]<-10.8);
 if(mobile)await f.locator('#vK').tap();else await p.keyboard.press('Space');await p.waitForTimeout(1400);if(mobile)await p.mouse.up();else await p.keyboard.up('KeyW');checks.realJump=await f.evaluate(()=>__gameQA.player.pos.toArray());assert.ok(checks.realJump[2]>-5&&checks.realJump[1]<2);
 if(mobile){await p.setViewportSize({width:412,height:915});await f.locator('#vK').tap();await p.waitForTimeout(100);assert.ok(await f.evaluate(()=>__gameQA.player.vy>0));await p.screenshot({path:out+'/portrait.jpg'});}
 assert.deepEqual(errors,[]);results.push({mobile,checks,errors});await ctx.close();
}fs.writeFileSync(out+'/qa.json',JSON.stringify({url,method:'Paused deterministic physics/projectiles and save migration; real keyboard, touch jump, pointer joystick; mobile viewport emulation.',results},null,2));console.log(JSON.stringify(results));}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
