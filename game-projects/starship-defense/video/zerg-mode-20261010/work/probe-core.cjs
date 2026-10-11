// 贴基地探针：绕西到 (-45,-40) 停 3s 测承伤 → 贴基地 (-12,-42) 咬+酸 14s 记录 bio 收入与掉血。
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
  const held=new Set();let dashHeld=false;
  async function keys(wanted){for(const k of [...held])if(!wanted.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of wanted)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}}
  async function goto2(tx,tz,arriveD,tag){
    for(let i=0;i<220;i++){
      const s=await p.evaluate(()=>{const q=__gameQA,z=q.zerg,b=z.bug;return{alive:!!(b&&!b.dead),
        bx:b?+b.mesh.position.x.toFixed(1):0,bz:b?+b.mesh.position.z.toFixed(1):0,hp:Math.round(b?b.hp:0),bmax:b?b.maxHp:1,
        yaw:+q.getCamYaw().toFixed(2),bio:Math.round(z.biomass),dashCd:+(+z.dashCd).toFixed(2),deaths:z.deaths};});
      if(!s.alive){console.log(tag,'DEAD deaths',s.deaths);return false;}
      const d=Math.hypot(tx-s.bx,tz-s.bz);
      if(i%5===0)console.log(tag,'d',Math.round(d),'hp',Math.round(s.hp/s.bmax*100)+'%','bio',s.bio,'x',s.bx,'z',s.bz);
      if(d<=arriveD){await keys([]);if(dashHeld){await p.keyboard.up('ShiftLeft');dashHeld=false;}return true;}
      const dx=tx-s.bx,dz=tz-s.bz,f=dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw),r=-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw);
      const want=[];if(Math.abs(f)>1)want.push(f>0?'KeyW':'KeyS');if(Math.abs(r)>1)want.push(r>0?'KeyD':'KeyA');
      await keys(want);
      if(want.length){if(!dashHeld){await p.keyboard.down('ShiftLeft');dashHeld=true;}}else if(dashHeld){await p.keyboard.up('ShiftLeft');dashHeld=false;}
      if(s.dashCd<=0&&d>25){await p.keyboard.press('KeyL');}
      await sleep(200);
    }
    console.log(tag,'TIMEOUT');return false;
  }
  // 绕行点：先到 (-50,20)（安全区），再贴 z=-40 纬线东移
  if(!await goto2(-50,20,5,'A'))return done();
  console.log('--- 到 (-45,-40)，测西线承伤 3s ---');
  if(!await goto2(-45,-40,5,'B'))return done();
  let lastHp=null;for(let i=0;i<5;i++){
    const s=await p.evaluate(()=>{const q=__gameQA,z=q.zerg,b=z.bug;return{alive:!!(b&&!b.dead),hp:Math.round(b?b.hp:0),bio:Math.round(z.biomass),deaths:z.deaths};});
    if(!s.alive){console.log('HOLD-DEAD');return done();}
    const dhp=lastHp===null?0:s.hp-lastHp;lastHp=s.hp;
    console.log('B-hold hp',s.hp,'dhp',dhp,'bio',s.bio);
    await sleep(600);
  }
  console.log('--- 贴基地 (-13,-42) 输出 14s：J+K 全按 ---');
  if(!await goto2(-13,-42,5,'C'))return done();
  const t0=Date.now();let lastBio=80,bites=0,acids=0;
  while(Date.now()-t0<14000){
    const s=await p.evaluate(()=>{const q=__gameQA,z=q.zerg,b=z.bug;return{alive:!!(b&&!b.dead),hp:Math.round(b?b.hp:0),bmax:b?b.maxHp:1,bio:Math.round(z.biomass),baseHp:Math.round(q.base.hp),deaths:z.deaths,clawCd:+(+z.clawCd).toFixed(2),spitCd:+(+z.spitCd).toFixed(2)};});
    if(!s.alive){console.log('CORE-DEAD bites',bites,'acids',acids);return done();}
    const gain=s.bio-lastBio;if(gain>0)console.log('  bio+',gain);
    lastBio=s.bio;
    if(s.clawCd<=0){await p.keyboard.press('KeyJ');bites++;}
    else if(s.spitCd<=0){await p.keyboard.press('KeyK');acids++;}
    console.log('CORE hp',s.hp,'bio',s.bio,'base',s.baseHp,'bites',bites,'acids',acids,'deaths',s.deaths);
    await sleep(300);
  }
  async function done(){await keys([]);if(dashHeld)await p.keyboard.up('ShiftLeft');await browser.close();}
  await done();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
