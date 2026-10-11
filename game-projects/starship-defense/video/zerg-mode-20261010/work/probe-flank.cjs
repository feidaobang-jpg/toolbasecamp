// 绕后探针：验证"绕西翼直攻基地"路线的承伤与咬基地收益。
// 阶段：巢(-69,180) → 西翼(-50,20)停3s → (-48,-30)停3s → 基地(-12,-42)贴脸咬10s。全程每 1s 记录。
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
  async function goto2(tx,tz,arriveD,tag,bites){
    for(let i=0;i<200;i++){
      const s=await p.evaluate(()=>{const q=__gameQA,z=q.zerg,b=z.bug;return{alive:!!(b&&!b.dead),
        bx:b?+b.mesh.position.x.toFixed(1):0,bz:b?+b.mesh.position.z.toFixed(1):0,hp:Math.round(b?b.hp:0),bmax:b?b.maxHp:1,
        yaw:+q.getCamYaw().toFixed(2),bio:Math.round(z.biomass),clawCd:+(+z.clawCd).toFixed(2),dashCd:+(+z.dashCd).toFixed(2),deaths:z.deaths};});
      if(!s.alive){console.log(tag,'DEAD deaths',s.deaths);return false;}
      const d=Math.hypot(tx-s.bx,tz-s.bz);
      if(i%4===0)console.log(tag,'d',Math.round(d),'hp',Math.round(s.hp/s.bmax*100)+'%','bio',s.bio,'x',s.bx,'z',s.bz);
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
  async function hold(seconds,tag){
    const t0=Date.now();let lastHp=null;
    while(Date.now()-t0<seconds*1000){
      const s=await p.evaluate(()=>{const q=__gameQA,z=q.zerg,b=z.bug;return{alive:!!(b&&!b.dead),hp:Math.round(b?b.hp:0),bmax:b?b.maxHp:1,bio:Math.round(z.biomass),deaths:z.deaths,clawCd:+(+z.clawCd).toFixed(2)};});
      if(!s.alive){console.log(tag,'DEAD deaths',s.deaths);return false;}
      const dhp=lastHp===null?0:s.hp-lastHp;lastHp=s.hp;
      console.log(tag,'hp',s.hp,'dhp/s~',dhp,'bio',s.bio,'deaths',s.deaths);
      if(s.clawCd<=0){await p.keyboard.press('KeyJ');}
      await sleep(600);
    }
    return true;
  }
  console.log('=== 阶段1: 巢→西翼(-50,20) ===');
  if(!await goto2(-50,20,5,'P1'))return finish();
  console.log('=== 停留测承伤 3s ===');
  if(!await hold(3,'H1'))return finish();
  console.log('=== 阶段2: →(-48,-30) ===');
  if(!await goto2(-48,-30,5,'P2'))return finish();
  console.log('=== 停留测承伤 3s ===');
  if(!await hold(3,'H2'))return finish();
  console.log('=== 阶段3: →基地(-12,-42) 贴脸咬 12s ===');
  if(!await goto2(-12,-42,5,'P3'))return finish();
  await hold(12,'CORE');
  async function finish(){await keys([]);if(dashHeld)await p.keyboard.up('ShiftLeft');await browser.close();return;}
  await finish();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
