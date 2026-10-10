// 飞虫召唤诊断：press KeyI 前后对照 bio/monsters/fly 字段，定位飞虫消失原因。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const GAME_URL='https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
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
  const pre=await p.evaluate(()=>{__gameQA.zerg.biomass=300;const z=__gameQA.zerg;return{bio:z.biomass,flyCd:z.flyCd,n:__gameQA.monsters.length};});
  console.log('PRE',JSON.stringify(pre));
  await p.keyboard.press('KeyI');
  for(const ms of [60,200,500,1000,2000,3500,5000,8000]){
    await sleep(ms===60?60:ms-((ms===200?60:ms===500?200:ms===1000?500:ms===2000?1000:ms===3500?2000:ms===5000?3500:5000)));
    const s=await p.evaluate(()=>{
      const q=__gameQA,z=q.zerg,ms=q.monsters;
      const flies=ms.filter(m=>m.fly);
      const f0=ms.find(m=>m!==z.bug);
      return{bio:Math.round(z.biomass),flyCd:+(+z.flyCd).toFixed(1),n:ms.length,flyN:flies.length,
        flags:ms.filter(m=>m!==z.bug).map(m=>({fly:!!m.fly,dead:!!m.dead,hp:Math.round(m.hp),y:+m.mesh.position.y.toFixed(1)})),
        sample:f0?Object.keys(f0).filter(k=>/fly|dead|hp|dmg|speed|target/i.test(k)).map(k=>k+'='+JSON.stringify(f0[k]).slice(0,40)).join(' '):'none'};
    });
    console.log('T+'+ms,JSON.stringify(s));
    if(s.flyN===0&&ms>0&&s.bio!==undefined&&s.flyCd>0&&ms<10){/* 继续观察 */}
  }
  console.log('ERRORS',errs.length,errs.slice(0,3));
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
