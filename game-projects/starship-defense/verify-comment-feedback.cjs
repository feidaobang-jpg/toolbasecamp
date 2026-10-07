// Regression for creator comments: modal focus, moving mortar targets and spawn/route safety.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const url=process.env.GAME_URL||'http://127.0.0.1:8937/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-feedback-v0.22.1/qa');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});const results=[];
 try{for(const viewport of [{width:1280,height:720},{width:390,height:844},{width:844,height:390}]){
  const page=await browser.newPage({viewport,isMobile:viewport.width<1000,hasTouch:viewport.width<1000}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+(url.includes('?')?'&':'?')+'qa=1&test=1');await page.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  await page.locator('.coop-entry').click();const focus=[];
  for(const field of ['name','roomName','code','password']){
   await page.locator('[data-field="'+field+'"]').click();await page.waitForTimeout(350);
   const retained=await page.evaluate(f=>document.activeElement?.dataset.field===f,field);
   if(retained){await page.locator('[data-field="'+field+'"]').fill(field==='code'?'123456':'test');await page.setViewportSize({...viewport,height:Math.max(280,viewport.height-180)});await page.waitForTimeout(200);}
   focus.push({field,retained,afterResize:await page.evaluate(f=>document.activeElement?.dataset.field===f,field)});await page.setViewportSize(viewport);
  }
  await page.screenshot({path:path.join(out,viewport.width+'-lobby.png')});await page.locator('[data-do="close"]').click();
  const combat=await page.evaluate(()=>{
   const q=__gameQA,res={shots:[],routes:[],invalid:[]};q.Game.state='paused';q.clearEntities(true);q.Game.loop=1;
   for(const speed of [0,8,16]){q.clearEntities(true);q.placeBuilding('mortarTurret',0,40,0);const m=q.spawnMonster('mob',0,80,{quiet:true});m.hp=m.maxHp=10000;m.mesh.position.set(0,q.groundY(0,80),80);m.vx=speed;m.vz=0;q.updBuildings(.05);let t=0;for(;t<2&&q.bullets.length;t+=.025){m.mesh.position.x+=speed*.025;m.mesh.position.y=q.groundY(m.mesh.position.x,m.mesh.position.z);q.updBullets(.025);}res.shots.push({speed,time:t,damage:10000-m.hp});}
   q.clearEntities(true);q.Game.chapter=1;q.Game.level=1;q.Game.testMode=true;q.player.pos.set(0,q.groundY(0,-30),-30);q.player.mesh.position.copy(q.player.pos);
   for(const id of ['W','C','E'])for(const kind of ['mob','boss']){q.clearEntities(true);const m=q.spawnMonster(kind,0,q.HIVE.z-3,{quiet:true,route:q.hiveRoute(id)});m.hp=m.maxHp=1e6;m.atkCd=m.spitCd=1e5;for(let i=0;i<2400&&m.route;i++)q.updMonsters(.05);res.routes.push({id,kind,x:m.mesh.position.x,z:m.mesh.position.z,remaining:!!m.route,index:m.routeIndex});}
   q.clearEntities(true);for(let x=-80;x<=80;x+=20)for(let z=-50;z<=320;z+=30){const m=q.spawnMonster('mob',x,z,{elite:true,affix:'tank',quiet:true});if(q.collideWalls(m.mesh.position.x,m.mesh.position.z,m.radius,m.mesh.position.y)||q.tooSteep(m.mesh.position.x,m.mesh.position.z))res.invalid.push([x,z,m.mesh.position.x,m.mesh.position.z]);q.clearEntities(true);}
   return res;
  });results.push({viewport,focus,combat,errors});await page.close();
 }}finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));}
 console.log(JSON.stringify(results,null,2));if(process.env.REPRO_ONLY!=='1')for(const r of results){assert.ok(r.focus.every(f=>f.retained&&f.afterResize),'lobby focus');assert.ok(r.combat.shots.every(s=>s.damage>0&&s.time<1.1),'moving mortar targets');assert.ok(r.combat.routes.every(s=>!s.remaining),'all tunnels exit');assert.equal(r.combat.invalid.length,0,'safe elite spawns');assert.deepEqual(r.errors,[]);}
})().catch(e=>{console.error(e);process.exitCode=1;});
