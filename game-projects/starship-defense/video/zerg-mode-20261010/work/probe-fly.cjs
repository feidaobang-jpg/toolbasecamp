// 飞虫机制探针（仅用于读数值，不进录制素材）：作弊灌生物量，连空投多批飞虫，观察航线/战损/基地掉血。
const path=require('path');
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
  await sleep(1000);
  await p.evaluate(()=>{__gameQA.zerg.biomass=900;});
  const snap=()=>p.evaluate(()=>{
    const q=__gameQA,z=q.zerg;
    const flies=q.monsters.filter(m=>!m.dead&&m.fly&&m!==z.bug);
    const walkers=q.monsters.filter(m=>!m.dead&&!m.fly&&m!==z.bug);
    const spec=flies[0];
    return{t:Math.round(z.timeLeft),bio:Math.round(z.biomass),flyN:flies.length,walkN:walkers.length,
      flyHp:flies.map(f=>Math.round(f.hp)),
      spec:spec?{hp:Math.round(spec.hp),maxHp:Math.round(spec.maxHp),dmg:spec.dmg,speed:+spec.speed.toFixed(1),x:+spec.mesh.position.x.toFixed(1),z:+spec.mesh.position.z.toFixed(1),y:+spec.mesh.position.y.toFixed(1)}:null,
      walkSpec:walkers[0]?{hp:Math.round(walkers[0].hp),dmg:walkers[0].dmg,speed:+walkers[0].speed.toFixed(1),x:+walkers[0].mesh.position.x.toFixed(1),z:+walkers[0].mesh.position.z.toFixed(1)}:null,
      gateHp:Math.round(q.gate.hp),baseHp:Math.round(q.base.hp),
      aa:q.buildings.filter(b=>!b.dead).map(b=>({x:+b.mesh.position.x.toFixed(0),z:+b.mesh.position.z.toFixed(0),hp:Math.round(b.hp||0)}))};
  });
  for(let batch=1;batch<=4;batch++){
    await p.keyboard.press('KeyI');await sleep(500);
    await p.evaluate(()=>{__gameQA.zerg.biomass=Math.max(__gameQA.zerg.biomass,200);});
  }
  const log=[];
  for(let i=0;i<60;i++){
    const s=await snap();log.push(s);
    if(i%4===0)console.log('T+'+(i*2)+'s fly',s.flyN,'hp',JSON.stringify(s.flyHp),'base',s.baseHp,'gate',s.gateHp,'walk',s.walkN,'spec',JSON.stringify(s.spec));
    if(s.flyN===0&&i>10)break;
    await sleep(2000);
  }
  const last=log[log.length-1];
  console.log('FINAL fly',last.flyN,'base',last.baseHp,'gate',last.gateHp,'bio',last.bio);
  console.log('AA final',JSON.stringify(last.aa));
  console.log('WALK spec',JSON.stringify(last.walkSpec));
  console.log('ERRORS',errs.length,errs.slice(0,3));
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
