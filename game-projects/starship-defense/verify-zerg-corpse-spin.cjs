// 网友反馈修复验证（2026-10-10）：
//  A. 虫族模式母虫阵亡后不留孤立模型，切回战役/周目也不残留（我不是abbie）；
//  B. 直升机悬停在虫（含虫王/BOSS）正上方时，虫不再原地打转（fallen_chen：武直里飞的虫王上空时虫王会打转）；
//  C. 回归：地面虫朝目标行军不受朝向保护影响。
// 运行：node verify-zerg-corpse-spin.cjs [页面URL] （默认自带静态服务 8903；传线上 URL 可复现修复前行为）
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ROOT=path.join(__dirname,'..','..','public');
const PORT=8903;
const out=path.join(__dirname,'media-kit/releases/web-zerg-corpse-spinfix/qa');fs.mkdirSync(out,{recursive:true});
const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0]);let f=path.join(ROOT,u==='/'?'index.html':u);
  if(!f.startsWith(ROOT))return res.writeHead(403).end();
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404).end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});
});
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

(async()=>{
  const remote=process.argv[2]||'';
  if(!remote)await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const url=remote||`http://127.0.0.1:${PORT}/html/game/starship-defense/index.html`;
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const results=[];
  try{
    // ===== A. 母虫阵亡不留孤立模型 =====
    let ctx=await browser.newContext({viewport:{width:1280,height:720}});
    let page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__ccReady&&window.__gameQA);
    await page.evaluate(()=>document.getElementById('btnZerg').click());
    await page.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle');
    const born=await page.evaluate(()=>{const mo=__gameQA.zerg.bug;if(!mo)return null;window.__qaMesh=mo.mesh;return {inScene:!!mo.mesh.parent,hp:mo.hp};});
    assert.ok(born&&born.inScene,'母虫出生后网格应在场景内');
    await page.evaluate(()=>{__gameQA.zerg.bug.invuln=0;__gameQA.zerg.hurt(999999);}); // 母虫阵亡（不走 killMonster 的路径）
    await wait(1600); // 尸体生命周期 0.75s + 余量
    const died=await page.evaluate(()=>{const m=window.__qaMesh;return {inScene:!!m.parent,corpses:__gameQA.visuals.corpses.length,deaths:__gameQA.zerg.deaths,listed:__gameQA.monsters.includes(m)};});
    assert.equal(died.deaths,1,'前置条件：母虫确实阵亡一次');
    assert.equal(died.inScene,false,'母虫阵亡 1.6s 后网格必须已离开场景（修复前会永久残留）');
    assert.equal(died.listed,false,'死亡母虫应已出 monsters 列');
    results.push(`A1 母虫阵亡后尸体按生命周期移除：inScene=${died.inScene} corpses=${died.corpses}`);
    // 切回战役（周目）后仍不得残留
    await page.evaluate(()=>{__gameQA.zerg.stop();__gameQA.newGame(true);});
    await wait(1200);
    const camp=await page.evaluate(()=>{const m=window.__qaMesh;return {inScene:!!m.parent,state:__gameQA.Game.state,corpses:__gameQA.visuals.corpses.length};});
    assert.equal(camp.inScene,false,'切回战役/周目后孤立模型不得残留（修复前会跟过去）');
    results.push(`A2 切回战役后无残留：inScene=${camp.inScene} state=${camp.state} corpses=${camp.corpses}`);
    assert.deepEqual(errors,[],'A 段不应有页面异常');
    await ctx.close();

    // ===== B. 直升机悬停正上方时虫不再原地打转 =====
    ctx=await browser.newContext({viewport:{width:1280,height:720}});
    page=await ctx.newPage();const errorsB=[];page.on('pageerror',e=>errorsB.push(e.message));
    await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__ccReady&&window.__gameQA);
    await page.evaluate(()=>{__gameQA.newGame(true);if(__gameQA.Game.state==='prep')__gameQA.startBattle();});
    await page.waitForFunction(()=>__gameQA.Game.state==='battle');
    const setup=await page.evaluate(()=>{
      const g=__gameQA;
      const v=g.spawnVehicle('heli');g.enterVehicle(v);
      v.mesh.position.set(-60,g.groundY(-60,150),150);v.landing=false;v.alt=40; // 高度由 v.alt 驱动，悬停 40m
      const b=g.spawnMonster('boss',-60,150,{quiet:true});
      window.__heli=v;window.__boss=b;
      return {heli:[v.mesh.position.x,v.mesh.position.y,v.mesh.position.z],boss:[b.mesh.position.x,b.mesh.position.y,b.mesh.position.z],fly:b.fly===true};
    });
    await wait(1500); // 让 BOSS 锁定正上方的直升机
    const samples=[];
    for(let i=0;i<15;i++){samples.push(await page.evaluate(()=>{const m=window.__boss.mesh;return {r:m.rotation.y,x:m.position.x,z:m.position.z,tgt:(()=>{const t=__gameQA.monsterTargets(window.__boss);return t?{kind:t.kind,dy:+(t.pos.y-m.position.y).toFixed(1),dh:+Math.hypot(t.pos.x-m.position.x,t.pos.z-m.position.z).toFixed(2)}:null;})()};}));await wait(100);}
    let spin=0,move=0;
    for(let i=1;i<samples.length;i++){spin+=Math.abs(wrap(samples[i].r-samples[i-1].r));move+=Math.hypot(samples[i].x-samples[i-1].x,samples[i].z-samples[i-1].z);}
    const tgt=samples[samples.length-1].tgt;
    results.push(`B 目标=${tgt?tgt.kind:'无'} dy=${tgt?tgt.dy:'-'} 水平距=${tgt?tgt.dh:'-'} 1.4s 累计转向=${spin.toFixed(2)}rad 累计位移=${move.toFixed(2)}m`);
    assert.ok(tgt&&(tgt.kind==='player'||tgt.kind==='vehicle')&&tgt.dy>6&&tgt.dh<2,'前置条件：BOSS 的目标应是正上方 (>6m) 的直升机');
    assert.ok(spin<0.6,`悬停正上方时 BOSS 不得原地打转（累计转向 ${spin.toFixed(2)}rad，修复前约为每帧 π 级翻转）`);
    results.push('B1 武直悬停虫王正上方：朝向稳定、不再打转');
    // ===== C. 回归：地面虫仍正常朝目标行军 =====
    const mob=await page.evaluate(()=>{const m=__gameQA.spawnMonster('mob',-20,110,{quiet:true});window.__mob=m;return [m.mesh.position.x,m.mesh.position.z];});
    await wait(4000);
    const after=await page.evaluate(()=>{const m=window.__mob;return {x:m.mesh.position.x,z:m.mesh.position.z,dead:m.dead};});
    const walked=Math.hypot(after.x-mob[0],after.z-mob[1]);
    assert.ok(after.dead||walked>5,`地面虫应朝目标行军（4s 位移 ${walked.toFixed(1)}m）`);
    results.push(`C1 地面行军回归通过：4s 位移 ${walked.toFixed(1)}m`);
    assert.deepEqual(errorsB,[],'B/C 段不应有页面异常');
    await ctx.close();
  }finally{
    await browser.close();if(!remote)server.close();
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({url,at:new Date().toISOString(),results},null,2));
  console.log(results.join('\n'));
  console.log('ALL PASS');
})().catch(e=>{console.error('FAIL:',e.message);process.exit(1);});
