// 存档提示胶囊：每 30 秒的心跳自动存档静默写盘，不再把提示顶回屏幕；玩家可感知的节点仍提示。
// 运行：node verify-save-notice.cjs （自带静态服务，端口 8907，依次测虫潮围城与枪火集结的战役模式）
// 线上/Toy 预览复验：SAVE_NOTICE_URLS="https://.../index.html,https://..." node verify-save-notice.cjs
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const ROOT=path.join(__dirname,'..','..','public');
const PORT=8907;
const GAMES=[['starship-defense','虫潮围城'],['gunfire-assembly','枪火集结']];
const REMOTE=(process.env.SAVE_NOTICE_URLS||'').split(',').map(s=>s.trim()).filter(Boolean);
// 手机横屏复验：SAVE_NOTICE_VIEWPORT=844x390（含 Toy 外壳的紧凑高度）
const VP=(process.env.SAVE_NOTICE_VIEWPORT||'1280x720').split('x').map(Number);
const TARGETS=REMOTE.length?REMOTE.map((u,i)=>[u,GAMES[i]?GAMES[i][1]:'远端'+i]):GAMES.map(([d,n])=>[`http://127.0.0.1:${PORT}/html/game/${d}/index.html`,n]);
const MIME={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff2':'font/woff2','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0]);let f=path.join(ROOT,u==='/'?'index.html':u);
  if(!f.startsWith(ROOT))return res.writeHead(403).end();
  fs.readFile(f,(e,d)=>{if(e){res.writeHead(404).end('nf');return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});
});
const chip=page=>page.evaluate(()=>{const el=document.getElementById('saveHealth');const cs=getComputedStyle(el);
  return {faded:el.classList.contains('faded'),opacity:cs.opacity,pe:cs.pointerEvents,text:el.textContent,
    visible:!!el.offsetParent,status:window.__gameQA.saveStore.status};});
