const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-insects-v0.17.0');
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch({channel:'msedge',headless:true});try{const p=await b.newPage();await p.goto((process.env.GAME_URL||'http://127.0.0.1:8898/html/game/starship-defense/index.html')+'?qa=1');await p.waitForFunction(()=>window.__gameQA);const result=await p.evaluate(()=>{
 const q=__gameQA;q.newGame(true);q.Game.state='paused';q.clearEntities(false);q.setGate(true);const cases=[];
 for(const r of q.rockColliders.filter(r=>r.z>20&&r.z<160).slice(0,12))cases.push({name:'rock-'+cases.length,from:[r.x-r.r-2,r.z],to:[r.x+r.r+3,r.z]});
 cases.push({name:'shelter-wall',from:[23,35],to:[30,30]},{name:'east-edge',from:[107,80],to:[90,92]},{name:'west-edge',from:[-107,80],to:[-90,92]},{name:'cave-west-edge',from:[-5,230],to:[0,285]},{name:'cave-east-edge',from:[5,230],to:[0,285]},{name:'wall-ramp',from:[0,25],to:[24,-18]});
 const results=[];
 for(const c of cases){q.clearEntities(false);const mo=q.spawnMonster('mob',...c.from,{ch:q.CHAPTERS[0]});mo.speed=7;mo.radius=.9;const goal=mo.mesh.position.clone().set(c.to[0],q.groundY(...c.to),c.to[1]),start=mo.mesh.position.toArray();let best=Infinity,stalled=0,maxStalled=0;
  for(let i=0;i<1800;i++){const old=mo.mesh.position.clone(),d=goal.clone().sub(old).setY(0).normalize(),nd=q.navDir(mo,goal)||d;q.moveMonster(mo,nd,1/30,1,mo.navWaypoint||goal);const dist=Math.hypot(mo.mesh.position.x-goal.x,mo.mesh.position.z-goal.z);if(dist<best-.2){best=dist;stalled=0;}else stalled+=1/30;maxStalled=Math.max(maxStalled,stalled);if(dist<1.8)break;}
  results.push({...c,start,end:mo.mesh.position.toArray(),distance:Math.hypot(mo.mesh.position.x-goal.x,mo.mesh.position.z-goal.z),maxStalled});
 }
 // Actual wave routing must complete all three underground galleries.
 const routes=[];for(const mouth of q.MOUTHS){q.clearEntities(false);q.player.dead=true;const mo=q.spawnMonster('mob',0,299,{ch:q.CHAPTERS[0],route:q.hiveRoute(mouth.id)});for(let i=0;i<2400&&mo.route;i++)q.updMonsters(1/30);routes.push({id:mouth.id,exited:!mo.route,pos:mo.mesh.position.toArray()});}
 const edges=[];for(const side of [-1,1]){q.clearEntities(false);const mo=q.spawnMonster('mob',side*108,90,{ch:q.CHAPTERS[0]});mo.wander=mo.mesh.position.clone().set(side,0,0);for(let i=0;i<300;i++)q.moveMonster(mo,mo.wander,1/30,.3);edges.push({side,x:mo.mesh.position.x,z:mo.mesh.position.z,inside:Math.abs(mo.mesh.position.x)<108});}
 q.clearEntities(false);for(let i=0;i<48;i++)q.spawnMonster('mob',(i%4-1.5)*.5,300+Math.floor(i/4)*.2,{ch:q.CHAPTERS[0],route:q.hiveRoute(q.MOUTHS[i%3].id)});
 for(let i=0;i<2400&&q.monsters.some(m=>m.route);i++)q.updMonsters(1/30);
 const crowd={remaining:q.monsters.filter(m=>m.route).map(m=>({pos:m.mesh.position.toArray(),routeIndex:m.routeIndex})),total:q.monsters.length};
 return {cases:results,routes,edges,crowd};});fs.writeFileSync(path.join(out,'navigation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!process.env.BASELINE){assert.ok(result.cases.every(c=>c.distance<2),result.cases.filter(c=>c.distance>=2).map(c=>c.name).join(','));assert.ok(result.routes.every(r=>r.exited));assert.ok(result.edges.every(e=>e.inside));assert.equal(result.crowd.remaining.length,0);}
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
