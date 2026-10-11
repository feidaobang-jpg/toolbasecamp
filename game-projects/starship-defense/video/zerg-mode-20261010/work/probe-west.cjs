// 西侧抵近探针：x=-69 南下到 z=-40 后沿 z=-40 逐步向东，找西墙停止线与基地酸液可达位；每步报 hp/baseHp。
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
  const held=new Set();let turnKey=null,turnRate=1.9;
  async function keys(w){for(const k of [...held])if(!w.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of w)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}}
  async function st(){return p.evaluate(()=>{const q=__gameQA,z=q.zerg,b=z.bug;return{alive:!!(b&&!b.dead),x:b?+b.mesh.position.x.toFixed(1):0,z:b?+b.mesh.position.z.toFixed(1):0,hp:Math.round(b?b.hp:0),yaw:+q.getCamYaw().toFixed(2),bio:Math.round(z.biomass),spitCd:+(+z.spitCd).toFixed(2),moltCd:+(+z.moltCd).toFixed(2),deaths:z.deaths,baseHp:Math.round(q.base.hp),timeLeft:Math.round(z.timeLeft),turrets:q.buildings.filter(t=>!t.dead).length};});}
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  async function aimAt(tx,tz,s){const want=Math.atan2(tx-s.x,tz-s.z);let err=wrap(want-s.yaw);
    if(Math.abs(err)<.12)return s;
    if(!turnKey){const y0=s.yaw;await p.keyboard.down('KeyE');await sleep(160);await p.keyboard.up('KeyE');const y1=(await st()).yaw,d=wrap(y1-y0);turnKey=d>0?'KeyE':'KeyQ';turnRate=Math.abs(d)/.16||1;err=wrap(want-y1);s={...s,yaw:y1};}
    await p.keyboard.down(turnKey);await sleep(Math.min(500,Math.max(60,Math.abs(err)/turnRate*1000)));await p.keyboard.up(turnKey);return await st();}
  async function goto(tx,tz,tag){let last=null,stuck=0,t0=Date.now();
    while(Date.now()-t0<45000){let s=await st();if(!s.alive){console.log(tag,'DEAD');return null;}
      const d=Math.hypot(tx-s.x,tz-s.z);if(d<2.5)return s;
      if(last&&Math.hypot(s.x-last.x,s.z-last.z)<.3)stuck++;else stuck=0;last={x:s.x,z:s.z};
      if(stuck>10){console.log(tag,'STUCK at',s.x,s.z,'->',tx,tz);return s;}
      s=await aimAt(tx,tz,s);const dx=tx-s.x,dz=tz-s.z,f=dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw),r=-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw);
      const w=[];if(Math.abs(f)>1)w.push(f>0?'KeyW':'KeyS');if(Math.abs(r)>1)w.push(r>0?'KeyD':'KeyA');await keys(w);await keys([].concat(w));if(!held.has('ShiftLeft')){await p.keyboard.down('ShiftLeft');held.add('ShiftLeft');}await sleep(240);}
    console.log(tag,'TIMEOUT');return await st();}
  let s=await goto(-69,-40,'SOUTH');if(!s)process.exit(0);
  await keys([]);
  for(let tx=-64;tx>=-40;tx-=4){/* noop */}
  for(let tx=-64;tx<=-8;tx+=6){
    s=await goto(tx,-40,'E@'+tx);if(!s)process.exit(0);
    console.log('E@'+tx,'pos',s.x+','+s.z,'hp',s.hp,'baseHp',s.baseHp,'turrets',s.turrets,'bio',s.bio,'tl',s.timeLeft);
    const dB=Math.hypot(-12-s.x,-42-s.z);
    if(dB<=33){ // 试两发酸看基地掉不掉血
      let bh0=s.baseHp,shots=0;
      for(let i=0;i<8&&s.spitCd<0;i++)s=await st();
      for(let k=0;k<3;k++){s=await st();if(!s.alive)break;
        if(s.spitCd<=0){s=await aimAt(-12,-42,s);await sleep(400);await p.keyboard.press('KeyK');shots++;await sleep(1600);} }
      s=await st();console.log('  ACIDTEST dB',Math.round(dB),'shots',shots,'baseHp',s?s.baseHp:'DEAD','(was',bh0,') hp',s?s.hp:'-');
    }
    if(s&&!s.alive)process.exit(0);
  }
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
