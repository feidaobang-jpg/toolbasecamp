// 探针 v33：西走廊细网格测绘（1.5u 步长），定位 (-39.6,-30) 附近的真实缺口。
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
  const grid=await p.evaluate(()=>{
    const q=__gameQA,rows=[];
    for(let z=-44;z<=-16;z+=1.5){
      let row='';
      for(let x=-48;x<=-30;x+=1.5)row+=(!q.collideWalls(x,z,.95)&&!q.tooSteep(x,z))?'.':'#';
      rows.push({z,row});
    }
    return rows;
  });
  console.log('GRID x=-48..-30 step1.5 (每字符1.5u；列头: -48 -46.5 -45 -43.5 -42 -40.5 -39 -37.5 -36 -34.5 -33 -31.5 -30)');
  for(const r of grid)console.log(String(r.z).padStart(5),r.row.split('').join(''));
  // z=-30 那一行逐格打印真实坐标便于读
  const row30=grid.find(r=>Math.abs(r.z-(-30))<.75);
  if(row30){const cells=row30.row.split('');let out='';cells.forEach((c,i)=>{out+=`x=${-48+i*1.5}:${c}  `;});console.log('z=-30 细节:',out);}
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
