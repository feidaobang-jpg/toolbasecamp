// 虫潮对战多人联机验收：真实联机大厅建 2 对 2 房间，三个真人选队伍（房主、队友选蓝，对手选红），空位由电脑补；
// 校验座位分配、客人出兵/转账经房主执行并同步、中途加入的第四人接手电脑座位、队友掉线电脑接管、结算，以及客人收到的快照流量。
// 需要本地联机服务（ws://127.0.0.1:8792）或在 GAME_URL 指向线上时使用线上服务。
// 用法：GAME_URL=http://127.0.0.1:8794/html/game/starship-defense/index.html node verify-versus-teams-online.cjs
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=process.env.PW||['D:/project/godot/absurd-3d-daily/node_modules/playwright','C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].find(p=>fs.existsSync(p));
const {chromium}=require(pw);
const url=process.env.GAME_URL||'http://127.0.0.1:8794/html/game/starship-defense/index.html';
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'qa','out','versus-teams');
fs.mkdirSync(OUT,{recursive:true});
const results=[];const pass=(name,detail)=>{results.push({name,ok:true,detail});console.log('PASS',name,detail===undefined?'':JSON.stringify(detail));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// 统计客人收到的 state 消息字节数（在页面里包一层 WebSocket）
const meter=()=>{const W=window.WebSocket;window.__stateBytes={n:0,bytes:0,since:performance.now()};window.WebSocket=function(...a){const ws=new W(...a);ws.addEventListener('message',e=>{if(typeof e.data==='string'&&e.data.startsWith('{"type":"state"')){window.__stateBytes.n++;window.__stateBytes.bytes+=e.data.length;}});return ws;};window.WebSocket.prototype=W.prototype;Object.assign(window.WebSocket,{OPEN:1,CLOSED:3,CONNECTING:0,CLOSING:2});};
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  try{
    const ctx=()=>b.newContext({viewport:{width:1100,height:620}});
    const hc=await ctx(),ac=await ctx(),oc=await ctx(),lc=await ctx();
    const host=await hc.newPage(),ally=await ac.newPage(),foe=await oc.newPage(),late=await lc.newPage(),errors=[];
    for(const [n,pg] of [['host',host],['ally',ally],['foe',foe],['late',late]]){pg.on('pageerror',e=>errors.push(n+':'+e.message));await pg.addInitScript(meter);}
    await host.goto(url+'?qa=1&test=1');await host.waitForFunction(()=>window.__gameQA&&window.__ccReady&&window.__COOP_QA__,null,{timeout:60000});
    await host.click('#btnVersus');await host.click('#vsOnline');await host.waitForSelector('.coop-panel:not([hidden])');
    await host.selectOption('.coop-panel [data-field="capacity"]','4');await host.selectOption('.coop-panel [data-field="vsTeam"]','blue');await host.selectOption('.coop-panel [data-field="vsDiff"]','easy');
    await host.fill('.coop-panel [data-field="name"]','房主');await host.click('.coop-panel [data-do="create"]');
    await host.waitForFunction(()=>window.__COOP_QA__.connection.room?.code,null,{timeout:15000});
    const room=await host.evaluate(()=>{const r=__COOP_QA__.connection.room;return {code:r.code,max:r.maxPlayers,mode:r.settings.mode,size:r.settings.size,diff:r.settings.diff,start:document.querySelector('.coop-panel [data-do="start"]').textContent};});
    assert.equal(room.max,4);assert.equal(room.mode,'versus');assert.equal(room.size,2);assert.equal(room.diff,'easy');assert.equal(room.start,'开始对战');
    pass('建 2 对 2 对战房间：服务器记 versus / 每队 2 人 / 上限 4 人 / 电脑补位简单',room);
    // 两名客人：一个选蓝（队友），一个选红（对手）
    for(const [pg,name,team] of [[ally,'队友','blue'],[foe,'对手','red']]){
      await pg.goto(url+'?qa=1&test=1&coop='+room.code);await pg.waitForFunction(()=>window.__gameQA&&window.__ccReady&&window.__COOP_QA__,null,{timeout:60000});
      await pg.waitForFunction(()=>window.__COOP_QA__.connection.room,null,{timeout:15000});
      // 点邀请链接进房后，大厅自动切到对战选项：能看到「队伍」
      await pg.waitForFunction(()=>!document.querySelector('.coop-panel [data-field="vsTeam"]').closest('label').hidden,null,{timeout:8000});
      await pg.selectOption('.coop-panel [data-field="vsTeam"]',team);
      await pg.click('.coop-panel [data-do="ready"]');
    }
    await host.waitForFunction(()=>{const r=__COOP_QA__.connection.room;return r.players.length===3&&r.players.every(p=>p.ready);},null,{timeout:15000});
    const roster=await host.evaluate(()=>({players:__COOP_QA__.connection.room.players.map(p=>p.name+':'+p.team),text:document.querySelector('.coop-roster').textContent}));
    assert.deepEqual(roster.players.map(x=>x.split(':')[1]),['blue','blue','red']);assert.ok(roster.text.includes('（红方）'));pass('房间名单显示每人选的队伍',roster);
    const listed=await late.goto(url+'?qa=1&test=1').then(()=>late.waitForFunction(()=>window.__gameQA&&window.__ccReady&&window.__COOP_QA__,null,{timeout:60000})).then(()=>late.evaluate(()=>{document.querySelector('.coop-entry').click();return new Promise(r=>setTimeout(()=>r([...document.querySelectorAll('.coop-rooms li span')].map(e=>e.textContent).join(' | ')),2500));}));
    assert.ok(listed.includes('对战 2 对 2'));pass('大厅房间列表标注「对战 2 对 2」',listed);
    await host.click('.coop-panel [data-do="start"]');
    for(const pg of [host,ally,foe])await pg.waitForFunction(()=>__gameQA.versus.state.active,null,{timeout:15000});
    await sleep(1500);
    const seats=await Promise.all([host,ally,foe].map(pg=>pg.evaluate(()=>({role:__gameQA.versus.state.role,pid:__gameQA.versus.state.localPid,team:__gameQA.player.team,heroes:__gameQA.coopHumans.map(h=>h.vsPid+'@'+h.slot+(h.vsAI?'电脑':'')).sort().join(','),eco:document.getElementById('vsEco').textContent}))));
    assert.equal(seats[0].pid,'blue0');assert.equal(seats[1].pid,'blue1');assert.equal(seats[2].pid,'red0');
    for(const s of seats)assert.equal(s.heroes,'blue0@0,blue1@1,red0@2,red1@103电脑');
    assert.ok(seats[0].eco.includes('队友'));
    pass('开局：房主 blue0、队友 blue1、对手 red0，红方空位 red1 由电脑补；三个画面看到同样 4 名英雄',seats);
    const hostAI=await host.evaluate(()=>({red1:__gameQA.versus.seat('red1').ai,blue1:__gameQA.versus.seat('blue1').ai}));
    assert.equal(hostAI.red1,'easy');assert.equal(hostAI.blue1,null);pass('电脑补位用房间选的难度（简单），真人座位不由电脑指挥',hostAI);
    // 客人出兵：各自的钱、各自的兵
    await host.evaluate(()=>{const v=__gameQA.versus;v.state.time=21;for(const s of v.state.seats)s.gold=3000;});await sleep(400);
    await ally.keyboard.press('KeyR');await sleep(200);await ally.keyboard.press('Digit1');
    await host.waitForFunction(()=>__gameQA.versus.state.units.filter(u=>u.owner==='blue1').length>=6,null,{timeout:8000});
    const gold=await host.evaluate(()=>({blue0:Math.round(__gameQA.versus.seat('blue0').gold),blue1:Math.round(__gameQA.versus.seat('blue1').gold)}));
    assert.ok(gold.blue1<=2860&&gold.blue0>=2990);pass('队友（客人）R→1：房主那边派出记在队友名下的小虫，扣的是队友的钱',gold);
    await ally.waitForFunction(()=>{const t=document.getElementById('vsPanelEco').textContent;return /兵力 6\//.test(t);},null,{timeout:8000});
    pass('客人面板显示自己的在场兵力（6/16）');
    // 队友给房主转钱：T → 1
    await ally.keyboard.press('KeyT');await sleep(300);
    const before=await host.evaluate(()=>__gameQA.versus.seat('blue0').gold);
    await ally.keyboard.press('Digit1');
    await host.waitForFunction(b0=>__gameQA.versus.seat('blue0').gold>=b0+199,before,{timeout:8000});
    await host.waitForFunction(()=>document.getElementById('msg').textContent.includes('转了 200'),null,{timeout:4000});
    pass('队友 T→1 给房主转 200 金：房主核验执行，房主看到到账提示');
    await ally.keyboard.press('KeyT');
    // 中途加入：第四人选红，接手 red1 的电脑座位
    // 第四人走「虫潮对战 → 好友对战」进大厅（对战选项），选红方后输房间号加入
    await late.click('.coop-panel [data-do="close"]');await late.click('#btnVersus');await late.click('#vsOnline');await late.waitForSelector('.coop-panel:not([hidden])');
    await late.fill('.coop-panel [data-field="name"]','新来的');await late.selectOption('.coop-panel [data-field="vsTeam"]','red');
    await late.fill('.coop-panel [data-field="code"]',room.code);await late.click('.coop-panel [data-do="join"]');
    await late.waitForFunction(()=>__gameQA.versus.state.active,null,{timeout:15000});
    await host.waitForFunction(()=>{const h=__gameQA.coopHumans.find(h=>h.vsPid==='red1');return h&&h.slot===3&&!h.vsAI&&!__gameQA.versus.seat('red1').ai;},null,{timeout:10000});
    await late.waitForFunction(()=>__gameQA.versus.state.localPid==='red1'&&__gameQA.player.team==='red',null,{timeout:10000});
    const lateState=await late.evaluate(()=>({pid:__gameQA.versus.state.localPid,heroes:__gameQA.coopHumans.length,time:Math.round(__gameQA.versus.state.time),gold:__gameQA.versus.seat('red1').gold}));
    pass('中途加入的第四人接手红方电脑座位 red1（金币、银行保留），房主那边改成真人操作',lateState);
    await late.keyboard.press('KeyR');await sleep(200);await late.keyboard.press('Digit2');
    await host.waitForFunction(()=>__gameQA.versus.state.units.some(u=>u.owner==='red1'&&u.prof==='gunner'),null,{timeout:8000});
    pass('中途加入者按 R→2 派出机枪小队，记在 red1 名下');
    // 客人收到的快照流量（2 对 2，客人 3 人）
    await sleep(3000);
    const flow=await foe.evaluate(()=>{const s=window.__stateBytes,sec=(performance.now()-s.since)/1000;return {msgs:s.n,avgBytes:Math.round(s.bytes/Math.max(1,s.n)),kbPerSec:+(s.bytes/1024/sec).toFixed(1)};});
    pass('客人收到的状态快照（2 对 2 前期，整段平均）',flow);
    await host.screenshot({path:path.join(OUT,'online-teams-host.png')});await late.screenshot({path:path.join(OUT,'online-teams-late.png')});
    // 队友掉线：电脑接管 blue1
    await ac.close();
    await host.waitForFunction(()=>{const h=__gameQA.coopHumans.find(h=>h.vsPid==='blue1');return h&&h.vsAI&&__gameQA.versus.seat('blue1').ai==='normal';},null,{timeout:15000});
    const leftMsg=await host.textContent('#msg');assert.ok(leftMsg.includes('队友'));pass('队友掉线：电脑接管这名队友（指挥与英雄）',{leftMsg});
    // 结算：打掉红方核心
    await host.evaluate(()=>{const v=__gameQA.versus;v.damage(v.hq('red'),1e7,'blue','unit');});
    for(const pg of [host,foe,late])await pg.waitForSelector('#vsResult:not(.hidden)',{timeout:8000});
    const end=await Promise.all([host,foe,late].map(pg=>pg.evaluate(()=>({title:document.getElementById('vsResultTitle').textContent,rows:[...document.querySelectorAll('#vsStats tr')].map(r=>r.textContent).filter(t=>t.includes('：')).length}))));
    assert.ok(end[0].title.includes('胜利'));assert.ok(end[1].title.includes('失败'));assert.ok(end[2].title.includes('失败'));assert.ok(end.every(e=>e.rows>=2));
    pass('结算：房主胜利，两名红方真人失败；三个画面都列出每个人的数据',end);
    assert.deepEqual(errors,[]);pass('所有画面无脚本报错');
  }finally{await b.close();}
  fs.writeFileSync(path.join(OUT,'verify-versus-teams-online.json'),JSON.stringify({url,at:new Date().toISOString(),results},null,1));
  console.log('ALL PASS',results.length);
})().catch(e=>{console.error('FAIL',e);fs.writeFileSync(path.join(OUT,'verify-versus-teams-online.json'),JSON.stringify({url,at:new Date().toISOString(),results,failure:String(e.stack||e)},null,1));process.exit(1);});
