// Touch gestures and actual purchases catch unreachable shop/build cards.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8924/html/game/starship-defense/index.html';
const out=path.resolve(__dirname,process.env.OUT_DIR||'media-kit/releases/web-shop-scroll-v0.29.2/qa/local');
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
 const results=[];
 const viewports={desktop:{width:1280,height:720},landscape:{width:844,height:390},portrait:{width:390,height:844},compact:{width:740,height:360},toy:{width:844,height:346}};
 try{for(const shape of (process.env.SHAPES||'landscape,portrait,compact,toy,desktop').split(',')){
  const viewport=viewports[shape];
  const context=await browser.newContext({viewport,isMobile:shape!=='desktop',hasTouch:true,recordVideo:shape==='landscape'&&!process.env.REPRO_ONLY?{dir:out,size:viewport}:undefined});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(process.env.BASELINE_SCRIPT)await page.route(/game\.compat\.js(?:\?|$)/,route=>route.fulfill({contentType:'application/javascript',body:fs.readFileSync(process.env.BASELINE_SCRIPT)}));
  if(process.env.BASELINE_HTML)await page.route(/index\.html(?:\?|$)/,route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(process.env.BASELINE_HTML)}));
  if(process.env.BLOCK_JS==='1')await page.route(/\.js(?:\?|$)/,route=>route.abort());
  await page.goto(url+(url.includes('?')?'&':'?')+'qa=1&test=1');await page.waitForFunction(()=>window.__gameQA&&window.__ccReady);
  await page.locator('#btnStart').click();await page.waitForTimeout(300);
  await page.evaluate(shape=>{__gameQA.setDeviceMode(shape==='desktop'?'pc':'touch');__gameQA.Game.gold=100000;__gameQA.openShop();},shape);
  const cdp=await context.newCDPSession(page);
  const tap=async locator=>{const p=await locator.evaluate(el=>{
   const r=el.getBoundingClientRect(),panel=el.closest('.panel');let l=Math.max(0,r.left),t=Math.max(0,r.top),right=Math.min(innerWidth,r.right),bottom=Math.min(innerHeight,r.bottom);
   if(el.closest('.shopItem')){const h=panel.querySelector('.panelHeader,.buildHeader').getBoundingClientRect();if(document.getElementById('stage').style.transform.includes('rotate'))right=Math.min(right,h.left);else t=Math.max(t,h.bottom);}
   return{x:(l+right)/2,y:(t+bottom)/2,width:right-l,height:bottom-t,id:2};
  });assert.ok(p.width>4&&p.height>4,'Touch target has an exposed region');await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:2}]});await page.waitForTimeout(120);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(180);};
  if(process.env.COOP_UPDATES)await page.evaluate(()=>{
   const q=__gameQA,driver=__COOP_QA__;q.player.cls=q.Game.cls;q.player.curWeapon=q.Game.curWeapon;
   const snapshot=driver.snapshot();driver.connection.slot=1;driver.config={localSlot:1};
   window.qaShopCommands=[];driver.connection.send=m=>{qaShopCommands.push(m);return true;};
   window.qaShopFirst=document.getElementById('shopGrid').firstElementChild;
   window.qaShopUpdates=setInterval(()=>driver.connection.onMessage({type:'state',state:{game:snapshot}}),65);
  });
  for(const panel of (process.env.COOP_UPDATES?['shopPanel']:['shopPanel','buildPanel'])){
   if(panel==='buildPanel'){await page.locator('#shopClose').click();await page.locator('#vL').click();}
   await page.waitForTimeout(350);
   const initial=await page.locator('#'+panel).evaluate(e=>{
    const r=e.getBoundingClientRect(),rotated=document.getElementById('stage').style.transform.includes('rotate');
    const start=rotated?{x:r.left+r.width*.25,y:r.top+r.height*.45}:{x:r.left+r.width*.45,y:r.top+r.height*.75};
    const ancestors=[];for(let n=e;n;n=n.parentElement)ancestors.push({tag:n.tagName,id:n.id,touch:getComputedStyle(n).touchAction});
    return{start,rotated,scroll:e.scrollTop,height:e.clientHeight,total:e.scrollHeight,ancestors};
   });
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...initial.start,id:1}]});
   for(let i=1;i<=12;i++){
    const p={x:initial.start.x+(initial.rotated?150*i/12:0),y:initial.start.y-(initial.rotated?0:150*i/12),id:1};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[p]});await page.waitForTimeout(20);
   }
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(400);
   const after=await page.locator('#'+panel).evaluate(e=>({scroll:e.scrollTop,active:document.activeElement.textContent.slice(0,50),stableCards:!window.qaShopFirst||qaShopFirst===e.querySelector('.shopItem')}));
   if(process.env.COOP_UPDATES){
    const card=page.locator('#shopGrid .shopItem').filter({hasText:'等离子炮'}),b=await card.boundingBox();
    if(!process.env.REPRO_ONLY)await tap(card);
    else if(b){const point={x:b.x+b.width/2,y:b.y+b.height/2,id:2};
     await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});await page.waitForTimeout(120);
     await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150);
    }
    after.commands=await page.evaluate(()=>qaShopCommands.filter(m=>m.command?.id==='plasma'));
   }
   await page.screenshot({path:path.join(out,`${viewport.width}x${viewport.height}-${panel}.png`)});
   results.push({viewport,panel,initial,after,errors});console.log(JSON.stringify(results.at(-1)));
   if(!process.env.REPRO_ONLY)assert.ok(after.scroll>initial.scroll+30,'Touch drag must scroll '+panel+' '+JSON.stringify(viewport));
   if(!process.env.REPRO_ONLY&&process.env.COOP_UPDATES)assert.equal(after.commands.length,1,'Held tap survives state update and submits one purchase');
   if(!process.env.REPRO_ONLY&&process.env.COOP_UPDATES)assert.equal(after.stableCards,true,'Unchanged state snapshots preserve card identity');
   if(!process.env.REPRO_ONLY){
    // Sticky controls are a second path on WebViews without reliable pan gestures.
    const up=page.locator('#'+panel+' [data-panel-page="-1"]'),down=page.locator('#'+panel+' [data-panel-page="1"]');
    await tap(up);await tap(up);assert.equal(await page.locator('#'+panel).evaluate(e=>e.scrollTop),0,'Previous page reaches first card');
    for(let i=0;i<6;i++)await tap(down);
    const bottom=await page.locator('#'+panel).evaluate(e=>({top:e.scrollTop,max:e.scrollHeight-e.clientHeight}));
    assert.ok(Math.abs(bottom.top-bottom.max)<2,'Next page reaches last card');
    after.paging=bottom;
    if(panel==='shopPanel'&&!process.env.COOP_UPDATES){
     const bought=[];
     for(const id of ['laser','plasma']){
      await tap(down);const name=await page.evaluate(id=>__gameQA.WEAPONS[id].name,id);
      const gold=await page.evaluate(()=>__gameQA.Game.gold);
      await tap(page.locator('#shopGrid .shopItem').filter({hasText:name}));
      const state=await page.evaluate(id=>({owned:__gameQA.Game.weapons.includes(id),equipped:__gameQA.Game.curWeapon===id,gold:__gameQA.Game.gold,price:__gameQA.WEAPONS[id].price,scroll:document.getElementById('shopPanel').scrollTop}),id);
      assert.ok(state.owned&&state.equipped);assert.equal(gold-state.gold,state.price);assert.ok(state.scroll>0,'Purchase keeps reading position');bought.push({id,...state});
     }
     after.purchases=bought;
     // Frame the verified equipment row for the media handoff only.
     await page.locator('#shopPanel').evaluate(panel=>{const card=[...panel.querySelectorAll('.shopItem')].find(e=>e.textContent.includes('等离子炮'));panel.scrollTop=card.offsetTop-panel.querySelector('.panelHeader').offsetHeight-8;});
    }else if(panel==='buildPanel'){
     const last=await page.evaluate(()=>{const q=__gameQA,key=Object.keys(q.BUILDINGS).sort((a,b)=>q.BUILDINGS[b].price-q.BUILDINGS[a].price)[0];return{key,name:q.BUILDINGS[key].name};});
     await tap(page.locator('#buildGrid .shopItem').filter({hasText:last.name}));
     assert.equal(await page.evaluate(()=>__gameQA.place.kind),last.key);after.selectedBuilding=last;
    }
    assert.deepEqual(errors,[]);
    await page.screenshot({path:path.join(out,`${viewport.width}x${viewport.height}-${panel}-verified.png`)});
   }
  }
  await context.close();
 }}finally{await browser.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({url,at:new Date().toISOString(),method:'Desktop Edge mobile viewport, real CDP touch gestures; not physical phone',results},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
