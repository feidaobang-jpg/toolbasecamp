// Real Edge runtime and actual UI input. Accelerated QA fixtures are labeled;
// these checks do not represent physical-phone performance or human balance testing.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8917/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-tactics-v0.20.0/qa');
const results=[];
function check(name,ok,detail){results.push({name,ok:!!ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}`);}
(async()=>{
 fs.mkdirSync(path.join(out,'captures'),{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 try{
  for(const shape of ['desktop','landscape','portrait','compact']){
   const mobile=shape!=='desktop',viewport=shape==='desktop'?{width:1280,height:720}:shape==='landscape'?{width:844,height:390}:shape==='portrait'?{width:390,height:844}:{width:568,height:320};
   const context=await browser.newContext({viewport,hasTouch:mobile,isMobile:mobile});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
   await page.goto(url+(url.includes('?')?'&':'?')+'qa=1');await page.waitForFunction(()=>window.__gameQA&&window.__ccReady);
   await page.locator('#btnStart').click();await page.waitForFunction(()=>__gameQA.Game.state==='prep');
   await page.evaluate(()=>{
    const q=__gameQA;q.Game.state='paused';q.Game.pausedFrom='prep';q.clearEntities(false);q.Game.squadCount=4;
    ['gunner','assault','medic','engineer'].forEach((role,slot)=>{q.squadGear(slot).role=role;q.spawnSquad(slot);});
    q.Game.state='prep';q.tacticalPanel.open();
   });
   // Real button activation; portrait coordinates follow the game's rotated container.
   await page.locator('[data-squad-slot="0"][data-squad-order="defend"]').click();
   await page.locator('[data-squad-slot="1"][data-squad-order="follow"]').click();
   await page.locator('[data-squad-slot="2"][data-squad-order="follow"]').click();
   await page.locator('[data-squad-slot="3"][data-squad-order="defend"]').click();
   check(shape+'逐人指令与选中态',await page.evaluate(()=>{
    const q=__gameQA;return q.Game.squadGear.map(g=>g.order).join(',')==='defend,follow,follow,defend'&&document.querySelectorAll('#tacticalSquad [aria-pressed="true"]').length===4;
   }));
   const frozen=await page.evaluate(async()=>{const q=__gameQA;const pos=q.squad.map(s=>s.mesh.position.toArray()),gold=q.Game.gold;await new Promise(r=>setTimeout(r,350));return q.panelOpen&&q.Game.gold===gold&&JSON.stringify(pos)===JSON.stringify(q.squad.map(s=>s.mesh.position.toArray()));});
   check(shape+'部署时冻结本局',frozen);
   await page.locator('#squadAutoDefense').click();
   check(shape+'自动回防开关',await page.evaluate(()=>__gameQA.Game.squadAutoDefense===false));
   await page.locator('#tacticsClose').click();
   check(shape+'关闭回到本局',await page.evaluate(()=>!__gameQA.panelOpen&&__gameQA.Game.state==='prep'));
   await page.keyboard.press('Escape');await page.locator('#tacticsPause').focus();await page.keyboard.press('Enter');
   check(shape+'暂停菜单键盘进入',await page.locator('#tacticsPanel').isVisible());
   await page.locator('[data-squad-slot="0"][data-squad-order="follow"]').focus();await page.keyboard.press('Enter');
   check(shape+'键盘更改逐人指令',await page.evaluate(()=>__gameQA.squadGear(0).order==='follow'));
   await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await page.keyboard.press('Escape');
   check(shape+'返回保留暂停',await page.evaluate(()=>!__gameQA.panelOpen&&__gameQA.Game.state==='paused'));
   await page.evaluate(()=>{const q=__gameQA;q.tacticalPanel.open();q.tacticalPanel.render();});
   // Verify the panel scrolls and every button has a physical target >=44px.
   const geometry=await page.evaluate(()=>{
    const panel=document.getElementById('tacticsPanel'),stage=document.getElementById('stage');
    const scale=Math.hypot(new DOMMatrix(getComputedStyle(stage).transform).a,new DOMMatrix(getComputedStyle(stage).transform).b);
    const buttons=[...panel.querySelectorAll('button:not(.closeX)')];
    return {width:panel.clientWidth,height:panel.clientHeight,scrollHeight:panel.scrollHeight,minTarget:Math.min(...buttons.map(b=>Math.min(b.offsetWidth,b.offsetHeight)*scale)),overflow:getComputedStyle(panel).overflowY};
   });
   check(shape+'可滚动与触控目标',geometry.overflow==='auto'&&(!mobile||geometry.minTarget>=43),geometry);
   await page.screenshot({path:path.join(out,'captures',shape+'-tactics.png')});
   check(shape+'无脚本错误',errors.length===0,errors);
   await context.close();
  }
  const page=await browser.newPage({viewport:{width:1280,height:720}});await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  const behavior=await page.evaluate(()=>{
   const q=__gameQA;q.newGame(false);q.Game.state='paused';q.Game.pausedFrom='battle';q.clearEntities(false);q.Game.squadCount=4;
   ['gunner','assault','medic','engineer'].forEach((role,slot)=>{q.squadGear(slot).role=role;q.spawnSquad(slot);q.setSquadMemberTask(slot,[0,3].includes(slot)?'defend':'follow');});
   q.player.pos.set(0,q.groundY(0,120),120);q.player.mesh.position.copy(q.player.pos);
   q.squad.forEach((s,i)=>s.mesh.position.set((i-1.5)*3,q.groundY((i-1.5)*3,-25),-25));
   const threat=q.spawnMonster('mob',0,0,{quiet:true});threat.emerge=0;q.updSquad(.05);
   const manual=q.squad.map(s=>q.squadBehavior(s));threat.dead=true;
   for(let i=0;i<900;i++){q.updSquad(1/30);q.updSmartGate(1/30);}
   const positions=q.squad.map(s=>({slot:s.slot,z:s.mesh.position.z,gap:s.mesh.position.distanceTo(q.player.pos)}));
   const save=q.saveData(),valid=q.validateNormalSave(save,{weapons:q.WEAPONS,buildings:q.BUILDINGS,vehicles:q.VEHICLES});
   q.setSquadAutoDefense(false);save.squadAutoDefense=false;q.applySave(save);const restored=q.Game.squadGear.map(g=>g.order);
   const bad=JSON.parse(JSON.stringify(save));bad.squadGear[0].order='attack';const rejects=!q.validateNormalSave(bad,{weapons:q.WEAPONS,buildings:q.BUILDINGS,vehicles:q.VEHICLES});
   delete save.squadAutoDefense;save.squadOrder='defend';save.squadGear.forEach(g=>delete g.order);q.applySave(save);const legacy=q.squad.every(s=>q.squadBehavior(s)==='defend')&&q.Game.squadAutoDefense;
   q.setSquadTask('follow');const global=q.Game.squadGear.every(g=>g.order===null);
   return {manual,positions,valid,restored,rejects,legacy,global};
  });
  check('手动分工不被基地警报覆盖',behavior.manual.join(',')==='defend,follow,follow,defend',behavior);
  check('留守与出击实际分离',behavior.positions.filter(s=>[0,3].includes(s.slot)).every(s=>s.z<10)&&behavior.positions.filter(s=>[1,2].includes(s.slot)).every(s=>s.gap<15),behavior.positions);
  check('云存档验证、分工恢复与旧档迁移',behavior.valid&&behavior.rejects&&behavior.legacy&&behavior.restored.join(',')==='defend,follow,follow,defend',behavior);
  check('全队快捷指令统一分工',behavior.global);
  const waves=await page.evaluate(()=>{
   const q=__gameQA,rows=[];
   for(const difficulty of ['casual','normal','hard'])for(let level=1;level<=5;level++){
    q.newGame(false);q.clearEntities(false);q.Game.state='paused';q.Game.pausedFrom='battle';q.Game.difficulty=difficulty;q.Game.level=level;
    const before=q.tacticalPreview();q.startBattle();q.Game.state='paused';q.Game.pausedFrom='battle';
    const expected=q.Game.wave.plan.schedule;
    for(let i=0;i<expected.length;i++)q.updWave(3);
    const actual=q.monsters.filter(m=>m.waveEntry).map(m=>m.waveEntry);
    const types=[...new Set(actual.map(e=>e.species))],mouths=[...new Set(actual.map(e=>e.mouth))];
    rows.push({difficulty,level,preview:before.info,expected:expected.length,actual:actual.length,match:JSON.stringify(expected)===JSON.stringify(actual),types,mouths,supply:q.openingSupply(1,level,1)});
   }
   const later=q.tacticalWavePlan({difficulty:'normal',chapter:4,level:5,loop:1,queenKilled:false});
   const queen=q.tacticalWavePlan({difficulty:'normal',chapter:1,level:5,loop:1,queenKilled:true});
   return {rows,later:later.schedule.every(e=>e.species===3)&&!later.opening,queen:queen.schedule.length<rows.find(r=>r.level===5&&r.difficulty==='normal').expected};
  });
  check('三档难度前五关预告与实际出兵一致',waves.rows.every(r=>r.match),waves.rows);
  check('第三关酸液、第四关飞虫、第五关三路混合',waves.rows.filter(r=>r.difficulty==='normal').every(r=>r.level===3?r.types.includes(1):r.level===4?r.types.includes(3):r.level===5?r.types.includes(1)&&r.types.includes(3)&&r.mouths.length===3:true));
  check('后续章节虫种与母皇减压兼容',waves.later&&waves.queen);
  const report=await page.evaluate(()=>{
   const q=__gameQA;q.newGame(false);q.clearEntities(false);q.Game.squadCount=1;q.spawnSquad();q.startBattle();q.Game.state='paused';q.Game.pausedFrom='battle';
   q.damageBuilding(q.buildings[0],1e6);q.damageSquad(q.squad[0],1e6);q.Game.gold+=1000;q.upgradeWeapon('lmg');
   const before=q.Game.gold;q.levelWin();const report={...q.Game.lastBattle},after=q.Game.gold;q.levelWin();
   const save=q.saveData();return {report,valid:q.validateNormalSave(save,{weapons:q.WEAPONS,buildings:q.BUILDINGS,vehicles:q.VEHICLES}),noDouble:q.Game.gold===after,bonus:after-before};
  });
  check('战报记录真实损失与支出且奖励幂等',report.report.buildingLosses===1&&report.report.squadLosses===1&&report.report.spent>0&&report.valid&&report.noDouble,report);
  // Guaranteed income excludes optional wild mobs, elites, queen and side missions.
  const economy=await page.evaluate(()=>{const q=__gameQA;let gold=150;return [1,2,3,4,5].map(level=>{const plan=q.tacticalWavePlan({difficulty:'normal',chapter:1,level,loop:1,queenKilled:false});const drops=plan.schedule.reduce((sum,e)=>sum+(e.kind==='mob'?q.CHAPTERS[e.species].mob.gold:0),0),bonus=80+level*30+50;gold+=drops+bonus+q.openingSupply(1,level,1);return{level,gold,firstTwo:gold>=q.squadRole(0).price+q.SQUAD_ROLES.medic.price+250};});});
  check('第二关后固定收入足够两名不同兵种队友',economy[1].firstTwo,economy);
  await page.close();
 }finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({method:'Edge WebGL + actual button/keyboard input; accelerated behavior fixtures',physical_phone:false,results},null,2));}
 assert.ok(results.every(r=>r.ok),results.filter(r=>!r.ok).map(r=>r.name).join('\n'));
})().catch(e=>{console.error(e);process.exitCode=1;});
