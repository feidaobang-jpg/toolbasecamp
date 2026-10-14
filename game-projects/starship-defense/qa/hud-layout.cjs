// 虫潮围城主战役 HUD 布局体检：同视口截图 + 中心区遮挡测量
// 用法: node qa/hud-layout.cjs                 打印体检 JSON
//       SAVE_SHOTS=1 PREFIX=after- node qa/hud-layout.cjs   同时输出截图（改动前后对照）
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
const URL_BASE=process.env.GAME_URL||'http://127.0.0.1:8931/html/game/starship-defense/index.html';
const OUT=process.env.QA_OUTPUT||path.join(__dirname,'..','media-kit','releases','web-hud-layout-20261014','qa');
const PREFIX=process.env.PREFIX||'before-';
const PROBES=['hudTop','radar','hudLeft','hudRight','saveHealth','hint','interactHint','readyBtn','prepDock','prepDockRow','placeBar','weaponBar','keysHint','msg','cornerTools','tacticsButton','squadOrderBtn','webTools','joyBase','vJ','vSPRINT','vsTop','bfFlags'];
// FORCE=versus-mode 之类可把模式类压上，检查共用 HUD 在别的模式里是否也叠
const FORCE=(process.env.FORCE||'').split(',').filter(Boolean);
// #touchUI 是全屏透明拖拽层，不参与视觉遮挡统计
const VIEWS={
  desktop:{width:1280,height:720,device:'desktop'},
  desktopShort:{width:1366,height:625,device:'desktop'},
  phone:{width:844,height:390,device:'touch'},
  phoneCompact:{width:800,height:390,device:'touch'},
  phonePortrait:{width:390,height:844,device:'touch'},   // 竖屏：舞台整体旋转 90°
  phoneTall:{width:740,height:360,device:'touch'},       // 更矮的横屏手机
};
function overlap(a,b){
  const w=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x);
  const h=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
  return w>1&&h>1?{w:Math.round(w),h:Math.round(h),area:Math.round(w*h)}:null;
}
(async()=>{
  if(process.env.SAVE_SHOTS)fs.mkdirSync(OUT,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const report={};
  for(const [name,view] of Object.entries(VIEWS)){
    const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},hasTouch:view.device==='touch',isMobile:false,deviceScaleFactor:1});
    await ctx.addInitScript(m=>{try{localStorage.setItem('chongchao-device-mode',m);}catch(e){}},view.device==='touch'?'touch':'desktop');
    const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(URL_BASE+'?qa=1');
    await page.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
    // 正常主战役备战态：第 1 章第 1 关，金币 150，有本章提示与战术入口
    await page.evaluate(()=>{const q=__gameQA;q.newGame();q.sandboxWave.enabled=false;});
    await page.waitForTimeout(900);
    // 把最容易叠在一起的三类瞬时提示同时摆出来
    await page.evaluate(()=>{
      const ih=document.getElementById('interactHint');
      ih.textContent='↕ 关闭城门 · 走向城门会自动开门';ih.classList.remove('hidden');
      const sh=document.getElementById('saveHealth');sh.textContent='本地已保存 · 可选Toy云备份';sh.classList.remove('hidden','faded');
      __gameQA.Game.squadCount=1;   // 有队友时指挥按钮才出现，一并验证可点
    });
    await page.evaluate(c=>{const s=document.getElementById('stage');for(const k of c)s.classList.add(k);},FORCE);
    await page.waitForTimeout(200);
    // 用舞台的「逻辑像素」坐标（960×BASE_H，竖屏旋转时换轴），不用被 letterbox 拉变的包围盒
    const geo=await page.evaluate((ids)=>{
      const stage=document.getElementById('stage');const sr=stage.getBoundingClientRect();
      const sw=stage.offsetWidth,sh=stage.offsetHeight;
      const m=new DOMMatrix(getComputedStyle(stage).transform);
      const rotated=Math.abs(m.b)>Math.abs(m.a)+.01,s=Math.hypot(m.a,m.b)||1;
      const scx=sr.x+sr.width/2,scy=sr.y+sr.height/2;
      const out={stage:{logicalWidth:sw,logicalHeight:sh,rotated:rotated,scale:+s.toFixed(3)},els:{},nested:{}};
      for(const id of ids){const el=document.getElementById(id);
        if(!el){out.els[id]='missing';continue;}
        const cs=getComputedStyle(el);const r=el.getBoundingClientRect();
        if(el.classList.contains('hidden')||cs.display==='none'||cs.visibility==='hidden'){out.els[id]='hidden';continue;}
        // rotate(90deg)：屏幕 x 随逻辑 y 反向、屏幕 y 随逻辑 x 正向
        const box=rotated
          ?{x:sw/2+(r.y-scy)/s,y:sh/2-(r.right-scx)/s,width:r.height/s,height:r.width/s}
          :{x:(r.x-sr.x)/s,y:(r.y-sr.y)/s,width:r.width/s,height:r.height/s};
        out.els[id]={x:+box.x.toFixed(1),y:+box.y.toFixed(1),width:+box.width.toFixed(1),height:+box.height.toFixed(1),
          z:cs.zIndex,pe:cs.pointerEvents};
        // 记录父子关系，父子叠放不算遮挡
        out.nested[id]=[...ids].filter(o=>o!==id&&document.getElementById(o)&&document.getElementById(o).contains(el));
      }
      return out;
    },PROBES);
    const visible=Object.entries(geo.els).filter(([,v])=>v!=='hidden'&&v!=='missing');
    const overlaps=[];
    for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
      const [ka,a]=visible[i],[kb,b]=visible[j];
      if((geo.nested[ka]||[]).includes(kb)||(geo.nested[kb]||[]).includes(ka))continue;
      const o=overlap(a,b);if(o)overlaps.push({a:ka,b:kb,...o});
    }
    overlaps.sort((x,y)=>y.area-x.area);
    // 中心战场可视区：横向 20%~80%、纵向 8%~92%，被 HUD 面板盖住的比例
    const center={x:geo.stage.logicalWidth*.2,y:geo.stage.logicalHeight*.08,width:geo.stage.logicalWidth*.6,height:geo.stage.logicalHeight*.84};
    const centerBlocks=visible.filter(([,v])=>overlap(center,v)).map(([k,v])=>({id:k,
      blockedPct:+(overlap(center,v).area/(center.width*center.height)*100).toFixed(2),
      box:[v.x,v.y,v.width,v.height]}));
    centerBlocks.sort((a,b)=>b.blockedPct-a.blockedPct);
    report[name]={viewport:`${view.width}x${view.height}`,device:view.device,stage:geo.stage,
      touchModeClass:await page.evaluate(()=>document.getElementById('stage').classList.contains('touch-mode')),
      state:await page.evaluate(()=>__gameQA.Game.state),
      boxes:Object.fromEntries(visible),overlaps,centerBlocks,errors};
    if(process.env.SAVE_SHOTS)await page.screenshot({path:path.join(OUT,PREFIX+name+'.png')});
    // 触屏可点性：HUD 里的命令按钮必须真的能点（历史上被 #lookZone 吞掉过）
    const taps=[];
    for(const id of FORCE.length?[]:['tacticsButton','squadOrderBtn','readyBtn']){
      const el=await page.$('#'+id);
      if(!el){taps.push({id,tapped:false,why:'元素不存在'});continue;}
      if(!(await el.isVisible())){
        taps.push({id,tapped:false,why:await page.evaluate(i=>{const e=document.getElementById(i);const cs=getComputedStyle(e);return `隐藏(display=${cs.display},class=${e.className})`;},id)});
        continue;
      }
      const box=await el.boundingBox();
      const before=await page.evaluate(i=>document.getElementById(i).textContent,'squadOrderBtn');
      await page.evaluate(t=>{window.__squadBefore=t;},before);
      const hit=await page.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return e?{tag:e.tagName,id:e.id,cls:e.className}:null;},{x:box.x+box.width/2,y:box.y+box.height/2});
      let ok=null;
      try{await el.click({timeout:2500});}catch(e){ok='click 超时';}
      if(ok===null)ok=await page.evaluate(i=>{
        if(i==='readyBtn')return __gameQA.Game.state==='battle';
        if(i==='squadOrderBtn')return document.getElementById(i).textContent!==window.__squadBefore;
        return !document.getElementById('tacticsPanel').classList.contains('hidden');
      },id);
      taps.push({id,hit:hit&&(hit.id||hit.cls),tapped:ok});
      await page.evaluate(()=>{const p=document.getElementById('tacticsPanel');if(p&&!p.classList.contains('hidden'))document.getElementById('tacticsClose').click();});
      await page.waitForTimeout(150);
    }
    report[name].taps=taps;
    await ctx.close();
  }
  await browser.close();
  const dump=path.join(OUT||process.env.TMP||'.',PREFIX+'report.json');
  try{fs.mkdirSync(path.dirname(dump),{recursive:true});fs.writeFileSync(dump,JSON.stringify(report,null,1));}catch(e){}
  const brief=Object.fromEntries(Object.entries(report).map(([k,r])=>[k,{
    stage:r.stage&&`${r.stage.logicalWidth}x${r.stage.logicalHeight}${r.stage.rotated?' 旋转':''}`,
    遮挡:r.overlaps.map(o=>[o.a,o.b,o.w+'x'+o.h].join(' × ')),
    中心区:r.centerBlocks.map(c=>c.id+' '+c.blockedPct+'% ['+c.box.map(Math.round).join(',')+']'),
    可点:r.taps.map(function(t){return t.id+':'+(t.tapped===true?'OK':t.tapped===false?'FAIL('+(t.why||t.hit||'')+')':t.tapped);}),
    报错:r.errors}]));
  console.log(JSON.stringify(brief,null,1));
})().catch(e=>{console.error(e);process.exitCode=1;});
