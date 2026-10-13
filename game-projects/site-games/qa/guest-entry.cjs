// Real Toy/Web entry regression in fresh browsers. No account cookies or SDK mocks.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const targets=JSON.parse(fs.readFileSync(process.env.GUEST_ENTRY_TARGETS,'utf8')).games;
const mode=process.env.GUEST_ENTRY_MODE||'public';
const out=process.env.GUEST_ENTRY_OUT||path.join(require('node:os').tmpdir(),'guest-entry-qa');
(async()=>{
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const results=[];
  try{
    for(const target of targets)for(const viewport of [{width:1280,height:720},{width:844,height:390},{width:390,height:844}]){
      const context=await browser.newContext({viewport,hasTouch:viewport.width<1000,isMobile:viewport.width<1000});
      assert.deepEqual(await context.cookies(),[]);
      const page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      const url=mode==='website'?'https://www.zhengxiaohui.cn/html/game/'+target.game+'/index.html':mode==='preview'?target.preview_url:target.url;
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
      assert(response&&response.ok(),target.game+' entry HTTP failed');
      assert(!(await response.text()).includes('__TOY_LOGIN_GATE__'),target.game+' was intercepted before loading the game');
      const frame=mode==='website'?page.mainFrame():await (async()=>{
        await page.locator('iframe').first().waitFor({state:'attached',timeout:45000});
        return page.locator('iframe').first().contentFrame();
      })();
      const native=target.game==='tank-3d';
      const entry=frame.locator(native?'#menu [data-act="coop"]':'.coop-entry').first();
      if(target.game==='gunfire-assembly'){
        await frame.locator('#btnVersus').click();await frame.locator('#vsOnline').click();
      }else{await entry.waitFor({state:'visible',timeout:45000});await entry.click();}
      const name=frame.locator(native?'#coop-name':'[data-field="name"]'),room=frame.locator(native?'#coop-room-name':'[data-field="roomName"]');
      await name.waitFor({state:'visible'});
      assert.equal(await name.getAttribute('readonly'),'');assert.equal(await room.getAttribute('readonly'),'');
      assert.equal(await name.inputValue(),'玩家');
      await frame.locator(native?'#coop-anonymous':'[data-field="anonymous"]').click();
      assert.equal(await name.getAttribute('readonly'),'');assert.equal(await room.getAttribute('readonly'),'');
      assert.equal(await name.inputValue(),'玩家');
      // Only one ephemeral production room per game; leave it immediately.
      if(viewport.width===1280&&mode==='public'){
        await frame.locator(native?'#coop-create':'[data-do="create"]').click();
        await frame.locator(native?'#coop-room':'.coop-roster').filter({hasText:/\d{6}/}).waitFor({timeout:30000});
        await frame.locator(native?'#lobby [data-act="coop-back"]':'[data-do="leave"]').click();
      }
      if(!native)await frame.locator('[data-do="close"]').click();
      else if(viewport.width!==1280||mode!=='public')await frame.locator('#lobby [data-act="coop-back"]').click();
      if(target.game==='gunfire-assembly'){
        await frame.locator('[data-vs-ai="normal"]').click();
      }else if(target.game==='starship-defense'){
        await frame.locator('#btnStart').click();
      }else if(target.game==='cadillacs-stage1-3d'){
        await frame.locator('#menu [data-act="select"]').click();await frame.locator('#sel-go').click();
      }else await frame.locator('#menu [data-act="start"]').click();
      await frame.locator('canvas').first().waitFor({state:'visible'});
      await frame.locator(['starship-defense','gunfire-assembly'].includes(target.game)?'#hud':'#menu').waitFor({state:['starship-defense','gunfire-assembly'].includes(target.game)?'visible':'hidden',timeout:30000});
      const auth=(await context.cookies()).filter(c=>['SESSDATA','DedeUserID','bili_jct'].includes(c.name));
      assert.deepEqual(auth,[],'an authenticated browser was used as guest evidence');
      assert.deepEqual(errors,[]);
      const screenshot=path.join(out,target.game+'-'+viewport.width+'x'+viewport.height+'.png');
      await page.screenshot({path:screenshot});
      results.push({game:target.game,url,viewport,passed:true,authenticated:false,screenshot,checks:['fresh context without account cookies','no Toy login gate','public name inputs remain readonly','default anonymous identity','single player starts without login',...(viewport.width===1280&&mode==='public'?['real anonymous room created and immediately left']:[])]});
      fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({mode,method:'Fresh headless Edge contexts, actual remote games; no SDK mocks; mobile viewport simulation',results},null,2));
      console.log(JSON.stringify({game:target.game,viewport,passed:true}));
      await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
