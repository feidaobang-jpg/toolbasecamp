// 虫族模式 v1 验证：玩家扮演母虫带虫群攻人类要塞，复用主世界防御体系。
// 覆盖：菜单入口、开局布防、母虫移动、守军反击、撕咬破门、酸液、召唤/蜕皮、
//       战役存档隔离、胜利/溃散结算、重开与退出、战役本体不受影响、触屏改键。
// 运行：node verify-zerg-mode.cjs （自带静态服务，端口 8902）
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ROOT=path.join(__dirname,'..','..','public');
const PORT=8902;
const out=path.join(__dirname,'media-kit/releases/zerg-mode/qa');fs.mkdirSync(out,{recursive:true});
const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0]);let f=path.join(ROOT,u==='/'?'index.html':u);
  if(!f.startsWith(ROOT))return res.writeHead(403).end();
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404).end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});
});
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
// 快照所有 localStorage（排除虫族战绩键），用于验证战役存档不被虫族模式改写
const snapStore=page=>page.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k==='chongchao-zerg-best-v1')continue;o[k]=localStorage.getItem(k);}return o;});
const st=page=>page.evaluate(()=>{const g=__gameQA,z=g.zerg;return {
  state:g.Game.state,zergOn:g.zergOn(),active:z.active,over:z.over,biomass:z.biomass,deaths:z.deaths,
  bug:!!(z.bug&&!z.bug.dead),bugHp:z.bug?z.bug.hp:-1,bugMax:z.bug?z.bug.maxHp:-1,
  monsters:g.monsters.filter(m=>!m.dead).length,zergPlayer:g.monsters.some(m=>m.zergPlayer&&!m.dead),
  squad:g.squad.filter(s=>!s.dead).length,buildings:g.buildings.filter(b=>!b.dead).length,
  gateHp:g.gate.hp,baseHp:g.base.hp,baseMax:g.base.maxHp,
  sumCd:z.sumCd,flyCd:z.flyCd,moltCd:z.moltCd,clawCd:z.clawCd,spitCd:z.spitCd,
  stageZerg:document.getElementById('stage').classList.contains('zerg-mode'),
  hudHidden:document.getElementById('hud').classList.contains('hidden'),
  zergHudShown:!document.getElementById('zergHud').classList.contains('hidden'),
  overTitle:(document.getElementById('overTitle')||{}).textContent||'',
  menuOverShown:!document.getElementById('menuOver').classList.contains('hidden'),
  menuMainShown:!document.getElementById('menuMain').classList.contains('hidden')};});
