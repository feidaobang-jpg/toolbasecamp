// Toy 预览 / 公开页实测：在 B 站 Toy 外壳的游戏 iframe 里走一遍虫族模式 v2（电脑视口 + 手机视口）。
// 用法：PREVIEW_URL=https://www.bilibili.com/toy/preview/<id>/index.html node verify-zerg-toy.cjs
// 外壳把游戏放在 www.bilibilitoy.com 的 iframe 里，对 iframe 自身 goto 带 qa 参数的地址；手机视口截图后触摸进不了 iframe，截图放最后。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PW||'D:/project/godot/absurd-3d-daily/node_modules/playwright');
const url=process.env.PREVIEW_URL;if(!url)throw new Error('PREVIEW_URL required');
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'qa','out','zerg-toy');fs.mkdirSync(OUT,{recursive:true});
const MANIFEST=process.env.TOY_MANIFEST||path.join(__dirname,'../../dist/toy/chongchao-qianshao/manifest.json');
const MOBILE_UA='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const results=[],errors=[];
const pass=(n,d)=>{results.push({name:n,detail:d});console.log('PASS',n,d===undefined?'':JSON.stringify(d));};
async function gameFrame(page){
  await page.goto(url,{waitUntil:'domcontentloaded'});
  let frame=null;for(let i=0;i<60&&!frame;i++){frame=page.frames().find(f=>/bilibilitoy\.com/.test(f.url()));if(!frame)await sleep(500);}
  if(!frame)throw new Error('game iframe not found');
  const u=new URL(frame.url());u.searchParams.set('qa','1');await frame.goto(u.href);
  await frame.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});return frame;
}
const st=f=>f.evaluate(()=>{const g=__gameQA,z=g.zerg,b=z.bug,shown=id=>!document.getElementById(id).classList.contains('hidden');return {state:g.Game.state,active:z.active,over:z.over,frozen:z.frozen,phase:z.phase,
  bug:!!(b&&!b.dead),swarm:g.monsters.filter(m=>!m.dead&&!m.zergPlayer).length,squad:g.squad.length,turrets:z.outposts.reduce((n,o)=>n+o.turrets.filter(t=>!t.dead).length,0),dens:z.dens.length,
  gate:g.gate.hp,gateMax:g.gate.maxHp,base:g.base.hp,baseMax:g.base.maxHp,acid:z.cd.acid||0,evo:z.evoTaken.length,camYaw:g.getCamYaw(),
  menu:shown('zergMenu'),evolve:shown('zergEvolve'),result:shown('zergResult'),main:shown('menuMain'),title:document.getElementById('zgResultTitle').textContent,grade:document.getElementById('zgGrade').textContent};});
