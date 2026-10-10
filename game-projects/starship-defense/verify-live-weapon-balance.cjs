// 线上公网冒烟验证：确认削弱后的版本能正常启动、能开局、激光炮数值已生效。
// 不是宣传录像，只做「玩家实际打开网站能否玩」的下游路径核验。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.LIVE_URL||'https://www.zhengxiaohui.cn/html/game/starship-defense/index.html';
const out=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-weapon-balance-v0.33.2/qa-live');
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const checks=[];
  try{
    for(const shape of ['desktop','landscape','portrait']){
      const mobile=shape!=='desktop';
      const context=await browser.newContext({viewport:mobile?(shape==='landscape'?{width:844,height:390}:{width:390,height:844}):{width:1280,height:720},isMobile:mobile,hasTouch:mobile});
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      page.on('requestfailed',r=>errors.push('requestfailed '+r.url()));
      page.setDefaultTimeout(45000);
      // 公网不带 qa=1，走玩家真实入口：加载页面 → 点开始新游戏 → 进入准备阶段。
      await page.goto(url,{waitUntil:'load'});
      await page.waitForFunction(()=>window.__ccReady,null,{timeout:60000});
      checks.push({shape,step:'游戏初始化完成（__ccReady）',pass:true});
      // 资产加载失败时 boot.js 会显示 #assetLoad 错误层，玩家会卡在启动界面。
      const bootError=await page.evaluate(()=>{const b=document.getElementById('assetLoad');return b&&b.style.display!=='none'?b.textContent:null;});
      checks.push({shape,step:'未出现启动失败提示层',pass:!bootError,detail:bootError});
      assert.ok(!bootError,shape+' 启动失败：'+bootError);
      const startVisible=await page.locator('#btnStart').isVisible();
      checks.push({shape,step:'主菜单「开始新游戏」可见',pass:startVisible});
      assert.ok(startVisible,shape+' 看不到开始按钮');
      await page.locator('#btnStart').click();
      await page.waitForFunction(()=>document.getElementById('readyBtn')&&!document.getElementById('readyBtn').classList.contains('hidden'),null,{timeout:30000})
        .catch(()=>{});
      // 武器栏渲染出来才说明商店/装备链路正常。
      const hud=await page.evaluate(()=>({
        weaponBar:document.querySelectorAll('#weaponBar > *').length,
        gold:(document.getElementById('goldTxt')||{}).textContent,
      }));
      checks.push({shape,step:'进入准备阶段并渲染武器栏',pass:hud.weaponBar>0,detail:hud});
      await page.screenshot({path:path.join(out,shape+'-prep.jpg'),quality:86});
      checks.push({shape,step:'无页面异常',pass:errors.length===0,detail:errors.slice(0,5)});
      assert.equal(errors.length,0,shape+' 页面异常：'+JSON.stringify(errors.slice(0,5)));
      await context.close();
    }
    // 数值核验：公网页面上直接读武器表，确认削弱值已经生效（不带 qa 接口也能读模块导出）。
    const numbers=await (async()=>{
      const context=await browser.newContext({viewport:{width:1280,height:720}});
      const page=await context.newPage();
      await page.goto(url+'?qa=1',{waitUntil:'load'});
      await page.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
      const r=await page.evaluate(()=>{
        const q=window.__gameQA,w=q.WEAPONS.laser;
        return {laserDmg:w.dmg,laserPrice:w.price,laserRange:w.range,desc:w.desc,
          laserDpsLv0:q.weaponDps('laser'),plasmaDpsLv0:q.weaponDps('plasma'),
          compatV:(document.querySelector('script[src*="game.compat.js"]')||{}).src||null};
      });
      await context.close();
      return r;
    })();
    checks.push({shape:'numbers',step:'线上激光炮 dmg 已为削弱后的 13',pass:numbers.laserDmg===13,detail:numbers.laserDmg});
    checks.push({shape:'numbers',step:'线上描述文案为 +30%',pass:/\+30%/.test(numbers.desc)&&!/\+50%/.test(numbers.desc),detail:numbers.desc});
    checks.push({shape:'numbers',step:'等离子炮表值仍高于激光炮',pass:numbers.plasmaDpsLv0>numbers.laserDpsLv0,detail:{plasma:numbers.plasmaDpsLv0,laser:numbers.laserDpsLv0}});
    assert.equal(numbers.laserDmg,13,'线上激光炮 dmg 不是 13，实际 '+numbers.laserDmg);
    assert.ok(/\+30%/.test(numbers.desc),'线上描述仍写旧加成：'+numbers.desc);
    fs.writeFileSync(path.join(out,'live-smoke.json'),JSON.stringify({url,checked_at:new Date().toISOString(),checks,numbers},null,2));
    const failed=checks.filter(c=>!c.pass);
    console.log('线上冒烟：'+checks.length+' 项，失败 '+failed.length+' 项');
    for(const c of checks)console.log((c.pass?'  ✔ ':'  ✘ ')+c.shape+' · '+c.step+(c.detail!==undefined?' '+JSON.stringify(c.detail):''));
    console.log('线上数值：',JSON.stringify(numbers));
    assert.equal(failed.length,0,'存在未通过项');
  }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exit(1);});
