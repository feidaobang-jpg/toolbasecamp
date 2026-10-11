// 探针 v34：薄墙(x≈-37.5)北端与要塞墙西北角之间的穿越窗口。x -46..-26 step1.5, z -26..-4 step1.5。
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
    for(let z=-26;z<=-4;z+=1.5){
      let row='';
      for(let x=-46;x<=-26;x+=1.5)row+=(!q.collideWalls(x,z,.95)&&!q.tooSteep(x,z))?'.':'#';
      rows.push({z,row});
    }
    return rows;
  });
  console.log('GRID x=-46..-26 step1.5 (列头: -46 -44.5 -43 -41.5 -40 -38.5 -37 -35.5 -34 -32.5 -31 -29.5 -28 -26.5)');
  for(const r of grid)console.log(String(r.z).padStart(5),r.row.split('').join(''));
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
