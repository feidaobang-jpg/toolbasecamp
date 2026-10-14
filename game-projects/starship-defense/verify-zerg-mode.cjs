// 虫族模式 v2 验证：母虫带虫群三段攻城（拔哨站 → 破城门 → 毁核心）。
// 覆盖：简报与难度、开局朝向与布防、护盾与核心护壁、虫群护卫、自动撕咬、击杀得生物量、
//       地穴与加时、进化冻结与键盘选择、炮击预警、各技能、阵亡重生、胜负结算与战绩、
//       战役存档隔离、重开 / 退出复原、切换视角、触屏标签与面板、竖屏旋转、负载帧率。
// 运行：node verify-zerg-mode.cjs（自带静态服务，端口 8902）。QA_OUTPUT 可改输出目录。
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),{execSync}=require('node:child_process');
const PW=['C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright','D:/project/godot/absurd-3d-daily/node_modules/playwright'].find(p=>fs.existsSync(p))||'playwright';
const {chromium}=require(PW);
const ROOT=path.join(__dirname,'..','..','public'),PORT=Number(process.env.QA_PORT)||8902;
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-zerg-v0.36.0/qa');fs.mkdirSync(out,{recursive:true});
const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.glb':'model/gltf-binary','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0]),f=path.join(ROOT,u==='/'?'index.html':u);
  if(!f.startsWith(ROOT))return res.writeHead(403).end();
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404).end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'});res.end(d);});
});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// 快照 localStorage（排除虫族模式自己的键），用于确认战役存档与设置不被改写
const snapStore=page=>page.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('chongchao-zerg-'))continue;o[k]=localStorage.getItem(k);}return o;});
const st=page=>page.evaluate(()=>{const g=__gameQA,z=g.zerg,b=z.bug,$=id=>document.getElementById(id),shown=id=>!$(id).classList.contains('hidden');return {
  state:g.Game.state,active:z.active,over:z.over,frozen:z.frozen,phase:z.phase,diff:z.diff,time:z.timeLeft,elapsed:z.elapsed,biomass:z.biomass,lives:z.lives,deaths:z.deaths,
  bug:b&&!b.dead?{x:b.mesh.position.x,z:b.mesh.position.z,hp:b.hp,max:b.maxHp,invuln:b.invuln}:null,
  swarm:g.monsters.filter(m=>!m.dead&&!m.zergPlayer).length,flyers:g.monsters.filter(m=>!m.dead&&m.fly).length,
  squad:g.squad.filter(q=>!q.dead).length,buildings:g.buildings.length,turrets:z.outposts.reduce((n,o)=>n+o.turrets.filter(t=>!t.dead).length,0),
  cleared:z.outposts.filter(o=>o.cleared).length,dens:z.dens.length,gate:g.gate.hp,gateMax:g.gate.maxHp,gateDead:g.gate.dead,base:g.base.hp,baseMax:g.base.maxHp,
  shells:z.shells.length,cd:{...z.cd},dashT:z.dashT,frenzy:z.frenzyT,mark:!!z.mark,evo:[...z.evoTaken],stats:z.stats?{...z.stats}:null,
  camYaw:g.getCamYaw(),camMode:g.getCamMode(),camView:g.getCamView(),bullets:g.bullets.length,
  stageZerg:$('stage').classList.contains('zerg-mode'),menu:shown('zergMenu'),evolve:shown('zergEvolve'),result:shown('zergResult'),main:shown('menuMain'),paused:shown('menuPause'),
  title:$('zgResultTitle').textContent,grade:$('zgGrade').textContent,focus:document.activeElement&&document.activeElement.id||''};});
