// 绕后站位探针：西廊 x=-69 南下，在若干 z 排向东推进，报告每排阻挡停止线；
// 凡距基地核心 ≤30 的位置喷一发酸液，实测 baseHp 是否下降（判断墙是否挡弹道）。只读+正常按键。
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
  async function st(){return p.evaluate(()=>{const q=__gameQA,z=q.zerg,b=z.bug;return{alive:!!(b&&!b.dead),x:b?+b.mesh.position.x.toFixed(1):0,z:b?+b.mesh.position.z.toFixed(1):0,hp:Math.round(b?b.hp:0),yaw:+q.getCamYaw().toFixed(2),bio:Math.round(z.biomass),spitCd:+(+z.spitCd).toFixed(2),deaths:z.deaths,baseHp:Math.round(q.base.hp),timeLeft:Math.round(z.timeLeft),swarm:q.monsters.filter(m=>!m.dead).length};});}
  const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
  async function head(tx,tz){let last=null,stuck=0,t0=Date.now();
    while(Date.now()-t0<50000){let s=await st();if(!s.alive)return{dead:true,s};
      const d=Math.hypot(tx-s.x,tz-s.z);if(d<3)return{s};
      if(last&&Math.hypot(s.x-last.x,s.z-last.z)<.3)stuck++;else stuck=0;last={x:s.x,z:s.z};
      if(stuck>14)return{blocked:true,s};
      const want=Math.atan2(tx-s.x,tz-s.z),err=wrap(want-s.yaw);
      if(Math.abs(err)>.15){const tk=err>0?'KeyE':'KeyQ';await p.keyboard.down(tk);await sleep(Math.min(420,Math.abs(err)/1.9*1000));await p.keyboard.up(tk);s=await st();}
      const dx=tx-s.x,dz=tz-s.z,f=dx*Math.sin(s.yaw)+dz*Math.cos(s.yaw),r=-dx*Math.cos(s.yaw)+dz*Math.sin(s.yaw);
      const w=[];if(Math.abs(f)>1)w.push(f>0?'KeyW':'KeyS');if(Math.abs(r)>1)w.push(r>0?'KeyD':'KeyA');await keys(w);await sleep(230);}
    return{timeout:true,s:await st()};}
  // 每排：从 x=-69 出发向东；找到最远可达点；若距核心<=30 喷一发酸
  for(const row of [-46,-52,-58,-64]){
    console.log('=== ROW z='+row);
    let r=await head(-69,row);if(r.dead||r.blocked||r.timeout){console.log('cannot reach row',row,JSON.stringify({d:r.dead,b:r.blocked,x:r.s&&r.s.x,z:r.s&&r.s.z,hp:r.s&&r.s.hp}));continue;}
    let prev=null;
    for(let tx=-63;tx>=-25;tx-=5){
      const rr=await head(tx,row);
      if(rr.dead){console.log('DEAD row',row);process.exit(0);}
      const s=rr.s;console.log(' row',row,'at',s.x+','+s.z,'hp',s.hp,'baseHp',s.baseHp,rr.blocked?'BLOCKED':'ok');
      const dB=Math.hypot(-12-s.x,-42-s.z);
      if(dB<=30){
        // 对准核心喷一发，看基地掉不掉血
        let t=await st();while(t.spitCd>0&&t.alive){await sleep(300);t=await st();}
        if(!t.alive)continue;
        const want=Math.atan2(-12-t.x,-42-t.z),err=wrap(want-t.yaw);
        if(Math.abs(err)>.1){await p.keyboard.down(err>0?'KeyE':'KeyQ');await sleep(Math.min(500,Math.abs(err)/1.9*1000));await p.keyboard.up(err>0?'KeyE':'KeyQ');}
        await sleep(300);await p.keyboard.press('KeyK');
        const before=t.baseHp;await sleep(2200);const a2=await st();
        console.log('   ACID->core dB',Math.round(dB),'baseHp',before,'=>',a2?a2.baseHp:'DEAD',a2&&a2.baseHp<before?'*** DAMAGE ***':'(no damage/blocked)');
        if(a2&&!a2.alive){console.log('died after acid');}
      }
      if(rr.blocked){console.log('  row edge at',s.x);break;}
    }
  }
  const f=await st();console.log('FINAL',JSON.stringify(f));
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
