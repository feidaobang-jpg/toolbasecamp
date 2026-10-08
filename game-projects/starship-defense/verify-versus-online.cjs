// 虫潮对战联机验收：两个浏览器走真实联机大厅（建对战房 → 邀请码加入 → 准备 → 开始），
// 校验客人的出兵 / 建造 / 银行 / 买枪经房主执行并同步回来、胜负双方结算、再来一局、客人掉线电脑接管。
// 需要本地联机服务（ws://127.0.0.1:8792）或在 GAME_URL 指向线上时使用线上服务。
// 用法：GAME_URL=http://127.0.0.1:8794/html/game/starship-defense/index.html node verify-versus-online.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=process.env.PW||['D:/project/godot/absurd-3d-daily/node_modules/playwright','C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].find(p=>fs.existsSync(p));
const {chromium}=require(pw);
const url=process.env.GAME_URL||'http://127.0.0.1:8794/html/game/starship-defense/index.html';
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'qa','out','versus');
fs.mkdirSync(OUT,{recursive:true});
const results=[];const pass=(name,detail)=>{results.push({name,ok:true,detail});console.log('PASS',name,detail===undefined?'':JSON.stringify(detail));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  try{
    const hc=await b.newContext({viewport:{width:1280,height:720}}),gc=await b.newContext({viewport:{width:1280,height:720}});
    const host=await hc.newPage(),guest=await gc.newPage(),errors=[];
    host.on('pageerror',e=>errors.push('host:'+e.message));guest.on('pageerror',e=>errors.push('guest:'+e.message));
    await host.goto(url+'?qa=1&test=1');await host.waitForFunction(()=>window.__gameQA&&window.__ccReady&&window.__COOP_QA__,null,{timeout:60000});
    await host.click('#btnVersus');await host.click('#vsOnline');
    await host.waitForSelector('.coop-panel:not([hidden])');
    const cap=await host.evaluate(()=>{const s=document.querySelector('.coop-panel [data-field="capacity"]');return {value:s.value,disabled:s.disabled};});
    assert.equal(cap.value,'2');assert.ok(cap.disabled);pass('对战菜单 → 好友对战：大厅人数固定 2 人',cap);
    await host.fill('.coop-panel [data-field="name"]','房主');await host.click('.coop-panel [data-do="create"]');
    await host.waitForFunction(()=>window.__COOP_QA__.connection.room?.code,null,{timeout:15000});
    const room=await host.evaluate(()=>({code:__COOP_QA__.connection.room.code,max:__COOP_QA__.connection.room.maxPlayers,mode:__COOP_QA__.connection.room.settings.mode}));
    assert.equal(room.max,2);assert.equal(room.mode,'versus');pass('创建对战房间：服务器记为 versus、上限 2 人',room);
    await guest.goto(url+'?qa=1&test=1&coop='+room.code);await guest.waitForFunction(()=>window.__gameQA&&window.__ccReady&&window.__COOP_QA__,null,{timeout:60000});
    await guest.waitForFunction(()=>window.__COOP_QA__.connection.room,null,{timeout:15000});
    const listed=await guest.evaluate(()=>[...document.querySelectorAll('.coop-rooms li span')].map(e=>e.textContent).join(' | '));
    pass('客人通过邀请码进入房间',{listed});
    await guest.click('.coop-panel [data-do="ready"]');
    await host.waitForFunction(()=>__COOP_QA__.connection.room.players.length===2&&__COOP_QA__.connection.room.players.every(p=>p.ready),null,{timeout:15000});
    await host.click('.coop-panel [data-do="start"]');
    await host.waitForFunction(()=>__gameQA.versus.state.active,null,{timeout:15000});await guest.waitForFunction(()=>__gameQA.versus.state.active,null,{timeout:15000});
    await sleep(1500);
    const roles=await Promise.all([host,guest].map(p=>p.evaluate(()=>({role:__gameQA.versus.state.role,team:__gameQA.versus.state.localTeam,player:__gameQA.versus.state.local.team,mode:__gameQA.versus.state.mode}))));
    assert.equal(roles[0].role,'host');assert.equal(roles[0].team,'blue');assert.equal(roles[1].role,'guest');assert.equal(roles[1].team,'red');
    pass('开局：房主蓝方计算整局，客人红方',roles);
    // 跳过准备阶段，给双方加钱
    await host.evaluate(()=>{const v=__gameQA.versus;v.state.time=21;v.team('red').gold=5000;v.team('blue').gold=5000;});await sleep(500);
    // 客人：出兵
    await guest.keyboard.press('KeyR');await sleep(200);await guest.keyboard.press('Digit1');
    await host.waitForFunction(()=>__gameQA.versus.state.units.filter(u=>u.team==='red').length>=6,null,{timeout:8000});
    await guest.waitForFunction(()=>[...__gameQA.versus.state.guestUnits.values()].filter(g=>g.team==='red').length>=6,null,{timeout:8000});
    pass('客人按 R→1：房主那边派出红方小虫，客人画面同步看到');
    // 客人：升级银行、换路线、买枪
    await guest.keyboard.press('Digit0');await guest.keyboard.press('KeyZ');await sleep(200);
    await guest.keyboard.press('KeyO');await sleep(200);await guest.keyboard.press('Digit2');
    await host.waitForFunction(()=>{const v=__gameQA.versus;return v.team('red').bank===2&&v.team('red').lane==='right'&&v.heroOf('red').vsWeapons.includes('shotgun');},null,{timeout:8000});
    await guest.waitForFunction(()=>__gameQA.Game.weapons.includes('shotgun')&&__gameQA.versus.team('red').bank===2,null,{timeout:8000});
    pass('客人升级银行、切换路线、买霰弹枪：房主核验后执行并同步');
    // 客人：建造（在红方半场正前方）
    await guest.keyboard.press('KeyL');await sleep(200);await guest.keyboard.press('Digit2');await sleep(500);await guest.keyboard.press('KeyJ');
    await host.waitForFunction(()=>__gameQA.buildings.some(b=>b.team==='red'&&b.kind==='mgTurret'),null,{timeout:8000});
    await guest.waitForFunction(()=>__gameQA.buildings.some(b=>b.team==='red'&&b.kind==='mgTurret'&&b.vsType==='building'),null,{timeout:8000});
    pass('客人 L→2→J 建机枪塔：房主放置为红方设施，客人看到阵营环');
    await guest.keyboard.press('Escape');
    // 房主出兵，客人看到
    await host.keyboard.press('KeyR');await sleep(150);await host.keyboard.press('Digit2');
    await guest.waitForFunction(()=>[...__gameQA.versus.state.guestUnits.values()].some(g=>g.team==='blue'&&g.prof==='gunner'),null,{timeout:8000});
    pass('房主派机枪小队，客人画面同步');
    await host.screenshot({path:path.join(OUT,'online-host.png')});await guest.screenshot({path:path.join(OUT,'online-guest.png')});
    // 胜负：打掉红方核心
    await host.evaluate(()=>{const v=__gameQA.versus;v.damage(v.hq('red'),1e6,'blue','unit');});
    await host.waitForSelector('#vsResult:not(.hidden)');await guest.waitForSelector('#vsResult:not(.hidden)',{timeout:8000});
    const titles=await Promise.all([host,guest].map(p=>p.evaluate(()=>({title:document.getElementById('vsResultTitle').textContent,btn:document.getElementById('vsRematch').textContent}))));
    assert.ok(titles[0].title.includes('胜利'));assert.ok(titles[1].title.includes('失败'));assert.ok(titles[1].btn.includes('等待房主'));
    pass('结算：房主胜利、客人失败，客人按钮显示等待房主',titles);
    const m0=await guest.evaluate(()=>__gameQA.versus.state.matchId);
    await host.click('#vsRematch');
    await host.waitForFunction(()=>__gameQA.versus.state.active&&!__gameQA.versus.state.over&&__gameQA.versus.state.time<5,null,{timeout:10000});
    await guest.waitForFunction(m0=>__gameQA.versus.state.matchId!==m0&&!__gameQA.versus.state.over&&document.getElementById('vsResult').classList.contains('hidden'),m0,{timeout:10000});
    pass('房主再来一局：双方进入新一局，客人结算界面关闭');
    // 客人掉线 → 电脑接管
    await gc.close();
    await host.waitForFunction(()=>{const v=__gameQA.versus,h=v.heroOf('red');return h&&h.vsAI&&v.team('red').ai==='normal';},null,{timeout:15000});
    const msg=await host.textContent('#msg');pass('客人掉线：电脑接管红方指挥与英雄',{msg});
    await sleep(6000);
    const ai=await host.evaluate(()=>({redGold:Math.round(__gameQA.versus.team('red').gold),redBuild:__gameQA.buildings.filter(b=>b.team==='red').length,time:Math.round(__gameQA.versus.state.time)}));
    pass('接管后红方电脑继续运营',ai);
    assert.deepEqual(errors,[]);pass('双方无脚本报错');
  }finally{await b.close();}
  fs.writeFileSync(path.join(OUT,'verify-versus-online.json'),JSON.stringify({url,at:new Date().toISOString(),results},null,1));
  console.log('ALL PASS',results.length);
})().catch(e=>{console.error('FAIL',e);fs.writeFileSync(path.join(OUT,'verify-versus-online.json'),JSON.stringify({url,at:new Date().toISOString(),results,failure:String(e.stack||e)},null,1));process.exit(1);});
