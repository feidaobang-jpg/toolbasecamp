// 探针 v30：破门后终局可行性。①dump 全建筑坐标；②模拟 gate.dead 后在门脸/门洞内逐塔测酸液命中与伤害。
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
  const blds=await p.evaluate(()=>__gameQA.buildings.map(t=>({kind:t.kind,x:+t.mesh.position.x.toFixed(1),z:+t.mesh.position.z.toFixed(1),hp:Math.round(t.hp),r:t.range||null})));
  console.log('BUILDINGS',JSON.stringify(blds));
  // 模拟破门 + 清守军（只清 monsters，不动炮塔），虫满血站门脸
  await p.evaluate(()=>{const q=__gameQA;q.gate.dead=true;q.gate.mesh&&(q.gate.mesh.visible=false);
    for(const m of q.monsters){if(m!==q.zerg.bug&&!m.dead){m.dead=true;if(m.mesh)m.mesh.visible=false;}}});
  // 等母虫可用后传送
  await p.evaluate(async()=>{const q=__gameQA;for(let i=0;i<40&&(!q.zerg.bug||q.zerg.bug.dead);i++)await new Promise(r=>setTimeout(r,250));});
  const spots=[[0,-13.2],[0,-18],[0,-22]];
  for(const [sx,sz] of spots){
    await p.evaluate(([x,z])=>{const q=__gameQA,b=q.zerg.bug;if(!b)return;b.mesh.position.set(x,q.groundY(x,z),z);b.hp=b.maxHp=950;},[sx,sz]);
    await sleep(400);
    console.log('SPOT',sx,sz);
    for(const bld of blds){
      if(bld.kind==='gate'||bld.hp<=0)continue;
      const d=Math.hypot(bld.x-sx,bld.z-sz);
      if(d>32){console.log('  ',bld.kind,'@',bld.x+','+bld.z,'d='+d.toFixed(1),'SKIP>32');continue;}
      const r1=await p.evaluate(([bx,bz])=>{const q=__gameQA,b=q.zerg.bug;if(!b||b.dead)return null;
        q.setCamYaw(Math.atan2(bx-b.mesh.position.x,bz-b.mesh.position.z));q.zerg.spitCd=0;
        const t=q.buildings.find(t=>!t.dead&&Math.abs(t.mesh.position.x-bx)<1.5&&Math.abs(t.mesh.position.z-bz)<1.5);
        return{hp0:t?Math.round(t.hp):-1};},[bld.x,bld.z]);
      if(r1===null||r1.hp0<0){console.log('  ',bld.kind,'worm-dead/target-lost');break;}
      await p.keyboard.press('KeyK');
      await sleep(1600);
      const r2=await p.evaluate(([bx,bz])=>{const q=__gameQA;
        const t=q.buildings.find(t=>!t.dead&&Math.abs(t.mesh.position.x-bx)<1.5&&Math.abs(t.mesh.position.z-bz)<1.5);
        const b=q.zerg.bug;return{hp1:t?Math.round(t.hp):-1,spit:q.zerg.spitCd>0,bio:Math.round(q.zerg.biomass),bdead:!b||b.dead,bhp:b?Math.round(b.hp):0};},[bld.x,bld.z]);
      const dmg=r1.hp0-r2.hp1;
      console.log('  ',bld.kind,'@',bld.x+','+bld.z,'d='+d.toFixed(1),'dmg',dmg,'spitFired',r2.spit,'bio+',r2.bio>0?'yes':'-','wormHp',r2.bhp,r2.bdead?'DEAD':'');
      if(r2.bdead)break;
      await p.evaluate(()=>{const q=__gameQA;if(q.zerg.bug)q.zerg.bug.hp=950;q.zerg.biomass=Math.max(q.zerg.biomass,50);});
    }
  }
  console.log('ERRORS',JSON.stringify(errs));
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
