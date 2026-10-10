// Complete route using fixed simulation steps and scripted navigation. This is
// a balance/rule check, not a recording or a claim of human/phone playtesting.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});try{
 const p=await b.newPage();await p.goto((process.env.GAME_URL||'http://127.0.0.1:8798/html/game/starship-defense/index.html')+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
 const res=await p.evaluate(()=>{
  const q=__gameQA,r=q.rvBreakout;q.AudioSys.sfx=()=>{};r.start();
  q.CombatControls.autoAim=true;const axis=q.Input.axis;q.Input.axis=()=>q.__axis||{x:0,y:0};q.Input.keys.J=true;
  let steps=0,lastStage=-1,phase='drive',searched=-1,minHP=1400;const stages=[];
  const route=[2100,2720,3340,3980],toward=(target,from)=>{const dx=target.x-from.x,dz=target.z-from.z,n=Math.hypot(dx,dz);q.__axis=n>1?{x:-dx/n,y:-dz/n}:{x:0,y:0};return n;};
  for(;steps<20000&&!r.state.over;steps++){
   const s=r.state,v=s.rv,pos=v.mesh.position,dt=.05;q.Game.state='battle';q.setCamYaw(0);
   if(s.stage!==lastStage){stages.push({stage:s.stage,t:s.elapsed,hp:v.hp,fuel:s.fuel,scrap:s.scrap});lastStage=s.stage;phase=q.player.inVehicle?'drive':'return';}
   if(phase==='drive'){
    if(toward({x:0,z:route[s.stage]},pos)<3&&s.stage<3){q.exitVehicle();phase='search';searched=s.stage;}
   }else if(phase==='return'){
    if(toward({x:pos.x+3.5,z:pos.z},q.player.pos)<2&&!q.player.dead){q.enterVehicle(v);phase='drive';}
   }else if(phase==='search'){
    const d=toward({x:18,z:route[searched]},q.player.pos);
    if(d<3&&!s.search&&!s.looted[searched])r.interact();
    if(s.looted[searched]||s.stage>searched)phase='service';
   }else if(phase==='service'){
    const d=toward({x:4,z:pos.z},q.player.pos);
    if(d<2&&!s.job){if(v.hp<v.maxHp-250&&s.scrap>=40)r.job('repair');else if(s.gun<2&&s.scrap>=90+s.gun*50)r.job('gun');else if(s.fuel<25&&s.scrap>=25)r.job('fuel');else{q.enterVehicle(v);phase='wait';}}
   }else if(phase==='wait')q.__axis={x:0,y:0};
   q.player.invulnerable=Math.max(0,q.player.invulnerable-dt);q.updPlayer(dt);r.update(dt);q.updMonsters(dt);q.updBullets(dt);q.updVehicles?.(dt);q.updPickups(dt);q.updParticles(dt);
   minHP=Math.min(minHP,v.hp);
  }
  q.Input.axis=axis;q.Input.reset();return {won:r.state.over&&r.state.rv.hp>0,elapsed:r.state.elapsed,steps,hp:r.state.rv.hp,minHP,stage:r.state.stage,gun:r.state.gun,looted:r.state.looted,stages};
 });console.log(JSON.stringify(res,null,2));const out=process.env.QA_OUTPUT?path.join(process.env.QA_OUTPUT,'route-balance.json'):path.join(__dirname,'media-kit/releases/web-rv-v0.28.0/qa/route-balance.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({method:'fixed .05s simulation; scripted navigation, sound disabled; no invulnerability or health/resource grants',...res},null,2));assert.ok(res.won);assert.ok(res.elapsed>=300&&res.elapsed<=600);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
