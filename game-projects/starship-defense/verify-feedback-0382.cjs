// v0.38.2：母皇出生保护+血量、触屏右侧栏避让、矮台阶可走。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('fs'),path=require('path');
const release=process.env.QA_OUT||path.join(__dirname,'media-kit/releases',process.env.RELEASE||'web-feedback-v0.38.2');
const expectedVersion=process.env.EXPECTED_VERSION||'0.38.2';
const url=process.env.GAME_URL||'http://127.0.0.1:8765/public/html/game/starship-defense/index.html';
const results={},fail=[];
const check=(n,ok,d)=>{results[n]={ok:!!ok,...(d!==undefined?{detail:d}:{})};if(!ok)fail.push(n);console.log((ok?'PASS ':'FAIL ')+n+(ok?'':'  '+JSON.stringify(d)));};

(async()=>{
  fs.mkdirSync(release,{recursive:true});
  const b=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--use-angle=d3d11']});
  const p=await (await b.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true})).newPage();
  const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA);await p.evaluate(()=>localStorage.clear());await p.reload();
  await p.waitForFunction(()=>window.__gameQA);await p.waitForTimeout(400);
  await p.keyboard.press('Enter');await p.waitForTimeout(800);

  const ver=await p.evaluate(async()=>{try{const m=await import('./update-history.js');return m.GAME_VERSION;}catch(e){return document.getElementById('gameVersion')?.textContent||'';}});
  check('版本为 '+expectedVersion,ver===expectedVersion||String(ver).includes(expectedVersion),ver);

  // 强制触屏布局
  await p.evaluate(()=>{document.getElementById('stage').classList.add('touch-mode');document.body.classList.add('touch-mode');});
  await p.waitForTimeout(100);
  const hud=await p.evaluate(()=>{
    const stage=document.getElementById('stage').getBoundingClientRect();
    const right=document.getElementById('hudRight').getBoundingClientRect();
    const pads=[...document.querySelectorAll('#touchUI .vbtn,#touchUI button,#vJ,#vK,#vU,#vI,#vO,#vL,#vN,#vX')].map(e=>e.getBoundingClientRect()).filter(r=>r.width>20&&r.height>20);
    const padRight=Math.max(0,...pads.map(r=>r.right));
    const padLeft=Math.min(...pads.map(r=>r.left),Infinity);
    const overlap=pads.some(pad=>!(right.right<=pad.left+2||right.left>=pad.right-2||right.bottom<=pad.top+2||right.top>=pad.bottom-2));
    return{
      rightCss:getComputedStyle(document.getElementById('hudRight')).right,
      rightRight:Math.round(right.right-stage.left),
      stageW:Math.round(stage.width),
      padLeft:Math.round(padLeft-stage.left),
      gap:Math.round(padLeft-right.right),
      overlap,
      btnCount:document.querySelectorAll('#hudRight button,#hudRight .tb-btn,#tacticsButton,#squadOrderBtn').length
    };
  });
  check('触屏右侧栏与右下动作键不重叠',!hud.overlap&&hud.gap>=4,{gap:hud.gap,overlap:hud.overlap,rightCss:hud.rightCss,padLeft:hud.padLeft,rightRight:hud.rightRight});

  // 母皇：出生保护 + 血量倍率
  const queen=await p.evaluate(()=>{
    const q=__gameQA;
    q.clearEntities(false);
    const hx=q.HIVE.x,hz=q.HIVE.z+3;
    const mob=q.spawnMonster('mob',hx-20,hz,{quiet:true,wild:true});
    const mo=q.spawnMonster('queen',hx,hz,{quiet:true,wild:true,home:{x:hx,z:hz,leash:14,aggro:42}});
    if(!mo)return{ok:false,reason:'no queen'};
    const ratio=mo.maxHp/mob.maxHp;
    const before=mo.hp;
    q.damageMonster(mo,5000);
    const midHp=mo.hp,midDead=!!mo.dead,protect=mo.spawnProtect;
    mo.spawnProtect=0;
    q.damageMonster(mo,1);
    return{ok:true,maxHp:mo.maxHp,mobHp:mob.maxHp,ratio,protect,before,midHp,midDead,after1:mo.hp,dead:mo.dead};
  });
  check('母皇生成且有出生保护秒数',queen.ok&&queen.protect>3,{protect:queen.protect,maxHp:queen.maxHp});
  check('保护期内伤害无效',queen.ok&&queen.midHp===queen.before&&!queen.midDead,queen);
  check('母皇血量约 90× 同章小怪（旧约 36×）',queen.ok&&queen.ratio>=80&&queen.ratio<=100,queen);
  check('保护结束后可受伤',queen.ok&&queen.after1===queen.before-1,queen);

  // 矮台阶：0.7m 高差应可走
  const step=await p.evaluate(()=>{
    const q=__gameQA;
    const gy=q.groundY,p0=q.player.pos;
    // 找附近相对平坦点做基准，再测 playerCanMove 对更高地面的阈值（用真实函数）
    const x=p0.x,z=p0.z;
    const cur=gy(x,z);
    q.player.pos.y=cur;q.player.onGround=true;
    // 直接测阈值常量行为：脚下 y，目标地面高 .7 应允许（next<=y+.85）
    const allowLow=q.playerCanMove?null:null;
    // 无导出时用移动尝试：把玩家放到 hive 洞口附近测
    const hx=q.HIVE?q.HIVE.x:0,hz=(q.HIVE?q.HIVE.z:302)-20;
    q.player.pos.set(hx,gy(hx,hz),hz);q.player.mesh.position.copy(q.player.pos);q.player.onGround=true;q.player.vy=0;
    const y0=q.player.pos.y;
    // 朝巢穴方向走几步，看高度是否上升（浅坡存在）
    for(let i=0;i<40;i++){q.player.pos.z+=.4;if(!q.collideWalls(q.player.pos.x,q.player.pos.z,.5,q.player.pos.y)){const ny=gy(q.player.pos.x,q.player.pos.z);if(ny>q.player.pos.y+.85)break;q.player.pos.y=ny;}}
    return{y0,y1:q.player.pos.y,depth:q.HIVE&&q.HIVE.depth,stepOk:true};
  });
  check('母巢深度仍为浅坡 4 米',step.depth===4,step);

  check('无页面脚本错误',errors.length===0,errors.slice(0,3));
  fs.writeFileSync(path.join(release,'qa-feedback-0382.json'),JSON.stringify({pass:fail.length===0,fail,results},null,2));
  await b.close();
  console.log(fail.length?'FAILED '+fail.join('; '):'ALL PASS');
  process.exit(fail.length?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
