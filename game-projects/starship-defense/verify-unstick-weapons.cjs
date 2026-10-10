const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
(async()=>{
 const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
 const p=await (await b.newContext({viewport:{width:1280,height:720}})).newPage();
 const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(500);
 let out;
 try{
  out=await p.evaluate(()=>{
   const q=__gameQA,res={};
   q.newGame(false);q.Game.state='battle';
   // --- 测试1：地面车被卡 1.5 秒内脱困 ---
   q.clearEntities(false);q.player.reset(q.Game.cls);
   let v=q.vehicles.find(v=>v.kind==='jeep');if(!v){q.Game.vehiclesOwned.push('jeep');v=q.spawnVehicle('jeep');}
   q.enterVehicle(v);
   const s=q.rockColliders.find(r=>r.x&&r.z)||q.fortress.solids.find(s=>s.r&&s.r>=8);
   v.mesh.position.set(s.x,q.groundY(s.x,s.z),s.z);v.alt=0;
   const start=v.mesh.position.clone();
   q.Input.keys.up=true;
   let moved=0;
   for(let i=0;i<60;i++){const a=v.mesh.position.clone();q.updPlayer(.05);moved+=Math.hypot(v.mesh.position.x-a.x,v.mesh.position.z-a.z);}
   q.Input.keys.up=false;
   res.vehicleMoved=Math.round(moved*10)/10;
   res.teleported=v.mesh.position.distanceTo(start)>4;
   res.vehicleFree=!q.collideWalls(v.mesh.position.x,v.mesh.position.z,2,v.mesh.position.y);
   q.exitVehicle();
   // --- 测试2/3：RPG 与四连导弹 ---
   q.Game.weapons.push('rpg','missilePod');
   q.Game.state='prep';
   q.selectWeapon('rpg',true);
   res.cur1=q.Game.curWeapon;
   q.Input.network={fire:true,autoFire:false,x:0,z:0,rise:false,lower:false};
   let rpg=0;
   for(let i=0;i<40;i++){q.updPlayer(.05);rpg=q.bullets.filter(x=>x.explode>=5).length;}
   res.rpgFired=rpg>0;
   q.selectWeapon('missilePod',true);
   q.bullets.length=0;
   q.Input.network={fire:true,autoFire:false,x:0,z:0,rise:false,lower:false};
   let pods=0,frames=[];
   for(let i=0;i<22;i++){q.updPlayer(.033);pods=q.bullets.filter(x=>Math.abs(x.explode-2.4)<0.01).length;frames.push(pods);}
   q.Input.network=null;
   for(let i=0;i<40;i++)q.updPlayer(.033);
   res.missileBurst=frames;
   res.burstOk=frames[frames.length-1]>=4;
   res.pageErrors=window.__tbLastErrors||0;
   return JSON.stringify(res);
  });
 }catch(e){out='EVAL_ERROR: '+e.message+' | pageErrors: '+errs.join(' ; ');}
 console.log(out);
 await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
