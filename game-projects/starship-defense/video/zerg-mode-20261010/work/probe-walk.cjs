// 可走性探针：调用游戏内部 collideWalls/tooSteep/squadCanWalk 测西南走廊各点，另查 WORLD 边界。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const GAME_URL='https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const p=await context.newPage();
  await p.goto(GAME_URL,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
  await p.click('#btnZerg');
  await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
  await sleep(800);
  const res=await p.evaluate(()=>{
    const q=__gameQA;
    const pts=[[-50,-32],[-48,-35],[-45,-38],[-52,-42],[-44,-50],[-42,-52],[-48,-46],[-52,-50],[-40,-45],[-36,-48],[-30,-48],[-46,-30],[-50,-20],[-44,-25],[-38,-30],[-35,-40],[-30,-42],[-20,-50],[-10,-50],[-5,-45]];
    const rows=pts.map(([x,z])=>{
      let wall=null,steep=null;
      try{wall=q.collideWalls?!!q.collideWalls(x,z,.8):'n/a';}catch(e){wall='err';}
      try{steep=q.tooSteep?!!q.tooSteep(x,z):'n/a';}catch(e){steep='err';}
      let walk='n/a';
      try{walk=q.squadCanWalk?!!q.squadCanWalk(x,z):'n/a';}catch(e){walk='err';}
      return{x,z,wall,steep,walk};
    });
    return{rows,WORLD:q.WORLD||null,groundY:(()=>{try{return typeof q.groundY;}catch(e){return 'err';}})()};
  });
  console.log('WORLD',JSON.stringify(res.WORLD));
  for(const r of res.rows)console.log('PT',String(r.x).padStart(4),String(r.z).padStart(5),'wall',String(r.wall).padEnd(5),'steep',String(r.steep).padEnd(5),'walk',r.walk);
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
