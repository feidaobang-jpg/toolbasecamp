// Real browser regression for first-drop compatibility and self-contained Toy builds.
// node powerup-check.cjs <output-dir> [url]
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.argv[2],url=process.argv[3]||'http://127.0.0.1:8765/public/html/game/tank-3d/index.html';
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  const results=[];
  try {
    for(const mobile of [false,true]) {
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,locale:'zh-CN'});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
      await page.addInitScript(()=>{
        // Reproduce older embedded browser Canvas capability, without emulating its GPU.
        CanvasRenderingContext2D.prototype.roundRect=undefined;
        let now=1000;const queue=[];
        performance.now=()=>now;
        requestAnimationFrame=cb=>{queue.push(cb);return queue.length;};
        window.advance=n=>{for(let i=0;i<n;i++){now+=1000/60;const callbacks=queue.splice(0);for(const cb of callbacks)cb(now);}};
      });
      await page.goto(url+(url.includes('?')?'&':'?')+'qa=1');
      await page.waitForFunction(()=>window.tankQa,null,{polling:100});
      await page.click('#lang');assert.equal(await page.locator('html').getAttribute('lang'),'en');
      assert.ok(!(await page.locator('#start').textContent()).includes('tank3d.'));
      await page.click('#lang');assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
      await page.keyboard.press('Enter');await page.evaluate(()=>advance(220));
      const checks=await page.evaluate(()=>{
        const {world:w,W}=tankQa,run=n=>advance(n),checks=[];
        w.enemies=[];w.spawning=[];w.rosterIndex=w.roster.length;w.bullets=[];
        for(const type of W.POWERUPS) {
          // Use the actual drop/event/render path; inspect it for a frame before pickup.
          W.spawnPowerup(w,type);w.powerup.x=20;w.powerup.z=20;
          const time=w.time;run(3);if(w.time<=time)throw Error('Frame stopped on '+type);
          w.player.x=20;w.player.z=20;const count=w.pickups;run(2);
          if(w.pickups!==count+1||w.powerup)throw Error('Pickup failed '+type);
          w.player.x=8;w.player.z=25;checks.push(type);
        }
        W.spawnPowerup(w,'star');w.powerup.x=20;w.powerup.z=20;run(1100);
        if(w.powerup||w.freeze>0||w.shovel>0)throw Error('Timers failed');
        for(let i=0;i<5;i++){W.qa.killPlayer(w);run(130);if(!w.player||w.player.shield<=0)throw Error('Respawn failed');}
        run(210);if(w.player.shield>0)throw Error('Protection never expires');
        W.qa.destroyBase(w);run(200);if(w.status!=='lost')throw Error('Base loss failed');
        return checks;
      });
      await page.keyboard.press('Enter');await page.evaluate(()=>advance(230));
      await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>tankQa.paused),true);
      await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>tankQa.paused),false);
      await page.keyboard.press('KeyC');await page.evaluate(()=>advance(5));
      await page.screenshot({path:path.join(out,mobile?'phone-portrait.png':'desktop.png')});
      await page.evaluate(()=>{tankQa.jump(50);tankQa.start();advance(230);tankQa.clear();advance(30);});
      assert.equal(await page.evaluate(()=>tankQa.loop),2);assert.equal(await page.evaluate(()=>tankQa.stage),1);
      assert.deepEqual(errors,[]);
      results.push({mobile,checks,expiry:true,respawns:5,baseLoss:true,pause:true,camera:true,language:true,stage50Loop:true,errors});
      await context.close();
    }
    fs.writeFileSync(path.join(out,'regression.json'),JSON.stringify({url,browser:browser.version(),missingRoundRect:true,results},null,2));
    console.log(JSON.stringify(results));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
