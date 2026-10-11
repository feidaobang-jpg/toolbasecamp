// 探针 v31：城墙几何测绘。网格采样 collideWalls+tooSteep，找出围墙范围与可绕行缺口。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const GAME_URL='https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const p=await (await browser.newContext({viewport:{width:960,height:540}})).newPage();
  await p.goto(GAME_URL,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
  await p.click('#btnZerg');
  await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
  await sleep(600);
  // 地图网格：x -80..40 步 4，z -70..60 步 5 —— 画 ASCII 墙图（# = 不可站/墙，. = 可走，C=core B=bunker S=sniper G=gate）
  const grid=await p.evaluate(()=>{
    const q=__gameQA,rows=[];
    for(let z=-70;z<=60;z+=5){
      let row='';
      for(let x=-80;x<=40;x+=4){
        const stand=!q.collideWalls(x,z,.95)&&!q.tooSteep(x,z);
        row+=stand?'.':'#';
      }
      rows.push({z,row});
    }
    return rows;
  });
  const marks=[[0,-16,'G'],[-8,-20,'B'],[8,-20,'S'],[0,-26,'C'],[-12,-42,'K'],[-15,-13,'m'],[15,-13,'m'],[-27,-13,'m'],[27,-20,'m'],[1,11,'W']];
  console.log('    x=' + Array.from({length:31},(_,i)=>String(-80+i*4).padStart(3).slice(-1)).join(''));
  for(const r of grid){
    let row=r.row.split('');
    for(const [mx,mz,ch] of marks){
      const xi=Math.round((mx-(-80))/4), zi=Math.round((r.z-mz)/5)===0?Math.round((-70-r.z)/-5):null;
      if(Math.abs(r.z-mz)<2.5&&xi>=0&&xi<row.length)row[xi]=ch;
    }
    console.log(String(r.z).padStart(4),row.join(''));
  }
  // 关键走廊验证：西绕路线 x=-40 从 z=20 走到 z=-42，每步 collideWalls
  const west=await p.evaluate(()=>{
    const q=__gameQA,out=[];
    for(let z=20;z>=-60;z-=2)out.push({z,x:-40,ok:!q.collideWalls(-40,z,.95)&&!q.tooSteep(-40,z)});
    return out;
  });
  console.log('WEST x=-40:',west.map(w=>w.z+(w.ok?'.':'#')).join(''));
  const west2=await p.evaluate(()=>{
    const q=__gameQA,out=[];
    for(let x=-60;x<=-12;x+=2){const ok=!q.collideWalls(x,-42,.95)&&!q.tooSteep(x,-42);out.push(x+(ok?'.':'#'));}
    return out;
  });
  console.log('CORE-LAT z=-42:',west2.join(''));
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
