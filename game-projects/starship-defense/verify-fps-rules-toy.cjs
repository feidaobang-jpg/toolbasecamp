// Toy 预览/公开页实测：在 B 站 Toy 外壳的游戏 iframe 里核对战地、抗战的枪战规则（电脑视口 + 手机视口）。
// 用法：PREVIEW_URL=https://www.bilibili.com/toy/preview/<id>/index.html node verify-fps-rules-toy.cjs
// 外壳把游戏放在 www.bilibilitoy.com 的 iframe 里，对 iframe 自身 goto 带 qa 参数的地址；手机视口截图后触摸进不了 iframe，截图放最后。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PW||'D:/project/godot/absurd-3d-daily/node_modules/playwright');
const url=process.env.PREVIEW_URL;if(!url)throw new Error('PREVIEW_URL required');
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'qa','out','fps-rules-toy');fs.mkdirSync(OUT,{recursive:true});
const MANIFEST=process.env.TOY_MANIFEST||path.join(__dirname,'../../dist/toy/chongchao-qianshao/manifest.json');
const MOBILE_UA='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const results=[],errors=[];const pass=(n,d)=>{results.push({name:n,detail:d});console.log('PASS',n,d===undefined?'':JSON.stringify(d));};
async function gameFrame(page){
  await page.goto(url,{waitUntil:'domcontentloaded'});
  let frame=null;for(let i=0;i<60&&!frame;i++){frame=page.frames().find(f=>/bilibilitoy\.com/.test(f.url()));if(!frame)await sleep(500);}
  if(!frame)throw new Error('game iframe not found');
  const u=new URL(frame.url());u.searchParams.set('qa','1');await frame.goto(u.href);
  await frame.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});return frame;
}
const state=f=>f.evaluate(()=>{const q=__gameQA,h=q.player;return {mode:q.getCamMode(),fps:q.fpsRules(),manual:q.manualHuman(),assist:q.aimAssistKind(),ammo:h.bfAmmo?.[q.Game.curWeapon],mag:q.WEAPONS[q.Game.curWeapon]?.mag,reload:!!h.bfReload,vC:document.getElementById('vC').classList.contains('hidden'),person:document.getElementById('personBtn').classList.contains('hidden')};});
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
  try{
    // 电脑视口
    const p=await b.newPage({viewport:{width:1280,height:720}});p.on('pageerror',e=>errors.push(e.message));
    let f=await gameFrame(p);
    if(fs.existsSync(MANIFEST)){
      const want=JSON.parse(fs.readFileSync(MANIFEST,'utf8')).files['game.compat.js'],got=await f.evaluate(async()=>{const src=[...document.scripts].map(s=>s.src).find(s=>/game\.compat\.js/.test(s));return [...new Uint8Array(await (await fetch(src,{cache:'no-store'})).arrayBuffer())];});
      const sha=crypto.createHash('sha256').update(Buffer.from(got)).digest('hex');assert.equal(sha,want);pass('页面运行的脚本与本次上传的包一致',{sha256:sha.slice(0,16)});
    }
    await f.click('#btnVersus');await f.click('[data-vs-ai="normal"]');await f.waitForFunction(()=>__gameQA.versus.active&&__gameQA.versus.state.time>.5);
    await f.evaluate(()=>{const q=__gameQA;q.player.invulnerable=1e6;q.versus.state.units.forEach(u=>{u.dead=true;u.mesh.visible=false;});q.vehicles.forEach(x=>{x.bfAIStart=Infinity;x.bfDriver=null;});});
    let s=await state(f);assert.equal(s.mode,'first');assert.ok(s.fps&&s.manual&&s.person);assert.equal(s.assist,null);
    await f.click('#c3d',{position:{x:640,y:300},button:'middle'});await p.keyboard.press('KeyC');await sleep(300);assert.equal((await state(f)).mode,'first');
    await sleep(1200);const idle=await state(f);assert.equal(idle.ammo,idle.mag);
    await p.keyboard.down('KeyJ');await sleep(600);await p.keyboard.up('KeyJ');const fired=await state(f);assert.ok(fired.ammo<fired.mag||fired.reload);
    pass('电脑视口战地：固定第一人称、C 不切视角、不按不开火、按住 J 开火',{idle:idle.ammo,fired:fired.ammo});
    await p.screenshot({path:path.join(OUT,'toy-desktop-battlefield.png')});
    f=await gameFrame(p);await f.click('#btnResistance');await f.click('[data-chapter="0"]');await sleep(600);
    const war=await f.evaluate(()=>({mode:__gameQA.getCamMode(),fps:__gameQA.fpsRules()}));await f.click('#c3d',{position:{x:640,y:300},button:'middle'});await p.keyboard.press('KeyC');await sleep(300);
    assert.equal(war.mode,'first');assert.ok(war.fps);assert.equal(await f.evaluate(()=>__gameQA.getCamMode()),'first');pass('电脑视口抗战：固定第一人称，C 不切视角',war);
    await p.screenshot({path:path.join(OUT,'toy-desktop-resistance.png')});await p.close();
    // 手机横屏视口
    const ctx=await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,userAgent:MOBILE_UA}),m=await ctx.newPage();m.on('pageerror',e=>errors.push('mobile: '+e.message));
    const g=await gameFrame(m);await g.evaluate(()=>__gameQA.setDeviceMode('touch'));
    await g.tap('#btnVersus');await g.tap('[data-vs-ai="normal"]');await g.waitForFunction(()=>__gameQA.versus.active&&__gameQA.versus.state.time>.5);
    await g.evaluate(()=>{const q=__gameQA;q.player.invulnerable=1e6;q.versus.state.units.forEach(u=>{u.dead=true;u.mesh.visible=false;});q.vehicles.forEach(x=>{x.bfAIStart=Infinity;x.bfDriver=null;});});
    await sleep(1200);const mi=await state(g);assert.equal(mi.mode,'first');assert.equal(mi.assist,'touch');assert.ok(mi.vC);assert.equal(mi.ammo,mi.mag);
    const fire=await g.locator('#vJ').boundingBox();assert.ok(fire&&fire.width>=40);
    const cdp=await ctx.newCDPSession(m),x=fire.x+fire.width/2,y=fire.y+fire.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    for(let i=1;i<=5;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-i*12,y,id:1}]});await sleep(40);}
    await sleep(400);const held=await g.evaluate(()=>({ammo:__gameQA.player.bfAmmo[__gameQA.Game.curWeapon],reload:!!__gameQA.player.bfReload,yaw:__gameQA.getCamYaw()}));
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok(held.ammo<mi.mag||held.reload);assert.ok(Math.min(held.yaw,Math.PI*2-held.yaw)>.15);
    pass('手机视口战地：固定第一人称、切换视角键收起、不按不开火；按住射击键拖动能开火并转视角',{idle:mi.ammo,held});
    await m.screenshot({path:path.join(OUT,'toy-mobile-battlefield.png')});
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({url,date:new Date().toISOString(),results,errors},null,1));
    console.log('ALL PASS',results.length);
  }finally{await b.close();}
})().catch(e=>{console.error('FAIL',e.message);console.error(errors);process.exit(1);});
