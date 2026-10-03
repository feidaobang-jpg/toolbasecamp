// Browser integration checks. GAME_URL can target the deployed site as well.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const url=process.env.GAME_URL||'http://127.0.0.1:8877/html/game/starship-defense/index.html';
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__gameQA&&__gameQA.CombatControls);
    assert.deepEqual(await page.evaluate(()=>__gameQA.CombatControls.settings),{input:'mouse',aim:'auto',fire:'auto'});
    // Setup only: input and the game loop stay real for each behavioral assertion.
    const setup=()=>page.evaluate(()=>{
      const q=__gameQA;q.newGame(true);q.clearEntities(false);q.Game.state='prep';q.sandboxWave.enabled=false;
      q.setCamMode('third',false);q.setCamYaw(0);q.player.pos.set(0,q.groundY(0,25),25);q.player.mesh.position.copy(q.player.pos);q.player.yaw=0;q.player.fireCd=0;
      q.CombatControls.set('fire','auto');q.CombatControls.set('aim','auto');q.CombatControls.set('input','mouse');q.Input.reset();
    });
    const spawn=()=>page.evaluate(()=>{
      const q=__gameQA;q.spawnMonster('mob',0,17,{ch:0});const m=q.monsters[q.monsters.length-1];m.emerge=0;m.hp=m.maxHp=10000;m.speed=0;return m.hp;
    });
    await setup();await spawn();
    await page.waitForFunction(()=>__gameQA.monsters.some(m=>m.hp<10000));
    console.log('PASS automatic fire reaches a target behind the retreating player');
    await page.evaluate(()=>{__gameQA.player.yaw=Math.PI;__gameQA.player.fireCd=3;});
    await page.keyboard.down('KeyA');await page.waitForTimeout(200);await page.keyboard.up('KeyA');
    assert.ok(Math.abs(await page.evaluate(()=>__gameQA.player.yaw)-Math.PI)<.01);
    console.log('PASS strafing preserves attack facing between automatic shots');
    await setup();await page.waitForTimeout(350);assert.equal(await page.evaluate(()=>__gameQA.bullets.length),0);
    console.log('PASS automatic fire stays idle without a target');
    await page.evaluate(()=>__gameQA.CombatControls.set('fire','hold'));await spawn();await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>__gameQA.monsters[0].hp),10000);
    await page.keyboard.down('KeyJ');await page.waitForFunction(()=>__gameQA.monsters.some(m=>m.hp<10000));await page.keyboard.up('KeyJ');
    assert.equal(await page.evaluate(()=>__gameQA.Input.firing(false)),false);
    console.log('PASS hold mode only fires while held');
    await page.evaluate(()=>__gameQA.CombatControls.set('fire','toggle'));await page.keyboard.press('KeyJ');
    assert.equal(await page.evaluate(()=>__gameQA.Input.firing(false)),true);
    await page.keyboard.press('KeyJ');assert.equal(await page.evaluate(()=>__gameQA.Input.firing(false)),false);
    await page.keyboard.press('KeyJ');await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>__gameQA.Input.firing(false)),false);
    console.log('PASS toggle edges and pause reset');
    await page.keyboard.press('Escape');
    // Mouse capture can be denied in embedded browsers; firing must still work.
    await page.evaluate(()=>{const q=__gameQA;q.CombatControls.set('input','mouse');q.CombatControls.set('fire','hold');document.getElementById('c3d').requestPointerLock=()=>Promise.reject(Error('test denied'));});
    await page.mouse.move(640,360);await page.mouse.down();
    assert.equal(await page.evaluate(()=>__gameQA.Input.firing(false)),true);
    await page.mouse.up();assert.equal(await page.evaluate(()=>__gameQA.Input.firing(false)),false);
    await page.mouse.click(640,360,{button:'right'});
    await page.waitForFunction(()=>__gameQA.bullets.some(b=>b.arc));
    console.log('PASS left mouse fire without pointer lock and right mouse grenade');
    await page.evaluate(()=>{const q=__gameQA;q.CombatControls.set('fire','toggle');});
    await page.keyboard.press('KeyJ');await page.keyboard.press('KeyO');
    await page.locator('#shopPanel').waitFor({state:'visible'});
    assert.equal(await page.evaluate(()=>__gameQA.CombatControls.firing()),false);
    await page.keyboard.press('Escape');if(await page.evaluate(()=>__gameQA.Game.state==='paused'))await page.keyboard.press('Escape');
    console.log('PASS opening a shop clears latched fire');
    await page.evaluate(()=>{__gameQA.CombatControls.set('aim','manual');__gameQA.CombatControls.set('input','keyboard');});
    const aim=await page.evaluate(()=>{const q=__gameQA,a=q.playerAim(q.player.pos.clone(),50,null);return {target:a.mo===null,z:a.dir.z};});
    assert.equal(aim.target,true);assert.ok(aim.z>.99);
    await page.locator('#c3d').click({position:{x:480,y:250}});
    assert.equal(await page.evaluate(()=>document.pointerLockElement===null),true);
    console.log('PASS manual aim ignores off-axis enemies; keyboard mode never captures mouse');
    await page.reload();await page.waitForFunction(()=>window.__gameQA&&__gameQA.CombatControls);
    assert.deepEqual(await page.evaluate(()=>__gameQA.CombatControls.settings),{input:'keyboard',aim:'manual',fire:'toggle'});
    console.log('PASS settings persist across reload');
    await page.locator('#keysMenu').click();await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'combat-input');
    await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#combat-input').inputValue(),'mouse');
    await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'combat-aim');
    await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#combat-aim').inputValue(),'auto');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#keyPanel').isVisible(),false);
    console.log('PASS keyboard settings navigation and Esc return');
    const touch=await browser.newContext({viewport:{width:960,height:540},hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'});
    const phone=await touch.newPage();await phone.goto(url+'?qa=1');await phone.waitForFunction(()=>window.__gameQA);
    await phone.locator('#btnStart').tap();
    assert.equal(await phone.evaluate(()=>__gameQA.isTouch&&!__gameQA.Input.firing(true)),true);
    const fireButton=await phone.locator('#vJ').boundingBox(),cdp=await touch.newCDPSession(phone);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:fireButton.x+fireButton.width/2,y:fireButton.y+fireButton.height/2}]});
    assert.equal(await phone.evaluate(()=>__gameQA.Input.firing(false)),true);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await phone.evaluate(()=>__gameQA.Input.firing(true)),false);
    await touch.close();console.log('PASS touch retains hold-to-fire without PC automatic attacks');
    assert.deepEqual(errors,[]);console.log('PASS no browser script errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
