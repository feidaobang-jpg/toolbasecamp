// 飞虫攻基地验证：母虫走安全西廊 x=-69 到 z≈20，从 (-55,20) 一带每 8s 投 2 只飞虫共 6 波，盯 baseHp 变化。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling']});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const p=await context.newPage();
  await p.goto('https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1',{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
  await p.click('#btnZerg');
  await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
  await sleep(1200);
  const held=new Set();
  async function keys(w){for(const k of [...held])if(!w.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of w)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}}
  async function st(){return p.evaluate(()=>{const q=__gameQA,z=q.zerg,b=z.bug;return{alive:!!(b&&!b.dead),x:b?+b.mesh.position.x.toFixed(1):0,z:b?+b.mesh.position.z.toFixed(1):0,hp:Math.round(b?b.hp:0),yaw:+q.getCamYaw().toFixed(2),bio:Math.round(z.biomass),flyCd:+(+z.flyCd).toFixed(2),deaths:z.deaths,baseHp:Math.round(q.base.hp),sums:q.squad.length,flies:q.monsters.filter(m=>!m.dead&&m.fly).length,gates:q.monsters.filter(m=>!m.dead).length};});}
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  async function goto(tx,tz){let last=null,stuck=0,t0=Date.now();
    while(Date.now()-t0<60000){let s=await st();if(!s.alive){console.log('DEAD');return null;}
      const d=Math.hypot(tx-s.x,tz-s.z);if(d<3)return s;
      if(last&&Math.hypot(s.x-last.x,s.z-last.z)<.3)stuck++;else stuck=0;last={x:s.x,z:s.z};
      if(stuck>12){console.log('STUCK',s.x,s.z);return s;}
      const want=Math.atan2(tx-s.x,tz-s.z),err=wrap(want-s.yaw);
      if(Math.abs(err)>.15){await p.keyboard.down(err>0?'KeyE':'KeyQ');await sleep(Math.min(450,Math.abs(err)/1.9*1000));await p.keyboard.up(err>0?'KeyE':'KeyQ');s=await st();}
      const dx=tx-s.x,dz=tz-s.z,f=dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw),r=-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw);
      const w=[];if(Math.abs(f)>1)w.push(f>0?'KeyW':'KeyS');if(Math.abs(r)>1)w.push(r>0?'KeyD':'KeyA');await keys(w);await sleep(240);}
    return await st();}
  await goto(-69,140);await goto(-69,60);const s0=await goto(-69,20);
  console.log('AT WEST',s0&&s0.x+','+s0.z,'bio',s0&&s0.bio,'baseHp',s0&&s0.baseHp);
  for(let wv=1;wv<=6;wv++){
    let s=await st();if(!s||!s.alive)break;
    while(s.flyCd>0||s.bio<90){await sleep(1000);s=await st();if(!s||!s.alive){wv=99;break;}}
    if(wv===99)break;
    await p.keyboard.press('KeyI');console.log('WAVE',wv,'cast at',s.x+','+s.z,'bio',s.bio);
    for(let t=0;t<24;t++){await sleep(1000);const c=await st();if(!c||!c.alive){console.log('bug died midwatch');break;}
      if(t%4===0)console.log('  +'+(t+1)+'s flies',c.flies,'swarm',c.gates,'baseHp',c.baseHp,'bio',c.bio,'hp',c.hp);}
  }
  const f=await st();console.log('FINAL',JSON.stringify(f));
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
