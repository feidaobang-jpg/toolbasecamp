// Real chapter transitions, save/load, sandbox UI and bounded scene resources.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8898/html/game/starship-defense/index.html';
const output=process.env.CAPTURE_PATH||path.join(__dirname,'media-kit/releases/web-environments-v0.12.0');
(async()=>{
  fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const results={};
  try{
    const page=await browser.newPage({viewport:{width:1440,height:810}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__gameQA?.battlefield);
    const mapping=await page.evaluate(()=>Array.from({length:10},(_,i)=>__gameQA.environmentForChapter(i+1).id));
    assert.deepEqual(mapping,['desert','desert','desert','frost','frost','frost','hive','hive','hive','hive']);
    results.chapterMapping=mapping;
    results.transition=await page.evaluate(()=>{
      const q=__gameQA;q.newGame(false);q.Game.chapter=3;q.Game.level=10;q.startPrep();q.Game.wave.done=true;q.levelWin();q.updWave(10);
      const next={chapter:q.Game.chapter,environment:q.battlefield.current.id};
      q.Game.chapter=7;q.Game.level=1;q.startPrep();const data=q.saveData();q.newGame(false);q.loadGame(data);
      return {next,loaded:q.battlefield.current.id,chapter:q.Game.chapter};
    });
    assert.deepEqual(results.transition,{next:{chapter:4,environment:'frost'},loaded:'hive',chapter:7});
    console.log('PASS chapter 3→4 progression and chapter 7 save/load select the correct environment');
    results.invariants=await page.evaluate(()=>{
      const q=__gameQA;const before={position:q.groundMesh.geometry.attributes.position.array.slice(),solids:JSON.stringify(q.fortress.solids),lights:q.scene.children.filter(o=>o.isLight).length};
      for(const c of [1,4,7,1])q.battlefield.applyChapter(c);
      const count=q.battlefield.rebuilds;q.battlefield.applyChapter(2);
      return {sameTerrain:before.position.every((v,i)=>v===q.groundMesh.geometry.attributes.position.array[i]),sameCollision:before.solids===JSON.stringify(q.fortress.solids),sameLights:before.lights===q.scene.children.filter(o=>o.isLight).length,noSameBiomeRebuild:count===q.battlefield.rebuilds,groups:q.scene.children.filter(o=>o.name==='chapter-environment').length};
    });
    assert.deepEqual(results.invariants,{sameTerrain:true,sameCollision:true,sameLights:true,noSameBiomeRebuild:true,groups:1});
    console.log('PASS fixed geometry/collision/light count and no rebuild within one environment');
    results.operation=await page.evaluate(()=>{const q=__gameQA;q.Game.chapter=4;q.startPrep();q.operations.start('depot');const during=q.battlefield.current.id;q.operations.finish(false);return {during,after:q.battlefield.current.id};});
    assert.deepEqual(results.operation,{during:'frost',after:'frost'});
    const normalSave=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('sst_save_')&&!k.startsWith('sst_save_sandbox_'))));
    await page.evaluate(()=>{const q=__gameQA;q.newGame(true);q.sandboxWave.enabled=false;});
    for(const id of ['frost','hive','desert']){
      await page.keyboard.press('KeyT');await page.locator('#testEnvironment').selectOption(id);await page.locator('#test-environment').click();
      assert.equal(await page.evaluate(()=>__gameQA.battlefield.current.id),id);
      assert.equal(await page.locator('#sandboxPanel').isVisible(),false);
      assert.match(await page.locator('#environmentName').textContent(),{desert:/荒漠/,frost:/冰原/,hive:/虫巢/}[id]);
    }
    assert.deepEqual(await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('sst_save_')&&!k.startsWith('sst_save_sandbox_')))),normalSave);
    console.log('PASS sandbox environment selector works through actual controls');
    results.scene=[];
    for(const chapter of [1,4,7]){
      await page.evaluate(ch=>{
        const q=__gameQA;q.Game.chapter=ch;q.Game.level=1;q.startPrep();q.sandboxWave.enabled=false;q.clearEntities(false);
        q.CombatControls.set('fire','hold');q.player.pos.set(0,q.groundY(0,35),35);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.setCamMode('third',false);q.setCameraView(0);
        for(let i=0;i<5;i++){q.spawnMonster('mob',(i-2)*5,65+Math.abs(i-2)*3,{ch:q.CHAPTERS[ch-1],wild:true});const m=q.monsters[q.monsters.length-1];m.speed=0;m.emerge=0;}
      },chapter);
      await page.waitForTimeout(1400);
      const id=await page.evaluate(()=>__gameQA.battlefield.current.id);
      await page.evaluate(()=>{document.getElementById('msg').style.opacity=0;document.getElementById('hint').style.opacity=0;});
      await page.screenshot({path:path.join(output,id+'.jpg'),type:'jpeg',quality:88});
      results.scene.push(await page.evaluate(()=>({id:__gameQA.battlefield.current.id,memory:{...__gameQA.renderer.info.memory},drawCalls:__gameQA.renderer.info.render.calls,triangles:__gameQA.renderer.info.render.triangles})));
    }
    // Render each rebuilt environment so WebGL allocations and disposal are exercised.
    const memory=[];
    for(let pass=0;pass<3;pass++)for(const chapter of [1,4,7]){
      await page.evaluate(c=>__gameQA.battlefield.applyChapter(c),chapter);await page.waitForTimeout(120);
      if(chapter===7)memory.push(await page.evaluate(()=>({...__gameQA.renderer.info.memory})));
    }
    assert.equal(memory[0].geometries,memory[2].geometries);assert.equal(memory[0].textures,memory[2].textures);results.memory=memory;
    await page.evaluate(()=>{const q=__gameQA;q.visuals.quality='smooth';q.battlefield.update(.1,q.player.pos,'smooth');});
    assert.equal(await page.evaluate(()=>__gameQA.battlefield.weather.visible),false);
    console.log('PASS repeated switching releases scene resources; smooth mode hides weather');
    const phone=await browser.newContext({viewport:{width:960,height:540},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'});
    const mobile=await phone.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(url+'?qa=1');await mobile.waitForFunction(()=>window.__gameQA?.battlefield);await mobile.locator('#btnTest').tap();
    await mobile.locator('#sandboxBtn').tap();await mobile.locator('#testEnvironment').selectOption('frost');await mobile.locator('#test-environment').tap();
    assert.equal(await mobile.evaluate(()=>__gameQA.battlefield.current.id),'frost');
    assert.equal(await mobile.locator('#vJ').isVisible(),true);
    assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await mobile.screenshot({path:path.join(output,'phone-frost.jpg'),type:'jpeg',quality:85});
    results.phone='touch selector, HUD and controls passed';await phone.close();
    assert.deepEqual(errors,[]);results.errors=errors;results.checkedAt=new Date().toISOString();
    fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(results,null,2)+'\n');
    console.log('PASS mobile touch selection, layout and zero runtime errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
