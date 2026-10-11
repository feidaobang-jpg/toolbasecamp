// 基础设施快测（约40秒）：验证「进章节 → 帧采集 → 音轨就绪 → ob() 各状态健壮 → 停止 → 编码」整条链路。
// 不做完整通关，只录约15秒真实移动+射击，目的是快速暴露录制管线的任何崩溃点。
// 纪律：只发正常键盘输入、只读状态；正常规则，无无敌/清敌/瞬移。
const fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT=__dirname,WEB=path.resolve(ROOT,'../../../../../public'),OUT=path.join(ROOT,'capture','infra-test');
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(WEB,'.'+decodeURIComponent(req.url.split('?')[0]));
 if(!file.startsWith(WEB+path.sep)){res.writeHead(403);return res.end();}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',MIME[path.extname(file).toLowerCase()]||'application/octet-stream');res.end(data);});
}).listen(0,'127.0.0.1');
const log=[];const step=(m)=>{console.log(m);log.push(m);};
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1}),p=await context.newPage();
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 const frames=[];const events=[];let recording=false,lastSaved=0,cdp=null,audioStarted=false,audioStartTs=0,started=Date.now();
 const T=()=>(Date.now()-started)/1000;
 try{
  await p.addInitScript(()=>{const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(dest,...args){if(dest instanceof AudioDestinationNode){if(!this.context.__movieDest)this.context.__movieDest=this.context.createMediaStreamDestination();window.__movieAudio=this.context.__movieDest;return connect.call(this,this.context.__movieDest,...args);}return connect.call(this,dest,...args);};});
  await p.goto('http://127.0.0.1:'+server.address().port+'/html/game/starship-defense/index.html?qa=1');
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA&&window.__gameQA.resistanceCampaign,{timeout:60000});
  await p.evaluate(()=>{const c=__gameQA.CombatControls;c.set('input','keyboard');c.set('aim','auto');c.set('fire','hold');});
  step('页面加载 + QA 就绪 OK');

  // 菜单态 ob()（战役未激活）—— 这里之前会崩溃
  const ob=()=>p.evaluate(()=>{const q=__gameQA,r=q.resistanceCampaign,s=r.state;
   if(!s.active||!s.map||!s.player)return{active:!!s.active,nativeState:q.Game.state,menuWar:(()=>{try{return !document.getElementById('warMenu').classList.contains('hidden')}catch(e){return null}})()};
   const o=r.objective(),P=s.player.root.position;
   return{active:s.active,chapter:s.chapter,phase:s.phase,x:P.x,z:P.z,hp:Math.ceil(s.player.hp),yaw:q.getCamYaw(),enemies:s.units.filter(u=>u.team==='enemy'&&!u.dead).length,distObj:Math.round(Math.hypot(P.x-o.x,P.z-o.z)*10)/10,testMode:q.Game.testMode};});
  const menuState=await ob();
  step('菜单态 ob() 未崩溃: active='+menuState.active+' menuWar='+menuState.menuWar);

  // 开始帧采集（音轨稍后进战斗再启动）
  started=Date.now();
  cdp=await context.newCDPSession(p);
  cdp.on('Page.screencastFrame',async e=>{if(recording&&e.metadata.timestamp-lastSaved>=.035){lastSaved=e.metadata.timestamp;const file=String(frames.length).padStart(6,'0')+'.jpg';fs.writeFileSync(path.join(OUT,file),Buffer.from(e.data,'base64'));frames.push({file,timestamp:e.metadata.timestamp});}await cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});});
  recording=true;
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:98,maxWidth:1920,maxHeight:1080,everyNthFrame:1});
  step('帧采集已启动');

  // 进入第1章
  await p.click('#btnResistance');await sleep(2000);
  await p.click('.warChapter[data-chapter="0"]');await sleep(2200);
  await p.evaluate(()=>{if(document.activeElement&&document.activeElement.blur)document.activeElement.blur();});
  const battle=await ob();
  step('进入第1章: active='+battle.active+' chapter='+battle.chapter+' testMode='+battle.testMode);
  if(!battle.active)throw new Error('未能进入战役');

  // 启动音轨（进战斗后钩子应就绪）
  for(let i=0;i<10;i++){
   const ok=await p.evaluate(()=>{if(!window.__movieAudio)return false;try{window.__movieChunks=[];window.__movieRec=new MediaRecorder(window.__movieAudio.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:192000});window.__movieRec.ondataavailable=e=>window.__movieChunks.push(e.data);window.__movieRec.start(500);window.__movieAudioStart=Date.now();return true;}catch(e){return false;}});
   if(ok){audioStarted=true;audioStartTs=frames.length?frames[frames.length-1].timestamp:0;step('音轨采集已启动 @frame '+frames.length);break;}
   await sleep(400);
  }
  if(!audioStarted)step('警告：音轨未就绪（菜单态无音频，进战斗后应就绪）');

  // 录约12秒真实操作：前进 + 转向 + 射击
  const held=new Set();
  const keys=async w=>{for(const k of [...held])if(!w.includes(k)){await p.keyboard.up(k);held.delete(k);}for(const k of w)if(!held.has(k)){await p.keyboard.down(k);held.add(k);}};
  for(let i=0;i<24;i++){
   const s=await ob();
   if(i%6===0)step(`  t=${T().toFixed(1)}s frame=${frames.length} z=${Math.round(s.z)} hp=${s.hp} enemies=${s.enemies} yaw=${s.yaw!=null?s.yaw.toFixed(2):null}`);
   // 朝北推进（目标在 +z），偶尔射击
   await keys(['KeyW']);await sleep(340);
   if(i%4===2){await keys(['KeyW','KeyJ']);await sleep(220);}
   await keys([]);
  }
  await keys([]);
  const endState=await ob();
  step('录制结束状态: z='+Math.round(endState.z)+' kills? hp='+endState.hp);

  // 停止采集 + 取音轨
  await cdp.send('Page.stopScreencast');recording=false;
  let audioBytes=null,audioStartWall=0;
  if(audioStarted){
   const audio=await p.evaluate(async()=>{await new Promise(r=>{__movieRec.onstop=r;__movieRec.stop();});return{start:__movieAudioStart,bytes:Array.from(new Uint8Array(await new Blob(__movieChunks).arrayBuffer()))};});
   audioBytes=Buffer.from(audio.bytes);audioStartWall=audio.start;
   fs.writeFileSync(path.join(OUT,'game-audio.webm'),audioBytes);
   step('音轨已保存: '+audioBytes.length+' bytes');
  }
  const data={take:'infra-test',started,audioStart:audioStartWall,audioStartTs,audioStarted,duration:T(),frames,events,shots:[],phase_isolation:[],finalState:endState,errors,gameplay_modified:false,time_scale:1,normal_rule_inputs_only:true};
  fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(data,null,2));
  step('capture.json 已写: '+frames.length+' 帧, duration '+data.duration.toFixed(1)+'s, 音轨='+(audioBytes?audioBytes.length+'bytes':'无'));
  step('RESULT: frames='+(frames.length>100?'OK('+frames.length+')':'FEW('+frames.length+')')+' audio='+(audioBytes&&audioBytes.length>1000?'OK':'MISSING')+' errors='+errors.length);
  if(errors.length)step('pageerrors: '+errors.slice(0,5).join(' | '));
 }catch(e){
  fs.writeFileSync(path.join(OUT,'failure.json'),JSON.stringify({error:e.stack,frames:frames.length,audioStarted,errors,log},null,2));
  step('INFRA FAILED: '+e.message);throw e;
 }finally{
  await p.evaluate(()=>{try{__gameQA.resistanceCampaign.stop(true);}catch(_){}}).catch(()=>{});
  await context.close();await browser.close();server.close();
 }
})().catch(()=>{server.close();process.exitCode=1;});
