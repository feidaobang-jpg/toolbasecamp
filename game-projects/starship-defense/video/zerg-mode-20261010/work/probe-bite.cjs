// 微探针：定位"贴门不咬"。每 600ms 采样位置/dg/咬击/生物量，导航到门后持续按 J。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const GAME_URL='https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const p=await context.newPage();
  p.on('pageerror',e=>console.log('PAGEERR',e.message));
  await p.goto(GAME_URL,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
  try{if(await p.locator('#keysMenu').isVisible().catch(()=>false)){await p.click('#keysMenu');await p.selectOption('#combat-input','keyboard');await p.click('#keysClose');}}catch{}
  await p.click('#btnZerg');
  await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
  await sleep(1200);
  const held=new Set();
  async function keys(wanted){for(const k of [...held])if(!wanted.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of wanted)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}}
  const t0=Date.now();
  let bites=0,lastBio=80;
  for(let i=0;i<40;i++){ // 24s
    const s=await p.evaluate(()=>{
      const q=__gameQA,z=q.zerg,b=z.bug;
      return{t:+((Date.now()-window.__t0||0)/1000).toFixed(1),alive:!!(b&&!b.dead),hp:Math.round(b?b.hp:0),
        bx:b?+b.mesh.position.x.toFixed(1):0,bz:b?+b.mesh.position.z.toFixed(1):0,
        yaw:+q.getCamYaw().toFixed(2),bio:Math.round(z.biomass),clawCd:+(+z.clawCd).toFixed(2),
        gateHp:Math.round(q.gate.hp),binv:+(+b.invuln).toFixed(1)};
    });
    if(!s.alive){console.log('DEAD at',s.t,'bio',s.bio,'bites',bites);break;}
    const dg=Math.hypot(0-s.bx,-16-s.bz);
    const dx=0-s.bx,dz=-16-s.bz,f=dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw),r=-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw);
    const want=[];if(Math.abs(f)>1)want.push(f>0?'KeyW':'KeyS');if(Math.abs(r)>1)want.push(r>0?'KeyD':'KeyA');
    if(dg>4.5){await keys(want);if(s.dashOk!==false){}}
    else{await keys([]);if(s.clawCd<=0){await p.keyboard.press('KeyJ');bites++;}}
    const gain=s.bio-lastBio;if(gain>0)console.log('  bio+',gain,'at t',s.t);
    lastBio=s.bio;
    if(i%3===0)console.log('T',s.t,'dg',Math.round(dg),'f',f.toFixed(1),'r',r.toFixed(1),'yaw',s.yaw,'hp',s.hp,'bio',s.bio,'bites',bites,'clawCd',s.clawCd,'inv',s.binv);
    if(s.bio>lastBio)lastBio=s.bio;
    await sleep(600);
  }
  await keys([]);
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
