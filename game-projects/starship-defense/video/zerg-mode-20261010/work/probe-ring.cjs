// v24 绕后探路：巢(1,176)→西侧外环→基地北侧(-12,-54)→贴脸酸基地，全程真实行走，只读观察碰撞与承伤。
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
  await sleep(1200);
  const held=new Set();
  async function keys(w){for(const k of [...held])if(!w.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of w)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}}
  async function st(){return p.evaluate(()=>{const q=__gameQA,z=q.zerg,b=z.bug;return{alive:!!(b&&!b.dead),x:b?+b.mesh.position.x.toFixed(1):0,z:b?+b.mesh.position.z.toFixed(1):0,hp:Math.round(b?b.hp:0),yaw:+q.getCamYaw().toFixed(2),bio:Math.round(z.biomass),spitCd:+(+z.spitCd).toFixed(2),deaths:z.deaths,baseHp:Math.round(q.base.hp),turrets:q.buildings.filter(t=>!t.dead).map(t=>({x:+t.mesh.position.x.toFixed(1),z:+t.mesh.position.z.toFixed(1),hp:Math.round(t.hp)}))};});}
  const WAY=[[-69,140],[-69,60],[-69,-10],[-69,-40],[-50,-52],[-25,-54],[-12,-52]];
  for(let wi=0;wi<WAY.length;wi++){
    const [tx,tz]=WAY[wi];let last=null,stuck=0,t0=Date.now();
    console.log('=== WP',wi,tx,tz);
    while(Date.now()-t0<70000){
      const s=await st();
      if(!s.alive){console.log('DEAD at wp',wi,'deaths',s.deaths);await sleep(4500);break;}
      const d=Math.hypot(tx-s.x,tz-s.z);
      if(d<4){console.log('REACHED',wi,'x',s.x,'z',s.z,'hp',s.hp,'baseHp',s.baseHp);break;}
      if(last&&Math.hypot(s.x-last.x,s.z-last.z)<.4)stuck++;else stuck=0;
      last={x:s.x,z:s.z};
      if(Date.now()-t0>2500&&stuck>8){console.log('BLOCKED at',s.x,s.z,'→',tx,tz);break;}
      const dx=tx-s.x,dz=tz-s.z,f=dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw),r=-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw);
      const w=[];if(Math.abs(f)>1)w.push(f>0?'KeyW':'KeyS');if(Math.abs(r)>1)w.push(r>0?'KeyD':'KeyA');
      await keys(w);if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}
      if(Date.now()%1)0;
      await sleep(220);
      if(wi>=5&&s.spitCd<=0&&d<30){await keys([]);await sleep(80);await p.keyboard.press('KeyK');console.log('ACID base d',Math.round(d),'baseHp',s.baseHp,'bio',s.bio);}
    }
    await keys([]);if(held.has('ShiftLeft')){await p.keyboard.up('ShiftLeft');held.delete('ShiftLeft');}
  }
  const f=await st();console.log('FINAL',JSON.stringify({hp:f.hp,bio:f.bio,deaths:f.deaths,baseHp:f.baseHp,turrets:f.turrets.map(t=>t.x+','+t.z+':'+t.hp).join(' ')}));
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
