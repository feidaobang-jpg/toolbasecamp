// Controlled qa=1 fixtures plus real build-menu input; mobile is viewport simulation.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8917/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-defense-v0.21.0/qa/website');
async function run(){
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const results=[];
 try{
  for(const shape of ['desktop','landscape','portrait']){
   const mobile=shape!=='desktop';
   const context=await browser.newContext({viewport:mobile?(shape==='landscape'?{width:844,height:390}:{width:390,height:844}):{width:1280,height:720},isMobile:mobile,hasTouch:mobile,
    recordVideo:shape==='desktop'?{dir:path.join(out,'captures'),size:{width:1280,height:720}}:undefined});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
   await page.goto(url);let game=page;
   if(process.env.TOY_PREVIEW==='1'){await page.locator('iframe').first().waitFor();game=await(await page.locator('iframe').first().elementHandle()).contentFrame();}
   await game.goto(game.url()+(game.url().includes('?')?'&':'?')+'qa=1');
   await game.waitForFunction(()=>window.__gameQA&&window.__ccReady);
   await game.locator('#btnStart').click();await game.waitForFunction(()=>__gameQA.Game.state==='prep');
   await game.evaluate(()=>{const q=__gameQA;q.clearEntities(true);q.Game.gold=15000;q.Game.state='prep';q.CombatControls.set('fire','hold');q.player.pos.set(0,q.groundY(0,20),20);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.setCamMode('third',false);});
   for(const [id,name] of [['cryoTurret','寒霜脉冲塔'],['mortarTurret','重型迫击炮']]){
    if(mobile)await game.locator('#vL').tap();else await page.keyboard.press('KeyL');
    await game.locator('#buildPanel').waitFor({state:'visible'});await game.waitForTimeout(320);
    await game.locator('#buildGrid .shopItem').filter({hasText:name}).click();
    assert.equal(await game.evaluate(()=>__gameQA.place.kind),id);
    if(mobile)await game.locator('#placeOk').tap();else await page.keyboard.press('KeyJ');
    assert.ok(await game.evaluate(id=>__gameQA.buildings.some(b=>b.kind===id),id));
    if(mobile)await game.locator('#placeCancel').tap();else await page.keyboard.press('Escape');
    await game.evaluate(()=>{const q=__gameQA;q.player.pos.x+=7;q.player.pos.y=q.groundY(q.player.pos.x,q.player.pos.z);q.player.mesh.position.copy(q.player.pos);});
   }
   await page.screenshot({path:path.join(out,shape+'-new-turrets.jpg'),quality:86});
   const combat=await game.evaluate(()=>{
    const q=__gameQA,results={};q.Game.state='paused';q.clearEntities(true);
    const mob=(x,z,fly=false)=>{const m=q.spawnMonster('mob',x,z,{quiet:true});m.hp=m.maxHp=10000;m.fly=fly;m.emerge=0;m.mesh.position.set(x,q.groundY(x,z)+(fly?4:0),z);return m;};
    // Static target isolates each tower's first shot; no player/squad contributes.
    for(const kind of Object.keys(q.BUILDINGS).filter(k=>q.BUILDINGS[k].dmg)){
     const damage=[];
     for(const loop of [1,2,3]){
      q.clearEntities(true);q.Game.loop=loop;const b=q.placeBuilding(kind,0,40,0),m=mob(0,52,kind==='antiAir');
      q.updBuildings(.05);for(let i=0;i<60;i++)q.updBullets(.05);
      damage.push(10000-m.hp);
     }
     results[kind]=damage;
    }
    q.clearEntities(true);q.Game.loop=1;const frost=q.placeBuilding('cryoTurret',0,40,0),a=mob(0,52),b=mob(3,53),boss=q.spawnMonster('boss',-3,54,{quiet:true});boss.hp=boss.maxHp=10000;boss.emerge=0;
    q.updBuildings(.05);
    results.frost={damage:[10000-a.hp,10000-b.hp,10000-boss.hp],slow:[a.slowFactor,b.slowFactor,boss.slowFactor],duration:a.slowT};
    const dir=a.mesh.position.clone().set(1,0,0),x=a.mesh.position.x;
    q.moveMonster(a,dir,.1,1);results.frost.slowDistance=a.mesh.position.x-x;
    const x2=a.mesh.position.x;a.slowT=0;q.moveMonster(a,dir,.1,1);results.frost.normalDistance=a.mesh.position.x-x2;
    b.atkCd=99;b.spitCd=99;for(let i=0;i<45;i++)q.updMonsters(.05);results.frost.expired=b.slowT===0;
    q.clearEntities(true);const mortar=q.placeBuilding('mortarTurret',0,40,0),c=mob(0,58),d=mob(3,59);
    q.updBuildings(.05);results.mortar={arc:q.bullets.some(b=>b.gravity>0)};
    for(let i=0;i<60;i++)q.updBullets(.05);results.mortar.damage=[10000-c.hp,10000-d.hp];
    q.clearEntities(true);q.placeBuilding('mortarTurret',0,40,0);mob(0,52,true);q.updBuildings(.05);results.mortar.noAirTarget=q.bullets.length===0;
    return results;
   });
   for(const [kind,damage] of Object.entries(combat).filter(([k])=>!['frost','mortar'].includes(k))){
    assert.ok(damage[0]>0,kind+' must hit');assert.ok(Math.abs(damage[1]/damage[0]-1.5)<.01,kind+' loop2');assert.ok(Math.abs(damage[2]/damage[0]-2)<.01,kind+' loop3');
   }
   assert.ok(combat.frost.damage.every(n=>n>0));assert.deepEqual(combat.frost.slow,[.45,.45,.7]);assert.equal(combat.frost.duration,2);assert.ok(combat.frost.expired);
   assert.ok(combat.frost.slowDistance<combat.frost.normalDistance*.6);
   assert.ok(combat.mortar.arc&&combat.mortar.noAirTarget&&combat.mortar.damage.every(n=>n>0));
   const saves=await game.evaluate(()=>{
    const q=__gameQA,valid=d=>q.validateNormalSave(d,{weapons:q.WEAPONS,buildings:q.BUILDINGS,vehicles:q.VEHICLES}),res=[];
    q.Game.state='paused';q.clearEntities(true);q.Game.gold=20000;
    for(const [loop,limit] of [[1,64],[2,80],[3,96]]){
     q.clearEntities(true);q.Game.loop=loop;
     for(let i=0;i<limit;i++)q.placeBuilding(i%2?'cryoTurret':'mortarTurret',-100+(i%16)*12,90+Math.floor(i/16)*20,0);
     q.renderBuild();const s=q.saveData(),rejected=q.placementCheck('mgTurret',0,30,0);
     const copy=JSON.parse(JSON.stringify(s));q.applySave(copy);
     res.push({loop,limit,valid:valid(s),overflow:!valid({...s,buildings:[...s.buildings,s.buildings[0]]}),count:q.buildings.length,rejected,menu:document.getElementById('buildGold').textContent});
    }
    q.clearEntities(true);q.Game.loop=1;q.Game.chapter=10;q.Game.level=10;q.Game.wave.rewarded=false;
    const tower=q.placeBuilding('mgTurret',0,40,0);tower.hp=tower.maxHp/2;q.levelWin();
    const rolled={loop:q.Game.loop,hp:tower.hp,maxHp:tower.maxHp,valid:valid(q.saveData())};q.applySave(q.saveData());
    rolled.reload=q.buildings[0].hp;
    const old=q.saveData();delete old.buildings[0].maxHp;old.buildings[0].hp=100;q.applySave(old);
    rolled.legacyHp=q.buildings[0].hp;rolled.legacyValid=valid(old);
    return {res,rolled};
   });
   for(const r of saves.res){assert.ok(r.valid&&r.overflow);assert.equal(r.count,r.limit);assert.ok(r.rejected.includes(String(r.limit)));assert.ok(r.menu.includes('/'+r.limit));}
   assert.equal(saves.rolled.loop,2);assert.equal(saves.rolled.maxHp,350);assert.equal(saves.rolled.hp,175);assert.equal(saves.rolled.reload,175);assert.equal(saves.rolled.legacyHp,100);assert.ok(saves.rolled.valid&&saves.rolled.legacyValid);
   await game.evaluate(()=>{
    const q=__gameQA;q.newGame(false);q.clearEntities(true);q.Game.loop=3;q.Game.gold=8000;q.CombatControls.set('fire','hold');
    q.player.pos.set(0,q.groundY(0,32),32);q.player.mesh.position.copy(q.player.pos);q.setCameraView(1,false);
    for(const [kind,x,z] of [['cryoTurret',-6,44],['mortarTurret',6,44],['mgTurret',-13,42],['cannonTurret',13,42]])q.placeBuilding(kind,x,z,0);
    for(let i=0;i<8;i++){const m=q.spawnMonster('mob',(i%4-1.5)*4,60+Math.floor(i/4)*8,{ch:q.CHAPTERS[i%4],quiet:true});m.hp=m.maxHp=2000;m.emerge=0;}
   });
   await game.waitForTimeout(2500);await page.keyboard.down('KeyD');await page.keyboard.down('KeyE');await game.waitForTimeout(1800);await page.keyboard.up('KeyD');await page.keyboard.up('KeyE');
   await page.screenshot({path:path.join(out,shape+'-tower-combat.jpg'),quality:88});
   if(mobile)await game.locator('#vL').tap();else await page.keyboard.press('KeyL');
   await game.waitForTimeout(320);
   await page.screenshot({path:path.join(out,shape+'-build-menu.jpg'),quality:86});
   await game.locator('#buildClose').click();
   await game.evaluate(()=>{const q=__gameQA;q.setDeviceMode('touch');q.setDeviceMode('desktop');q.setDeviceMode('auto');});
   assert.equal(await game.evaluate(()=>__gameQA.Game.loop),3);
   assert.deepEqual(errors,[]);results.push({shape,combat,saves,errors});
   await context.close();console.log(shape+' passed');
  }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({version:'web-defense-v0.21.0',checked_at:new Date().toISOString(),results},null,2));
}
run().catch(e=>{console.error(e);process.exitCode=1;});
