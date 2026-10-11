// 掩体探针 v4：南门外带 (z∈[6..12]) 各点净承伤 + 酸液打门命中 + 建筑血量表。修复 bug=null 崩溃。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const GAME_URL='https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const p=await context.newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(GAME_URL,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
  await p.click('#btnZerg');
  await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
  await sleep(800);
  const blds=await p.evaluate(()=>__gameQA.buildings.map(t=>({kind:t.kind,x:+t.mesh.position.x.toFixed(1),z:+t.mesh.position.z.toFixed(1),hp:Math.round(t.hp),maxHp:Math.round(t.maxHp||t.hp)})));
  console.log('BUILDINGS',JSON.stringify(blds));
  const spots=[[0,10],[3,10],[6,10],[0,6],[4,7],[-3,8],[0,14],[6,14]];
  for(const [x,z] of spots){
    const meta=await p.evaluate(([x,z])=>{
      const q=__gameQA;
      const stand=!q.collideWalls(x,z,.95)&&!q.tooSteep(x,z);
      return{stand};
    },[x,z]);
    if(!meta.stand){console.log('SPOT',x,z,'stand=false');continue;}
    // 等复活+传送+清场
    await p.evaluate(async([x,z])=>{
      const q=__gameQA;
      for(let i=0;i<40&&(!q.zerg.bug||q.zerg.bug.dead);i++)await new Promise(r=>setTimeout(r,250));
      for(const m of q.monsters){if(m!==q.zerg.bug&&!m.dead){m.dead=true;if(m.mesh)m.mesh.visible=false;}}
      const b=q.zerg.bug;if(!b)return;
      b.mesh.position.set(x,q.groundY(x,z),z);b.hp=b.maxHp=950;
    },[x,z]);
    await sleep(300);
    await p.evaluate(()=>{const q=__gameQA;if(q.zerg.bug)q.zerg.bug.hp=950;for(const m of q.monsters){if(m!==q.zerg.bug&&!m.dead){m.dead=true;if(m.mesh)m.mesh.visible=false;}}});
    const dps=await p.evaluate(async()=>{
      const q=__gameQA,b=q.zerg.bug;if(!b)return{dead:true};
      const h0=b.hp;await new Promise(r=>setTimeout(r,4000));
      return{dps:+((h0-b.hp)/4).toFixed(1),hp:Math.round(b.hp),dead:b.dead};
    });
    if(dps.dead){console.log('SPOT',x,z,'died-standing');continue;}
    console.log('SPOT',x,z,'dps',dps.dps,'hp',dps.hp);
    // 酸液打门 ×2
    for(let i=0;i<2;i++){
      const g1=await p.evaluate(([x,z])=>{
        const q=__gameQA,b=q.zerg.bug;if(!b||b.dead)return null;
        q.setCamYaw(Math.atan2(q.gate.mesh.position.x-x,q.gate.mesh.position.z-z));
        q.zerg.spitCd=0;return q.gate.hp;
      },[x,z]);
      if(g1===null)break;
      await p.keyboard.press('KeyK');
      await sleep(1500);
      const out=await p.evaluate(g1=>({g2:__gameQA.gate.hp,cd:__gameQA.zerg.spitCd>0,dead:!__gameQA.zerg.bug||__gameQA.zerg.bug.dead}),g1);
      console.log('  GATE-SHOT dmg',(g1-out.g2),'fired',out.cd,'dead',out.dead);
      if(out.dead)break;
      await p.evaluate(()=>{const q=__gameQA;if(q.zerg.bug)q.zerg.bug.hp=950;});
    }
  }
  console.log('ERRORS',JSON.stringify(errs));
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