const inView=(page,sel)=>page.evaluate(sel=>[...document.querySelectorAll(sel)].every(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),sel);
const open=async(page,url)=>{await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__ccReady&&window.__gameQA,null,{timeout:60000});};
const startZerg=async(page,diff='normal')=>{await page.evaluate(d=>__gameQA.zerg.start(d),diff);await page.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle');await wait(400);};
const god=(page,on=true)=>page.evaluate(on=>{clearInterval(window.__god);if(on)window.__god=setInterval(()=>{const b=__gameQA.zerg.bug;if(b)b.invuln=5;},100);else if(__gameQA.zerg.bug)__gameQA.zerg.bug.invuln=0;},on);
const place=(page,x,z)=>page.evaluate(([x,z])=>{const g=__gameQA,b=g.zerg.bug;b.mesh.position.set(x,g.groundY(x,z),z);},[x,z]);
const near=(a,b,eps,msg)=>assert.ok(Math.abs(a-b)<=eps,`${msg}：期望约 ${b}，实际 ${a}`);

(async()=>{
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const url=`http://127.0.0.1:${PORT}/html/game/starship-defense/index.html`;
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const results=[],errors=[];
  const ok=t=>{results.push(t);console.log('✓ '+t);};
  const watch=page=>{page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon|Failed to load resource/.test(m.text()))errors.push(m.text());});};
  try{
    /* ===== 桌面键鼠 ===== */
    let ctx=await browser.newContext({viewport:{width:1280,height:720}}),page=await ctx.newPage();watch(page);
    await open(page,url);
    const store0=await snapStore(page),person0=await page.evaluate(()=>({mode:__gameQA.getCamMode(),view:__gameQA.getCamView(),saved:localStorage.getItem('chongchao-person')}));

    // 1. 入口与简报
    assert.ok(await page.locator('#btnZerg').isVisible(),'主菜单应有虫族模式入口');
    await page.click('#btnZerg');await wait(300);
    let s=await st(page);
    assert.ok(s.menu&&!s.main&&!s.active,'点入口应先显示简报，不直接开打');
    assert.equal(await page.locator('#zgSteps > div').count(),3,'简报应列出三步目标');
    assert.equal(await page.locator('#zgDiffRow button').count(),3,'应有三档难度');
    assert.equal(s.focus,'zergStart','键盘默认焦点应在「开始进攻」');
    await page.screenshot({path:path.join(out,'01-briefing.png')});
    await page.keyboard.press('Escape');await wait(200);s=await st(page);
    assert.ok(s.main&&!s.menu,'Esc 应从简报回主菜单');
    ok('主菜单入口先进简报：三步目标、三档难度、操作说明；默认焦点在「开始进攻」，Esc 返回主菜单');

    // 2. 难度选择保存
    await page.click('#btnZerg');await page.click('[data-zerg-diff="easy"]');
    assert.equal(await page.evaluate(()=>localStorage.getItem('chongchao-zerg-difficulty-v1')),'easy');
    assert.equal(await page.getAttribute('[data-zerg-diff="easy"]','aria-pressed'),'true');
    await page.click('[data-zerg-diff="normal"]');
    ok('难度选择即时高亮并保存到本机');

    // 3. 开局
    await page.click('#zergStart');await page.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle');await wait(500);
    s=await st(page);
    assert.ok(s.stageZerg&&s.bug,'应进入战斗并生成母虫');
    near(Math.abs(s.camYaw),Math.PI,.05,'开局镜头应朝向要塞');
    assert.equal(s.camMode,'third');assert.equal(s.phase,1);assert.equal(s.lives,4);
    assert.equal(s.swarm,8,'开局应有 8 只随行虫');assert.equal(s.squad,5,'普通难度守军 5 人');assert.equal(s.turrets,7,'三处哨站共 7 座炮塔');
    assert.equal(s.gate,6500);assert.equal(s.base,6500);near(s.time,300,2,'普通难度限时');
    assert.ok(s.bug.z>150,'母虫应从虫洞口出发');
    const hud=await page.evaluate(()=>{const d=id=>getComputedStyle(document.getElementById(id)).display;return {hudTop:d('hudTop'),radar:d('radar'),weaponBar:d('weaponBar'),zerg:d('zergHud'),bar:document.querySelectorAll('#zgBar .zg-ab').length,marker:document.querySelector('#zgMarker span').textContent,keys:[...document.querySelectorAll('#zgBar kbd')].map(k=>k.textContent).join('')};});
    assert.equal(hud.hudTop,'none');assert.equal(hud.radar,'none');assert.equal(hud.weaponBar,'none');assert.notEqual(hud.zerg,'none');
    assert.equal(hud.bar,7,'技能栏应有 7 个技能');assert.equal(hud.keys,'JKUIOLH');assert.match(hud.marker,/哨站 \d+米/);
    await page.screenshot({path:path.join(out,'02-start.png')});
    ok(`开局：母虫在虫洞口面朝要塞，随行虫 ${s.swarm}、守军 ${s.squad}、哨站炮塔 ${s.turrets}、城门 ${s.gate}、核心 ${s.base}；战役 HUD 让位，虫族战况条、雷达、技能栏（${hud.keys}）与目标标记「${hud.marker}」就位`);

    // 4. 移动：W 朝要塞方向
    const z0=s.bug.z;await page.keyboard.down('KeyW');await wait(700);await page.keyboard.up('KeyW');s=await st(page);
    assert.ok(z0-s.bug.z>3,'按 W 应朝要塞（-Z）前进，位移 '+(z0-s.bug.z).toFixed(1));
    ok('WASD 驱动母虫：按 W 朝要塞前进 '+(z0-s.bug.z).toFixed(1)+' 米');

    // 5. 第一步：城门护盾与核心护壁
    await page.evaluate(()=>{__gameQA.damageGate(500);__gameQA.damageBase(500);});s=await st(page);
    assert.equal(s.gate,s.gateMax,'哨站未清时城门有护盾');assert.equal(s.base,s.baseMax,'城门未破时核心有护壁');
    ok('第一步期间城门护盾挡下全部伤害，核心同样不受伤');

    // 6. 虫群护卫：附近没有敌人时跟着母虫
    const escort=await page.evaluate(()=>{const g=__gameQA,m=g.monsters.find(m=>!m.dead&&!m.zergPlayer);return g.monsterTargets(m).kind;});
    assert.equal(escort,'escort','远离敌人时虫群应护卫母虫');
    ok('远离敌人时虫群目标为护卫母虫，不各自冲向要塞');

    // 7. 自动撕咬 + 击毁得生物量
    await god(page);
    const t7=await page.evaluate(()=>{const g=__gameQA,z=g.zerg,t=z.outposts.find(o=>o.id==='east').turrets[0];window.__t=t;return {x:t.mesh.position.x,z:t.mesh.position.z,hp:t.hp};});
    await place(page,t7.x,t7.z+3.4);await wait(1400);
    const hpAfter=await page.evaluate(()=>window.__t.hp);
    assert.ok(hpAfter<t7.hp,'贴近炮塔应自动撕咬，耐久 '+t7.hp+' → '+hpAfter);
    const engaged=await page.evaluate(()=>{const g=__gameQA,m=g.monsters.find(m=>!m.dead&&!m.zergPlayer);return g.monsterTargets(m).kind;});
    assert.equal(engaged,'building','母虫交战时虫群应攻击哨站炮塔');
    let bio=(await st(page)).biomass;
    await page.evaluate(()=>__gameQA.damageBuilding(window.__t,99999));s=await st(page);
    assert.ok(s.biomass-bio>=45,'击毁炮塔应得 45 生物量，实际 +'+(s.biomass-bio).toFixed(1));assert.equal(s.stats.turrets,1);
    bio=s.biomass;await page.evaluate(()=>__gameQA.damageSquad(__gameQA.squad[0],99999));s=await st(page);
    assert.ok(s.biomass-bio>=35,'击杀守军应得 35 生物量');assert.equal(s.stats.soldiers,1);
    ok(`不按键贴近即自动撕咬（炮塔 ${t7.hp} → ${Math.round(hpAfter)}），虫群转为攻击炮塔；击毁炮塔 +45、击杀守军 +35 生物量`);

    // 8. 清空哨站 → 地穴 + 加时
    let t0=s.time;
    await page.evaluate(()=>{const g=__gameQA,o=g.zerg.outposts.find(o=>o.id==='east');for(const t of [...o.turrets])if(!t.dead)g.damageBuilding(t,99999);});await wait(200);s=await st(page);
    assert.equal(s.cleared,1);assert.equal(s.dens,1,'清空哨站应长出地穴');assert.ok(s.time-t0>13,'清空哨站应加时 15 秒');assert.equal(s.phase,1);
    await page.screenshot({path:path.join(out,'03-outpost-cleared.png')});
    ok('东丘哨站清空：碉堡门外长出地穴、加时 15 秒，仍处第一步');

    // 9. 三处清完 → 第二步 + 进化冻结
    await page.evaluate(()=>{const g=__gameQA;for(const o of g.zerg.outposts)for(const t of [...o.turrets])if(!t.dead)g.damageBuilding(t,99999);});await wait(300);s=await st(page);
    assert.equal(s.phase,2);assert.equal(s.dens,3);assert.ok(s.frozen&&s.evolve,'进入第二步应弹出进化三选一并冻结');
    assert.equal(await page.locator('#zgEvoRow button').count(),3);
    t0=s.time;await page.keyboard.press('KeyP');await wait(600);s=await st(page);
    assert.equal(s.time,t0,'进化选择期间计时应停止');assert.ok(!s.paused&&s.state==='battle','进化未选完时暂停键不应打开暂停菜单');
    await page.screenshot({path:path.join(out,'04-evolve.png')});
    await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await wait(300);s=await st(page);
    assert.ok(!s.frozen&&!s.evolve&&s.evo.length===1,'键盘应能选定进化并恢复战斗');
    ok('三处哨站清完进入第二步：进化三选一弹出、战斗与计时冻结、暂停键被挡；方向键 + 回车选定「'+s.evo[0]+'」后恢复');

    // 10. 第二步：城门可破、核心仍有护壁
    await page.evaluate(()=>{__gameQA.damageGate(500);__gameQA.damageBase(500);});s=await st(page);
    near(s.gate,s.gateMax-500,40,'城门应被打掉约 500（守军工程兵会缓慢修补）');assert.equal(s.base,s.baseMax);
    ok('第二步城门护盾消失可被攻击，核心护壁仍在');

    // 11. 迫击炮：预警圈 → 命中扣血；冲刺短暂无敌
    await god(page,false);await place(page,0,120);
    await page.evaluate(()=>{const z=__gameQA.zerg;z.bug.hp=z.bug.maxHp;z.shellCd=.05;});await wait(400);s=await st(page);
    assert.equal(s.shells,1,'应出现炮击预警圈');assert.equal(s.bug.hp,s.bug.max,'预警阶段不应扣血');
    assert.ok(await page.evaluate(()=>!document.getElementById('zgWarn').classList.contains('hidden')),'站在红圈内应有警告');
    await page.screenshot({path:path.join(out,'05-shell-warning.png')});
    await wait(2000);s=await st(page);
    const shellHit=s.bug.max-s.bug.hp;
    near(shellHit,460*.38,12,'炮击命中伤害（普通难度护甲 0.38）');assert.equal(s.shells,0);
    await page.evaluate(()=>{__gameQA.zerg.shellCd=99;});
    await page.keyboard.press('KeyL');await wait(120);s=await st(page);
    assert.ok(s.dashT>0&&s.bug.invuln>0&&s.cd.dash>4,'冲刺应突进并短暂无敌');
    ok('迫击炮先画 1.9 秒红圈并提示，落地扣血 '+Math.round(shellHit)+'；冲刺进入冷却并获得短暂无敌');

    // 12. 酸液标记、孵化、蜕皮、号令
    await god(page);
    await page.evaluate(()=>{const g=__gameQA;g.zerg.bug.mesh.position.set(0,g.groundY(0,6),6);g.setCamYaw(Math.PI);});await wait(200);
    const b0=(await st(page)).bullets;await page.keyboard.press('KeyK');await wait(150);s=await st(page);
    assert.ok(s.cd.acid>.8&&s.bullets>b0,'酸液应发射并进入冷却');assert.ok(s.mark,'酸液应标记集火目标');
    await place(page,0,120);await wait(200);
    await page.evaluate(()=>{const g=__gameQA;for(const m of g.monsters)if(!m.zergPlayer)g.damageMonster(m,99999);g.zerg.biomass=500;});await wait(300);
    let n0=(await st(page)).swarm;await page.keyboard.press('KeyU');await wait(150);s=await st(page);
    assert.ok(s.swarm-n0>=3&&s.biomass<460&&s.cd.brood>4,'U 应孵化至少 3 只战士并扣生物量');
    n0=s.flyers;await page.keyboard.press('KeyI');await wait(150);s=await st(page);
    assert.ok(s.flyers-n0>=2&&s.cd.flyer>6,'I 应孵化至少 2 只飞虫');
    await page.evaluate(()=>{const z=__gameQA.zerg;z.biomass=0;z.cd.brood=0;});n0=s.swarm;await page.keyboard.press('KeyU');await wait(150);s=await st(page);
    assert.equal(s.swarm,n0,'生物量不足不应孵化');
    await god(page,false);await page.evaluate(()=>{const z=__gameQA.zerg;z.biomass=200;z.bug.hp=z.bug.maxHp*.4;});await page.keyboard.press('KeyO');await wait(120);s=await st(page);
    assert.ok(s.bug.hp/s.bug.max>.7&&s.biomass<175&&s.cd.molt>3,'蜕皮应回血并扣生物量');
    await page.evaluate(()=>{__gameQA.zerg.cd.rally=0;});n0=s.swarm;await page.keyboard.press('KeyN');await wait(200);s=await st(page);
    assert.ok(s.frenzy>6&&s.swarm>n0&&s.cd.rally>20,'号令应触发狂热并呼叫增援');
    ok('酸液发射并标记集火目标；U 孵战士、I 孵飞虫按价扣生物量并进冷却，生物量不足不孵；蜕皮回血 35%；号令触发 7 秒狂热与一波增援');

    // 13. 阵亡 → 最近地穴重生
    await page.evaluate(()=>__gameQA.zerg.hurt(99999));s=await st(page);
    assert.equal(s.lives,3);assert.equal(s.deaths,1);assert.equal(s.bug,null);
    await wait(3500);s=await st(page);
    assert.ok(s.bug&&s.bug.hp===s.bug.max,'3 秒后应满血重生');
    const den=await page.evaluate(()=>[...__gameQA.zerg.dens].sort((a,b)=>a.z-b.z)[0]);
    assert.ok(Math.hypot(s.bug.x-den.x,s.bug.z-den.z)<12,'应在最靠近要塞的地穴重生');
    ok('母虫阵亡扣一次重生机会，3 秒后在最靠近要塞的地穴（'+den.name+'）满血重生');

    // 14. 切换视角：C 循环含第一人称
    const views=[];for(let i=0;i<5;i++){await page.keyboard.press('KeyC');await wait(250);s=await st(page);views.push(s.camMode==='first'?'first':'third'+s.camView);if(s.camMode==='first')await page.screenshot({path:path.join(out,'06-first-person.png')});}
    assert.deepEqual(views,['third2','third3','third4','first','third0'],'C 应循环各预设并经过第一人称');
    ok('C 依次切到 俯视→低位→远景→第一人称→近身，全程可玩');

    // 15. 破门 → 第三步、城下地穴、守备队增援
    await god(page);n0=(await st(page)).squad;
    await page.evaluate(()=>__gameQA.damageGate(999999));await wait(400);s=await st(page);
    assert.equal(s.phase,3);assert.ok(s.gateDead&&s.frozen&&s.evolve);assert.equal(s.dens,4,'破门后坡道下应长出城下地穴');assert.ok(s.squad>=n0,'核心守备队应出动');
    await page.click('#zgEvoRow button');await wait(300);
    await page.evaluate(()=>__gameQA.damageBase(500));s=await st(page);
    near(s.base,s.baseMax-500,40,'第三步核心可被攻击');assert.equal(s.evo.length,2);
    await page.evaluate(()=>{const g=__gameQA;g.zerg.bug.mesh.position.set(-8,g.groundY(-8,-34),-34);g.setCamYaw(Math.atan2(-4,-8));});await wait(900);
    await page.screenshot({path:path.join(out,'07-core.png')});
    ok('城门被毁进入第三步：再次进化、坡道下长出城下地穴、守备队增援，核心护壁解除');

    // 16. 胜利结算与战绩
    await page.evaluate(()=>__gameQA.damageBase(999999));await wait(500);s=await st(page);
    assert.ok(s.over&&s.result&&s.state==='over');assert.match(s.title,/胜利/);assert.match(s.grade,/评级 [SAB]/);assert.equal(s.focus,'zergAgain');
    const best=await page.evaluate(()=>JSON.parse(localStorage.getItem('chongchao-zerg-best-v2')));
    assert.equal(best.schema,2);assert.equal(best.by.normal.wins,1);assert.equal(best.by.normal.runs,1);assert.ok(best.by.normal.bestTime>0);
    assert.equal(await page.locator('#zgStats > div').count(),6);
    await page.screenshot({path:path.join(out,'08-victory.png')});
    ok('核心归零即胜利：结算显示「'+s.grade+'」与 6 项数据，战绩按难度写入本机');

    // 17. 战役存档隔离
    // 局内按 C 切过人称，偏好键此刻可能不同；退出后第 20 项再做逐键全等比较。
    const strip=o=>{const c={...o};delete c['chongchao-person'];return c;};
    assert.deepEqual(strip(await snapStore(page)),strip(store0),'虫族模式不得改写战役存档与其他设置');
    ok('整局结束时战役存档、键位与其他本机设置逐键未变');

    // 18. 再攻一次 / 暂停重开
    await page.click('#zergAgain');await page.waitForFunction(()=>__gameQA.Game.state==='battle');await wait(400);s=await st(page);
    assert.ok(s.phase===1&&s.lives===4&&s.turrets===7&&s.dens===0&&s.evo.length===0&&s.gate===6500&&!s.gateDead&&s.base===6500,'再攻一次应完整重置');
    await wait(1200);await page.keyboard.press('KeyP');await wait(300);s=await st(page);assert.ok(s.paused&&s.state==='paused');
    await page.screenshot({path:path.join(out,'09-pause.png')});
    await page.click('#btnRestartLv');await wait(500);s=await st(page);
    assert.ok(s.state==='battle'&&!s.paused&&s.elapsed<1,'暂停菜单「重开本关」应重新开局');
    ok('结算「再攻一次」与暂停菜单「重开本关」都回到全新的第一步');

    // 19. 失败：重生次数用完 / 时间耗尽；更换难度
    await page.evaluate(()=>{const z=__gameQA.zerg;z.lives=0;z.bug.invuln=0;z.hurt(99999);});await wait(300);s=await st(page);
    assert.ok(s.over&&s.result);assert.match(s.title,/失败/);assert.equal(s.grade,'');
    await page.screenshot({path:path.join(out,'10-defeat.png')});
    await page.click('#zergResultMenu');await wait(300);s=await st(page);assert.ok(s.menu&&!s.active&&s.state==='menu','「更换难度」应回到简报');
    await page.click('[data-zerg-diff="easy"]');await page.click('#zergStart');await page.waitForFunction(()=>__gameQA.zergOn());await wait(400);s=await st(page);
    assert.ok(s.diff==='easy'&&s.squad===3&&s.lives===5&&s.gate===5000,'简单难度守军 3 人、可重生 5 次、城门 5000');near(s.time,360,2,'简单难度限时');
    const easyBuildings=s.buildings;
    await page.evaluate(()=>{__gameQA.zerg.timeLeft=.05;});await wait(300);s=await st(page);
    assert.ok(s.over&&/失败/.test(s.title),'时间耗尽应判负');
    ok('重生次数用完与时间耗尽都判负并写明推进到第几步；「更换难度」回简报，简单难度守军 3 人 / 设施 '+easyBuildings+' 座 / 限时 6 分钟');

    // 20. 回主菜单：世界复原，战役照常
    await page.click('#zergResultBack');await wait(400);
    const back=await page.evaluate(()=>{const g=__gameQA;return {state:g.Game.state,main:!document.getElementById('menuMain').classList.contains('hidden'),zerg:document.getElementById('stage').classList.contains('zerg-mode'),monsters:g.monsters.length,buildings:g.buildings.length,squad:g.squad.length,gateMax:g.gate.maxHp,gateDead:g.gate.dead,playerDead:g.player.dead,mode:g.getCamMode(),view:g.getCamView(),saved:localStorage.getItem('chongchao-person'),hud:!document.getElementById('zergHud').classList.contains('hidden')};});
    assert.deepEqual({state:back.state,main:back.main,zerg:back.zerg,monsters:back.monsters,buildings:back.buildings,squad:back.squad,gateMax:back.gateMax,gateDead:back.gateDead,playerDead:back.playerDead,hud:back.hud},
      {state:'menu',main:true,zerg:false,monsters:0,buildings:0,squad:0,gateMax:2500,gateDead:false,playerDead:false,hud:false});
    assert.deepEqual({mode:back.mode,view:back.view,saved:back.saved},person0,'退出后人称与视角偏好应还原');
    assert.deepEqual(await snapStore(page),store0,'退出后本机存储（除虫族战绩与难度）应与进入前逐键相同');
    await page.evaluate(()=>__gameQA.newGame(false));await wait(600);
    const camp=await page.evaluate(()=>{const g=__gameQA;return {state:g.Game.state,dead:g.player.dead,visible:g.player.mesh.visible,gate:g.gate.maxHp,base:g.base.maxHp===g.baseMaxHp(),zerg:g.zergOn()};});
    assert.deepEqual(camp,{state:'prep',dead:false,visible:true,gate:2500,base:true,zerg:false});
    ok('回主菜单后虫、设施、守军、地穴全部清除，城门与核心耐久、人称偏好还原；随后开新战役正常进入布防');
    await ctx.close();

    /* ===== 负载帧率（桌面 1280×720）===== */
    ctx=await browser.newContext({viewport:{width:1280,height:720}});page=await ctx.newPage();watch(page);await open(page,url);
    await startZerg(page,'normal');await god(page);
    await page.evaluate(()=>{const g=__gameQA,z=g.zerg;for(const o of z.outposts)for(const t of [...o.turrets])g.damageBuilding(t,99999);});await wait(300);
    await page.click('#zgEvoRow button');await wait(200);
    await page.evaluate(()=>{const g=__gameQA,z=g.zerg;z.bug.mesh.position.set(0,g.groundY(0,12),12);g.setCamYaw(Math.PI);z.biomass=9999;z.shellCd=1;});
    for(let i=0;i<8;i++){await page.evaluate(()=>{const z=__gameQA.zerg;z.cd.brood=0;z.cd.flyer=0;});await page.keyboard.press(i%2?'KeyI':'KeyU');await wait(120);}
    await page.evaluate(()=>__gameQA.startMeasure());await page.keyboard.down('KeyW');await wait(5000);await page.keyboard.up('KeyW');
    const perf=await page.evaluate(()=>{const m=__gameQA.endMeasure();return {fps:m.averageFPS,p95:m.p95Ms,over50:m.over50ms,calls:m.drawCalls,tris:m.triangles,renderer:m.renderer,swarm:__gameQA.monsters.length};});
    assert.ok(perf.fps>=30,'攻城负载下平均帧率应不低于 30，实际 '+perf.fps.toFixed(1));
    await page.screenshot({path:path.join(out,'11-siege-load.png')});
    ok(`攻城负载（场上虫 ${perf.swarm} 只、城头火力与炮击同屏，持续前进 5 秒）：平均 ${perf.fps.toFixed(0)} FPS，P95 ${perf.p95.toFixed(1)}ms，超 50ms 长帧 ${perf.over50} 次，${perf.calls} 次绘制 / ${perf.tris} 三角形；${perf.renderer}`);
    await ctx.close();

    /* ===== 手机横屏 844×390 触屏 ===== */
    ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2});page=await ctx.newPage();watch(page);await open(page,url);
    await page.evaluate(()=>__gameQA.setDeviceMode('touch'));await wait(300);
    await page.evaluate(()=>document.getElementById('btnZerg').click());await wait(300);
    assert.ok(await inView(page,'#zergStart,#zergBack,#zgDiffRow button'),'手机横屏简报的难度与开始按钮应完整可见');
    await page.screenshot({path:path.join(out,'12-touch-briefing.png')});
    await page.evaluate(()=>document.getElementById('zergStart').click());await page.waitForFunction(()=>__gameQA.zergOn());await wait(500);await god(page);
    const touch=await page.evaluate(()=>{const t=id=>document.getElementById(id).textContent,d=id=>getComputedStyle(document.getElementById(id)).display;return {labels:['vJ','vK','vL','vU','vI','vO','vH'].map(t).join('|'),vX:d('vX'),sprint:d('vSPRINT'),bar:d('zgBar'),joy:d('joyBase')};});
    assert.match(touch.labels,/^撕咬\|酸液\|冲刺\|战士\|飞虫\|蜕皮\|号令/);assert.equal(touch.vX,'none');assert.equal(touch.sprint,'none');assert.equal(touch.bar,'none');assert.notEqual(touch.joy,'none');
    assert.ok(await inView(page,'#zgQueen,#zgTop,#zgRadar,#vJ,#vK,#vL,#vU,#vI,#vO,#vH,#joyBase'),'手机横屏战况条、雷达、摇杆与 7 个技能键应完整可见');
    const box=await page.locator('#vK').boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await wait(250);s=await st(page);
    assert.ok(s.cd.acid>.8,'点酸液键应触发酸液');
    assert.match(await page.evaluate(()=>document.getElementById('vK').textContent),/酸液\s+\ds/,'冷却中应在键上显示剩余秒数');
    await page.screenshot({path:path.join(out,'13-touch-hud.png')});
    await page.evaluate(()=>{const g=__gameQA;for(const o of g.zerg.outposts)for(const t of [...o.turrets])g.damageBuilding(t,99999);});await wait(300);
    assert.ok(await inView(page,'#zgEvoRow button'),'手机横屏进化三选一应完整可见');
    await page.screenshot({path:path.join(out,'14-touch-evolve.png')});
    const card=await page.locator('#zgEvoRow button').nth(1).boundingBox();await page.touchscreen.tap(card.x+card.width/2,card.y+card.height/2);await wait(300);
    assert.equal((await st(page)).evo.length,1,'触屏点卡片应选定进化');
    await page.evaluate(()=>__gameQA.damageGate(999999));await wait(400);await page.evaluate(()=>document.querySelector('#zgEvoRow button').click());await wait(200);
    await page.evaluate(()=>__gameQA.damageBase(999999));await wait(500);
    assert.ok(await inView(page,'#zergAgain,#zergResultMenu,#zergResultBack,#zgStats > div'),'手机横屏结算数据与按钮应完整可见');
    await page.screenshot({path:path.join(out,'15-touch-result.png')});
    await page.evaluate(()=>document.getElementById('zergResultBack').click());await wait(300);
    assert.equal(await page.evaluate(()=>['vJ','vK','vH','vU'].map(id=>document.getElementById(id).textContent).join('|')),'射击|跳跃|医疗|手雷','退出后触屏键应还原为战役标签');
    ok('手机横屏 844×390：简报、战况条、雷达、摇杆与 7 个技能键（撕咬/酸液/冲刺/战士/飞虫/蜕皮/号令）完整可见，换枪与跑步键隐藏；点按触发技能并在键上显示冷却；进化与结算面板完整可点；退出后按键标签还原');
    await ctx.close();

    /* ===== 手机竖屏 390×844：自动旋转为横屏布局 ===== */
    ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});page=await ctx.newPage();watch(page);await open(page,url);
    await page.evaluate(()=>__gameQA.setDeviceMode('touch'));await wait(400);
    await page.evaluate(()=>document.getElementById('btnZerg').click());await wait(300);
    assert.ok(await inView(page,'#zergStart,#zgDiffRow button'),'竖屏旋转后的简报按钮应在屏内');
    await page.evaluate(()=>document.getElementById('zergStart').click());await page.waitForFunction(()=>__gameQA.zergOn());await wait(600);
    const rot=await page.evaluate(()=>{const st=document.getElementById('stage');return {w:st.clientWidth,h:st.clientHeight,transform:getComputedStyle(st).transform!=='none'};});
    assert.ok(rot.w>rot.h&&rot.transform,'竖屏手机上舞台应旋转为横屏逻辑尺寸');
    assert.ok(await inView(page,'#zgQueen,#zgRadar,#vJ,#vH,#joyBase'),'竖屏旋转后战况条与按键应在屏内');
    await page.screenshot({path:path.join(out,'16-portrait.png')});
    ok(`手机竖屏 390×844：舞台旋转为 ${rot.w}×${rot.h} 横屏逻辑布局，简报、战况条、雷达与技能键都在屏内`);
    await ctx.close();

    assert.deepEqual(errors,[],'不应有页面错误');
    ok('四种视口全程无页面错误');
  }catch(e){
    console.error('✗ 失败：'+e.message);results.push('✗ 失败：'+e.message);process.exitCode=1;
    if(errors.length)console.error('页面错误：',errors.slice(0,5));
  }finally{
    let head='';try{head=execSync('git rev-parse --short HEAD',{cwd:__dirname}).toString().trim();}catch{}
    const passed=process.exitCode?'未通过':'通过';
    fs.writeFileSync(path.join(out,'results.md'),`# 虫族模式 v2 验证记录\n\n- 结论：${passed}（${results.filter(r=>!r.startsWith('✗')).length} 项检查）\n- 运行：\`node verify-zerg-mode.cjs\`，Edge headless（ANGLE D3D11），本地静态服务加载 game.compat.js\n- 代码基线：${head}（运行时工作区可能含未提交改动）\n- 范围：桌面 1280×720、手机横屏 844×390、手机竖屏 390×844 的设备模拟；不是真机验收，多指触控与手机真实性能未测\n\n${results.map(r=>'- '+r).join('\n')}\n`);
    await browser.close();server.close();
  }
})();
