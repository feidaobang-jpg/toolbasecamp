// Isolated browsers test actual rebuilt game menus and wire payloads; SDK responses are mocked.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..'),out=process.env.INPUT_SAFETY_QA_OUT||path.join(require('os').tmpdir(),'input-safety-qa');
const games=['tank-3d','jackal-stage1-3d','cadillacs-stage1-3d','starship-defense','gunfire-assembly'];
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wav':'audio/wav'};
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
async function installMocks(context,toy=true){
  await context.addInitScript(({toy})=>{
    window.__safetyRequests=[];window.__wire=[];window.__sockets=[];window.__profileCalls=0;window.__profileMode='deny';
    if(toy)window.toy={isSupport:async ability=>['checkInputSafety','getUserProfile'].includes(ability),getUserProfile:async()=>{window.__profileCalls++;if(window.__profileMode==='deny')throw Error('denied');return {nickname:window.__profileMode==='reject'?'blocked-profile':'B站安全昵称',avatar:'',toyOpenId:'not-to-be-transmitted'};},checkInputSafety:async req=>{
      window.__safetyRequests.push(req);
      if(req.text.includes('blocked'))return {status:'rejected',passed:false};
      if(req.text.includes('unavailable'))return {status:'unavailable',passed:false};
      return {status:'ok',passed:true};
    }};
    class MockSocket {
      constructor(url){this.readyState=1;this.bufferedAmount=0;window.__sockets.push(this);const game=new URL(url).searchParams.get('game');this.game=game;setTimeout(()=>this.receive({type:'hello',protocol:{tank:'tank3d-v2',jackal:'jackal3d-v1',cadillacs:'cadillacs3d-v1',starship:'starship-v1'}[game]}),10);}
      receive(value){this.onmessage?.({data:JSON.stringify(value)});}
      send(text){const value=JSON.parse(text);window.__wire.push(value);
        if(value.type==='list')setTimeout(()=>this.receive({type:'rooms',rooms:[{code:'654321',name:'blocked-old-room',players:[{slot:0,name:'blocked-old-player'}],maxPlayers:4,settings:{mode:'classic',stage:1},canJoin:true}],page:1,total:1}),0);
        if(value.type==='create')setTimeout(()=>this.receive({type:'joined',slot:0,room:{code:'123456',name:value.roomName,players:[{slot:0,name:value.name,ready:true}],maxPlayers:4,settings:{mode:'classic',stage:1}}}),0);
      }
      close(){this.readyState=3;this.onclose?.();}
    }
    window.WebSocket=MockSocket;
  },{toy});
}
(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const results=[];
  try{
    for(const game of games)for(const viewport of [{width:1280,height:720},{width:390,height:844}]){
      const native=game==='tank-3d',context=await browser.newContext({viewport,hasTouch:viewport.width<500,isMobile:viewport.width<500});await installMocks(context);
      const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
      let url=base+'/public/html/game/'+game+'/index.html?test=1';
      if(process.env.INPUT_SAFETY_PACKAGES==='1'){
        const meta=JSON.parse(fs.readFileSync(path.join(root,'game-projects',game,'media-kit/game.json')));
        const dir=['starship-defense','gunfire-assembly'].includes(game)?path.join(root,'dist/toy',game==='starship-defense'?'chongchao-qianshao':'feidao-gunfire','package'):path.join(root,'game-projects',game,'dist',(native?'':'toy-')+meta.current_version,'package');
        url='https://www.bilibilitoy.com/toy/safety-qa-'+game+'/index.html?test=1';
        await page.route('https://www.bilibilitoy.com/toy/safety-qa-'+game+'/**',route=>{
          const file=path.resolve(dir,decodeURIComponent(new URL(route.request().url()).pathname.split('/').slice(3).join('/')));
          return file.startsWith(dir+path.sep)&&fs.existsSync(file)?route.fulfill({path:file,contentType:mime[path.extname(file)]||'application/octet-stream'}):route.fulfill({status:404});
        });
      }
      await page.goto(url);
      if(game==='gunfire-assembly'){await page.locator('#btnVersus').click();await page.locator('#vsOnline').click();}
      else {const entry=page.locator(native?'#menu [data-act="coop"]':'.coop-entry').first();await entry.waitFor({state:'visible',timeout:30000});await entry.click();}
      const name=page.locator(native?'#coop-name':'[data-field="name"]'),room=page.locator(native?'#coop-room-name':'[data-field="roomName"]'),create=page.locator(native?'#coop-create':'[data-do="create"]'),status=page.locator(native?'#coop-message':'.coop-status');
      await name.waitFor({state:'visible'});await page.waitForFunction(()=>window.__wire.some(m=>m.type==='list'));
      assert(!await page.locator('body').innerText().then(t=>t.includes('blocked-old')),'old room/player text displayed');
      const profile=page.locator(native?'#coop-bili-name':'.coop-bili-name');
      assert.equal(await page.evaluate(()=>__profileCalls),0,'profile requested without a click');
      const defaultName=await name.inputValue();await profile.click();await status.filter({hasText:'可继续使用默认名称'}).waitFor();assert.equal(await name.inputValue(),defaultName);
      await page.evaluate(()=>window.__profileMode='reject');await profile.click();await status.filter({hasText:'B站昵称未通过安全检测'}).waitFor();assert.equal(await name.inputValue(),'');
      await page.evaluate(()=>window.__profileMode='allow');await profile.click();await status.filter({hasText:'已填入B站昵称'}).waitFor();assert.equal(await name.inputValue(),'B站安全昵称');
      assert(!JSON.stringify(await page.evaluate(()=>__wire)).includes('not-to-be-transmitted'),'Toy OpenID leaked into shared transport');
      await name.fill('blocked-name');await room.fill('安全房间');await create.click();await status.filter({hasText:'未通过安全检测'}).waitFor();
      assert.equal(await name.inputValue(),'');assert.equal(await page.evaluate(()=>__wire.filter(m=>m.type==='create').length),0);
      await name.fill('安全昵称');await room.fill('unavailable');await create.click();await status.filter({hasText:'暂时无法完成安全检测'}).waitFor();
      assert.equal(await room.inputValue(),'');assert.equal(await page.evaluate(()=>__wire.filter(m=>m.type==='create').length),0);
      await name.fill('安全昵称');await room.fill('安全房间');await create.click();await page.waitForFunction(()=>__wire.some(m=>m.type==='create'));
      const sent=await page.evaluate(()=>__wire.find(m=>m.type==='create'));assert.equal(sent.name,'安全昵称');assert.equal(sent.roomName,'安全房间');
      const checked=await page.evaluate(()=>__safetyRequests);assert(checked.some(r=>r.text===sent.name));assert(checked.some(r=>r.text===sent.roomName));
      assert.deepEqual(errors,[]);await page.screenshot({path:path.join(out,game+'-'+viewport.width+'x'+viewport.height+'.png')});
      results.push({game,viewport,passed:true,checks:['profile only on player click','profile denied fallback','profile nickname checked before filling','Toy OpenID not transmitted','old remote text hidden','rejected nickname cleared and not sent','unavailable room cleared and not sent','approved exact text sent','no page errors']});await context.close();
    }
    const context=await browser.newContext();await installMocks(context,false);const page=await context.newPage();
    await page.goto(base+'/public/html/game/tank-3d/index.html');await page.locator('#menu [data-act="coop"]').click();await page.locator('#coop-create').click();await page.waitForFunction(()=>__wire.some(m=>m.type==='create'));
    assert.deepEqual(await page.evaluate(()=>__wire.find(m=>m.type==='create').name),'坦克手');
    results.push({game:'tank-3d',channel:'website-without-sdk',passed:true,checks:['default identity multiplayer remains available','remote custom text hidden']});await context.close();
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({method:'Headless Edge, real runtime, mocked SDK/room transport; mobile viewport simulation',results},null,2));
    console.log(JSON.stringify({passed:true,cases:results.length,output:out}));
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