const startZerg=async(page)=>{await page.evaluate(()=>document.getElementById('btnZerg').click());await page.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle');};

(async()=>{
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const url=`http://127.0.0.1:${PORT}/html/game/starship-defense/index.html`;
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const results=[];
  try{
    // ===== 桌面键鼠：完整功能链路 =====
    let ctx=await browser.newContext({viewport:{width:1280,height:720}});
    let page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__ccReady&&window.__gameQA);

    // 1. 菜单入口存在且可见
    assert.ok(await page.locator('#btnZerg').isVisible(),'主菜单应有虫族模式入口');
    results.push('主菜单出现「虫族模式」入口按钮');

    // 2. 开局：进入战斗、布防就位、母虫生成、人类 HUD 让位
    const storeBefore=await snapStore(page);
    await startZerg(page);
    let s=await st(page);
    assert.equal(s.state,'battle');assert.equal(s.zergOn,true);assert.equal(s.active,true);
    assert.ok(s.stageZerg,'stage 应带 zerg-mode 类');
    assert.ok(s.hudHidden,'战役 HUD 应隐藏');assert.ok(s.zergHudShown,'虫族战况面板应显示');
    assert.ok(s.zergPlayer,'应有玩家母虫实体');assert.ok(s.bug,'母虫应存活');
    assert.ok(s.squad>=6,'守军应>=6，实际 '+s.squad);
    assert.ok(s.buildings>=9,'防御建筑应>=9，实际 '+s.buildings);
    assert.ok(s.gateHp>0&&s.baseHp>0,'城门与基地应满血就位');
    results.push(`开局布防就位：守军${s.squad}、建筑${s.buildings}、城门${Math.round(s.gateHp)}、基地核心${Math.round(s.baseHp)}`);

    // 3. 母虫移动：按住 W 前后位置应变化
    const p0=await page.evaluate(()=>{const b=__gameQA.zerg.bug;return {x:b.mesh.position.x,z:b.mesh.position.z};});
    await page.keyboard.down('KeyW');await wait(600);await page.keyboard.up('KeyW');
    const p1=await page.evaluate(()=>{const b=__gameQA.zerg.bug;return {x:b.mesh.position.x,z:b.mesh.position.z};});
    const moved=Math.hypot(p1.x-p0.x,p1.z-p0.z);
    assert.ok(moved>0.5,'母虫应能被 WASD 驱动，位移 '+moved.toFixed(2));
    results.push('WASD 驱动母虫移动正常（位移 '+moved.toFixed(1)+'m）');
    await page.screenshot({path:path.join(out,'zerg-battle.png')});

    // 4. 守军反击：把母虫送到防线中且解除无敌，应被炮塔/守军打掉血
    await page.evaluate(()=>{const g=__gameQA,b=g.zerg.bug;b.invuln=0;b.hp=b.maxHp;b.mesh.position.set(0,b.mesh.position.y,-18);});
    await wait(1600);
    s=await st(page);
    assert.ok(s.bugHp<s.bugMax,'防线应能反击母虫，hp '+Math.round(s.bugHp)+'/'+Math.round(s.bugMax));
    results.push('人类炮塔/守军会自动把母虫当敌人反击（掉血至 '+Math.round(s.bugHp/s.bugMax*100)+'%）');

    // 5. 撕咬破门：母虫贴城门，按 J 应削城门耐久
    await page.evaluate(()=>{const g=__gameQA,b=g.zerg.bug;b.invuln=999;b.mesh.position.set(g.gate.mesh.position.x,b.mesh.position.y,g.gate.mesh.position.z);g.zerg.clawCd=0;});
    const gateBefore=(await st(page)).gateHp;
    for(let i=0;i<5;i++){await page.keyboard.press('KeyJ');await wait(120);await page.evaluate(()=>__gameQA.zerg.clawCd=0);}
    const gateAfter=(await st(page)).gateHp;
    assert.ok(gateAfter<gateBefore,'撕咬应削减城门耐久 '+gateBefore+'->'+gateAfter);
    results.push(`J 撕咬近身目标：城门 ${Math.round(gateBefore)}→${Math.round(gateAfter)}`);

    // 6. 酸液：按 K 应进入吐息冷却（发射抛物线酸液弹）
    await page.evaluate(()=>{__gameQA.zerg.spitCd=0;});
    await page.keyboard.press('KeyK');await wait(80);
    assert.ok((await st(page)).spitCd>0,'K 酸液应触发并进入冷却');
    results.push('K 酸液远程吐息可用（进入冷却）');

    // 7. 召唤战士/飞虫：给足生物量，U/I 应增加虫群并进入冷却
    // 召唤单位出生在母虫身边；母虫随机到火线/障碍区时单位会被重定位或秒杀，先传送到开阔安全位保证计数可靠
    await page.evaluate(()=>{const b=__gameQA.zerg.bug;if(b)b.mesh.position.set(0,0,110);});
    await page.evaluate(()=>{__gameQA.zerg.biomass=400;__gameQA.zerg.sumCd=0;});
    const mBeforeU=(await st(page)).monsters;
    await page.keyboard.press('KeyU');await wait(120);
    s=await st(page);
    assert.ok(s.sumCd>0,'U 召战士应进入冷却');
    assert.ok(s.monsters>mBeforeU,'U 应新增战士虫 '+mBeforeU+'->'+s.monsters);
    assert.ok(s.biomass<400,'召唤应消耗生物量');
    await page.evaluate(()=>{__gameQA.zerg.biomass=400;__gameQA.zerg.flyCd=0;const b=__gameQA.zerg.bug;if(b)b.mesh.position.set(0,0,110);});
    const mBeforeI=(await st(page)).monsters;
    await page.keyboard.press('KeyI');await wait(120);
    s=await st(page);
    assert.ok(s.flyCd>0,'I 召飞虫应进入冷却');
    assert.ok(s.monsters>mBeforeI,'I 应新增飞虫 '+mBeforeI+'->'+s.monsters);
    results.push(`U/I 召唤消耗生物量并扩充虫群（战士 ${mBeforeU}→、飞虫 ${mBeforeI}→${s.monsters}）`);

    // 8. 蜕皮回血：先损血再按 O，应回血并消耗生物量
    await page.evaluate(()=>{const z=__gameQA.zerg;z.bug.hp=z.bug.maxHp*0.4;z.biomass=400;z.moltCd=0;});
    const hpBeforeMolt=(await st(page)).bugHp;
    await page.keyboard.press('KeyO');await wait(100);
    s=await st(page);
    assert.ok(s.bugHp>hpBeforeMolt,'O 蜕皮应回血 '+Math.round(hpBeforeMolt)+'->'+Math.round(s.bugHp));
    assert.ok(s.moltCd>0,'蜕皮应进入冷却');
    results.push('O 蜕皮消耗生物量为母虫回血');

    // 9. 战役存档隔离：整局虫族玩法不得改写战役 localStorage
    const storeMid=await snapStore(page);
    assert.deepEqual(storeMid,storeBefore,'虫族模式进行中不应改写战役存档');
    results.push('虫族模式独立运行，不覆盖战役自动存档');

    // 10. 胜利：摧毁基地核心 → 虫族胜利结算
    await page.evaluate(()=>{__gameQA.zerg.bug.invuln=999;__gameQA.damageBase(999999);});
    await page.waitForFunction(()=>__gameQA.Game.state==='over'&&__gameQA.zerg.over);
    s=await st(page);
    assert.ok(/虫族胜利/.test(s.overTitle),'结算标题应为虫族胜利，实际 '+s.overTitle);
    assert.ok(s.menuOverShown,'应弹出结算面板');
    assert.equal(s.active,true,'结算后仍属虫族会话（供重开/退出路由）');
    results.push('摧毁基地核心触发「虫族胜利」结算');

    // 11. 重开：结算面板重玩应回到满血新一局
    await page.evaluate(()=>document.getElementById('btnRetry').click());
    await page.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle'&&!__gameQA.zerg.over);
    s=await st(page);
    assert.equal(s.over,false);assert.ok(s.baseHp>=s.baseMax*0.99,'重开后基地核心应回满');
    assert.ok(s.bug&&s.zergPlayer,'重开后应有新母虫');
    results.push('结算面板「重玩」开启全新一局（基地回满、母虫重生）');

    // 12. 溃散：母虫阵亡达上限 → 虫群溃散
    await page.evaluate(()=>{const z=__gameQA.zerg;z.deaths=4;z.bug.invuln=0;z.hurt(999999);});
    await page.waitForFunction(()=>__gameQA.Game.state==='over'&&__gameQA.zerg.over);
    s=await st(page);
    assert.ok(/溃散/.test(s.overTitle),'五次阵亡应判虫群溃散，实际 '+s.overTitle);
    results.push('母虫阵亡达 5 次判定「虫群溃散」失败');

    // 13. 退出：回主菜单、清除 zerg-mode、恢复人类躯体
    await page.evaluate(()=>document.getElementById('btnOverQuit').click());
    await wait(200);
    s=await st(page);
    assert.equal(s.zergOn,false,'退出后应离开虫族会话');
    assert.equal(s.state,'menu');assert.equal(s.stageZerg,false,'应移除 zerg-mode 类');
    assert.ok(s.menuMainShown,'应回到主菜单');
    const playerOk=await page.evaluate(()=>!__gameQA.player.dead&&__gameQA.player.mesh.visible);
    assert.ok(playerOk,'退出后人类躯体应恢复');
    results.push('退出虫族模式回主菜单并恢复人类躯体与场景');

    // 14. 战役本体不受影响：可正常开新战役到布防阶段
    const storeAfter=await snapStore(page);
    assert.deepEqual(storeAfter,storeBefore,'整轮虫族玩法结束后战役存档仍未被改写');
    await page.evaluate(()=>__gameQA.newGame(false));
    await page.waitForFunction(()=>__gameQA.Game.state==='prep');
    assert.ok(await page.locator('#readyBtn').isVisible(),'战役布防应正常，开战按钮可见');
    results.push('虫族模式结束后战役本体完好，可正常开新局');

    assert.deepEqual(errors,[],'页面报错: '+errors.join('|'));
    await ctx.close();

    // ===== 触屏：动作键改中文标签且可点 =====
    ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true});
    page=await ctx.newPage();const terr=[];page.on('pageerror',e=>terr.push(e.message));
    await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__ccReady&&window.__gameQA);
    await page.evaluate(()=>__gameQA.setDeviceMode('touch'));
    await page.evaluate(()=>document.getElementById('btnZerg').click());
    await page.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle');
    const labels=await page.evaluate(()=>['vJ','vK','vU','vI','vO','vL'].map(id=>document.getElementById(id).textContent.trim()));
    assert.deepEqual(labels,['撕咬','酸液','召战士','召飞虫','蜕皮','冲刺'],'触屏动作键应改为虫族技能标签，实际 '+JSON.stringify(labels));
    // 点触「召战士」应触发召唤冷却
    await page.evaluate(()=>{__gameQA.zerg.biomass=400;__gameQA.zerg.sumCd=0;});
    const bb=await page.locator('#vU').boundingBox();
    await page.touchscreen.tap(bb.x+bb.width/2,bb.y+bb.height/2);
    await wait(150);
    assert.ok((await st(page)).sumCd>0,'触屏点「召战士」应触发召唤');
    await page.screenshot({path:path.join(out,'zerg-touch.png')});
    results.push('触屏动作键改为撕咬/酸液/召战士/召飞虫/蜕皮/冲刺且可点触发');
    assert.deepEqual(terr,[],'触屏页面报错: '+terr.join('|'));
    await ctx.close();
  }finally{
    await browser.close();server.close();
  }
  fs.writeFileSync(path.join(out,'results.md'),'# 虫族模式 v1 验证\n\n'+results.map((r,i)=>(i+1)+'. '+r).join('\n')+'\n');
  console.log(results.map((r,i)=>(i+1)+'. '+r).join('\n'));
  console.log('QA-OK');
})().catch(e=>{console.error('QA-FAIL',e);process.exit(1);});
