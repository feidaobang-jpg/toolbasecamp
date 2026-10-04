const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-grenade-nocd-v0.17.11'),url=process.env.GAME_URL||'http://127.0.0.1:8898/html/game/starship-defense/index.html';
(async()=>{fs.mkdirSync(out,{recursive:true});const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});const results=[];try{for(const mobile of [false,true]){
 const ctx=await b.newContext({viewport:mobile?{width:915,height:412}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);let f=p;
 if(process.env.TOY_PREVIEW==='1'){await p.locator('iframe').first().waitFor();f=await (await p.locator('iframe').first().elementHandle()).contentFrame();await f.waitForSelector('#btnStart');}
 await f.goto(f.url()+(f.url().includes('?')?'&':'?')+'qa=1');await f.waitForFunction(()=>window.__gameQA);await f.locator('#btnStart').click();await f.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.CombatControls.set('fire','hold');q.player.invulnerable=999;q.player.pos.set(0,0,50);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.camState.init=false;for(const x of [-2,0,2]){const m=q.spawnMonster('mob',x,69,{ch:q.CHAPTERS[0]});m.hp=m.maxHp=500;m.operationStatic=true;}});
 assert.ok(await f.locator('#itemTxt').innerText().then(t=>t.includes('手雷∞')));
 // 无CD：短间隔内连续两次投掷都应起飞
 if(mobile)await f.locator('#vU').tap();else await p.keyboard.press('KeyU');await f.waitForTimeout(120);
 if(mobile)await f.locator('#vU').tap();else await p.keyboard.press('KeyU');await f.waitForTimeout(80);
 const rapid=await f.evaluate(()=>({inAir:__gameQA.bullets.filter(b=>b.grenade).length,hasCd:Object.hasOwn(__gameQA.player,'grenadeCd')}));assert.equal(rapid.hasCd,false);assert.equal(rapid.inAir,2);
 await f.waitForTimeout(2000);
 const landed=await f.evaluate(()=>({remaining:__gameQA.bullets.filter(b=>b.grenade).length,hp:__gameQA.monsters.map(m=>m.hp)}));assert.equal(landed.remaining,0);assert.ok(landed.hp.some(h=>h<500),'grenades damage clustered enemies');
 await f.waitForTimeout(600);
 // 无限弹药与存档重载不受影响
 const save=await f.evaluate(()=>{const q=__gameQA,old=q.saveData();old.items.grenade=0;q.applySave(old);let throws=0;for(let i=0;i<20;i++){if(q.throwGrenade())throws++;q.updBullets(2);}const saved=q.saveData();q.applySave(saved);const afterReload=q.throwGrenade();q.updBullets(2);return {throws,afterReload,hasFiniteSupply:Object.hasOwn(q.ITEMS,'grenade'),hasSavedAmmo:Object.hasOwn(saved.items,'grenade')};});assert.deepEqual(save,{throws:20,afterReload:true,hasFiniteSupply:false,hasSavedAmmo:false});
 // 暂停时输入不投掷；触屏按键独立
 await f.evaluate(()=>{__gameQA.closePanels();__gameQA.Game.testMode=false;__gameQA.clearEntities(false);});await f.locator(mobile?'#vP':'#menuButton').click();await p.keyboard.press('KeyU');await f.waitForTimeout(80);assert.equal(await f.evaluate(()=>__gameQA.bullets.some(b=>b.grenade)),false);await f.locator('#btnResume').click();
 await f.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.player.pos.set(0,q.groundY(0,240),240);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.camState.init=false;q.CombatControls.set('fire','hold');});if(mobile)await f.locator('#vU').tap();else await p.keyboard.press('KeyU');await f.waitForTimeout(80);assert.equal(await f.evaluate(()=>__gameQA.bullets.some(b=>b.grenade)),true);await f.waitForTimeout(2200);assert.equal(await f.evaluate(()=>__gameQA.bullets.filter(b=>b.grenade).length),0);assert.ok((await f.locator('#itemTxt').innerText()).includes('手雷∞'));
 await p.screenshot({path:path.join(out,mobile?'mobile-grenade.jpg':'cave-grenade.jpg')});if(mobile){const u=await f.locator('#vU').boundingBox();assert.ok(u.width>=44&&u.height>=44);}
 assert.deepEqual(errors,[]);results.push({mobile,rapid,save,errors});await ctx.close();
 }fs.writeFileSync(path.join(out,'nocd.json'),JSON.stringify({url,results},null,2));console.log(JSON.stringify(results));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
