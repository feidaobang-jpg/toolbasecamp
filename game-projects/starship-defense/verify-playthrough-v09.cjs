// Keyboard-only bot plays whole levels in real time (no damage/kill hooks during the fight).
// Setup hooks only choose chapter/gear to mimic a mid-game player; outcome is recorded as-is.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases',process.env.RELEASE||'web-arsenal-build-v0.9.1');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
const scenarios=[
 {name:'chapter1-level1-starter',chapter:1,level:1,setup:{}},
 {name:'chapter6-level1-midgame',chapter:6,level:1,setup:{weapons:['lmg','shotgun','laser','flamer'],cur:'laser',lv:{laser:3,flamer:2},squad:2,hpBonus:80}},
 {name:'chapter6-level5-midgame',chapter:6,level:5,setup:{weapons:['lmg','shotgun','laser','flamer','launcher'],cur:'laser',lv:{laser:4,flamer:3,launcher:2},squad:3,hpBonus:120}},
 {name:'chapter6-level10-boss-lightgear',chapter:6,level:10,setup:{weapons:['lmg','shotgun','laser'],cur:'laser',lv:{laser:1},squad:0,hpBonus:40}},
 {name:'chapter10-level5-lategear',chapter:10,level:5,setup:{weapons:['lmg','laser','plasma','launcher'],cur:'plasma',lv:{laser:6,plasma:4,launcher:3},squad:4,hpBonus:240}},
];
(async()=>{
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const out=[];
 const only=process.env.SCEN;let prior=[];try{prior=JSON.parse(fs.readFileSync(path.join(release,'playthrough.json'),'utf8')).runs||[];}catch{}
 for(const s of scenarios.filter(x=>!only||x.name===only)){
  const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(400);
  await p.keyboard.press('Enter');await p.waitForTimeout(400);
  await p.evaluate(s=>{const q=__gameQA,g=q.Game;g.chapter=s.chapter;g.level=s.level;const u=s.setup;
    if(u.weapons){g.weapons=u.weapons;g.curWeapon=u.cur;g.weaponLv=u.lv;g.hpBonus=u.hpBonus;g.squadCount=u.squad;}
    q.startPrep();q.player.reset(g.cls);q.player.pos.set(0,5,-14);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.player.yaw=0;},s);
  await p.waitForTimeout(300);
  await p.keyboard.press('KeyR');await p.waitForTimeout(200);
  const t0=Date.now();let res=null,deaths=0,lastDead=false;
  await p.keyboard.down('KeyJ');
  while(Date.now()-t0<240000){
    await p.waitForTimeout(250);
    const st=await p.evaluate(()=>{const q=__gameQA;const live=q.monsters.filter(m=>!m.dead&&!m.home);let near=null,bd=1e9;for(const m of live){const d=Math.hypot(m.mesh.position.x-q.player.pos.x,m.mesh.position.z-q.player.pos.z);if(d<bd){bd=d;near=m;}}
      return{state:q.Game.state,level:q.Game.level,chapter:q.Game.chapter,base:Math.round(q.base.hp),hp:Math.round(q.player.hp),dead:q.player.dead,medkit:q.Game.items.medkit,live:live.length,left:q.Game.wave.total-q.Game.wave.killed,
        nx:near?near.mesh.position.x-q.player.pos.x:0,nz:near?near.mesh.position.z-q.player.pos.z:0,nd:near?bd:999,px:q.player.pos.x,pz:q.player.pos.z,yaw:q.getCamYaw()};});
    if(st.dead&&!lastDead)deaths++;lastDead=st.dead;
    if(st.state==='prep'&&(st.level!==s.level||st.chapter!==s.chapter)){res={won:true,seconds:Math.round((Date.now()-t0)/1000),baseHp:st.base,deaths};break;}
    if(st.state==='over'){res={won:false,seconds:Math.round((Date.now()-t0)/1000),baseHp:0,deaths,reason:'base destroyed'};break;}
    // Steering: turn the camera (Q/E) toward the nearest bug; stay near the gate; heal with H.
    const want=Math.atan2(st.nx,st.nz);let diff=Math.atan2(Math.sin(want-st.yaw),Math.cos(want-st.yaw));
    for(const k of ['KeyQ','KeyE','KeyW','KeyS','KeyA','KeyD'])await p.keyboard.up(k);
    if(st.nd<60&&Math.abs(diff)>.25)await p.keyboard.down(diff>0?'KeyQ':'KeyE');
    if(st.nd<6)await p.keyboard.down('KeyS');else if(st.nd>26&&st.nd<60&&st.pz<10)await p.keyboard.down('KeyW');
    if(st.pz>12)await p.keyboard.down('KeyS');
    if(st.hp>0&&st.hp<45&&st.medkit>0)await p.keyboard.press('KeyH');
    if(st.nd<12&&Math.random()<.15)await p.keyboard.press('KeyU');
  }
  for(const k of ['KeyJ','KeyQ','KeyE','KeyW','KeyS','KeyA','KeyD'])await p.keyboard.up(k);
  out.push({scenario:s.name,setup:s.setup,...(res||{won:false,timeout:true}),errors});
  console.log(JSON.stringify(out[out.length-1]));
  await p.context().close();
 }
 await b.close();
 const merged=[...prior.filter(r=>!out.some(o=>o.scenario===r.scenario)),...out];
 fs.writeFileSync(path.join(release,'playthrough.json'),JSON.stringify({version:process.env.RELEASE||'web-arsenal-build-v0.9.1',method:'Playwright keyboard bot (J held, Q/E turn to nearest bug, H heal, U grenades, stays by the gate); setup hooks only set chapter/gear before R; fight runs in real time without damage hooks',runs:merged},null,1));
})().catch(e=>{console.error(e);process.exit(1);});
