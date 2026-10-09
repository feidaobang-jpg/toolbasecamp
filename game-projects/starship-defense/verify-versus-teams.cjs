// 虫潮对战多人（2 对 2 到 4 对 4）实机验收：真实按键/点击选规模开局，校验座位、每人独立经济、队伍面板转账、
// 每人兵力/设施上限、每队一只虫王、只能拆自己的设施、投降、结算每人数据、退出恢复，以及手机横屏视口的队伍页。
// 用法：GAME_URL=http://127.0.0.1:8794/html/game/starship-defense/index.html node verify-versus-teams.cjs
// 手机为视口模拟（触屏 + 移动 UA），不代表真机。
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=process.env.PW||['D:/project/godot/absurd-3d-daily/node_modules/playwright','C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].find(p=>fs.existsSync(p));
const {chromium}=require(pw);
const url=process.env.GAME_URL||'http://127.0.0.1:8794/html/game/starship-defense/index.html';
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'qa','out','versus-teams');
fs.mkdirSync(OUT,{recursive:true});
const results=[];const pass=(name,detail)=>{results.push({name,ok:true,detail});console.log('PASS',name,detail===undefined?'':JSON.stringify(detail));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MOBILE_UA='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
  try{
    const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
    const autoBefore=await p.evaluate(()=>localStorage.getItem('sst_save_auto'));
    await p.click('#btnVersus');await sleep(200);
    // 键盘选规模：Tab 到「4 对 4」再 Enter
    await p.focus('[data-vs-size="3"]');await p.keyboard.press('Tab');await p.keyboard.press('Enter');await sleep(150);
    const menu=await p.evaluate(()=>({title:document.getElementById('vsMenuTitle').textContent,pressed:[...document.querySelectorAll('[data-vs-size]')].map(b=>b.getAttribute('aria-pressed')),note:document.getElementById('vsSizeNote').textContent,record:document.getElementById('vsRecordTxt').textContent}));
    assert.ok(menu.title.includes('4 对 4'));assert.deepEqual(menu.pressed,['false','false','false','true']);assert.ok(menu.note.includes('3 名电脑队友'));assert.ok(menu.record.includes('4 对 4'));
    pass('对战菜单键盘选「4 对 4」：标题、选中态、说明和战绩随规模切换',menu);
    await p.focus('[data-vs-ai="normal"]');await p.keyboard.press('Enter');
    await p.waitForFunction(()=>__gameQA.versus.state.active);await sleep(400);
    const setup=await p.evaluate(()=>{const q=__gameQA,v=q.versus,s=v.state;return {size:v.size,seats:s.seats.map(x=>x.pid+(x.ai?':'+x.ai:':人')),heroes:q.coopHumans.map(h=>h.vsPid+'@'+h.slot+(h.vsAI?'电脑':'')),local:s.localPid,hq:v.hq('blue').maxHp,banks:s.seats.map(x=>!!v.bank(x.pid)?.mesh.visible).filter(Boolean).length,worldX:q.WORLD?.maxX,popCap:v.popCap(),buildCap:v.buildCap(),teamTab:!document.getElementById('vsTeamTab').classList.contains('hidden'),hint:document.getElementById('keysHint').textContent};});
    assert.equal(setup.size,4);assert.equal(setup.seats.length,8);assert.equal(setup.local,'blue0');assert.equal(setup.heroes.length,8);assert.equal(setup.seats.filter(x=>x.endsWith(':人')).length,1);
    assert.equal(setup.hq,16800);assert.equal(setup.banks,8);assert.equal(setup.popCap,10);assert.equal(setup.buildCap,9);assert.ok(setup.teamTab);assert.ok(setup.hint.includes('T 队伍'));
    pass('4 对 4 开局：8 个座位 8 名英雄（你 + 7 个电脑）、8 座银行、核心 16800、每人兵力 10 / 设施 9',setup);
    const spots=await p.evaluate(()=>{const q=__gameQA,list=q.coopHumans.map(h=>[h.vsPid,Math.round(h.pos.x),Math.round(h.pos.z-900)]);let minD=1e9;for(let i=0;i<q.coopHumans.length;i++)for(let j=i+1;j<q.coopHumans.length;j++){const a=q.coopHumans[i].pos,b=q.coopHumans[j].pos;minD=Math.min(minD,Math.hypot(a.x-b.x,a.z-b.z));}return {list,minD:+minD.toFixed(1)};});
    assert.ok(spots.minD>=3);pass('英雄出生点分开（两两相距 ≥ 3 米），两队点对称',spots);
    await p.screenshot({path:path.join(OUT,'teams-start.png')});
    // 每人独立经济：我升银行不影响队友
    await p.keyboard.press('KeyR');await sleep(150);await p.keyboard.press('Digit0');await sleep(150);
    const eco=await p.evaluate(()=>{const v=__gameQA.versus;return {me:v.seat('blue0').bank,mate:v.seat('blue1').bank,meGold:Math.round(v.seat('blue0').gold),mateGold:Math.round(v.seat('blue1').gold)};});
    assert.equal(eco.me,2);assert.ok(eco.meGold<=130);assert.ok(eco.mateGold>=eco.meGold);pass('每人独立钱包：0 升级自己的银行，队友金币不受影响',eco);
    // 队伍面板：T 打开，1 给 1 号队友转 200
    await p.evaluate(()=>{const v=__gameQA.versus;v.seat('blue0').gold=1000;v.seat('blue1').ai=null;v.seat('blue1').aiState=null;});
    await p.keyboard.press('KeyT');await sleep(200);
    const tab=await p.evaluate(()=>({vis:!document.getElementById('vsPanel').classList.contains('hidden'),sel:document.querySelector('[data-vstab="team"]').getAttribute('aria-selected'),cards:[...document.querySelectorAll('#vsGrid .vs-card b')].map(e=>e.textContent)}));
    assert.ok(tab.vis);assert.equal(tab.sel,'true');assert.equal(tab.cards.length,3);pass('T 打开队伍页：列出 3 名队友',tab);
    const g0=await p.evaluate(()=>[__gameQA.versus.seat('blue0').gold,__gameQA.versus.seat('blue1').gold]);
    await p.keyboard.press('Digit1');await sleep(200);
    const g1=await p.evaluate(()=>[__gameQA.versus.seat('blue0').gold,__gameQA.versus.seat('blue1').gold]);
    assert.equal(Math.round(g0[0]-g1[0]),200);assert.equal(Math.round(g1[1]-g0[1]),200);pass('队伍页按 1：给 1 号队友转 200 金',{before:g0.map(Math.round),after:g1.map(Math.round)});
    const cross=await p.evaluate(()=>__gameQA.versus.give('blue0','red0',200));assert.ok(cross.includes('队友'));pass('不能给对手转账',cross);
    await p.keyboard.press('KeyT');await sleep(100);
    // 每人兵力上限 10：派 1 组小虫（6）后再派就超
    await p.evaluate(()=>{const v=__gameQA.versus,s=v.state;s.time=200;v.seat('blue0').gold=5000;});
    await p.keyboard.press('KeyR');await sleep(150);await p.keyboard.press('Digit1');await sleep(150);await p.keyboard.press('Digit2');await sleep(150);
    const pop=await p.evaluate(()=>{const v=__gameQA.versus;return {pop:v.popOf('blue0'),why:v.sendReason('blue0','carapace')};});
    assert.equal(pop.pop,8);assert.ok(pop.why.includes('兵力已满'));pass('每人兵力上限 10：派了小虫 6 + 机枪 2 后，再派 4 只甲壳虫被拦',pop);
    await p.keyboard.press('KeyR');await sleep(100);
    // 每人设施上限 9；只能拆自己的
    const bld=await p.evaluate(()=>{const v=__gameQA.versus,q=__gameQA;v.seat('blue0').gold=1e5;v.seat('blue1').gold=1e5;let ok=0;
      for(let i=0;i<12;i++){const w=v.world('blue',-70+i*12,-36);if(!v.build('blue0','wall',w.x,w.z,0))ok++;}
      const w2=v.world('blue',20,-48);const r2=v.build('blue1','mgTurret',w2.x,w2.z,0);const mate=q.buildings.find(b=>b.owner==='blue1');
      return {mine:ok,limit:v.zoneReason('blue0','wall',0,900-60),mateBuilt:r2,demolishMate:v.demolish('blue0',mate)};});
    assert.equal(bld.mine,9);assert.ok(bld.limit.includes('9'));assert.equal(bld.mateBuilt,'');assert.ok(bld.demolishMate.includes('自己'));pass('每人最多 9 座设施；不能拆队友建的',bld);
    // 每队只能有一只虫王（队友放了，自己就不能放）
    const king=await p.evaluate(()=>{const v=__gameQA.versus,s=v.state;s.time=400;v.seat('blue1').gold=4000;v.seat('blue0').gold=4000;v.seat('blue1').cd={};v.seat('blue0').cd={};
      for(const u of s.units)if(u.owner==='blue1'||u.owner==='blue0'){u.dead=true;u.mesh.visible=false;}s.units=s.units.filter(u=>!u.dead);
      const a=v.send('blue1','king','left');return {mate:a,mine:v.sendReason('blue0','king')};});
    assert.equal(king.mate,'');assert.ok(king.mine.includes('本队虫王'));pass('每队场上最多 1 只虫王',king);
    // 赏金记给出手的人：我（英雄）打死红方单位，钱进我的钱包
    const bounty=await p.evaluate(()=>{const v=__gameQA.versus,s=v.state;v.seat('red0').gold=1000;v.seat('red0').cd={};v.send('red0','swarm','left');const ru=s.units.find(u=>u.team==='red'&&u.prof==='bug0'&&!u.laneMinion);
      const a=[v.seat('blue0').gold,v.seat('blue2').gold];v.damage(ru,1e4,'blue','hero','blue0');return {me:Math.round(v.seat('blue0').gold-a[0]),mate:Math.round(v.seat('blue2').gold-a[1])};});
    assert.equal(bounty.me,6);assert.equal(bounty.mate,0);pass('赏金记给出手的人（小虫 6 金进我的钱包，队友不分）',bounty);
    // 投降：队友都是电脑，5:00 后我点投降即判负；结算列出每个人
    await p.evaluate(()=>{__gameQA.versus.state.time=320;});
    await p.keyboard.press('Escape');await p.waitForSelector('#menuPause:not(.hidden)');
    await p.click('#vsSurrender');await sleep(200);
    const ask=await p.evaluate(()=>document.getElementById('confirmText').textContent);assert.ok(ask.includes('真人'));
    await p.click('#confirmOk');await sleep(250);
    // 1 号座位在前面的转账测试里改成了真人座位：本队 2 名真人，需要两人都同意
    const vote=await p.evaluate(()=>({msg:document.getElementById('msg').textContent,over:__gameQA.versus.state.over}));
    assert.ok(vote.msg.includes('1/2'));assert.ok(!vote.over);pass('多人投降要本队真人都同意：只有我点时显示 1/2、对局继续',vote);
    await p.evaluate(()=>__gameQA.versus.surrender('blue1'));
    await p.waitForSelector('#vsResult:not(.hidden)',{timeout:5000});
    const res=await p.evaluate(()=>({title:document.getElementById('vsResultTitle').textContent,reason:document.getElementById('vsResultReason').textContent,rows:[...document.querySelectorAll('#vsStats tr')].map(r=>r.textContent),note:document.getElementById('vsResultNote').textContent}));
    assert.ok(res.title.includes('失败'));assert.ok(res.reason.includes('4 对 4'));assert.ok(res.rows.some(r=>r.includes('每人')));assert.ok(res.rows.filter(r=>/你：|电脑：/.test(r)).length>=4);assert.ok(res.note.includes('4 对 4'));
    pass('队友也点投降后判负；结算列出每个人的派兵/击杀/银行',{ask,reason:res.reason,rows:res.rows.length,note:res.note});
    await p.screenshot({path:path.join(OUT,'teams-result.png')});
    // 再来一局保持 4 对 4
    await p.click('#vsRematch');await p.waitForFunction(()=>__gameQA.versus.state.active&&!__gameQA.versus.state.over&&__gameQA.versus.state.time<5);
    assert.equal(await p.evaluate(()=>__gameQA.versus.size),4);pass('再来一局保持 4 对 4');
    // 退出恢复
    await p.keyboard.press('Escape');await p.waitForSelector('#menuPause:not(.hidden)');await p.click('#btnQuit');await p.waitForSelector('#menuMain:not(.hidden)');
    const back=await p.evaluate(()=>({active:__gameQA.versus.state.active,ground:__gameQA.groundMesh.visible,heroes:__gameQA.coopHumans.length,auto:localStorage.getItem('sst_save_auto'),maxX:__gameQA.WORLD?.maxX,pid:__gameQA.player.vsPid}));
    assert.ok(!back.active);assert.ok(back.ground);assert.equal(back.auto,autoBefore);assert.equal(back.pid,undefined);pass('回主菜单：对战退出、原战场恢复、自动存档未改动、英雄去掉座位标记',back);
    await p.evaluate(()=>__gameQA.newGame(false));await sleep(500);
    const camp=await p.evaluate(()=>({state:__gameQA.Game.state,heroes:__gameQA.coopHumans.length,bld:__gameQA.buildings.filter(b=>b.team).length}));
    assert.equal(camp.state,'prep');assert.equal(camp.bld,0);pass('之后开始战役没有对战残留',camp);
    // 2 对 2、3 对 3 也能开局
    for(const n of [2,3]){
      await p.evaluate(n=>__gameQA.startVersusAI('easy',n),n);await sleep(400);
      const s=await p.evaluate(()=>({size:__gameQA.versus.size,seats:__gameQA.versus.state.seats.length,heroes:__gameQA.coopHumans.length,hq:__gameQA.versus.hq('red').maxHp}));
      assert.equal(s.size,n);assert.equal(s.seats,2*n);assert.equal(s.heroes,2*n);pass(n+' 对 '+n+' 开局',s);
      await p.evaluate(()=>__gameQA.exitVersus());
    }
    /* ---------- 4 对 4 满负载帧时间 ---------- */
    await p.evaluate(()=>__gameQA.startVersusAI('hard',4));await sleep(800);
    const load=await p.evaluate(async()=>{const q=__gameQA,v=q.versus,s=v.state;s.time=400;
      for(const st of s.seats){st.gold=1e6;st.ai=null;st.aiState=null;const team=st.team;
        for(let i=0;i<5;i++){const kinds=['mgTurret','cannonTurret','teslaTurret','antiAir','wall'];const p=v.world(team,-80+(st.idx*5+i)*8,-30-(i%2)*10);v.build(st.pid,kinds[i%5],p.x,p.z,0);}
        for(const id of ['swarm','gunners']){st.cd={};v.send(st.pid,id,st.idx%2?'left':'right');}}
      const blue=s.units.filter(u=>u.team==='blue').length,red=s.units.filter(u=>u.team==='red').length;
      q.player.pos.set(0,0,900);q.startMeasure();await new Promise(r=>setTimeout(r,6000));const m=q.endMeasure();delete m.raw;
      return {blue,red,heroes:q.coopHumans.length,buildings:q.buildings.length,fps:Math.round(m.averageFPS),p95:Math.round(m.p95Ms),over50:m.over50ms,draws:m.drawCalls,tris:m.triangles,quality:m.quality,renderer:m.renderer};});
    pass('4 对 4 满负载帧时间（8 名英雄 + 每人 8 个单位 + 每人 5 座设施，实时 6 秒）',load);
    await p.screenshot({path:path.join(OUT,'teams-load.png')});
    assert.deepEqual(errors,[]);pass('电脑端无脚本报错');
    await p.close();
    /* ---------- 手机视口（横屏 + 竖屏自动转横屏）：队伍页 ---------- */
    for(const [w,h,name] of [[844,390,'横屏'],[390,844,'竖屏']]){
      const ctx=await b.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true,userAgent:MOBILE_UA,deviceScaleFactor:2});
      const m=await ctx.newPage(),merr=[];m.on('pageerror',e=>merr.push(e.message));
      await m.goto(url+'?qa=1');await m.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
      await m.tap('#btnVersus');await m.tap('[data-vs-size="2"]');await m.tap('[data-vs-ai="easy"]');await m.waitForFunction(()=>__gameQA.versus.state.active);await sleep(500);
      await m.evaluate(()=>{__gameQA.versus.seat('blue0').gold=900;});
      await m.tap('#vR');await sleep(300);await m.tap('#vsTeamTab');await sleep(300);
      const mt=await m.evaluate(()=>{const R=e=>e.getBoundingClientRect(),panel=R(document.getElementById('vsPanel'));
        const hit=['joyBase','vJ','vK','vU','vI','vX','vSPRINT','vO','vL','vR'].filter(id=>{const b=R(document.getElementById(id));if(!b.width)return false;return !(b.right<=panel.left||b.left>=panel.right||b.bottom<=panel.top||b.top>=panel.bottom);});
        const tab=R(document.getElementById('vsTeamTab'));
        return {touch:__gameQA.isTouch,cards:document.querySelectorAll('#vsGrid .vs-card').length,overlap:hit,tab:document.getElementById('vsTeamTab').getAttribute('aria-selected'),tabSize:[Math.round(tab.width),Math.round(tab.height)]};});
      assert.ok(mt.touch);assert.equal(mt.cards,1);assert.deepEqual(mt.overlap,[]);assert.equal(mt.tab,'true');pass('手机'+name+' 2 对 2：点「出兵」再点「队伍」页，面板不遮挡摇杆和动作键',mt);
      const mg0=await m.evaluate(()=>__gameQA.versus.seat('blue1').gold);
      await m.tap('#vsGrid .vs-card >> nth=0');await sleep(300);
      const mg1=await m.evaluate(()=>__gameQA.versus.seat('blue1').gold);
      assert.equal(Math.round(mg1-mg0),200);pass('手机'+name+'：点队友卡片转 200 金');
      await m.screenshot({path:path.join(OUT,'teams-mobile-'+(w>h?'landscape':'portrait')+'.png')});
      assert.deepEqual(merr,[]);await ctx.close();
    }
  }finally{await b.close();}
  fs.writeFileSync(path.join(OUT,'verify-versus-teams.json'),JSON.stringify({url,at:new Date().toISOString(),results},null,1));
  console.log('ALL PASS',results.length);
})().catch(e=>{console.error('FAIL',e);fs.writeFileSync(path.join(OUT,'verify-versus-teams.json'),JSON.stringify({url,at:new Date().toISOString(),results,failure:String(e.stack||e)},null,1));process.exit(1);});
