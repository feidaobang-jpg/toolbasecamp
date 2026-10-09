// Regression for versus shop/build scrolling, including the rotated portrait stage.
// Actual Chromium touch gestures and taps; viewport simulation, not a physical phone.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=process.env.PW||'D:/project/godot/absurd-3d-daily/node_modules/playwright';
const {chromium}=require(pw);
const url=process.env.GAME_URL||'http://127.0.0.1:8798/html/game/starship-defense/index.html';
const teamSize=Number(process.env.VERSUS_SIZE||1);
const out=process.env.QA_OUTPUT||path.join(__dirname,'qa/out/versus-panel-scroll');
fs.mkdirSync(out,{recursive:true});
const results=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ua='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
async function gameFrame(p){
  await p.goto(url,{waitUntil:'domcontentloaded'});
  let f=p;
  if(/bilibili\.com/.test(url)){
    for(let n=0;n<60;n++){f=p.frames().find(x=>/bilibilitoy\.com/.test(x.url()));if(f)break;await sleep(500);}
    assert.ok(f,'Toy iframe found');const u=new URL(f.url());u.searchParams.set('qa','1');await f.goto(u.href);
  }else{const u=new URL(url);u.searchParams.set('qa','1');await p.goto(u.href);}
  await f.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});return f;
}
async function swipe(p,f){
  // Rectangles are in physical viewport coordinates, including the stage rotation.
  const points=await f.evaluate(()=>{
    const g=document.getElementById('vsGrid'),r=g.getBoundingClientRect();
    const rotated=getComputedStyle(document.getElementById('stage')).transform.match(/^matrix\(0,/);
    const point=y=>rotated?{x:r.right-r.width*y,y:r.top+r.height*.4}:{x:r.left+r.width*.4,y:r.top+r.height*y};
    return {a:point(.82),b:point(.18)};
  });
  // Toy frame can be offset by the platform header.
  if(f!==p){const el=await f.frameElement(),r=await el.boundingBox();points.a.x+=r.x;points.b.x+=r.x;points.a.y+=r.y;points.b.y+=r.y;}
  const cdp=await p.context().newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points.a,id:1}]});
  for(let i=1;i<=12;i++){const t=i/12;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:points.a.x+(points.b.x-points.a.x)*t,y:points.a.y+(points.b.y-points.a.y)*t,id:1}]});await sleep(30);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await sleep(350);
}
async function metrics(f){return f.evaluate(()=>{
  const g=document.getElementById('vsGrid'),p=document.getElementById('vsPanel'),s=document.getElementById('stage'),r=p.getBoundingClientRect();
  return {top:g.scrollTop,height:g.clientHeight,total:g.scrollHeight,panelHeight:p.offsetHeight,stageHeight:s.offsetHeight,topOffset:p.offsetTop,
    within:r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,
    action:getComputedStyle(g.querySelector('button b')).touchAction,last:g.lastElementChild.querySelector('b').textContent,
    clipped:[...g.children].filter(b=>b.scrollHeight>b.clientHeight+1).map(b=>b.querySelector('b').textContent)};
});}
(async()=>{
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--mute-audio']});
 try{
  for(const [width,height] of JSON.parse(process.env.QA_VIEWPORTS||'[[1280,720],[844,390],[844,346],[390,844],[346,844],[320,568],[844,260]]')){
   const mobile=width!==1280,ctx=await b.newContext({viewport:{width,height},hasTouch:mobile,isMobile:mobile,userAgent:mobile?ua:undefined,
     recordVideo:width===390&&height===844?{dir:path.join(out,'video'),size:{width,height}}:undefined});
   const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));const f=await gameFrame(p);
   await f.locator('#btnVersus')[mobile?'tap':'click']();await f.locator('[data-vs-size="'+teamSize+'"]')[mobile?'tap':'click']();await f.locator('[data-vs-ai="easy"]')[mobile?'tap':'click']();
   await f.waitForFunction(()=>__gameQA.versus.state.active);
   // Test-funded seat in preparation, so wave units do not block the placement check.
   await f.evaluate(()=>{__gameQA.versus.seat('blue0').gold=20000;__gameQA.versus.state.time=0;});
   const tabs=[];
   for(const tab of ['units','build','weapons']){
    if(tab==='units'){await f.locator(mobile?'#vR':'#stage').click();if(!mobile)await p.keyboard.press('KeyR');}
    else await f.locator('[data-vstab="'+tab+'"]')[mobile?'tap':'click']();
    await f.waitForFunction(tab=>!document.getElementById('vsPanel').classList.contains('hidden')&&document.getElementById('vsGrid').dataset.sig.startsWith(tab+':'),tab);await sleep(150);
    let m=await metrics(f);assert.ok(m.within,'panel stays inside viewport');assert.ok(m.height>=44,'usable item area');
    assert.deepEqual(m.clipped,[],'item descriptions and purchase states are not clipped');
    assert.equal(m.action,'pan-x pan-y','card descendants allow both transformed axes');
    if(m.total>m.height+2){
      if(mobile){await swipe(p,f);assert.ok((await metrics(f)).top>m.top+5,'real swipe scrolls '+tab);}
      else{const r=await f.locator('#vsGrid').boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.wheel(0,200);await sleep(150);assert.ok((await metrics(f)).top>0);}
      // Live economy updates must not reset the scroll or replace the touched card.
      const before=await f.evaluate(()=>{window.__scrollCard=document.getElementById('vsGrid').lastElementChild;return document.getElementById('vsGrid').scrollTop;});
      await sleep(650);assert.ok(await f.evaluate(()=>window.__scrollCard===document.getElementById('vsGrid').lastElementChild));
      assert.ok((await metrics(f)).top>=before-1);
    }
    for(let n=0;n<12;n++)await f.locator('[data-vspage="1"]')[mobile?'tap':'click']();
    m=await metrics(f);assert.ok(m.top+m.height>=m.total-2,'paging reaches last item');
    const visible=await f.evaluate(()=>{const g=document.getElementById('vsGrid'),a=g.getBoundingClientRect(),r=g.lastElementChild.getBoundingClientRect();return r.left>=a.left-1&&r.top>=a.top-1&&r.right<=a.right+1&&r.bottom<=a.bottom+1;});
    assert.ok(visible,'last card fully visible: '+JSON.stringify(m));
    if(tab==='build'){
      await p.screenshot({path:path.join(out,width+'x'+height+'-build.png')});
      await f.locator('#vsGrid .vs-card').nth(4)[mobile?'tap':'click']();
      assert.ok((await f.textContent('#placeName')).includes('特斯拉'));await sleep(250);await f.locator('#placeOk')[mobile?'tap':'click']();await sleep(100);
      assert.ok(await f.evaluate(()=>__gameQA.buildings.some(x=>x.kind==='teslaTurret'&&x.team==='blue')),'lower building can be placed: '+await f.textContent('#placeState'));
      // Placement stays active after a build; cancel before reopening the commander.
      await f.locator('#placeCancel')[mobile?'tap':'click']();await f.locator(mobile?'#vR':'#stage').click();if(!mobile)await p.keyboard.press('KeyR');
    }
    if(tab==='weapons'){
      const before=await f.evaluate(()=>__gameQA.versus.seat('blue0').gold);
      await f.locator('#vsGrid .vs-card').last()[mobile?'tap':'click']();
      assert.equal(await f.evaluate(()=>__gameQA.Game.curWeapon),'missilePod');
      assert.ok(await f.evaluate(()=>__gameQA.Game.weapons.includes('missilePod')));
      const paid=before-(await f.evaluate(()=>__gameQA.versus.seat('blue0').gold));assert.ok(paid>=2040&&paid<=2100,'purchase deducts 2100, allowing one 60-gold income tick');
      await f.locator('#vsGrid .vs-card').nth(5)[mobile?'tap':'click']();assert.equal(await f.evaluate(()=>__gameQA.Game.curWeapon),'plasma');
      await p.screenshot({path:path.join(out,width+'x'+height+'-weapons.png')});
    }
    tabs.push({tab,...m});
   }
   await f.locator('#vsClose')[mobile?'tap':'click']();assert.ok(await f.locator('#vsPanel').evaluate(el=>el.classList.contains('hidden')));
   assert.deepEqual(errors,[]);results.push({width,height,tabs,ok:true});console.log('PASS',width+'x'+height,'swipe/paging/lower building/plasma purchase/close');await ctx.close();
  }
 }finally{await b.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({url,at:new Date().toISOString(),results},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
