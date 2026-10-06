// Conservative opening balance fixtures: real combat/AI, normal health and
// earned gold only. Optional wild mobs and queen benefits are excluded. The player
// is placed at a fixed tactical station; this is not a human-input playthrough.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const url=process.env.GAME_URL||'http://127.0.0.1:8917/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-tactics-v0.20.0/qa');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 const runs=[];
 try{
  const page=await browser.newPage({viewport:{width:1280,height:720}});await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  for(const strategy of ['defend','split']){
   await page.evaluate(()=>{let seed=20107;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const q=__gameQA;q.newGame(false);q.Game.state='paused';q.Game.pausedFrom='prep';q.CombatControls.set('fire','auto');q.CombatControls.set('aim','auto');q.CombatControls.set('control','keyboard');});
   for(let level=1;level<=5;level++){
    const row=await page.evaluate(({strategy,level})=>{
     const q=__gameQA;q.closePanels();q.Game.level=level;q.startPrep();q.Game.state='paused';q.Game.pausedFrom='prep';q.clearEntities(false);
     const roles=['gunner','medic','assault','engineer'];
     while(q.Game.squadCount<4){const role=roles[q.Game.squadCount],price=q.SQUAD_ROLES[role].price+q.Game.squadCount*250;if(q.Game.gold<price)break;q.buyItem({type:'squad',id:role},price,false);for(let i=0;i<400;i++)q.updAirdrops(.05);}
     q.setSquadTask('defend');if(strategy==='split')q.squad.forEach(s=>q.setSquadMemberTask(s.slot,[1,2].includes(s.slot)?'follow':'defend'));
     const station=strategy==='split'?80:-8;
     q.player.pos.set(0,q.groundY(0,station),station);q.player.mesh.position.copy(q.player.pos);
     q.startBattle();q.Game.state='battle';q.Game.pausedFrom='battle';
     const before={gold:q.Game.gold,squad:q.Game.squadCount,base:q.base.hp};let time=0,deaths=0;
     for(let i=0;i<7000&&q.Game.level===level&&q.Game.state!=='over';i++){
      const dt=.05;time+=dt;q.player.invulnerable=Math.max(0,q.player.invulnerable-dt);
      if(q.player.dead){q.player.respawnT-=dt;if(q.player.respawnT<=0){deaths++;q.player.reset(q.Game.cls);q.player.invulnerable=3;q.player.pos.set(0,q.groundY(0,station),station);q.player.mesh.position.copy(q.player.pos);}}
      q.updPlayer(dt);q.updMonsters(dt);q.updBullets(dt);q.updBuildings(dt);q.updGate(dt);q.updSquad(dt);q.updPickups(dt);q.updAirdrops(dt);q.updParticles(dt);q.visuals.update(dt);q.updWave(dt);
     }
     const won=q.Game.level>level;if(q.Game.state!=='over'){q.Game.state='paused';q.Game.pausedFrom='battle';}
     return {strategy,level,won,time:+time.toFixed(1),deaths,before,after:{gold:q.Game.gold,squad:q.Game.squadCount,base:Math.round(q.base.hp)},report:q.Game.lastBattle,live:q.monsters.filter(m=>!m.dead&&!m.home).map(m=>({kind:m.kind,pos:m.mesh.position.toArray(),hp:m.hp,wild:m.wild}))};
    },{strategy,level});runs.push(row);console.log(JSON.stringify(row));if(!row.won)break;
   }
  }
  const support=await page.evaluate(()=>{
   const q=__gameQA;q.newGame(false);q.clearEntities(false);q.Game.state='paused';q.Game.pausedFrom='battle';q.Game.squadCount=1;q.squadGear(0).role='engineer';const s=q.spawnSquad(0);q.setSquadMemberTask(0,'defend');
   q.player.pos.set(0,0,120);q.player.mesh.position.copy(q.player.pos);const target=q.buildings[0];target.hp=50;
   for(let i=0;i<1500;i++){q.updSquad(.02);q.updSmartGate(.02);}return{hp:target.hp,gap:s.mesh.position.distanceTo(target.mesh.position),position:s.mesh.position.toArray()};
  });console.log('Engineer repair',support);
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'combat.json'),JSON.stringify({method:'accelerated actual game functions; fixed player stations; normal health and earned gold; optional wild/queen excluded',physical_phone:false,runs,support},null,2));
  assert.equal(runs.length,10,'both strategies finish five rounds');assert.ok(runs.every(r=>r.won));assert.ok(support.hp>100,'defending engineer walks into repair range');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
