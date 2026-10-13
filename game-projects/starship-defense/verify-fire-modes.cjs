// Actual input on the bundled game; deterministic enemy fixture, no mocked SDK.
const {chromium}=require(process.env.PW||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const url=process.env.FIRE_URL||'http://127.0.0.1:8768/html/game/starship-defense/index.html',out=process.env.FIRE_OUT||path.join(require('node:os').tmpdir(),'starship-fire-qa');
const sizes=process.env.FIRE_SIZES?JSON.parse(process.env.FIRE_SIZES):[[1280,580],[844,346],[390,720]];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--mute-audio']});const results=[];
 try{for(const [width,height] of sizes){
  const touch=width<1000,name=width+'x'+height,ctx=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,recordVideo:{dir:out,size:{width:960,height:540}}});
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  try{
   const response=await page.goto(url+(url.includes('?')?'&':'?')+'qa=1');assert(!(await response.text()).includes('__TOY_LOGIN_GATE__'));
   let f=page.mainFrame();
   if(url.includes('bilibili.com/toy/')){await page.locator('iframe').first().waitFor();f=await(await page.locator('iframe').first().elementHandle()).contentFrame();await f.goto(f.url()+(f.url().includes('?')?'&':'?')+'qa=1');}
   await f.waitForFunction(()=>window.__gameQA&&window.__ccReady);const version=await f.locator('#gameVersion').textContent();if(process.env.FIRE_VERSION)assert.equal(version,'v'+process.env.FIRE_VERSION);assert.equal(await f.evaluate(()=>__gameQA.CombatControls.settings.fire),'auto');
   await f.locator('#btnStart').click();
   await f.evaluate(()=>{const q=__gameQA;q.Input.releaseMouseLook();q.clearEntities(true);q.Game.testMode=true;q.Game.state='prep';q.sandboxWave.enabled=false;q.player.pos.set(0,q.groundY(0,90),90);q.player.mesh.position.copy(q.player.pos);q.player.dead=false;q.player.invulnerable=999;q.setCameraView(0,false);q.setCamYaw(0);q.Input.reset();});
   const fixture=()=>f.evaluate(()=>{const q=__gameQA;q.clearEntities(true);q.player.fireCd=0;const m=q.spawnMonster('mob',0,101,{quiet:true});m.emerge=0;m.hp=m.maxHp=100000;m.speed=0;m.mesh.position.set(0,q.groundY(0,101),101);window.__fireEnemy=m;});
   const hp=()=>f.evaluate(()=>window.__fireEnemy.hp);
   const firing=()=>f.evaluate(()=>({yes:__gameQA.Input.firing(true),no:__gameQA.Input.firing(false),intent:__gameQA.CombatControls.fireIntent,packet:__gameQA.starshipInput()}));
   const cdp=await ctx.newCDPSession(page);
   async function down(){if(!touch){await page.keyboard.down('KeyJ');return;}const b=await f.locator('#vJ').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});}
   async function up(cancel=false){if(!touch){await page.keyboard.up('KeyJ');return;}await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});}
   async function tap(){await down();await up();}
   async function choose(value,aim){
    await page.keyboard.press('Escape');await f.locator('#menuPause').waitFor({state:'visible'});
    await f.locator('#menuPause [data-menu-panel="menuSettingsPanel"]').click();await f.locator('#keysMenu').click();
    assert(await f.locator('#combat-fire').isVisible());assert.equal(await f.locator('#combat-input').isVisible(),!touch);
    await f.locator('#combat-fire').selectOption(value);if(aim)await f.locator('#combat-aim').selectOption(aim);
    await f.locator('#keysClose').click();await f.locator('#btnResume').click();
   }
   let s=await firing();assert.equal(s.yes,true);assert.equal(s.no,false);assert.equal(s.packet.fire,false);assert.equal(s.packet.autoFire,true);
   await fixture();await f.waitForFunction(()=>__fireEnemy.hp<100000,null,{timeout:8000});const autoDamage=100000-await hp();
   await choose('hold');await fixture();await page.waitForTimeout(450);assert.equal(await hp(),100000);await down();assert.equal((await firing()).yes,true);await f.waitForFunction(()=>__fireEnemy.hp<100000,null,{timeout:8000});await up();assert(await hp()<100000,'held input must shoot');assert.equal((await firing()).yes,false);
   await choose('toggle');await fixture();await tap();assert.equal((await firing()).yes,true);await f.waitForFunction(()=>__fireEnemy.hp<100000,null,{timeout:8000});assert(await hp()<100000,'tap must keep firing after release');if(touch)assert.equal(await f.locator('#vJ').getAttribute('aria-pressed'),'true');
   await tap();assert.equal((await firing()).yes,false);
   await tap();await page.keyboard.press('Escape');assert.equal((await firing()).yes,false);assert.equal((await firing()).packet.autoFire,false);await f.locator('#btnResume').click();assert.equal((await firing()).yes,false,'pause clears toggle');
   if(touch){await down();await up(true);assert.equal((await firing()).yes,false,'cancel clears toggle');}
   await tap();assert.equal((await firing()).yes,true);
   const switched=await f.evaluate(()=>{const q=__gameQA,old=q.isTouch,p=q.player.pos.toArray(),gold=q.Game.gold;q.setDeviceMode(old?'desktop':'touch');const a=q.Input.firing(true);q.setDeviceMode(old?'touch':'desktop');return {a,b:q.Input.firing(true),same:JSON.stringify(p)===JSON.stringify(q.player.pos.toArray())&&gold===q.Game.gold,fire:q.CombatControls.settings.fire};});assert.deepEqual(switched,{a:false,b:false,same:true,fire:'toggle'});
   await tap();await f.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal((await firing()).yes,false);await f.locator('#btnResume').click();
   await choose('auto','manual');assert(await f.evaluate(()=>{const q=__gameQA,from=q.player.pos.clone();from.y+=1.35;return q.playerAim(from,40).mo===null;}),'touch respects manual aim');await choose('auto','auto');
   const network=await f.evaluate(()=>{const q=__gameQA,p=q.starshipInput();q.Input.network=p;const r={without:q.Input.firing(false),with:q.Input.firing(true)};q.Input.network=null;return r;});assert.deepEqual(network,{without:false,with:true});
   await f.evaluate(()=>__gameQA.startPlacement('wall'));assert.equal((await firing()).yes,false);assert.equal((await firing()).packet.autoFire,false);await f.evaluate(()=>__gameQA.cancelPlacement());
   await page.keyboard.press('Escape');await f.locator('#menuPause [data-menu-panel="menuSettingsPanel"]').click();await f.locator('#keysMenu').click();
   await f.locator('#combat-fire').selectOption('hold');await f.locator('#combat-fire').scrollIntoViewIfNeeded();await f.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:path.join(out,name+'-settings.png')});
   await f.goto(f.url());await f.waitForFunction(()=>window.__gameQA&&window.__ccReady);assert.equal(await f.evaluate(()=>__gameQA.CombatControls.settings.fire),'hold');
   assert.deepEqual(errors,[]);assert.deepEqual((await ctx.cookies()).filter(c=>['SESSDATA','DedeUserID','bili_jct'].includes(c.name)),[]);
   results.push({viewport:[width,height],version,passed:true,authenticated:false,autoDamage,network,checks:['automatic damage','hold and release','toggle and feedback','pause/blur/cancel reset','device switches preserve run','manual aim','network target gating','build blocks fire','settings persistence'],limitations:['deterministic enemy fixture','browser touch simulation; physical phone not tested']});console.log(JSON.stringify(results.at(-1)));
  }catch(e){await page.screenshot({path:path.join(out,name+'-failure.png')}).catch(()=>{});throw e;}
  finally{await ctx.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({url,results},null,2));}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
