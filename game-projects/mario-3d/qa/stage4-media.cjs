// 第四关画面、性能与手机布局：五种视角 × 三处场景截图、Q/E 转一整圈、转镜头帧时间、手机横竖屏按钮与操作模式。
// 截图只留本机（.gitignore 已排除 media-kit 下的图片）；帧时间为本机 Edge + RTX 4060 Ti 实测，手机为视口模拟，不代表真机。
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.QA_BASE||'http://127.0.0.1:8798/html/game/mario-3d/index.html';
const out=process.env.QA_OUT||path.resolve(__dirname,'../media-kit/releases/v2.6.0-preview1/qa');
const checks=[],perf=[];
const check=(name,ok,data)=>{checks.push({name,ok:!!ok,data});assert(ok,name+': '+JSON.stringify(data));};
const SPOTS=[['stairs',6,6],['firebars',53,4],['bridge',131,3]];
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-gpu','--use-angle=d3d11']});
 const errors=[];
 try{
  const c=await b.newContext({viewport:{width:1280,height:720}});const p=await c.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'?level=1-4&test=1&q=high',{waitUntil:'networkidle'});await p.waitForFunction(()=>window.__marioReady&&window.__MARIO_TEST__);
  await p.locator('#menu [data-act=start]').click();await p.evaluate(()=>{__MARIO_TEST__.manual(true);__MARIO_TEST__.skipCard();__MARIO_TEST__.session.settings.demo=true;});
  const put=(x,y)=>p.evaluate(([x,y])=>{const q=__MARIO_TEST__;Object.assign(q.world.player,{x,y,z:0,vx:0,vy:0,vz:0,grounded:true,inv:0});q.view.snap=true;q.step(30);},[x,y]);
  const cam=()=>p.evaluate(()=>__MARIO_TEST__.state().camera);
  // 五种视角 × 三处
  for(let i=0;i<5;i++){
   if(i)await p.keyboard.press('KeyC');
   const id=await cam();
   for(const [name,x,y] of SPOTS){await put(x,y);await p.evaluate(()=>__MARIO_TEST__.step(1,true));await p.screenshot({path:path.join(out,'view-'+id+'-'+name+'.png')});
    check('视角 '+id+' 在 '+name+' 正常绘制',await p.evaluate(()=>__MARIO_TEST__.renderInfo().calls>10));}
  }
  // Q/E 转一整圈：侧视下按住 E，每 90° 截一张
  while(await cam()!=='side')await p.keyboard.press('KeyC');
  for(const [name,x,y] of SPOTS){
   await put(x,y);const y0=await p.evaluate(()=>__MARIO_TEST__.view.yawOffset);
   for(let k=0;k<4;k++){
    await p.keyboard.down('KeyE');let turned=0;
    for(let n=0;n<200&&turned<Math.PI/2;n++){await p.evaluate(()=>__MARIO_TEST__.step(4,false));turned=Math.abs(await p.evaluate(()=>__MARIO_TEST__.view.yawOffset)-y0)-k*Math.PI/2;}
    await p.keyboard.up('KeyE');await p.evaluate(()=>__MARIO_TEST__.step(1,true));
    await p.screenshot({path:path.join(out,'orbit-'+name+'-'+(k+1)*90+'.png')});
   }
   const turned=Math.abs(await p.evaluate(()=>__MARIO_TEST__.view.yawOffset)-y0);
   check('Q/E 在 '+name+' 转满一圈',turned>=2*Math.PI-0.2,{turned});
   await p.keyboard.press('KeyC');while(await cam()!=='side')await p.keyboard.press('KeyC');
  }
  // 转镜头帧时间（真实时钟、高画质）
  for(const size of [{width:1280,height:720},{width:844,height:390}]){
   await p.setViewportSize(size);await p.waitForTimeout(150);
   for(const [name,x,y] of [['firebars',53,4],['bridge',131,3]]){
    for(const pre of ['side','oblique','front']){
     while(await cam()!==pre)await p.keyboard.press('KeyC');
     await put(x,y);
     await p.evaluate(()=>{const q=__MARIO_TEST__;q.manual(false);q.perfStart();});
     await p.keyboard.down('KeyE');await p.waitForTimeout(3000);await p.keyboard.up('KeyE');
     const row=await p.evaluate(()=>{const q=__MARIO_TEST__,r=q.perfStop(),f=r.frames.slice().sort((a,b)=>a-b),sum=f.reduce((a,b)=>a+b,0);q.manual(true);return{frames:f.length,fps:f.length*1000/sum,p95:f[Math.floor(f.length*.95)],max:f[f.length-1],slow50:f.filter(x=>x>50).length,render:q.renderInfo(),flames:q.world.rt.flames.length};});
     perf.push({viewport:size.width+'x'+size.height,spot:name,preset:pre,...row});
     check('转镜头流畅 '+size.width+' '+name+' '+pre,row.fps>=(size.width===1280?55:50)&&row.slow50===0,row);
    }
   }
  }
  // 手机横屏 / 竖屏：操作模式切换不丢本局、按钮等大不出屏
  for(const size of [{width:844,height:390},{width:390,height:844}]){
   await p.setViewportSize(size);await p.waitForTimeout(200);await put(53,4);
   await p.locator('#btn-pause').click();
   const before=await p.evaluate(()=>({level:__MARIO_TEST__.world.levelId,x:__MARIO_TEST__.world.player.x}));
   for(const mode of ['hide','show'])await p.locator('#pause [data-control-mode='+mode+']').click();
   check('暂停里切换操作模式保留第四关进度 '+size.width,await p.evaluate(s=>__MARIO_TEST__.world.levelId===s.level&&__MARIO_TEST__.world.player.x===s.x,before));
   await p.locator('#pause [data-act=resume]').click();await p.evaluate(()=>__MARIO_TEST__.step(1));
   const btn=await p.locator('#touch [data-hold]').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{w:r.width,h:r.height,x:r.x,y:r.y,r:r.right,b:r.bottom,o:getComputedStyle(e).opacity};}));
   check('手机动作键 4 个等大且都在屏幕内 '+size.width,btn.length===4&&btn.every(e=>e.o==='1'&&Math.abs(e.w-btn[0].w)<.1&&e.x>=0&&e.y>=0&&e.r<=size.width+.1&&e.b<=size.height+.1),btn);
   await p.screenshot({path:path.join(out,'phone-'+size.width+'.png')});
  }
  check('无脚本错误',errors.length===0,errors);
  fs.writeFileSync(path.join(out,'stage4-media.json'),JSON.stringify({url:base,browser:b.version(),gpu:'RTX 4060 Ti (ANGLE D3D11), headless Edge, DPR 1; phone sizes are viewport simulation only',checks,perf,errors},null,1));
  console.log(JSON.stringify({passed:checks.length,perf:perf.map(r=>[r.viewport,r.spot,r.preset,+r.fps.toFixed(0),+r.p95.toFixed(1),+r.max.toFixed(1),r.render.calls])}));
 }finally{await b.close();}
})().catch(e=>{console.error(e.message||e);process.exit(1);});
