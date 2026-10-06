// Real-browser regression. Controlled combat fixtures use the existing qa=1 hooks.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8896/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-difficulty-v0.19.0/qa');
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});const results=[];
 try{for(const shape of ['desktop','landscape','portrait']){
  const mobile=shape!=='desktop';
  const context=await browser.newContext({viewport:shape==='desktop'?{width:1280,height:720}:shape==='landscape'?{width:844,height:390}:{width:390,height:844},hasTouch:mobile,isMobile:mobile,
   recordVideo:shape==='desktop'?{dir:path.join(out,'captures'),size:{width:1280,height:720}}:undefined});
  console.log('checking',shape);const page=await context.newPage(),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);let game=page;
  if(process.env.TOY_PREVIEW==='1'){await page.locator('iframe').first().waitFor();game=await (await page.locator('iframe').first().elementHandle()).contentFrame();}
  await game.goto(game.url()+(game.url().includes('?')?'&':'?')+'qa=1');await game.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  const press=async selector=>mobile?game.locator(selector==='#menuButton'?'#vP':selector).tap():game.locator(selector).click();
  const difficulty=[];
  for(const id of ['casual','normal','hard']){
   await press('[data-campaign-difficulty="'+id+'"]');
   assert.equal(await game.locator('[data-campaign-difficulty="'+id+'"]').getAttribute('aria-pressed'),'true');
   await press('#btnStart');await game.waitForFunction(()=>__gameQA.Game.state==='prep');
   const measured=await game.evaluate(id=>{
    const q=__gameQA;q.closePanels();q.clearEntities(true);q.Game.loop=1;q.Game.chapter=1;q.Game.level=1;
    q.CombatControls.set('fire','hold');
    const mob=q.spawnMonster('mob',0,100,{quiet:true}),boss=q.spawnMonster('boss',15,100,{quiet:true}),elite=q.spawnMonster('mob',-15,100,{quiet:true,elite:true,affix:'armored'});
    const stats={id:q.Game.difficulty,hp:mob.hp,damage:mob.dmg,gold:mob.gold,bossHp:boss.hp,eliteHp:elite.hp,baseHp:q.base.maxHp};
    q.clearEntities(false);q.Game.hive.killed=false;q.startBattle();stats.wave=q.Game.wave.total;
    q.updWave(2);stats.spawned=q.Game.wave.spawned;stats.interval=q.Game.wave.timer;
    q.clearEntities(false);q.Game.state='prep';q.Game.hive.killed=true;q.startBattle();stats.weakenedWave=q.Game.wave.total;
    q.Game.state='prep';q.Game.hive.killed=false;
    stats.save=q.saveData();stats.valid=q.validateNormalSave(stats.save,{weapons:q.WEAPONS,buildings:q.BUILDINGS,vehicles:q.VEHICLES});
    stats.badSaveRejected=!q.validateNormalSave({...stats.save,difficulty:'nightmare'},{weapons:q.WEAPONS,buildings:q.BUILDINGS,vehicles:q.VEHICLES});
    q.autoSave();return stats;
   },id);
   assert.equal(measured.id,id);assert.ok(measured.valid&&measured.badSaveRejected);assert.equal(measured.save.difficulty,id);assert.ok(measured.weakenedWave<measured.wave);assert.equal(measured.spawned,1);
   difficulty.push(measured);console.log(shape,id,'rules/save passed');
   assert.ok((await game.locator('#statLine').textContent()).includes({casual:'休闲',normal:'普通',hard:'困难'}[id]));
   await press('#menuButton');await press('#btnSaveMenu');await press('#slotList .saveSlot:not(.auto):nth-child(1) button:first-child');
   assert.ok((await game.locator('#slotList').textContent()).includes({casual:'休闲',normal:'普通',hard:'困难'}[id]));
   await press('#saveClose');await press('#btnQuit');
  }
  const [easy,normal,hard]=difficulty;
  assert.equal(normal.hp,30);assert.equal(normal.damage,8);assert.equal(normal.gold,12);assert.equal(normal.baseHp,2000);assert.equal(normal.wave,11);assert.ok(Math.abs(normal.interval-2.05)<1e-10);
  assert.ok(easy.hp<normal.hp&&easy.damage<normal.damage&&easy.baseHp>normal.baseHp&&easy.interval>normal.interval);
  assert.ok(hard.hp>normal.hp&&hard.damage>normal.damage&&hard.wave>normal.wave&&hard.interval<normal.interval&&hard.gold<normal.gold);
  assert.ok(hard.hp<normal.hp*1.2&&hard.bossHp<normal.bossHp*1.2,'hard mode avoids bloated HP');
  await press('[data-campaign-difficulty="casual"]');await press('#btnContinue');
  assert.equal(await game.evaluate(()=>__gameQA.Game.difficulty),'hard','continue restores save, not menu preference');
  await game.evaluate(()=>{const q=__gameQA;q.Game.level=4;q.Game.gold=712;q.autoSave();});
  await game.evaluate(()=>location.reload());await game.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  assert.equal(await game.locator('[data-campaign-difficulty="casual"]').getAttribute('aria-pressed'),'true','new-game preference persists');
  await press('#btnContinue');assert.deepEqual(await game.evaluate(()=>({d:__gameQA.Game.difficulty,l:__gameQA.Game.level,g:__gameQA.Game.gold})),{d:'hard',l:4,g:712});
  console.log(shape,'resume/reload passed');const compatibility=await game.evaluate(()=>{
   const q=__gameQA,d=q.saveData();delete d.difficulty;
   const legacyValid=q.validateNormalSave(d,{weapons:q.WEAPONS,buildings:q.BUILDINGS,vehicles:q.VEHICLES});q.loadGame(d);
   const legacy={id:q.Game.difficulty,level:q.Game.level,gold:q.Game.gold};
   const opResults=[];
   for(const id of ['casual','normal','hard']){
    q.loadGame({...d,difficulty:id});if(!q.operations.start('depot','normal'))throw new Error('operation did not start');
    const m=q.spawnMonster('mob',0,100,{quiet:true});opResults.push({hp:m.hp,dmg:m.dmg,gold:m.gold});q.operations.finish(false);
   }
   q.newGame(true);const test={id:q.Game.difficulty,mode:q.Game.testMode};
   return {legacyValid,legacy,opResults,test};
  });
  assert.ok(compatibility.legacyValid);assert.deepEqual(compatibility.legacy,{id:'normal',level:4,gold:712});
  assert.deepEqual(compatibility.opResults[0],compatibility.opResults[1]);assert.deepEqual(compatibility.opResults[1],compatibility.opResults[2]);
  assert.deepEqual(compatibility.test,{id:'normal',mode:true});
  await press('#menuButton');await press('#btnQuit');
  if(!mobile){
   await game.locator('[data-campaign-difficulty="normal"]').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
   assert.equal(await game.locator('[data-campaign-difficulty="hard"]').getAttribute('aria-pressed'),'true','keyboard confirms difficulty');
  }else await press('[data-campaign-difficulty="hard"]');
  await game.locator('[data-campaign-difficulty="hard"]').scrollIntoViewIfNeeded();
  const boxes=await game.locator('[data-campaign-difficulty]').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(const b of boxes)assert.ok(b.w>=43&&b.h>=35&&b.x>=-1&&b.y>=-1,'difficulty touch target is visible');
  await page.screenshot({path:path.join(out,'captures',shape+'-difficulty.png')});
  await press('#btnContinue');await game.waitForTimeout(1000);
  await page.screenshot({path:path.join(out,'captures',shape+'-hud.png')});
  const paused=await game.evaluate(()=>{const q=__gameQA;q.togglePause();return{d:q.Game.difficulty,l:q.Game.level,g:q.Game.gold};});
  await press('[data-device-mode="touch"]');await press('[data-device-mode="desktop"]');await press('[data-device-mode="auto"]');
  assert.deepEqual(await game.evaluate(()=>({d:__gameQA.Game.difficulty,l:__gameQA.Game.level,g:__gameQA.Game.gold})),paused,'mode switching preserves run');
  assert.equal(await game.locator('#menuPause [data-campaign-difficulty]').count(),0,'difficulty is fixed for this run');
  const curves=await game.evaluate(()=>{
   const q=__gameQA,problems=[];let cases=0,maxGoldRatio=0;const affixes=Object.keys(q.ELITES).length;
   for(const loop of [1,2,10,100000])for(let chapter=1;chapter<=10;chapter++)for(let level=1;level<=10;level++)for(const killed of [false,true]){
    const old=Math.round((8+level*1.8+chapter*1.6)*(1+(loop-1)*.3)),n=killed?Math.round(old*.65):old;
    const normal=q.campaignWaveCount('normal',chapter,level,loop,killed),hard=q.campaignWaveCount('hard',chapter,level,loop,killed);
    const interval=Math.max(.45,2.2-level*.1-chapter*.05-(loop-1)*.25);
    if(normal!==n||q.campaignSpawnInterval('normal',chapter,level,loop)!==interval)problems.push('normal parity');
    if(hard<normal||q.campaignSpawnInterval('hard',chapter,level,loop)>=interval||q.campaignSpawnInterval('hard',chapter,level,loop)<.35)problems.push('pressure/cap');
    const ec=id=>q.campaignEliteChance(id,chapter,loop),base=q.CHAPTERS[chapter-1].mob.gold*(1+(loop-1)*.3);
    const mean=id=>{const r=q.campaignDifficulty(id),g=Math.round(Math.round(base)*r.mobGold);return (id==='hard'?hard:normal)*g*(1+ec(id)*(4*(1+r.doubleAffix*(affixes-1)/affixes)-1));};
    const ratio=mean('hard')/mean('normal');maxGoldRatio=Math.max(maxGoldRatio,ratio);if(ratio>1.15)problems.push('gold snowball');cases++;
   }return{cases,problems,maxGoldRatio};
  });
  console.log(shape,'curves',curves);assert.deepEqual(curves.problems,[]);assert.deepEqual(errors,[]);
  results.push({shape,difficulty,compatibility,curves,keyboard:!mobile,touchSimulation:mobile,errors});await context.close();
 }
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({url,method:'Edge headless WebGL, keyboard/touch UI plus marked qa combat fixtures; no physical phone or audio recording',results},null,2));
 console.log(JSON.stringify(results.map(r=>({shape:r.shape,curves:r.curves,difficulty:r.difficulty.map(({id,hp,damage,baseHp,wave,interval,gold})=>({id,hp,damage,baseHp,wave,interval,gold})),errors:r.errors}))));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
