// 飞虫高频追踪探针：召唤 1 批后每 300ms 记录飞虫 HP/位置，定位死因与航线。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const GAME_URL='https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const p=await context.newPage();
  await p.goto(GAME_URL,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
  try{if(await p.locator('#keysMenu').isVisible().catch(()=>false)){await p.click('#keysMenu');await p.selectOption('#combat-input','keyboard');await p.click('#keysClose');}}catch{}
  await p.click('#btnZerg');
  await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
  await sleep(800);
  await p.evaluate(()=>{__gameQA.zerg.biomass=300;});
  const bugPos=await p.evaluate(()=>{const b=__gameQA.zerg.bug;return{x:+b.mesh.position.x.toFixed(1),z:+b.mesh.position.z.toFixed(1)};});
  console.log('BUG at',JSON.stringify(bugPos));
  await p.keyboard.press('KeyI');
  await sleep(400);
  for(let i=0;i<50;i++){
    const s=await p.evaluate(()=>{
      const q=__gameQA,z=q.zerg;
      const flies=q.monsters.filter(m=>!m.dead&&m.fly&&m!==z.bug);
      return{t:+z.timeLeft.toFixed(1),flyN:flies.length,
        flies:flies.map(f=>({hp:Math.round(f.hp),x:+f.mesh.position.x.toFixed(1),z:+f.mesh.position.z.toFixed(1),y:+f.mesh.position.y.toFixed(1)})),
        baseHp:Math.round(q.base.hp),gateHp:Math.round(q.gate.hp),over:z.over};
    });
    if(i%2===0||s.flyN>0)console.log('T'+((50-i)),'fly',s.flyN,JSON.stringify(s.flies),'base',s.baseHp,'gate',s.gateHp);
    if(s.flyN===0&&i>6){console.log('ALL FLIES DEAD at tick',i);break;}
    if(s.over)break;
    await sleep(300);
  }
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
