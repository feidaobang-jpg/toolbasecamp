// Toy 预览实测：在 B 站 Toy 预览外壳的游戏 iframe 里跑虫潮对战（电脑视口 + 手机视口模拟）。
// 用法：PREVIEW_URL=https://www.bilibili.com/toy/preview/<id>/index.html node verify-versus-toy.cjs
// 外壳把游戏放在 www.bilibilitoy.com 的 iframe 里；直接打开 iframe 地址会跳回外壳，所以对 iframe 自身 goto 带 qa 参数的地址。
// 手机视口里截图后触摸会进不了跨域 iframe，截图放最后。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=process.env.PW||['D:/project/godot/absurd-3d-daily/node_modules/playwright','C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].find(p=>fs.existsSync(p));
const {chromium}=require(pw);
const url=process.env.PREVIEW_URL;if(!url)throw new Error('PREVIEW_URL required');
const teamSize=Number(process.env.VERSUS_SIZE||1);assert.ok([1,2,3,4].includes(teamSize));
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'qa','out','versus-toy');fs.mkdirSync(OUT,{recursive:true});
const MOBILE_UA='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const results=[];const pass=(n,d)=>{results.push({name:n,detail:d});console.log('PASS',n,d===undefined?'':JSON.stringify(d));};
async function gameFrame(page){
  await page.goto(url,{waitUntil:'domcontentloaded'});
  let frame=null;for(let i=0;i<60&&!frame;i++){frame=page.frames().find(f=>/bilibilitoy\.com/.test(f.url()));if(!frame)await sleep(500);}
  if(!frame)throw new Error('game iframe not found');
  const u=new URL(frame.url());u.searchParams.set('qa','1');await frame.goto(u.href);
  await frame.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});return frame;
}
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  try{
    const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
    const f=await gameFrame(p);f.page().on('pageerror',e=>errors.push(e.message));
    await f.click('#btnVersus');assert.ok(await f.isVisible('#vsMenu'));
    await f.click('[data-vs-size="'+teamSize+'"]');
    await f.click('[data-vs-ai="normal"]');await f.waitForFunction(()=>__gameQA.versus.state.active);
    assert.equal(await f.evaluate(()=>__gameQA.versus.state.seats.length),teamSize*2);pass('Toy 电脑：所选规模与座位数一致',{teamSize,seats:teamSize*2});
    await f.evaluate(()=>{const v=__gameQA.versus;v.state.time=21;v.seat('blue0').gold=2000;});
    await f.locator('#stage').click({position:{x:400,y:400}});
    await p.keyboard.press('KeyR');await sleep(300);await p.keyboard.press('Digit1');await sleep(500);
    const st=await f.evaluate(()=>({blue:__gameQA.versus.state.units.filter(u=>u.team==='blue').length,panel:!document.getElementById('vsPanel').classList.contains('hidden'),arena:!__gameQA.groundMesh.visible}));
    assert.ok(st.blue>=6);assert.ok(st.panel);pass('Toy 预览·电脑：进入对战、R 面板、派出小虫',st);
    await sleep(4000);
    const run=await f.evaluate(()=>({time:Math.round(__gameQA.versus.state.time),redBuild:__gameQA.buildings.filter(b=>b.team==='red').length}));
    assert.ok(run.time>21);pass('Toy 预览·电脑：对局实时推进、电脑在运营',run);
    if(teamSize>1){
      await f.evaluate(()=>{__gameQA.versus.seat('blue0').gold=2000;});
      const before=await f.evaluate(()=>__gameQA.versus.seat('blue1').gold);
      await p.keyboard.press('KeyT');await sleep(200);await p.keyboard.press('Digit1');await sleep(200);
      const after=await f.evaluate(()=>__gameQA.versus.seat('blue1').gold);
      assert.ok(after>=before+200);pass('Toy 电脑：T 队伍页转账实际到账',{before,after});
    }
    await p.screenshot({path:path.join(OUT,'toy-desktop.png')});
    assert.deepEqual(errors,[]);pass('Toy 预览·电脑无脚本报错');await p.close();
    const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:MOBILE_UA,deviceScaleFactor:2});
    const m=await ctx.newPage(),merr=[];m.on('pageerror',e=>merr.push(e.message));
    const mf=await gameFrame(m);mf.page().on('pageerror',e=>merr.push(e.message));
    await mf.tap('#btnVersus');await mf.tap('[data-vs-size="'+teamSize+'"]');await mf.tap('[data-vs-ai="easy"]');await mf.waitForFunction(()=>__gameQA.versus.state.active);await sleep(500);
    assert.equal(await mf.evaluate(()=>__gameQA.versus.state.seats.length),teamSize*2);pass('Toy 手机：所选规模与座位数一致',{teamSize,seats:teamSize*2});
    await mf.tap('#vR');await sleep(400);
    const mm=await mf.evaluate(()=>({touch:__gameQA.isTouch,panel:!document.getElementById('vsPanel').classList.contains('hidden'),cards:document.querySelectorAll('#vsGrid .vs-card').length}));
    assert.ok(mm.panel);pass('Toy 预览·手机竖屏视口：点「出兵」打开面板',mm);
    await mf.tap('#vsGrid .vs-card >> nth=0');await sleep(400);
    const bank=await mf.evaluate(()=>__gameQA.versus.seat('blue0').bank);assert.equal(bank,2);pass('Toy 预览·手机：点卡片升级银行');
    if(teamSize>1){
      await mf.evaluate(()=>{__gameQA.versus.seat('blue0').gold=2000;});
      const before=await mf.evaluate(()=>__gameQA.versus.seat('blue1').gold);
      await mf.tap('#vsTeamTab');await mf.tap('#vsGrid .vs-card >> nth=0');await sleep(200);
      const after=await mf.evaluate(()=>__gameQA.versus.seat('blue1').gold);
      assert.ok(after>=before+200);pass('Toy 手机：点队伍卡片转账实际到账',{before,after});
    }
    await m.screenshot({path:path.join(OUT,'toy-mobile.png')});
    assert.deepEqual(merr,[]);pass('Toy 预览·手机无脚本报错');await ctx.close();
  }finally{await b.close();}
  fs.writeFileSync(path.join(OUT,'verify-versus-toy.json'),JSON.stringify({url,at:new Date().toISOString(),results},null,1));console.log('ALL PASS',results.length);
})().catch(e=>{console.error('FAIL',e);fs.writeFileSync(path.join(OUT,'verify-versus-toy.json'),JSON.stringify({url,at:new Date().toISOString(),results,failure:String(e.stack||e)},null,1));process.exit(1);});
