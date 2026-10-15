// 虫潮规模×3 与"准备阶段不再刷野怪"的行为回归（0.39.1，玩家反馈：怪出多点）
// 真实浏览器：只读地检查准备阶段布怪、波次数量、掉落金币、出怪间隔下限与同屏上限。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8931/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-swarm-scale-v0.39.1/qa');
const results=[];
const pass=(name,detail)=>{results.push({name,ok:true,detail});console.log('PASS',name,detail===undefined?'':JSON.stringify(detail));};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 const context=await browser.newContext({viewport:{width:1280,height:720}});
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(30000);
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
 await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__gameQA&&window.__ccReady);

 const prep=await page.evaluate(()=>{
  const q=__gameQA,V=3;
  q.newGame(false);q.Game.chapter=1;q.Game.level=1;q.startPrep();q.updHUD(.05);
  const home=q.monsters.filter(m=>m.home),stray=q.monsters.filter(m=>!m.home);
  const hud=document.getElementById('waveTxt').textContent;
  const preview=q.tacticalPreview();
  q.Game.state='paused';
  // 第 5 关同样检查，避免只在第一关成立
  q.Game.level=5;q.startPrep();q.Game.state='paused';
  const strayL5=q.monsters.filter(m=>!m.home).length;
  q.Game.level=1;q.startPrep();q.Game.state='paused';
  const baseline=q.campaignWaveCount('normal',1,1,1,false);
  q.startBattle();
  const total=q.Game.wave.total,scheduled=q.Game.wave.plan.schedule.length,live=q.monsters.filter(m=>!m.dead&&!m.home).length;
  return {scale:q.SWARM_SCALE,goldMul:q.swarmGoldMul(),home:home.length,queen:home.filter(m=>m.kind==='queen').length,
   guards:home.filter(m=>m.kind!=='queen').length,stray:stray.length,strayL5,hud,preview:preview.info,
   baseline,total,scheduled,live,cap:q.monsterCap(),touch:q.isTouch};
 });
 assert.equal(prep.scale,3,'SWARM_SCALE 默认 3 倍');
 assert.equal(prep.stray,0,'准备阶段前中场不再散布野怪');
 assert.equal(prep.strayL5,0,'第 5 关准备阶段同样没有野怪');
 assert.equal(prep.queen,1,'虫巢母皇保留');assert.equal(prep.guards,5,'老巢护卫保留');
 assert.ok(prep.hud.includes('本关虫潮')&&!prep.hud.includes('野怪'),prep.hud);
 assert.ok(!prep.preview.includes('野怪'),prep.preview);
 assert.equal(prep.total,prep.scheduled,'开战后本关虫潮全部来自虫洞出兵表');
 assert.equal(prep.baseline,11*prep.scale,'第一章第一关普通：原 11 只 ×3');
 assert.equal(prep.total,prep.baseline,'开战虫潮数与预告一致');
 assert.equal(prep.cap,144,'电脑单机同屏上限 48×3');assert.equal(prep.touch,false);
 pass('准备阶段只剩母巢、虫潮×3 与预告一致',prep);

 const economy=await page.evaluate(()=>{
  const q=__gameQA;q.clearEntities(false);q.Game.state='paused';q.Game.wave.done=false;
  const w=q.Game.wave;let spawned=0;
  // 精英是按概率随虫潮表 roll 的，多步几次直到出一只普通小兵，避免单步抽样偶发拿到精英导致抖动
  for(let i=0;i<24;i++){w.timer=0;const before=w.spawned;q.updWave(1);spawned+=w.spawned-before;
   if(q.monsters.some(m=>m.waveEntry&&m.kind==='mob'&&!m.elite))break;}
  const wave=q.monsters.filter(m=>m.waveEntry);
  const waveMob=wave.find(m=>m.kind==='mob'&&!m.elite),waveElite=wave.find(m=>m.kind==='mob'&&m.elite);
  const plain=q.spawnMonster('mob',0,100,{quiet:true}); // 不经虫潮表：副本、测试台等仍按原值
  const out={waveGold:waveMob&&waveMob.gold,plainGold:plain.gold,eliteGold:waveElite&&waveElite.gold,
   interval:q.campaignSpawnInterval('normal',1,1,1),spawned};
  q.clearEntities(false);return out;
 });
 assert.ok(economy.waveGold>=1&&economy.plainGold>=1,economy);
 assert.equal(economy.waveGold,Math.max(1,Math.round(economy.plainGold*Math.sqrt(1/3))),'虫潮小兵掉落到约 58%');
 assert.ok(Math.abs(economy.interval-2.05/Math.sqrt(3))<1e-9,economy.interval);
 pass('虫潮掉落回落、间隔按 √3 收紧',economy);

 const floors=await page.evaluate(()=>{const q=__gameQA,vals=[];
  for(const ch of [1,5,10])for(const lv of [1,5,10])for(const loop of [1,2,3]){
   const casual=q.campaignSpawnInterval('casual',ch,lv,loop),normal=q.campaignSpawnInterval('normal',ch,lv,loop),hard=q.campaignSpawnInterval('hard',ch,lv,loop);
   vals.push({casual,normal,hard,ordered:casual>normal&&normal>hard});
  }
  const counts=[];for(const ch of [1,5,10])for(const lv of [1,5,10])counts.push(q.campaignWaveCount('normal',ch,lv,1,false));
  return {minInterval:Math.min(...vals.map(v=>v.hard)),maxInterval:Math.max(...vals.map(v=>v.casual)),unordered:vals.filter(v=>!v.ordered).length,minCount:Math.min(...counts),maxCount:Math.max(...counts)};});
 assert.equal(floors.unordered,0,'三档难度的出怪间隔仍按休闲>普通>困难');
 assert.ok(floors.minInterval>=.35/Math.sqrt(3)-1e-9&&floors.maxCount>=100,floors);
 pass('后期出怪间隔有下限、三档顺序不变、波次随章节放大',floors);

 const capGate=await page.evaluate(()=>{
  const q=__gameQA;q.newGame(false);q.clearEntities(false);q.startBattle();q.Game.state='battle';
  const cap=q.monsterCap();
  for(let i=0;i<cap+20;i++){const m=q.spawnMonster('mob',(i%10-4.5)*4,90+Math.floor(i/10)*4,{quiet:true});m.hp=m.maxHp=1e7;m.emerge=0;}
  const atCap=q.monsters.length,before=q.Game.wave.spawned;q.Game.wave.timer=0;
  for(let i=0;i<10;i++){q.Game.wave.timer=0;q.updWave(3);}
  const after=q.Game.wave.spawned,live=q.monsters.length;
  q.clearEntities(false);q.Game.state='prep';
  return {cap,atCap,before,after,live};
 });
 assert.equal(capGate.after,capGate.before,'同屏达到上限时暂停出兵，不无限堆怪');
 assert.equal(capGate.live,capGate.atCap,'超过上限的场上虫不会被继续叠加');
 pass('同屏上限真正拦住出怪',capGate);

 const touchCap=await page.evaluate(()=>{const q=__gameQA;q.setDeviceMode('touch');const cap=q.monsterCap();q.setDeviceMode('auto');return {cap,touch:q.isTouch};});
 assert.equal(touchCap.cap,80,'手机同屏上限 80');
 pass('手机同屏上限收紧',touchCap);

 assert.deepEqual(errors,[],'page errors');
 await browser.close();
 fs.mkdirSync(out,{recursive:true});
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({method:'Headless Edge；qa=1 钩子只读检查准备阶段布怪、波次表、掉落金币、出怪间隔与同屏上限',scale:3,results},null,2));
 console.log('ALL PASS',results.length,'项');
})().catch(e=>{console.error(e);process.exitCode=1;});
