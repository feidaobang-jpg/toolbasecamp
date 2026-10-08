// Exercise the shipped classic script, real shop clicks and legacy/new saves.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8918/html/game/starship-defense/index.html';
const out=path.resolve(__dirname,process.env.OUT_DIR||'media-kit/releases/web-squad-v0.29.0/qa/local');
const shapes=process.env.SHAPES?process.env.SHAPES.split(','):['desktop','landscape','portrait'];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 const results=[];
 try{for(const shape of shapes){
  const viewport=shape==='desktop'?{width:1280,height:720}:shape==='landscape'?{width:844,height:390}:{width:390,height:844};
  const context=await browser.newContext({viewport,isMobile:shape!=='desktop',hasTouch:shape!=='desktop',recordVideo:shape==='desktop'?{dir:out,size:viewport}:undefined});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+(url.includes('?')?'&':'?')+'qa=1');await page.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  await page.locator('#btnStart').click();await page.waitForTimeout(300);
  await page.evaluate(()=>{const q=__gameQA;q.Game.gold=100000;q.openShop();});
  await page.locator('#shopTabs [data-t="squad"]').click();
  for(let i=0;i<12;i++){
   await page.locator('#shopGrid .shopItem').nth(i%4).click();
   // Only speed up the delivery animation; purchase/price/slot reservation use the actual shop.
   await page.evaluate(()=>__gameQA.updAirdrops(5));
   assert.equal(await page.evaluate(()=>__gameQA.Game.squadCount),i+1);
  }
  assert.equal(await page.evaluate(()=>__gameQA.squad.length),12);
  const before=await page.evaluate(()=>__gameQA.Game.gold);
  await page.locator('#shopGrid .shopItem').first().click();
  assert.equal(await page.evaluate(()=>__gameQA.Game.gold),before,'13th hire must not charge');
  await page.locator('[data-squad-slot="11"][data-gear="weapon"]').click();
  assert.equal(await page.evaluate(()=>__gameQA.squadGear(11).weapon),1);
  await page.evaluate(()=>{const q=__gameQA;q.closePanels();q.tacticalPanel.open();});
  await page.locator('[data-squad-slot="11"][data-squad-order="defend"]').click();
  assert.equal(await page.evaluate(()=>__gameQA.squadGear(11).order),'defend');
  assert.equal(await page.locator('#tacticalSquad .tactical-mate').count(),12);
  await page.screenshot({path:path.join(out,shape+'-orders.png')});
  const save=await page.evaluate(()=>{
   const q=__gameQA;q.closePanels();const d=q.saveData(),opts={weapons:q.WEAPONS,buildings:q.BUILDINGS,vehicles:q.VEHICLES};
   const valid=q.validateNormalSave(d,opts),overflow=q.validateNormalSave({...d,squadCount:13},opts),fraction=q.validateNormalSave({...d,squadCount:4.5},opts),gearOverflow=q.validateNormalSave({...d,squadGear:[...d.squadGear,{}]},opts);
   q.loadGame(d);const restored={count:q.squad.length,gear:q.squadGear(11).weapon,order:q.squadGear(11).order};
   const positions=q.squad.map(s=>({slot:s.slot,anchor:q.squadAnchor(s),follow:q.squadFollowPoint(s,q.player.pos)}));
   const legacy={...d,squadCount:4,squadGear:d.squadGear.slice(0,4)};const legacyValid=q.validateNormalSave(legacy,opts);q.loadGame(legacy);const legacyCount=q.squad.length;
   q.loadGame(d);q.autoSave();return{valid,overflow,fraction,gearOverflow,restored,positions,legacyValid,legacyCount};
  });
  assert.ok(save.valid&&save.legacyValid);assert.ok(!save.overflow&&!save.fraction&&!save.gearOverflow);
  assert.deepEqual(save.restored,{count:12,gear:1,order:'defend'});assert.equal(save.legacyCount,4);
  assert.ok(save.positions.every(s=>Number.isFinite(s.anchor.x)&&Number.isFinite(s.anchor.z)&&Number.isFinite(s.follow.x)&&Number.isFinite(s.follow.z)));
  assert.equal(new Set(save.positions.map(s=>JSON.stringify(s.anchor))).size,12,'separate defence posts');
  await page.reload();await page.waitForFunction(()=>window.__gameQA&&window.__ccReady);await page.locator('#btnContinue').click();
  assert.equal(await page.evaluate(()=>__gameQA.squad.length),12,'refresh/continue preserves full squad');
  const recovery=await page.evaluate(()=>{
   const q=__gameQA;q.damageSquad(q.squad.find(s=>s.slot===7),99999);const wounded=q.squad.length;
   q.startPrep();const returned=q.squad.map(s=>s.slot);
   q.setDeviceMode('touch');q.setDeviceMode('pc');q.setDeviceMode('auto');
   return{wounded,returned,count:q.Game.squadCount,gear:q.squadGear(11).weapon,order:q.squadGear(11).order};
  });
  assert.equal(recovery.wounded,11);assert.equal(recovery.returned.length,12);assert.equal(new Set(recovery.returned).size,12);assert.equal(recovery.count,12);assert.equal(recovery.gear,1);assert.equal(recovery.order,'defend');
  await page.evaluate(()=>{
   const q=__gameQA;q.setSquadTask('follow');q.setSquadAutoDefense(false);q.Game.state='battle';q.Game.testMode=true;q.sandboxWave.enabled=false;
   q.player.pos.set(0,q.groundY(0,40),40);q.player.mesh.position.copy(q.player.pos);
   for(let i=0;i<48;i++){const m=q.spawnMonster('mob',(i%8-3.5)*4,58+Math.floor(i/8)*5,{ch:q.CHAPTERS[i%10],quiet:true});if(m){m.hp=m.maxHp=1e7;m.emerge=0;}}
  });
  await page.keyboard.down('KeyJ');await page.evaluate(()=>__gameQA.startMeasure());
  for(let i=0;i<4;i++){
   const move=i%2?'KeyA':'KeyD',look=i%2?'KeyQ':'KeyE';await page.keyboard.down(move);await page.keyboard.down(look);await page.waitForTimeout(1500);await page.keyboard.up(move);await page.keyboard.up(look);
  }
  const performance=await page.evaluate(()=>{const q=__gameQA,m=q.endMeasure();delete m.raw;return{...m,squad:q.squad.length,bugs:q.monsters.filter(m=>!m.dead).length,finite:q.squad.every(s=>Number.isFinite(s.mesh.position.x)&&Number.isFinite(s.mesh.position.z)),targets:q.squad.filter(s=>s.target).length};});
  await page.keyboard.up('KeyJ');await page.screenshot({path:path.join(out,shape+'-battle.png')});
  assert.ok(performance.finite);assert.equal(performance.squad,12);assert.ok(performance.bugs>=40);assert.ok(performance.samples>30);
  // Pause/restart keeps the purchased squad; fresh game still starts with no free hires.
  await page.evaluate(()=>{const q=__gameQA;q.Game.testMode=false;q.togglePause();q.restartLevel();});
  assert.equal(await page.evaluate(()=>__gameQA.squad.length),12);
  assert.equal(await page.evaluate(()=>__gameQA.squadGear(11).weapon),1);
  await page.evaluate(()=>{const q=__gameQA;q.newGame(false);q.Game.coop=true;for(let i=0;i<12;i++)q.spawnSquad();});
  assert.equal(await page.evaluate(()=>__gameQA.squad.length),4,'coop NPC capacity unchanged');
  await page.evaluate(()=>{const q=__gameQA;q.Game.coop=false;q.newGame(false);});
  assert.equal(await page.evaluate(()=>__gameQA.Game.squadCount),0);
  assert.equal(errors.length,0,errors.join('\n'));
  const video=page.video();await context.close();if(video)await video.saveAs(path.join(out,'desktop-session.webm'));
  results.push({shape,viewport,save,recovery,performance,errors});
  console.log(shape+' PASS '+JSON.stringify({fps:Math.round(performance.averageFPS),p95:performance.p95Ms,squad:performance.squad,bugs:performance.bugs}));
 }
 }finally{await browser.close();}
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({url,at:new Date().toISOString(),method:'Headless Edge on desktop GPU; shop clicks and keyboard input. Seeded test funds, accelerated airdrop animation and invincible load scene. Phone viewport simulation, not physical phone. Video has no captured game audio.',results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
