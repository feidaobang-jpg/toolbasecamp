// Deterministic behavior scenarios plus real desktop/mobile pause-menu input.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const url=process.env.GAME_URL||'http://127.0.0.1:8881/html/game/starship-defense/index.html';
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 try{
  const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  await p.keyboard.press('KeyJ');await p.waitForFunction(()=>__gameQA.Game.state==='prep');
  assert.equal(await p.locator('#vG,#squadChip').count(),0);
  assert.equal(await p.evaluate(()=>__gameQA.keyBindings.action('KeyG')),null);
  await p.keyboard.press('Escape');await p.locator('#squadTask').focus();await p.keyboard.press('KeyS');
  assert.equal(await p.evaluate(()=>__gameQA.Game.squadOrder),'defend');
  await p.keyboard.press('KeyW');assert.equal(await p.evaluate(()=>__gameQA.Game.squadOrder),'follow');
  await p.keyboard.press('KeyK');assert.equal(await p.locator('#menuPause').isVisible(),false);
  console.log('PASS no command button/key; pause task responds to W/S and K');
  const behavior=await p.evaluate(()=>{
   const q=__gameQA;q.Game.state='paused';q.Game.pausedFrom='prep';q.clearEntities(true);q.Game.squadCount=2;
   q.player.pos.set(0,q.groundY(0,40),40);q.player.mesh.position.copy(q.player.pos);q.spawnSquad();q.spawnSquad();
   for(let i=0;i<2;i++)q.squad[i].mesh.position.set(i*4,q.groundY(i*4,40),40);
   const a=q.spawnMonster('mob',0,54),c=q.spawnMonster('mob',4,54);a.emerge=c.emerge=0;
   q.updSquad(.02);const split=q.squad[0].target!==q.squad[1].target;
   a.mesh.position.z=c.mesh.position.z=75;q.updSquad(.02);const noChase=q.squad.every(s=>!s.target);
   q.monsters.forEach(m=>m.dead=true);const threat=q.spawnMonster('mob',0,0);threat.emerge=0;
   q.Game.pausedFrom='battle';q.updSquad(.02);const auto=q.squadBehavior()==='defend'&&q.Game.squadOrder==='follow';
   threat.dead=true;q.updSquad(1);const held=q.squadBehavior()==='defend';q.updSquad(2.1);const resumed=q.squadBehavior()==='follow';
   q.setSquadTask('defend');q.Game.pausedFrom='prep';q.updSquad(.02);const defend=q.squadBehavior()==='defend';
   const save=q.saveData();const valid=q.validateNormalSave(save,{weapons:q.WEAPONS,buildings:q.BUILDINGS,vehicles:q.VEHICLES});q.applySave(save);const kept=q.Game.squadOrder==='defend';
   save.squadOrder='attack';q.applySave(save);const migrated=q.Game.squadOrder==='follow';
   return{split,noChase,auto,held,resumed,defend,valid,kept,migrated};
  });assert.ok(Object.values(behavior).every(Boolean),JSON.stringify(behavior));console.log('PASS split targeting, chase leash, automatic defense, grace period, task/save migration',behavior);
  const chase=await p.evaluate(()=>{
   const q=__gameQA;q.clearEntities(true);q.Game.state='paused';q.Game.pausedFrom='prep';q.Game.squadOrder='follow';q.Game.squadCount=1;
   q.player.pos.set(0,q.groundY(0,40),40);q.player.mesh.position.copy(q.player.pos);q.spawnSquad();const s=q.squad[0];s.mesh.position.set(0,q.groundY(0,64),64);
   const m=q.spawnMonster('mob',0,63);m.emerge=0;const before=s.mesh.position.distanceTo(q.player.pos);q.updSquad(.2);return{before,after:s.mesh.position.distanceTo(q.player.pos)};
  });assert.ok(chase.after<chase.before,JSON.stringify(chase));console.log('PASS separated teammate returns even with enemy nearby');
  const gate=await p.evaluate(()=>{
   const q=__gameQA;q.clearEntities(true);q.Game.state='paused';q.Game.pausedFrom='prep';q.Game.squadOrder='follow';q.Game.squadCount=1;
   q.player.pos.set(0,q.groundY(0,30),30);q.player.mesh.position.copy(q.player.pos);q.spawnSquad();const s=q.squad[0];s.mesh.position.set(0,q.groundY(0,-25),-25);
   q.gate.open=false;q.gate.auto=false;q.gate.hold=0;let opened=false;
   for(let i=0;i<1000;i++){q.updSquad(.02);q.updSmartGate(.02);opened ||= q.gate.open;}
   const out={opened,closed:!q.gate.open,z:s.mesh.position.z};q.setSquadTask('defend');let reopened=false;
   for(let i=0;i<1500;i++){q.updSquad(.02);q.updSmartGate(.02);reopened ||= q.gate.open;}
   return{out,back:(()=>{const a=q.squadAnchor(s);return{reopened,closed:!q.gate.open,z:+s.mesh.position.z.toFixed(2),nearPost:+Math.hypot(s.mesh.position.x-a.x,s.mesh.position.z-a.z).toFixed(2)};})()};
  });assert.ok(gate.out.opened&&gate.out.closed&&gate.out.z>0,JSON.stringify(gate));
  // 守基地岗位按 squadAnchor 设计在 z=-18（城门 z=-16 内侧），旧阈值 <-20 是更早的岗位布局；
  // 这里校验的是"回城门以内并站到岗位上、城门能自己关上"，不是具体深度。
  assert.ok(gate.back.reopened&&gate.back.closed&&gate.back.z<-17&&gate.back.nearPost<3,JSON.stringify(gate));console.log('PASS actual follow/defend gate traversal in both directions',gate);
  const op=await p.evaluate(()=>{
   const q=__gameQA;q.Game.state='prep';q.setSquadTask('defend');const started=q.operations.start('depot');q.Game.state='paused';q.updSquad(.02);
   const follows=q.squadBehavior()==='follow'&&q.Game.squadOrder==='defend';q.operations.finish(false);q.updSquad(.02);return{started,follows,restored:q.squadBehavior()==='defend'};
  });assert.ok(Object.values(op).every(Boolean),JSON.stringify(op));console.log('PASS mission follows without overwriting saved task');
  assert.deepEqual(errors,[]);
  const phone=await b.newContext({viewport:{width:393,height:720},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/110 Mobile Safari/537.36 BiliApp'});
  const m=await phone.newPage();m.on('pageerror',e=>errors.push(e.message));await m.goto(url+'?qa=1');await m.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  await m.locator('#btnStart').tap();await m.locator('#vP').tap();await m.locator('#squadTask').selectOption('defend');assert.equal(await m.evaluate(()=>__gameQA.Game.squadOrder),'defend');
  assert.equal(await m.locator('#squadTask').isVisible(),true);assert.equal(await m.locator('#vG').count(),0);await m.locator('#btnResume').tap();
  assert.equal(await m.locator('#touchUI').isVisible(),true);assert.deepEqual(errors,[]);console.log('PASS landscape phone task selection and resume');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
