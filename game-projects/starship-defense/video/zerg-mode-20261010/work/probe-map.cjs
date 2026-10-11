// 静态地图 dump：进战斗后输出炮塔/守军/载具/门/基地/虫巢坐标与数值，规划打法路线用。只读不操作。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const GAME_URL='https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const p=await context.newPage();
  await p.goto(GAME_URL,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
  try{if(await p.locator('#keysMenu').isVisible().catch(()=>false)){await p.click('#keysMenu');await p.selectOption('#combat-input','keyboard');await p.click('#keysClose');}}catch{}
  await p.click('#btnZerg');
  await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
  await sleep(4000); // 等布防完成
  const map=await p.evaluate(()=>{
    const q=__gameQA;
    const T=t=>({x:+t.mesh.position.x.toFixed(1),z:+t.mesh.position.z.toFixed(1),hp:Math.round(t.hp||0),kind:t.kind||t.type||'turret'});
    return{
      gate:{x:+q.gate.mesh.position.x.toFixed(1),z:+q.gate.mesh.position.z.toFixed(1),hp:Math.round(q.gate.hp),max:Math.round(q.gate.maxHp||0)},
      base:{x:+q.base.pos.x.toFixed(1),z:+q.base.pos.z.toFixed(1),hp:Math.round(q.base.hp),max:Math.round(q.base.maxHp)},
      turrets:q.buildings.filter(b=>!b.dead).map(T),
      squads:q.squad.filter(s=>!s.dead).map(s=>({x:+s.mesh.position.x.toFixed(1),z:+s.mesh.position.z.toFixed(1)})),
      vehicles:q.vehicles.filter(v=>!v.dead).map(v=>({x:+v.mesh.position.x.toFixed(1),z:+v.mesh.position.z.toFixed(1)})),
      nest:{x:+q.zerg.bug.mesh.position.x.toFixed(1),z:+q.zerg.bug.mesh.position.z.toFixed(1)},
      walls:(q.walls||[]).length};
  });
  console.log('NEST',JSON.stringify(map.nest));
  console.log('GATE',JSON.stringify(map.gate));
  console.log('BASE',JSON.stringify(map.base));
  console.log('TURRETS',JSON.stringify(map.turrets));
  console.log('SQUADS',map.squads.length,JSON.stringify(map.squads.slice(0,8)));
  console.log('VEHICLES',JSON.stringify(map.vehicles));
  console.log('WALLS',map.walls);
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
