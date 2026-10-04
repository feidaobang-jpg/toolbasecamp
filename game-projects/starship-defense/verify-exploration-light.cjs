// Real browser controls + QA relocation, for local, deployed and Toy iframe builds.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-lighting-v0.16.0');
const url=process.env.GAME_URL||'http://127.0.0.1:8898/html/game/starship-defense/index.html';
async function relocate(f,x,z,first=false){await f.evaluate(({x,z,first})=>{const q=__gameQA;q.player.pos.set(x,q.groundY(x,z),z);q.player.mesh.position.copy(q.player.pos);q.camState.init=false;q.setCamMode(first?'first':'third',false);q.setCamYaw(0);},{x,z,first});await f.waitForTimeout(500);}
async function status(f){return f.evaluate(()=>{const q=__gameQA,e=q.battlefield,l=q.explorationLight;return {time:e.timeOfDay,blend:l.blend,torch:l.torch.intensity,fill:l.fill.intensity,direction:l.torch.target.position.clone().sub(l.torch.position).normalize().toArray(),sun:e.sun[0].intensity,hemi:e.hemi[0].intensity,stars:e.objects.stars.visible,rebuilds:e.rebuilds,programs:q.renderer.info.programs.length};});}
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});const results=[];try{
for(const mobile of [false,true]){
 const ctx=await browser.newContext({viewport:mobile?{width:915,height:412}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(url);let f=p;
 if(process.env.TOY_PREVIEW==='1'){await p.locator('iframe').first().waitFor();f=await (await p.locator('iframe').first().elementHandle()).contentFrame();await f.waitForSelector('#btnStart');}
 await f.goto(f.url()+(f.url().includes('?')?'&':'?')+'qa=1');await f.waitForFunction(()=>window.__ccReady&&window.__gameQA);
 assert.equal((await status(f)).time,'day');assert.equal((await status(f)).stars,false);
 if(mobile)await f.locator('#daylightMain').tap();else{await f.locator('#daylightMain').focus();await p.keyboard.press('Enter');}
 assert.equal((await status(f)).time,'night');assert.equal((await status(f)).stars,true);
 await f.goto(f.url());await f.waitForFunction(()=>window.__gameQA);assert.equal((await status(f)).time,'night');await f.locator('#daylightMain').click();
 await f.locator('#btnStart').click();await f.waitForFunction(()=>__gameQA.Game.state==='prep');
 await f.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.Game.testMode=true;q.sandboxWave.enabled=false;q.CombatControls.set('fire','hold');q.player.invulnerable=99999;});
 const r={mobile,chapters:[],caves:[],errors};
 for(const ch of [1,4,7]){await f.evaluate(ch=>__gameQA.battlefield.applyChapter(ch),ch);await relocate(f,0,65);for(const time of ['day','night']){await f.evaluate(time=>__gameQA.battlefield.setTimeOfDay(time),time);await f.waitForTimeout(150);r.chapters.push({ch,...await status(f)});if(!mobile)await p.screenshot({path:path.join(out,`chapter-${ch}-${time}.jpg`)});}}
 await f.evaluate(()=>__gameQA.battlefield.applyChapter(1));
 for(const [x,z] of [[-68,205],[68,205],[0,205],[0,250],[0,302]]){await relocate(f,x,z);await f.waitForTimeout(400);const s=await status(f);assert.ok(s.torch>4);assert.ok(s.hemi>=.47);r.caves.push({x,z,...s});}
 const atNight=await status(f);await f.evaluate(()=>__gameQA.battlefield.setTimeOfDay('day'));await f.waitForTimeout(100);const atDay=await status(f);assert.ok(Math.abs(atNight.sun-atDay.sun)<.01);assert.ok(Math.abs(atNight.hemi-atDay.hemi)<.01);
 await relocate(f,0,240);await p.screenshot({path:path.join(out,mobile?'mobile-cave.jpg':'cave-third.jpg')});await relocate(f,0,240,true);await p.screenshot({path:path.join(out,mobile?'mobile-first.jpg':'cave-first.jpg')});
 await f.evaluate(()=>__gameQA.Input.keys.Q=true);await f.waitForTimeout(900);await f.evaluate(()=>__gameQA.Input.reset());const turned=await status(f);assert.ok(Math.abs(turned.direction[0])>.5);r.turned=turned;
 await f.locator(mobile?'#vP':'#menuButton').click();const rebuilds=(await status(f)).rebuilds;await f.locator('#daylightPause').click();assert.equal((await status(f)).time,'night');assert.equal((await status(f)).rebuilds,rebuilds);await p.screenshot({path:path.join(out,mobile?'mobile-menu.jpg':'pause-menu.jpg')});await f.locator('#btnResume').click();
 await relocate(f,0,170);await f.waitForTimeout(700);assert.equal((await status(f)).torch,0);assert.equal((await status(f)).fill,0);
 // A real entrance crossing, then return: no manual torch control required.
 await relocate(f,0,181);await p.keyboard.down('ShiftLeft');await p.keyboard.down('KeyW');await f.waitForTimeout(1400);await p.keyboard.up('KeyW');await p.keyboard.up('ShiftLeft');assert.ok((await status(f)).torch>3.5);
 // Repeat switching reuses scene assets and stable light shader variants.
 const before=await status(f);for(let i=0;i<12;i++){await f.evaluate(()=>{const e=__gameQA.battlefield;e.setTimeOfDay(e.timeOfDay==='day'?'night':'day');});}const after=await status(f);assert.equal(after.rebuilds,before.rebuilds);assert.equal(after.programs,before.programs);
 if(mobile){await p.setViewportSize({width:412,height:915});await f.waitForTimeout(300);await p.screenshot({path:path.join(out,'mobile-portrait.jpg')});}
 // Performance independent of video encoding; 48 insects, four squadmates.
 await f.evaluate(()=>{const q=__gameQA;q.clearEntities(false);q.player.pos.set(0,q.groundY(0,240),240);q.camState.init=false;q.setCamMode('third',false);for(let i=0;i<48;i++){const m=q.spawnMonster('mob',(i%8-4)*1.5,245+Math.floor(i/8)*5,{ch:q.CHAPTERS[i%10]});m.hp=m.maxHp=99999;}for(let i=0;i<4;i++)q.spawnSquad(i);});await f.waitForTimeout(1200);await f.evaluate(()=>{__gameQA.startMeasure();__gameQA.Input.keys={up:true,Q:true};});await f.waitForTimeout(6000);r.performance=await f.evaluate(()=>{__gameQA.Input.reset();return __gameQA.endMeasure();});delete r.performance.raw;r.performance.device=mobile?'desktop GPU mobile viewport emulation':'desktop Edge headless';assert.ok(r.performance.averageFPS>(mobile?30:50));assert.deepEqual(errors,[]);results.push(r);await ctx.close();
}
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({url,results},null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
