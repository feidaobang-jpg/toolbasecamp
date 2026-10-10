// 虫潮对战实机验收：真实按键/点击走完整流程，校验规则、界面、退出恢复，以及电脑/手机视口与满负载帧时间。
// 用法：GAME_URL=http://127.0.0.1:8794/html/game/starship-defense/index.html node verify-versus.cjs
// 手机为视口模拟（触屏 + 移动 UA），不代表真机。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=process.env.PW||['D:/project/godot/absurd-3d-daily/node_modules/playwright','C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].find(p=>fs.existsSync(p));
const {chromium}=require(pw);
const url=process.env.GAME_URL||'http://127.0.0.1:8794/html/game/starship-defense/index.html';
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'qa','out','versus');
fs.mkdirSync(OUT,{recursive:true});
const results=[];const pass=(name,detail)=>{results.push({name,ok:true,detail});console.log('PASS',name,detail===undefined?'':JSON.stringify(detail));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MOBILE_UA='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
  try{
    /* ---------- 电脑：纯键盘流程 ---------- */
    const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
    const autoBefore=await p.evaluate(()=>localStorage.getItem('sst_save_auto'));
    await p.click('#btnVersus');
    assert.ok(await p.isVisible('#vsMenu'));assert.ok(!(await p.isVisible('#menuMain')));pass('主菜单进入对战菜单，主菜单隐藏');
    await sleep(300);
    const focused=await p.evaluate(()=>document.activeElement?.dataset?.vsAi);assert.equal(focused,'normal');
    await p.keyboard.press('Enter');
    await p.waitForFunction(()=>__gameQA.versus.state.active);
    const hud=await p.evaluate(()=>({top:getComputedStyle(document.getElementById('vsTop')).display,stat:getComputedStyle(document.getElementById('statLine')).display,hint:document.getElementById('keysHint').textContent,diff:__gameQA.versus.state.difficulty,ai:__gameQA.versus.seat('red0').ai}));
    assert.equal(hud.top,'flex');assert.equal(hud.stat,'none');assert.ok(hud.hint.includes('R 出兵面板'));assert.equal(hud.diff,'normal');assert.equal(hud.ai,'normal');
    pass('键盘 Enter 开始「对战电脑·普通」，对战 HUD 显示、战役 HUD 隐藏',hud);
    await p.screenshot({path:path.join(OUT,'desktop-start.png')});
    await p.keyboard.press('KeyR');await sleep(200);
    const panel=await p.evaluate(()=>({vis:!document.getElementById('vsPanel').classList.contains('hidden'),cards:document.querySelectorAll('#vsGrid .vs-card').length,first:document.querySelector('#vsGrid .vs-card b').textContent}));
    assert.ok(panel.vis);assert.equal(panel.cards,10);assert.ok(panel.first.includes('银行'));pass('R 打开出兵面板：银行 + 9 个兵种',panel);
    await p.keyboard.press('KeyZ');await sleep(100);assert.equal(await p.evaluate(()=>__gameQA.versus.seat('blue0').lane),'right');pass('Z 切换进攻路线到右路');
    await p.keyboard.press('Digit0');await sleep(150);
    const bank=await p.evaluate(()=>({bank:__gameQA.versus.seat('blue0').bank,gold:__gameQA.versus.seat('blue0').gold}));assert.equal(bank.bank,2);assert.ok(bank.gold<=100+30);pass('0 升级银行 Lv2，扣 500 金',bank);
    await p.keyboard.press('Digit1');await sleep(150);
    assert.equal(await p.evaluate(()=>__gameQA.versus.state.units.filter(u=>u.team==='blue').length),0);
    assert.ok((await p.textContent('#msg')).includes('准备阶段'));pass('准备阶段按 1 不能出兵并提示原因');
    await p.evaluate(()=>{const v=__gameQA.versus;v.state.time=21;v.seat('blue0').gold=3000;});
    await p.keyboard.press('Digit1');await sleep(200);
    const sent=await p.evaluate(()=>({n:__gameQA.versus.state.units.filter(u=>u.team==='blue').length,gold:Math.round(__gameQA.versus.seat('blue0').gold),side:Math.sign(__gameQA.versus.state.units.find(u=>u.team==='blue').path[3].x)}));
    assert.equal(sent.n,6);assert.ok(sent.gold<=2850+30);assert.equal(sent.side,-1);pass('开战后 1 派出 6 只小虫，走右路（蓝方右手=西路）',sent);
    await p.keyboard.press('Digit1');await sleep(150);assert.ok((await p.textContent('#msg')).includes('冷却'));pass('同一兵种冷却中不能连派');
    // 建造：L → 2 机枪塔 → 放置
    await p.keyboard.press('KeyL');await sleep(150);assert.equal(await p.evaluate(()=>document.querySelectorAll('#vsGrid .vs-card').length),6);
    await p.keyboard.press('Digit2');await sleep(300);
    const placing=await p.evaluate(()=>({kind:document.getElementById('placeName').textContent,panel:document.getElementById('vsPanel').classList.contains('hidden')}));
    assert.ok(placing.kind.includes('机枪塔'));assert.ok(placing.panel);
    const builtBefore=await p.evaluate(()=>__gameQA.buildings.filter(b=>b.team==='blue').length);
    await p.keyboard.press('KeyJ');await sleep(300);
    const built=await p.evaluate(()=>{const b=__gameQA.buildings.filter(b=>b.team==='blue');return {n:b.length,kind:b.at(-1)?.kind,hp:b.at(-1)?.maxHp,ring:!!b.at(-1)?.mesh.children.find(c=>c.userData.vsRing)};});
    assert.equal(built.n,builtBefore+1);assert.equal(built.kind,'mgTurret');assert.equal(built.hp,400);assert.ok(built.ring);pass('L→2→J 在本方半场造机枪塔（对战耐久 ×1.6，蓝色阵营环）',built);
    await p.keyboard.press('Escape');await sleep(150);
    // 越线建造被拒
    const cross=await p.evaluate(()=>__gameQA.versus.zoneReason('blue0','mgTurret',0,900-10));assert.ok(cross.includes('本方半场'));pass('中线 25 米以内不能建造',cross);
    // 买枪：O → 2 霰弹枪
    await p.keyboard.press('KeyO');await sleep(150);await p.keyboard.press('Digit2');await sleep(200);
    const gun=await p.evaluate(()=>({owned:__gameQA.Game.weapons.slice(),cur:__gameQA.Game.curWeapon}));assert.ok(gun.owned.includes('shotgun'));assert.equal(gun.cur,'shotgun');pass('O→2 买霰弹枪并换上',gun);
    await p.keyboard.press('KeyR');await sleep(100);await p.keyboard.press('KeyR');await sleep(100);
    assert.ok(await p.evaluate(()=>document.getElementById('vsPanel').classList.contains('hidden')));pass('再按 R 关闭面板');
    // 规则：友伤、英雄伤害系数、建筑打折、赏金
    const rules=await p.evaluate(()=>{const v=__gameQA.versus,s=v.state;const own=s.units.find(u=>u.team==='blue'),hp0=own.hp;v.damage(own,50,'blue','hero');
      const red=__gameQA.versus.heroOf('red');red.invulnerable=0;const r0=red.hp;v.damage(red,50,'blue','hero');
      v.send('red0','swarm');const ru=s.units.find(u=>u.team==='red');const g0=v.seat('blue0').gold;v.damage(ru,1e4,'blue','hero');
      const bd=__gameQA.buildings.find(b=>b.team==='blue');const b0=bd.hp;v.damage(bd,100,'red','hero');
      return {friendly:own.hp===hp0,heroTaken:Math.round(r0-red.hp),bounty:Math.round(v.seat('blue0').gold-g0),bldTaken:Math.round(b0-bd.hp)};});
    assert.ok(rules.friendly);assert.ok(rules.heroTaken>=30&&rules.heroTaken<=40);assert.equal(rules.bounty,6);assert.equal(rules.bldTaken,60);pass('无友伤 · 英雄受伤 ×0.8 · 小虫赏金 6 · 英雄打建筑 ×0.6',rules);
    // 炮塔自动开火：把红方小虫放到蓝方机枪塔旁
    await p.evaluate(()=>{const v=__gameQA.versus,s=v.state,bd=__gameQA.buildings.find(b=>b.team==='blue'&&b.kind==='mgTurret');for(const u of s.units.filter(u=>u.team==='red'&&!u.dead)){u.mesh.position.set(bd.mesh.position.x+6,0,bd.mesh.position.z+6);u.path=[{x:bd.mesh.position.x,z:bd.mesh.position.z}];u.pathIdx=0;}});
    await sleep(3000);
    const turret=await p.evaluate(()=>({alive:__gameQA.versus.state.units.filter(u=>u.team==='red'&&!u.dead).length,kills:__gameQA.versus.teamSummary('blue').kills}));
    assert.ok(turret.alive<5);pass('蓝方机枪塔自动射杀靠近的红方小虫',turret);
    // 胜负与结算
    await p.evaluate(()=>{const v=__gameQA.versus;v.damage(v.hq('red'),1e6,'blue','unit');});
    await p.waitForSelector('#vsResult:not(.hidden)');
    const res=await p.evaluate(()=>({title:document.getElementById('vsResultTitle').textContent,rows:document.querySelectorAll('#vsStats tr').length,note:document.getElementById('vsResultNote').textContent}));
    assert.ok(res.title.includes('胜利'));assert.ok(res.rows>=9);assert.ok(res.note.includes('普通'));pass('打掉红方核心 → 胜利结算与战绩',res);
    await p.screenshot({path:path.join(OUT,'desktop-result.png')});
    await sleep(300);await p.keyboard.press('Enter');
    await p.waitForFunction(()=>__gameQA.versus.state.active&&!__gameQA.versus.state.over&&__gameQA.versus.state.time<5);
    assert.ok(await p.evaluate(()=>document.getElementById('vsResult').classList.contains('hidden')));pass('结算界面 Enter 再来一局');
    // 暂停菜单
    await p.keyboard.press('Escape');await p.waitForSelector('#menuPause:not(.hidden)');
    const pause=await p.evaluate(()=>({sur:getComputedStyle(document.getElementById('vsSurrender')).display,save:getComputedStyle(document.getElementById('btnSaveMenu')).display,restart:document.getElementById('btnRestartLv').textContent}));
    assert.notEqual(pause.sur,'none');assert.equal(pause.save,'none');assert.ok(pause.restart.includes('对战'));pass('暂停菜单：有投降、无存档、显示重开对战',pause);
    await p.click('#vsSurrender');await sleep(200);assert.ok((await p.textContent('#msg')).includes('后才能投降'));pass('5:00 前不能投降');
    // 退出恢复
    await p.click('#btnQuit');await p.waitForSelector('#menuMain:not(.hidden)');
    const back=await p.evaluate(()=>({active:__gameQA.versus.state.active,arena:!!__gameQA.fortress&&!!document,ground:__gameQA.groundMesh.visible,weapons:__gameQA.Game.weapons.slice(),blue:!!document.querySelector('#stage.versus-mode'),auto:localStorage.getItem('sst_save_auto')}));
    assert.ok(!back.active);assert.ok(back.ground);assert.ok(!back.blue);assert.equal(back.auto,autoBefore);pass('回主菜单：退出对战、原战场恢复、单机自动存档未被改动',{weapons:back.weapons});
    // 再开战役确认不受影响
    await p.evaluate(()=>__gameQA.newGame(false));await sleep(500);
    const camp=await p.evaluate(()=>({state:__gameQA.Game.state,base:Math.round(__gameQA.player.pos.z),bld:__gameQA.buildings.filter(b=>b.team).length}));
    assert.equal(camp.state,'prep');assert.equal(camp.bld,0);pass('之后开始战役：回到原基地，没有对战残留',camp);
    /* ---------- 满负载帧时间 ---------- */
    await p.evaluate(()=>{__gameQA.startVersusAI('hard');});await sleep(800);
    const load=await p.evaluate(async()=>{const q=__gameQA,v=q.versus,s=v.state;s.time=400;
      for(const team of ['blue','red']){const pid=team+'0',t=v.seat(pid);t.gold=1e6;t.ai=null;t.aiState=null;
        for(let i=0;i<16;i++){const kinds=['mgTurret','cannonTurret','teslaTurret','antiAir','wall'];const p=v.world(team,-60+(i%8)*16,-30-Math.floor(i/8)*12);v.build(pid,kinds[i%5],p.x,p.z,0);}
        for(const id of ['swarm','gunners','assault','carapace','flyers','bombers']){t.cd={};v.send(pid,id,'left');}}
      const blue=s.units.filter(u=>u.team==='blue').length,red=s.units.filter(u=>u.team==='red').length;
      q.player.pos.set(0,0,900);q.startMeasure();await new Promise(r=>setTimeout(r,6000));const m=q.endMeasure();delete m.raw;
      return {blue,red,buildings:q.buildings.length,fps:Math.round(m.averageFPS),p95:Math.round(m.p95Ms),over50:m.over50ms,draws:m.drawCalls,tris:m.triangles,quality:m.quality,renderer:m.renderer};});
    pass('电脑满负载帧时间（双方单位 + 32 座设施，实时 6 秒）',load);
    await p.screenshot({path:path.join(OUT,'desktop-load.png')});
    assert.deepEqual(errors,[]);pass('电脑端无脚本报错');
    await p.close();
    /* ---------- 手机视口：横屏 ---------- */
    for(const [w,h,name] of [[844,390,'landscape'],[390,844,'portrait']]){
      const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,userAgent:MOBILE_UA,deviceScaleFactor:2});
      const m=await ctx.newPage(),merr=[];m.on('pageerror',e=>merr.push(e.message));
      await m.goto(url+'?qa=1');await m.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
      await m.tap('#btnVersus');await m.tap('[data-vs-ai="easy"]');await m.waitForFunction(()=>__gameQA.versus.state.active);await sleep(500);
      const ui=await m.evaluate(()=>{const r=id=>{const e=document.getElementById(id),b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height),vis:getComputedStyle(e).display!=='none'&&!e.classList.contains('hidden')};};
        return {touch:__gameQA.isTouch,vR:r('vR'),vH:r('vH'),vO:r('vO'),vL:r('vL'),top:r('vsTop')};});
      assert.ok(ui.touch);assert.ok(ui.vR.vis);assert.ok(!ui.vH.vis);pass(name+'：触屏显示「出兵」按钮、隐藏医疗',ui);
      await m.tap('#vR');await sleep(300);
      const lay=await m.evaluate(()=>{const R=e=>e.getBoundingClientRect(),panel=R(document.getElementById('vsPanel'));
        const hit=['joyBase','vJ','vK','vU','vI','vX','vSPRINT','vO','vL','vR'].filter(id=>{const b=R(document.getElementById(id));if(!b.width)return false;return !(b.right<=panel.left||b.left>=panel.right||b.bottom<=panel.top||b.top>=panel.bottom);});
        return {open:!document.getElementById('vsPanel').classList.contains('hidden'),overlap:hit,cards:document.querySelectorAll('#vsGrid .vs-card').length};});
      assert.ok(lay.open);assert.deepEqual(lay.overlap,[]);pass(name+'：出兵面板不遮挡摇杆和动作键',lay);
      const g0=await m.evaluate(()=>__gameQA.versus.seat('blue0').gold);
      await m.tap('#vsGrid .vs-card >> nth=0');await sleep(300);
      const g1=await m.evaluate(()=>({gold:__gameQA.versus.seat('blue0').gold,bank:__gameQA.versus.seat('blue0').bank}));
      assert.equal(g1.bank,2);assert.ok(g1.gold<g0);pass(name+'：点卡片升级银行',g1);
      await m.screenshot({path:path.join(OUT,'mobile-'+name+'.png')});
      await m.tap('#vsClose');await sleep(200);assert.ok(await m.evaluate(()=>document.getElementById('vsPanel').classList.contains('hidden')));pass(name+'：✕ 关闭面板');
      assert.deepEqual(merr,[]);await ctx.close();
    }
  }finally{await b.close();}
  fs.writeFileSync(path.join(OUT,'verify-versus.json'),JSON.stringify({url,at:new Date().toISOString(),results},null,1));
  console.log('ALL PASS',results.length);
})().catch(e=>{console.error('FAIL',e);fs.writeFileSync(path.join(OUT,'verify-versus.json'),JSON.stringify({url,at:new Date().toISOString(),results,failure:String(e.stack||e)},null,1));process.exit(1);});
