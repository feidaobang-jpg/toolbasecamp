// Real menu/input checks plus explicitly instrumented combat fixtures. Mobile is browser simulation.
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.ACID_URL||'http://127.0.0.1:8779/html/game/starship-defense/index.html?qa=1';
const out=process.env.ACID_OUT||path.join(require('node:os').tmpdir(),'acid-arena-qa');
const results=[];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 try{
  for(const [width,height] of (process.env.ACID_SIZES?JSON.parse(process.env.ACID_SIZES):[[1280,720],[844,346],[390,844]])){
   const name=width+'x'+height,context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000,recordVideo:{dir:out,size:{width:1280,height:720}}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   try{
    await page.goto(url);let f=page.mainFrame();if(url.includes('bilibili.com/toy/')){await page.locator('iframe').first().waitFor();f=await(await page.locator('iframe').first().elementHandle()).contentFrame();await f.goto(f.url()+(f.url().includes('?')?'&':'?')+'qa=1');}await f.waitForFunction(()=>window.__gameQA&&window.__ccReady);
    await f.evaluate(()=>{const q=__gameQA;q.AudioSys.init();q.AudioSys.master.gain.value=0;q.newGame(false);q.Game.gold=777;q.autoSave();document.querySelector('#btnQuit').click();window.__acidSaveBefore=Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.includes('sst_save_')));});
    await f.locator('#btnAcid').click();await f.locator('#btnModeStart').click();await page.screenshot({path:path.join(out,name+'-rules.png')});
    await f.locator('#acidStart').click();await page.waitForTimeout(1300);await page.screenshot({path:path.join(out,name+'-battle.png')});
    assert.equal(await f.evaluate(()=>__gameQA.acidArena.state.round),1);assert.equal(await f.locator('#readyBtn').isVisible(),false);assert.equal(await f.locator('#saveHealth').isVisible(),false);
    assert.equal(await f.evaluate(()=>__gameQA.battlefield.defenseArt),false,'campaign lighting isolated');
    const start=await f.evaluate(()=>__gameQA.player.pos.toArray());await page.keyboard.down('KeyD');await page.waitForTimeout(300);await page.keyboard.up('KeyD');
    const moved=await f.evaluate(()=>__gameQA.player.pos.toArray());assert(Math.hypot(moved[0]-start[0],moved[2]-start[2])>1,'movement');
    if(width<1000){
      const cdp=await context.newCDPSession(page),box=await f.locator('#joyBase').boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
      const old=await f.evaluate(()=>__gameQA.player.pos.toArray());
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+box.width*.3,y,id:1}]});await page.waitForTimeout(350);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      const now=await f.evaluate(()=>__gameQA.player.pos.toArray());assert(Math.hypot(now[0]-old[0],now[2]-old[2])>1,'real touch joystick moves after rotation');
      await f.locator('#vK').tap();await f.waitForFunction(()=>__gameQA.acidArena.state.dashCd>2);
    }else{await page.keyboard.press('KeyK');await f.waitForFunction(()=>__gameQA.acidArena.state.dashCd>2);}
    await page.keyboard.press('Escape');const beforePause=await f.evaluate(()=>({time:__gameQA.acidArena.state.elapsed,hp:__gameQA.player.hp}));await page.waitForTimeout(300);
    assert.deepEqual(await f.evaluate(()=>({time:__gameQA.acidArena.state.elapsed,hp:__gameQA.player.hp})),beforePause);
    await f.locator('#btnRestartLv').click();assert.equal(await f.evaluate(()=>__gameQA.player.hp),3);
    const firedBefore=await f.evaluate(()=>{const q=__gameQA;q.player.invulnerable=100;q.CombatControls.set('fire','hold');return q.acidArena.state.enemies.reduce((n,e)=>n+e.hp,0);});
    if(width<1000){const b=await f.locator('#vJ').boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);await f.evaluate(()=>__gameQA.CombatControls.set('fire','auto'));}else await page.keyboard.down('KeyJ');
    await page.waitForTimeout(900);if(width>=1000)await page.keyboard.up('KeyJ');
    assert(await f.evaluate(()=>__gameQA.acidArena.state.enemies.reduce((n,e)=>n+e.hp,0))<firedBefore,'live projectiles hit enemies');
    await f.evaluate(()=>__gameQA.CombatControls.set('fire','auto'));
    const views=[];for(let i=0;i<4;i++){await page.keyboard.press('KeyC');await page.waitForTimeout(80);views.push(await f.evaluate(()=>__gameQA.getCamMode()+':'+__gameQA.getCamView()));}
    assert.equal(new Set(views).size,4,'four distinct views');
    // Freeze the RAF and advance only the real module in fixed steps for reliable mechanic assertions.
    const mechanics=await f.evaluate(()=>{
      const q=__gameQA,a=q.acidArena,s=a.state,p=q.player;q.Game.state='paused';
      const yaws=s.enemies.map(e=>e.mesh.rotation.y),positions=s.enemies.map(e=>e.mesh.position.toArray());
      q.Game.state='battle';p.invulnerable=100;for(let i=0;i<180;i++)a.update(1/60);q.Game.state='paused';
      const stationary=s.enemies.every((e,i)=>JSON.stringify(e.mesh.position.toArray())===JSON.stringify(positions[i])&&e.mesh.rotation.y===yaws[i]);
      const e=s.enemies[0];e.hp=e.maxHp=10000;e.weak=false;const shell=a.hurt(e,100);e.weak=true;const weak=a.hurt(e,100);
      q.Game.state='battle';p.invulnerable=0;a.hitPlayer();const one=p.hp;a.hitPlayer();const grace=p.hp;p.invulnerable=0;a.hitPlayer();p.invulnerable=0;a.hitPlayer();
      const dead=s.phase==='result'&&p.hp===0;return {stationary,shell,weak,one,grace,dead};
    });
    assert.deepEqual(mechanics,{stationary:true,shell:30,weak:180,one:2,grace:2,dead:true});
    await page.screenshot({path:path.join(out,name+'-failure.png')});await f.locator('#acidRetry').click();
    const upgrades=await f.evaluate(()=>{
      const q=__gameQA,a=q.acidArena,s=a.state;q.Game.state='battle';q.player.invulnerable=100;
      for(const e of s.enemies)a.hurt(e,100000);a.update(1/60);return {phase:s.phase,time:s.elapsed};
    });assert.equal(upgrades.phase,'upgrade');
    await page.waitForTimeout(250);assert.equal(await f.evaluate(()=>__gameQA.acidArena.state.elapsed),upgrades.time,'upgrade freezes timer');
    await page.screenshot({path:path.join(out,name+'-upgrade.png')});await f.locator('[data-upgrade="shield"]').click();
    assert.equal(await f.evaluate(()=>__gameQA.acidArena.state.round),2);
    const shield=await f.evaluate(()=>{const q=__gameQA,a=q.acidArena;q.player.invulnerable=0;a.shield();a.hitPlayer();return {hp:q.player.hp,blocks:a.state.blockedHits,cooldown:a.state.shieldCd};});
    assert.equal(shield.hp,3);assert.equal(shield.blocks,1);assert(shield.cooldown>11);
    await f.evaluate(()=>{const q=__gameQA,a=q.acidArena;for(const e of a.state.enemies)a.hurt(e,100000);a.update(1/60);});
    await f.locator('[data-upgrade="breach"]').click();assert.equal(await f.evaluate(()=>__gameQA.acidArena.state.round),3);
    const bounds=await f.evaluate(()=>{const q=__gameQA,a=q.acidArena;q.Input.keys.right=true;q.player.invulnerable=100;for(let i=0;i<300;i++)a.update(1/60);q.Input.reset();return q.player.pos.toArray();});assert(Math.abs(bounds[0])<=14&&Math.abs(bounds[2]+1700)<=10);
    await f.evaluate(()=>{const q=__gameQA,a=q.acidArena;for(const e of a.state.enemies)a.hurt(e,100000);a.update(1/60);});
    assert.equal(await f.locator('#acidResultTitle').innerText(),'围场突破！');await page.screenshot({path:path.join(out,name+'-win.png')});
    await f.locator('#acidResultBack').click();assert(await f.locator('#menuMain').isVisible());
    const saved=await f.evaluate(()=>({before:__acidSaveBefore,after:Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.includes('sst_save_')))}));
    assert.deepEqual(saved.after,saved.before,'each campaign save value is byte-for-byte unchanged; storage key enumeration order is irrelevant');
    await f.locator('#btnContinue').click();await page.waitForTimeout(250);assert.equal(await f.evaluate(()=>__gameQA.acidOn()),false);assert.equal(await f.evaluate(()=>__gameQA.Game.state),'prep');assert.equal(await f.evaluate(()=>__gameQA.Game.gold),777);
    assert.equal(await f.evaluate(()=>__gameQA.battlefield.defenseArt&&__gameQA.scene.getObjectByName('defense-armour').visible),true,'campaign artwork restored');
    assert.deepEqual(errors,[]);results.push({viewport:[width,height],mechanics,shield,status:'pass'});
   }finally{await context.close();}
  }
 }finally{await browser.close();fs.writeFileSync(path.join(out,'qa.json'),JSON.stringify(results,null,2));}
 console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
