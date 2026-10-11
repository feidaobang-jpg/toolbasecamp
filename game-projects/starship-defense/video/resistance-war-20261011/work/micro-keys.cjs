// 微测试：Q/E 键是否真的改变 camYaw；WASD 是否真的位移。
// 只发正常键盘输入 + 只读状态。不用任何 QA setter。
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=__dirname,WEB=path.resolve(ROOT,'../../../../../public'),OUT=path.join(ROOT,'micro');
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(WEB,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(WEB+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',MIME[path.extname(file).toLowerCase()]||'application/octet-stream');res.end(data);});
}).listen(0,'127.0.0.1');
const out={};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),p=await context.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const st=()=>p.evaluate(()=>{const q=__gameQA,r=q.resistanceCampaign,s=r.state,P=s.player.root.position;
  return {yaw:q.getCamYaw(),camMode:q.getCamMode(),gameState:q.Game.state,panelOpen:q.panelOpen,
   x:P.x,z:P.z,keysE:!!q.Input.keys.E,keysQ:!!q.Input.keys.Q,keysW:!!q.Input.keys.W,keysUp:!!q.Input.keys.up,
   keysJ:!!q.Input.keys.J,active:s.active,chapter:s.chapter,phase:s.phase,
   bindingE:q.keyBindings.code('E'),bindingQ:q.keyBindings.code('Q'),bindingUp:q.keyBindings.code('up')};});
 try{
  await p.goto('http://127.0.0.1:'+server.address().port+'/html/game/starship-defense/index.html?qa=1');
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA&&window.__gameQA.resistanceCampaign,{timeout:60000});
  await p.evaluate(()=>{const c=__gameQA.CombatControls;c.set('input','keyboard');c.set('aim','auto');c.set('fire','hold');});
  await p.click('#btnResistance');await sleep(800);
  await p.click('.warChapter[data-chapter="0"]');await sleep(2200);
  await p.evaluate(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});

  out.baseline=await st();
  console.log('BASELINE',JSON.stringify(out.baseline));

  // 1) 按住 E 600ms 看 yaw 是否变化
  const y0=(await st()).yaw;
  await p.keyboard.down('KeyE');await sleep(600);
  const midE=await st();
  await p.keyboard.up('KeyE');await sleep(300);
  const y1=(await st()).yaw;
  out.keyE={y0,mid_keysE:midE.keysE,y1,delta:y1-y0};
  console.log('KEY E: yaw',y0,'->',y1,'delta',(y1-y0).toFixed(4),'keys.E during hold =',midE.keysE);

  // 2) 按住 Q 600ms
  await p.keyboard.down('KeyQ');await sleep(600);
  const midQ=await st();
  await p.keyboard.up('KeyQ');await sleep(300);
  const y2=(await st()).yaw;
  out.keyQ={y1,mid_keysQ:midQ.keysQ,y2,delta:y2-y1};
  console.log('KEY Q: yaw',y1,'->',y2,'delta',(y2-y1).toFixed(4),'keys.Q during hold =',midQ.keysQ);

  // 3) 按住 W 700ms 看位移
  const b=(await st());
  await p.keyboard.down('KeyW');await sleep(700);
  const midW=await st();
  await p.keyboard.up('KeyW');await sleep(250);
  const a=await st();
  out.keyW={before:{x:b.x,z:b.z},mid_keysW:midW.keysW,mid_keysUp:midW.keysUp,after:{x:a.x,z:a.z},dz:a.z-b.z,dx:a.x-b.x};
  console.log('KEY W: z',b.z.toFixed(2),'->',a.z.toFixed(2),'dz',(a.z-b.z).toFixed(2),'keys.up during hold =',midW.keysUp);

  // 4) 同时 W+E（边走边转）
  const c0=await st();
  await p.keyboard.down('KeyW');await p.keyboard.down('KeyE');await sleep(800);
  await p.keyboard.up('KeyE');await p.keyboard.up('KeyW');await sleep(250);
  const c1=await st();
  out.combo={yaw0:c0.yaw,yaw1:c1.yaw,dYaw:c1.yaw-c0.yaw,z0:c0.z,z1:c1.z,dz:c1.z-c0.z};
  console.log('W+E: yaw delta',(c1.yaw-c0.yaw).toFixed(4),'dz',(c1.z-c0.z).toFixed(2));

  // 5) J 键开火是否置位（不改变任何数值，只看输入状态）
  await p.keyboard.down('KeyJ');await sleep(120);
  const jMid=await st();await p.keyboard.up('KeyJ');
  out.keyJ={keysJ_during_hold:jMid.keysJ};
  console.log('KEY J: Input.keys.J during hold =',jMid.keysJ);

  // 6) 焦点与面板状态（排除按键被导航层吞掉）
  out.focus=await p.evaluate(()=>({activeElement:document.activeElement?.id||document.activeElement?.tagName||null,
   navRoot:(()=>{try{const n=document.querySelector('.overlay.menu:not(.hidden)');return n?n.id:null}catch(e){return null}})(),
   panelOpen:!!__gameQA.panelOpen}));
  console.log('FOCUS',JSON.stringify(out.focus));

  out.errors=errors;
  fs.writeFileSync(path.join(OUT,'micro-report.json'),JSON.stringify(out,null,2));
  await p.screenshot({path:path.join(OUT,'end.png')});
 }catch(e){
  out.fatal=e.stack;out.errors=errors;
  fs.writeFileSync(path.join(OUT,'micro-failure.json'),JSON.stringify(out,null,2));
  console.error('MICRO FAILED',e.message);throw e;
 }finally{
  await p.evaluate(()=>{try{__gameQA.resistanceCampaign.stop(true);}catch(_){}}).catch(()=>{});
  await context.close();await browser.close();server.close();
 }
})().catch(()=>{server.close();process.exitCode=1;});
