// 探针 v32：核心口袋西/南测攻击位。①细网格可站性；②每点测爪击(J)与酸击(K)对核心的命中；③各点 4s 净承伤。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const GAME_URL='https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const p=await (await browser.newContext({viewport:{width:960,height:540}})).newPage();
  const errs=[];p.on('pageerror',e=>errs.push(e.message));
  await p.goto(GAME_URL,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
  await p.click('#btnZerg');
  await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
  await sleep(600);
  // 细网格：x -28..-6 步2，z -48..-34 步2
  const grid=await p.evaluate(()=>{
    const q=__gameQA,rows=[];
    for(let z=-48;z<=-34;z+=2){
      let row='';
      for(let x=-28;x<=-6;x+=2)row+=(!q.collideWalls(x,z,.95)&&!q.tooSteep(x,z))?'.':'#';
      rows.push({z,row});
    }
    return rows;
  });
  console.log('GRID x=-28..-6 step2 (header: -28 -26 -24 -22 -20 -18 -16 -14 -12 -10 -8 -6)');
  for(const r of grid)console.log(String(r.z).padStart(4),r.row.split('').join(' '));
  // 清守军 + 满血传送测试点
  await p.evaluate(()=>{const q=__gameQA;for(const m of q.monsters){if(m!==q.zerg.bug&&!m.dead){m.dead=true;if(m.mesh)m.mesh.visible=false;}}});
  await p.evaluate(async()=>{const q=__gameQA;for(let i=0;i<40&&(!q.zerg.bug||q.zerg.bug.dead);i++)await new Promise(r=>setTimeout(r,250));});
  const spots=[[-16,-46],[-16,-44],[-14,-44],[-14,-46],[-12,-46],[-16,-42],[-18,-42],[-20,-42],[-22,-42],[-16,-38],[-18,-38],[-20,-38],[-22,-36],[-24,-40]];
  for(const [sx,sz] of spots){
    const ok=await p.evaluate(([x,z])=>{const q=__gameQA;return !q.collideWalls(x,z,.95)&&!q.tooSteep(x,z);},[sx,sz]);
    if(!ok){console.log('SPOT',sx,sz,'stand=false');continue;}
    await p.evaluate(([x,z])=>{const q=__gameQA,b=q.zerg.bug;if(!b)return;b.mesh.position.set(x,q.groundY(x,z),z);b.hp=b.maxHp=950;q.zerg.biomass=Math.max(q.zerg.biomass,120);},[sx,sz]);
    await sleep(400);
    const st=await p.evaluate(()=>{const q=__gameQA,b=q.zerg.bug;return{bx:+b.mesh.position.x.toFixed(1),bz:+b.mesh.position.z.toFixed(1),baseHp:Math.round(q.base.hp),bhp:Math.round(b.hp)};});
    const dCore=Math.hypot(st.bx-(-12),st.bz-(-42));
    // 爪击测试：面向核心，J 两口
    await p.evaluate(([bx,bz])=>{const q=__gameQA,b=q.zerg.bug;q.setCamYaw(Math.atan2(q.base.pos.x-bx,q.base.pos.z-bz));q.zerg.clawCd=0;},[st.bx,st.bz]);
    await p.keyboard.press('KeyJ');await sleep(400);await p.keyboard.press('KeyJ');await sleep(900);
    const afterClaw=await p.evaluate(()=>({baseHp:Math.round(__gameQA.base.hp),bhp:Math.round(__gameQA.zerg.bug?__gameQA.zerg.bug.hp:0),dead:!__gameQA.zerg.bug||__gameQA.zerg.bug.dead}));
    const clawDmg=st.baseHp-afterClaw.baseHp;
    // 酸击测试
    await p.evaluate(()=>{const q=__gameQA;q.zerg.spitCd=0;if(q.zerg.bug)q.zerg.bug.hp=950;});
    await p.keyboard.press('KeyK');await sleep(1500);
    const afterAcid=await p.evaluate(()=>{const q=__gameQA;return{baseHp:Math.round(q.base.hp),bhp:Math.round(q.zerg.bug?q.zerg.bug.hp:0),dead:!q.zerg.bug||q.zerg.bug.dead,spit:q.zerg.spitCd>0};});
    const acidDmg=afterClaw.baseHp-afterAcid.baseHp;
    // 承伤 4s（不动作）
    await p.evaluate(()=>{const q=__gameQA;if(q.zerg.bug)q.zerg.bug.hp=950;});
    await sleep(4000);
    const dmg4=await p.evaluate(()=>{const q=__gameQA,b=q.zerg.bug;return{bhp:b?Math.round(b.hp):0,dead:!b||b.dead};});
    console.log('SPOT',sx+','+sz,'dCore='+dCore.toFixed(1),'claw',clawDmg,'acid',acidDmg+(afterAcid.spit?'(fired)':'(nofire)'),'dps4',((950-dmg4.bhp)/4).toFixed(0),dmg4.dead?'WORM-DEAD':'');
    if(afterAcid.dead||dmg4.dead){await p.evaluate(async()=>{const q=__gameQA;for(let i=0;i<40&&(!q.zerg.bug||q.zerg.bug.dead);i++)await new Promise(r=>setTimeout(r,250));});}
  }
  console.log('ERRORS',JSON.stringify(errs));
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