const inView=(f,sel)=>f.evaluate(sel=>[...document.querySelectorAll(sel)].every(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;}),sel);
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
  try{
    // 电脑视口
    const p=await b.newPage({viewport:{width:1280,height:720}});p.on('pageerror',e=>errors.push(e.message));
    let f=await gameFrame(p);
    if(fs.existsSync(MANIFEST)){
      const want=JSON.parse(fs.readFileSync(MANIFEST,'utf8')).files['game.compat.js'],got=await f.evaluate(async()=>{const src=[...document.scripts].map(s=>s.src).find(s=>/game\.compat\.js/.test(s));return [...new Uint8Array(await (await fetch(src,{cache:'no-store'})).arrayBuffer())];});
      const sha=crypto.createHash('sha256').update(Buffer.from(got)).digest('hex');assert.equal(sha,want);pass('页面运行的脚本与本次上传的包一致',{sha256:sha.slice(0,16)});
    }
    const store0=await f.evaluate(()=>Object.keys(localStorage).filter(k=>!k.startsWith('chongchao-zerg-')).sort().map(k=>k+'='+localStorage.getItem(k)));
    await f.click('#btnZerg');await sleep(300);let s=await st(f);
    assert.ok(s.menu&&!s.active);assert.equal(await f.locator('#zgSteps > div').count(),3);pass('入口先进简报，三步目标与三档难度可见');
    await f.click('[data-zerg-diff="normal"]');await f.click('#zergStart');await f.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle');await sleep(500);s=await st(f);
    assert.ok(s.bug&&s.phase===1&&s.swarm===8&&s.squad===5&&s.turrets===7&&Math.abs(Math.abs(s.camYaw)-Math.PI)<.05);
    const hud=await f.evaluate(()=>({bar:document.querySelectorAll('#zgBar .zg-ab').length,marker:document.querySelector('#zgMarker span').textContent,campaign:getComputedStyle(document.getElementById('hudTop')).display}));
    assert.equal(hud.bar,7);assert.match(hud.marker,/哨站/);assert.equal(hud.campaign,'none');pass('开局面朝要塞，战况条、技能栏与目标标记就位',{swarm:s.swarm,squad:s.squad,turrets:s.turrets,marker:hud.marker});
    await f.evaluate(()=>{window.__god=setInterval(()=>{const q=__gameQA.zerg.bug;if(q)q.invuln=5;},100);});
    const z0=await f.evaluate(()=>__gameQA.zerg.bug.mesh.position.z);await p.keyboard.down('KeyW');await sleep(700);await p.keyboard.up('KeyW');
    const z1=await f.evaluate(()=>__gameQA.zerg.bug.mesh.position.z);assert.ok(z0-z1>3);pass('键盘 W 朝要塞前进',{meters:+(z0-z1).toFixed(1)});
    await f.evaluate(()=>{__gameQA.damageGate(500);});s=await st(f);assert.equal(s.gate,s.gateMax);pass('第一步城门护盾生效');
    await f.evaluate(()=>{const g=__gameQA;for(const o of g.zerg.outposts)for(const t of [...o.turrets])g.damageBuilding(t,99999);});await sleep(300);s=await st(f);
    assert.ok(s.phase===2&&s.frozen&&s.evolve&&s.dens===3);await p.keyboard.press('ArrowRight');await p.keyboard.press('Enter');await sleep(300);s=await st(f);
    assert.ok(!s.frozen&&s.evo===1);pass('清完哨站进入第二步，键盘选定进化后恢复');
    await p.keyboard.press('KeyK');await sleep(150);s=await st(f);assert.ok(s.acid>.8);pass('K 发射酸液并进入冷却');
    await f.evaluate(()=>__gameQA.damageGate(999999));await sleep(400);await f.click('#zgEvoRow button');await sleep(300);s=await st(f);
    assert.ok(s.phase===3&&s.dens===4&&s.evo===2);
    await f.evaluate(()=>__gameQA.damageBase(999999));await sleep(500);s=await st(f);
    assert.ok(s.over&&s.result);assert.match(s.title,/胜利/);assert.match(s.grade,/评级/);pass('破门进入第三步，核心归零胜利结算',{grade:s.grade});
    await p.screenshot({path:path.join(OUT,'toy-desktop-result.png')});
    await f.click('#zergResultBack');await sleep(400);s=await st(f);assert.ok(s.main&&s.state==='menu');
    const store1=await f.evaluate(()=>Object.keys(localStorage).filter(k=>!k.startsWith('chongchao-zerg-')).sort().map(k=>k+'='+localStorage.getItem(k)));
    assert.deepEqual(store1,store0);pass('回主菜单后本机其他存储逐键未变');
    await p.close();

    // 手机视口（Toy 外壳内）
    const ctx=await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:2,userAgent:MOBILE_UA});
    const m=await ctx.newPage();m.on('pageerror',e=>errors.push(e.message));
    f=await gameFrame(m);
    await f.evaluate(()=>__gameQA.setDeviceMode('touch'));await sleep(300);
    await f.evaluate(()=>document.getElementById('btnZerg').click());await sleep(300);
    assert.ok(await inView(f,'#zergStart,#zgDiffRow button'));pass('手机视口简报的难度与开始按钮完整可见');
    await f.evaluate(()=>document.getElementById('zergStart').click());await f.waitForFunction(()=>__gameQA.zergOn());await sleep(500);
    await f.evaluate(()=>{window.__god=setInterval(()=>{const q=__gameQA.zerg.bug;if(q)q.invuln=5;},100);});
    const labels=await f.evaluate(()=>['vJ','vK','vL','vU','vI','vO','vH'].map(id=>document.getElementById(id).textContent).join('|'));
    assert.match(labels,/^撕咬\|酸液\|冲刺\|战士\|飞虫\|蜕皮\|号令/);assert.ok(await inView(f,'#zgQueen,#zgRadar,#vJ,#vK,#vL,#vU,#vI,#vO,#vH,#joyBase'));
    pass('手机视口战况条、雷达、摇杆与 7 个技能键完整可见',{labels});
    await f.locator('#vK').tap();await sleep(250);s=await st(f);assert.ok(s.acid>.8);pass('点按酸液键触发技能');
    await f.evaluate(()=>{const g=__gameQA;for(const o of g.zerg.outposts)for(const t of [...o.turrets])g.damageBuilding(t,99999);});await sleep(300);
    assert.ok(await inView(f,'#zgEvoRow button'));await f.locator('#zgEvoRow button').nth(1).tap();await sleep(300);s=await st(f);assert.equal(s.evo,1);pass('手机视口进化三选一完整可见并可点选');
    await f.evaluate(()=>__gameQA.zerg.stop());await sleep(300);
    assert.equal(await f.evaluate(()=>document.getElementById('vJ').textContent),'射击');pass('退出后触屏键还原');
    await m.screenshot({path:path.join(OUT,'toy-mobile.png')});
    assert.deepEqual(errors,[]);pass('无页面错误');
    fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({url,at:new Date().toISOString(),passed:results.length,results},null,1));
    console.log('ALL PASSED',results.length);
  }catch(e){console.error('FAIL',e.message,errors.slice(0,3));process.exitCode=1;}
  finally{await b.close();}
})();
