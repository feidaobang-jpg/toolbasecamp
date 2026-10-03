// Helicopter destroyed (or left) above rocks / mountains / forts / tunnels: where does the pilot land,
// and can they walk away? Also checks the general "stuck inside a solid" escape.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=path.join(__dirname,'media-kit/releases',process.env.RELEASE||'web-heli-fix-v0.9.4');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
(async()=>{
 fs.mkdirSync(path.join(release,'captures'),{recursive:true});
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
 const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(500);
 const out=await p.evaluate(()=>{
  const q=__gameQA,res=[];q.newGame(false);q.Game.state='prep';
  const spots=[];
  // large horseshoe mountains, the back mountain, cover rocks, hill-fort walls, hive spires, a tunnel wall
  for(const s of q.fortress.solids){if(s.r&&s.r>=8)spots.push(['mountain',s.x,s.z]);}
  for(const r of q.rockColliders)spots.push(['cover-rock',r.x,r.z]);
  for(const s of q.fortress.solids.filter(s=>s.tunnel&&!s.roof).slice(0,400).filter((_,i)=>i%80===0))spots.push(['tunnel-wall',s.x,s.z]);
  for(const s of q.fortress.solids.filter(s=>!s.tunnel&&s.r&&s.r<3&&s.top>8).slice(0,4))spots.push(['hive-spire',s.x,s.z]);
  for(const s of q.fortress.solids.filter(s=>s.hw&&s.hd&&s.top-s.bottom>3).slice(0,4))spots.push(['fort-wall',s.x,s.z]);
  for(const [kind,x,z] of spots){
    q.clearEntities(false);q.player.reset(q.Game.cls);
    let v=q.vehicles.find(v=>v.kind==='heli');if(!v){q.Game.vehiclesOwned.push('heli');v=q.spawnVehicle('heli');}
    v.hp=v.maxHp;v.dead=false;if(!q.vehicles.includes(v))q.vehicles.push(v);
    q.enterVehicle(v);v.alt=10;v.mesh.position.set(x,30,z);v.yaw=0;
    q.damageVehicle(v,1e9);
    const inside=q.collideWalls(q.player.pos.x,q.player.pos.z,.5);
    // try to walk away for 3 s in four directions
    const start=q.player.pos.clone();let moved=0;
    for(const k of ['up','left','down','right']){q.Input.keys[k]=true;for(let i=0;i<20;i++){const a=q.player.pos.clone();q.updPlayer(.05);moved+=Math.hypot(q.player.pos.x-a.x,q.player.pos.z-a.z);}q.Input.keys[k]=false;}
    res.push({kind,at:[Math.round(x),Math.round(z)],landed:[+q.player.pos.x.toFixed(1),+q.player.pos.z.toFixed(1)],insideSolid:inside,walkedAway:+moved.toFixed(1),stuck:inside||moved<1});
    q.spawnVehicle('heli');
  }
  return res;
 });
 const stuck=out.filter(r=>r.stuck);
 const summary={build:process.env.BUILD||'working tree',checked_at:new Date().toISOString(),spots:out.length,stuck:stuck.length,stuckByKind:stuck.reduce((m,r)=>(m[r.kind]=(m[r.kind]||0)+1,m),{}),examples:stuck.slice(0,6),errors};
 fs.writeFileSync(path.join(release,(process.env.TAG||'after')+'-heli.json'),JSON.stringify({...summary,all:out},null,1));
 console.log(JSON.stringify(summary,null,1));await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