(async()=>{
  await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const results=[];
  try{
    for(const [url,name] of TARGETS){
      const ctx=await browser.newContext({viewport:{width:VP[0]||1280,height:VP[1]||720},hasTouch:true});
      const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url+(url.includes('?')?'&':'?')+'qa=1');
      let f=page.mainFrame();
      if(url.includes('bilibili.com/toy/')){
        await page.locator('iframe').first().waitFor({timeout:60000});
        const h=await page.locator('iframe').first().elementHandle();f=await h.contentFrame();
        await f.goto(f.url()+(f.url().includes('?')?'&':'?')+'qa=1');
      }
      await f.waitForFunction(()=>window.__ccReady&&window.__gameQA,null,{timeout:90000});
      await f.evaluate(()=>__gameQA.newGame(false));
      await f.waitForFunction(()=>__gameQA.Game.state==='prep');
      await f.waitForFunction(()=>!__gameQA.Game.testMode);
      // 进场时提示会亮一次，等它自己淡出，作为后续判断的起点
      await f.waitForFunction(()=>document.getElementById('saveHealth').classList.contains('faded'),null,{timeout:9000});
      await f.waitForFunction(()=>parseFloat(getComputedStyle(document.getElementById('saveHealth')).opacity)<0.1);
      let c=await chip(f);assert.equal(c.faded,true,`${name}：起点应为淡出态`);
      results.push(`${name}：进场提示约 5 秒后自动淡出`);

      // 1) 心跳自动存档：写盘成功、状态文字更新，但提示保持淡出
      c=await f.evaluate(async()=>{
        const key=__gameQA.saveStore.prefix+'auto',before=__gameQA.saveStore.readRaw(key);
        await new Promise(r=>setTimeout(r,50));
        __gameQA.Game.gold+=1;                 // 让签名变化，确保真的写盘并轮转历史
        __gameQA.autoSave({notify:false});
        return {before,after:__gameQA.saveStore.readRaw(key),status:__gameQA.saveStore.status};
      }).then(async d=>({ ...d, chip:await chip(f)}));
      assert.notEqual(c.after,c.before,`${name}：心跳存档应确实写入本地`);
      assert.match(c.status,/^本地已保存/,`${name}：状态文字仍要更新，供存档面板读取`);
      assert.equal(c.chip.faded,true,`${name}：心跳自动存档不得把提示胶囊顶回屏幕`);
      assert.ok(parseFloat(c.chip.opacity)<0.1,`${name}：心跳后提示仍不可见`);
      results.push(`${name}：30 秒心跳存档静默写盘，提示不弹出（${c.status}）`);

      // 2) 玩家可感知节点（买兵/建塔/过关/手动存档走默认 notify）：提示照常出现并可点
      await f.evaluate(()=>{__gameQA.Game.gold+=2;__gameQA.autoSave();});
      // 淡入有 .35s 过渡，等它到完全不透明再判定
      await f.waitForFunction(()=>parseFloat(getComputedStyle(document.getElementById('saveHealth')).opacity)>0.99,null,{timeout:3000});
      c=await chip(f);
      assert.equal(c.faded,false,`${name}：事件型存档仍应显示提示`);
      assert.ok(parseFloat(c.opacity)>0.99,`${name}：提示应基本不透明，实际 ${c.opacity}`);
      assert.equal(c.pe,'auto',`${name}：提示期间仍可点击进入存档面板`);
      assert.match(c.text,/本地已保存/,`${name}：提示文案保持有效，实际为「${c.text}」`);
      results.push(`${name}：事件型存档仍弹出提示且可点击（${c.text}）`);

      // 3) 提示仍会在约 5 秒后淡出，不长期遮挡战场
      await f.waitForFunction(()=>document.getElementById('saveHealth').classList.contains('faded'),null,{timeout:9000});
      await f.waitForFunction(()=>parseFloat(getComputedStyle(document.getElementById('saveHealth')).opacity)<0.1);
      c=await chip(f);assert.equal(c.pe,'none',`${name}：淡出后不应接收点击`);
      results.push(`${name}：事件提示约 5 秒后淡出并让出点击`);

      // 4) 保存失败必须仍然提示，不能被静默参数吞掉
      await f.evaluate(()=>{__gameQA.saveStore.message('本地保存失败：存储不可用或空间不足，请立即导出备份',false);});
      c=await chip(f);
      assert.equal(c.faded,false,`${name}：保存失败必须立即提示`);
      assert.match(c.text,/保存失败|已保存/,`${name}：失败提示文案应可见，实际为「${c.text}」`);
      results.push(`${name}：保存失败等异常状态仍立即提示`);

      // 5) 真实 30 秒心跳：挂 class 观察器，等主循环自己存一次盘，全程提示不得闪现
      await f.evaluate(()=>{
        const el=document.getElementById('saveHealth');el.classList.add('faded');
        window.__pop=[];new MutationObserver(()=>{if(!el.classList.contains('faded'))window.__pop.push(Date.now());})
          .observe(el,{attributes:true,attributeFilter:['class']});
        window.__beforeStatus=__gameQA.saveStore.status;__gameQA.Game.gold+=3;
      });
      await f.waitForFunction(()=>__gameQA.saveStore.status!==window.__beforeStatus,null,{timeout:45000});
      const pops=await f.evaluate(()=>window.__pop);
      assert.equal(pops.length,0,`${name}：真实心跳自动存档把提示弹出了 ${pops.length} 次`);
      results.push(`${name}：真实 30 秒心跳自动存档已触发，期间提示一次都没有弹出`);

      assert.deepEqual(errors,[],`${name}：页面无 JS 报错`);
      await ctx.close();
    }
    console.log(results.map(r=>'  ✓ '+r).join('\n'));
    console.log(`\n存档提示回归通过（${TARGETS.length} 款）`);
  }catch(e){
    console.error('FAIL:',e.message);
    results.forEach(r=>console.log('  done ✓ '+r));
    process.exitCode=1;
  }finally{
    await browser.close();server.close();
  }
})();
