// 量化战役武器表各把枪的真实输出，用于判断削弱对象与幅度。
// 走浏览器内 __gameQA 接口，按 game.js 玩家开火处的真实伤害公式发射，
// 命中判定、贯穿与爆炸都使用游戏自身代码，不在脚本里另算一套数学。
// 用法：GAME_URL=http://127.0.0.1:8931/html/game/starship-defense/index.html QA_OUTPUT=<目录> node verify-weapon-balance.cjs
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8931/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-weapon-balance/qa');
// 测量窗口：5 秒持续输出，够让光束灼热叠满（heat 上限 1 需 1.5 秒）。
const WINDOW=5,TARGETS=6,UPGRADES=[0,10];
// 密集靶环半径：大于单靶命中半径（约 1.25–1.55），使 0° 那个靶落在中心靶正后方，
// 光束贯穿能真实吃到第二个目标；同时环内间距让爆炸半径 2.4–5 的武器覆盖到多数靶。
const RADIUS=2;
async function run(){
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  const results=[];
  try{
    const context=await browser.newContext({viewport:{width:1280,height:720}});
    // 播种 Math.random：散布与爆炸命中都依赖它，不播种会让集群秒伤逐次漂移，
    // 同一份代码测出两个数字（未改动的等离子炮就曾测到 2556 与 2160）。
    // 与 capture-squad-ops.cjs 同一写法；seedReset 供每次测量前复位随机流。
    await context.addInitScript(()=>{
      let seed=814;
      const next=()=>(seed=(1664525*seed+1013904223)>>>0)/4294967296;
      Math.random=next;
      window.__seedReset=()=>{seed=814;};
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
    await page.goto(url+'?qa=1');
    await page.waitForFunction(()=>window.__gameQA&&window.__ccReady);
    await page.locator('#btnStart').click();
    await page.waitForFunction(()=>__gameQA.Game.state==='prep');
    const data=await page.evaluate(async({WINDOW,TARGETS,UPGRADES,RADIUS})=>{
      const q=window.__gameQA;
      // 医疗兵无专精加成，classDamage 恒为 1，横向比较各武器时口径一致。
      // 自动瞄准 + 按住开火：让 updPlayer 走玩家真实的射击路径。
      q.Game.cls='medic';q.Game.state='paused';q.AudioSys.muted=true;
      q.CombatControls.set('aim','auto');q.CombatControls.set('fire','hold');
      const rows={};
      // 靶子排在 z=22 同一线上（距离玩家 12 米，射程最短的火焰喷射器也够得着）。
      const pz=10,tz=22,mid=Math.floor(TARGETS/2);
      q.player.pos.set(0,q.groundY(0,pz),pz);q.player.mesh.position.copy(q.player.pos);
      q.setCamYaw(0);q.setCamMode('third',false);
      /** 摆一组静态靶子：血量拉满到不可能被打死，保证整段窗口都在输出同一群目标。
       *  spread 大＝横向拉开（量纯单体）；spread 小＝密集圆群（量爆炸与贯穿收益）。
       *  密集群用「中心 1 个 + 环形 5 个」，其中 0° 与中心同在 x=0 弹道线上，
       *  光束的 pierce 因此能真正吃到第二个目标，不会把集群测成单体。 */
      function cluster(spread){
        q.clearEntities(true);
        const list=[];
        const dense=spread<RADIUS*2;
        for(let i=0;i<TARGETS;i++){
          let x,z;
          if(dense){
            if(i===0){x=0;z=tz;}
            else{const a=(i-1)*2*Math.PI/(TARGETS-1);x=RADIUS*Math.sin(a);z=tz+RADIUS*Math.cos(a);}
          }else{x=(i-mid)*spread;z=tz;}
          const m=q.spawnMonster('mob',x,z,{quiet:true});
          m.hp=m.maxHp=1e7;m.emerge=0;m.speed=0;m.fly=false;m.atkCd=99;m.spitCd=99;
          m.mesh.position.set(x,q.groundY(x,z),z);list.push(m);
        }
        return list;
      }
      /** 打满 WINDOW 秒并返回造成的总伤害。
       *  不在脚本里重抄伤害公式：直接按住 J 驱动游戏自身的 updPlayer 开火路径，
       *  射速、灼热累积、自动瞄准、抛物线落点、贯穿与爆炸全部走真实代码，
       *  这样以后调数值时脚本不会静默沿用旧公式而测错。 */
      function measure(id,lv,spread){
        // 每把枪都从同一条随机序列开始，否则先测的武器会消耗掉随机流，横向比较不公平。
        window.__seedReset();
        const ms=cluster(spread);
        q.Game.weaponLv={[id]:lv};
        if(!q.Game.weapons.includes(id))q.Game.weapons.push(id);
        q.Game.curWeapon=id;
        q.Game.state='battle';
        q.player.pos.set(0,q.groundY(0,pz),pz);q.player.mesh.position.copy(q.player.pos);
        q.player.fireCd=0;q.player.heat=0;q.player.burstLeft=0;q.player.dead=false;
        q.CombatControls.press('KeyJ'); // 按住射击键，等价于玩家全程按住 J
        const before=ms.reduce((s,m)=>s+m.hp,0);
        const DT=1/60,steps=Math.round(WINDOW/DT);
        for(let s=0;s<steps;s++){q.updPlayer(DT);q.updBullets(DT);}
        q.CombatControls.release('KeyJ');
        for(let s=0;s<180;s++)q.updBullets(DT); // 收尾：让仍在飞的弹丸结算完
        const dealt=before-ms.reduce((s,m)=>s+m.hp,0);
        q.Game.weaponLv={};
        return {dealt,hitCount:ms.filter(m=>m.hp<m.maxHp).length};
      }
      for(const id of Object.keys(q.WEAPONS)){
        const w=q.WEAPONS[id];
        rows[id]={name:w.name,price:w.price,range:w.range,rate:w.rate,
          beam:!!w.beam,pierce:w.pierce||0,explode:w.explode||0,pellets:w.pellets||1,burst:w.burst||1,
          tableDps:q.weaponDps(id),solo:{},cluster:{},efficiency:{}};
        for(const lv of UPGRADES){
          // 单体：靶子间距 40 米，爆炸与贯穿都吃不到邻居，量纯单体秒伤。
          const s=measure(id,lv,40),c=measure(id,lv,RADIUS);
          rows[id].solo['lv'+lv]={dps:+(s.dealt/WINDOW).toFixed(1),targetsHit:s.hitCount};
          rows[id].cluster['lv'+lv]={dps:+(c.dealt/WINDOW).toFixed(1),targetsHit:c.hitCount};
          rows[id].efficiency['lv'+lv]={price:w.price,dpsPerGold:w.price?+((c.dealt/WINDOW)/w.price).toFixed(4):null};
        }
      }
      q.clearEntities(true);
      return {rows,window:WINDOW,targets:TARGETS,upgrades:UPGRADES,radius:RADIUS};
    },{WINDOW,TARGETS,UPGRADES,RADIUS});
    results.push({check:'所有武器在单体与集群靶上都造成伤害',pass:true,data});
    for(const [id,r] of Object.entries(data.rows)){
      assert.ok(r.solo.lv0.dps>0||r.beam,id+' 应造成单体伤害');
      assert.ok(r.cluster.lv0.targetsHit>0,id+' 应命中集群靶');
    }
    const ranked=Object.entries(data.rows).map(([id,r])=>({id,name:r.name,dps:r.cluster.lv10.dps,price:r.price}))
      .sort((a,b)=>b.dps-a.dps);
    results.push({check:'Lv10 集群秒伤排名',pass:true,data:ranked});
    // 设计意图：等离子炮自称「最高秒伤的重型弹」，单体秒伤必须仍排第一；
    // 激光炮削弱后不得再反超它，否则又回到 v0.33.1 那种定位错位。
    const soloTop=Object.entries(data.rows).map(([id,r])=>({id,dps:r.solo.lv10.dps})).sort((a,b)=>b.dps-a.dps);
    results.push({check:'等离子炮仍为最高单体秒伤',pass:soloTop[0].id==='plasma',data:soloTop.slice(0,3)});
    assert.equal(soloTop[0].id,'plasma','等离子炮应保持最高单体秒伤，实测：'+JSON.stringify(soloTop.slice(0,3)));
    assert.ok(data.rows.laser.solo.lv10.dps>data.rows.lmg.solo.lv10.dps*1.5,
      '激光炮削弱后仍应显著强于免费机枪，否则削弱过头');
    // HUD 灼热百分比必须与「实际打出的伤害加成」同比例。
    // 不从 desc 文本反推（那是循环验证：改了伤害代码忘改文案也会通过），
    // 而是各测一发冷枪与满灼热枪，用真实伤害比对照 HUD 显示的数字。
    const heat=await page.evaluate(async()=>{
      const q=window.__gameQA;
      q.Game.cls='medic';q.Game.state='battle';
      // 与前面伤害测量同一站位：玩家 z=10，靶子 z=22（距离 12 米）。
      const pz=10,tz=22;
      if(!q.Game.weapons.includes('laser'))q.Game.weapons.push('laser');
      q.Game.curWeapon='laser';q.Game.weaponLv={};
      q.player.pos.set(0,q.groundY(0,pz),pz);q.player.mesh.position.copy(q.player.pos);
      q.setCamYaw(0);q.setCamMode('third',false);
      q.CombatControls.set('aim','auto');q.CombatControls.set('fire','hold');
      /** 在指定灼热值下发一发光束，返回实际造成的伤害。 */
      function oneShot(heatValue){
        window.__seedReset();
        q.clearEntities(true);
        const m=q.spawnMonster('mob',0,tz,{quiet:true});
        m.hp=m.maxHp=1e7;m.emerge=0;m.speed=0;m.fly=false;m.atkCd=99;m.spitCd=99;
        m.mesh.position.set(0,q.groundY(0,tz),tz);
        q.player.heat=heatValue;q.player.fireCd=0;q.player.dead=false;
        const before=m.hp;
        q.CombatControls.press('KeyJ');q.updPlayer(1/60);q.CombatControls.release('KeyJ');
        for(let i=0;i<60;i++)q.updBullets(1/60);
        return before-m.hp;
      }
      const cold=oneShot(0);
      // 按住 J 2.5 秒让灼热叠满（heat += dt/1.5，上限 1），期间不断射击。
      q.player.heat=0;q.player.fireCd=0;q.CombatControls.press('KeyJ');
      for(let i=0;i<150;i++){q.updPlayer(1/60);q.updBullets(1/60);}
      q.CombatControls.release('KeyJ');
      q.updHUD(0);
      const hot=oneShot(1);
      const text=document.getElementById('weapTxt').textContent;
      const shown=Number((text.match(/🔥(\d+)%/)||[])[1]);
      const actual=Math.round((hot/cold-1)*100);
      q.clearEntities(true);q.Game.curWeapon='lmg';q.player.heat=0;q.Game.weaponLv={};
      return {cold:+cold.toFixed(2),hot:+hot.toFixed(2),actualBonusPct:actual,shown,hudText:text};
    });
    results.push({check:'HUD 灼热百分比与实际伤害加成一致',pass:heat.shown===heat.actualBonusPct,data:heat});
    assert.equal(heat.shown,heat.actualBonusPct,
      'HUD 灼热显示应与实际伤害加成一致（冷枪 '+heat.cold+' → 满灼热 '+heat.hot+'）：'+JSON.stringify(heat));
    assert.ok(heat.actualBonusPct>0&&heat.actualBonusPct<=50,'灼热加成应在合理区间，实测 '+heat.actualBonusPct+'%');
    fs.writeFileSync(path.join(out,'weapon-balance.json'),JSON.stringify({results,errors},null,2));
    console.log('=== 设计意图 ===');
    console.log('单体秒伤前三：',soloTop.slice(0,3).map(s=>s.id+'='+s.dps).join(', '));
    console.log('激光灼热：冷枪 '+heat.cold+' → 满灼热 '+heat.hot+'（实际 +'+heat.actualBonusPct+'%，HUD 显示 '+heat.shown+'%）');
    console.log('=== Lv10 集群 DPS 排名（中心+环'+RADIUS+'米，'+TARGETS+'靶）===');
    for(const r of ranked)console.log(String(r.dps).padStart(8),r.name,'（'+r.price+' 金）',r.id);
    console.log('=== Lv10 单体 DPS ===');
    for(const [id,r] of Object.entries(data.rows))console.log(String(r.solo.lv10.dps).padStart(8),r.name);
    console.log('errors:',errors.length?errors:'none');
  }finally{await browser.close();}
  return results;
}
run().then(r=>{console.log('checks:',r.length);}).catch(e=>{console.error(e);process.exit(1);});
