// 本地最新代码飞虫诊断：自带静态服务器跑 worktree 版本，对比线上差异。
const path=require('path'),http=require('node:http'),fs=require('node:fs');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=path.join(__dirname,'..','..','..','..','..','public');
const PORT=8917;
const GAME_URL=`http://127.0.0.1:${PORT}/html/game/starship-defense/index.html?qa=1`;
const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const server=http.createServer((req,res)=>{
    const u=decodeURIComponent(req.url.split('?')[0]);let f=path.join(ROOT,u==='/'?'index.html':u);
    if(!f.startsWith(ROOT))return res.writeHead(403).end();
    fs.readFile(f,(e,d)=>{if(e){res.writeHead(404).end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});
  });
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const p=await context.newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto(GAME_URL,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
  try{if(await p.locator('#keysMenu').isVisible().catch(()=>false)){await p.click('#keysMenu');await p.selectOption('#combat-input','keyboard');await p.click('#keysClose');}}catch{}
  await p.click('#btnZerg');
  await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
  await sleep(800);
  const pre=await p.evaluate(()=>{__gameQA.zerg.biomass=300;const z=__gameQA.zerg;return{bio:z.biomass,n:__gameQA.monsters.length};});
  console.log('PRE',JSON.stringify(pre));
  await p.keyboard.press('KeyI');
  for(const ms of [60,500,1500,3000,6000,10000,15000]){
    await sleep(ms===60?60:ms-({60:0,500:60,1500:500,3000:1500,6000:3000,10000:6000,15000:10000}[ms]));
    const s=await p.evaluate(()=>{
      const q=__gameQA,z=q.zerg,ms=q.monsters;
      const flies=ms.filter(m=>m.fly);
      return{bio:Math.round(z.biomass),flyCd:+(+z.flyCd).toFixed(1),n:ms.length,flyN:flies.length,
        flags:ms.filter(m=>m!==z.bug).map(m=>({fly:!!m.fly,fae:!!m.flightAfterExit,rt:m.route?1:0,hp:Math.round(m.hp),x:+m.mesh.position.x.toFixed(0),z:+m.mesh.position.z.toFixed(0),y:+m.mesh.position.y.toFixed(1)})),
        ceil:(()=>{try{const m=ms.find(x=>x!==z.bug);if(!m)return null;const q=__gameQA;return q.ceilingAt?+q.ceilingAt(m.mesh.position.x,m.mesh.position.z).toFixed(1):'n/a';}catch(e){return 'err:'+e.message}})(),
        gateHp:Math.round(q.gate.hp),baseHp:Math.round(q.base.hp)};
    });
    console.log('T+'+ms,JSON.stringify(s));
  }
  console.log('ERRORS',errs.length,errs.slice(0,3));
  await browser.close();server.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
