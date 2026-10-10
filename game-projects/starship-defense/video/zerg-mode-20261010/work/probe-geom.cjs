// 只读几何 dump：岩体碰撞、要塞范围、城墙/门柱、虫洞 MOUTHS，规划绕后路线用。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const p=await context.newPage();
  await p.goto('https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1',{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
  await p.click('#btnZerg');
  await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
  await sleep(1500);
  const g=await p.evaluate(()=>{const q=__gameQA;
    const V=o=>o&&o.position?{x:+o.position.x.toFixed(1),z:+o.position.z.toFixed(1)}:null;
    return{
      rocks:(q.rockColliders||[]).map(r=>({x:+(r.x??r.position?.x??0).toFixed? +( (r.x??r.position?.x??0)).toFixed(1):null, z:+((r.z??r.position?.z??0)).toFixed(1), r:+((r.r??r.radius??0).toFixed(1)), mesh:V(r.mesh||r.object3d)})).slice(0,60),
      mouths:(q.MOUTHS||[]).m?.length!==undefined?[]:[],
      mouthOut:(q.MOUTHS||[]).map(m=>({id:m.id,name:m.name,x:+m.out.x.toFixed(1),z:+m.out.z.toFixed(1)})),
      fortress:q.fortress?{pos:V(q.fortress.pos?{position:q.fortress.pos}:q.fortress),...q.fortress}:null,
      ramparts:(q.RAMPARTS||[]).map(r=>({x:+(r.x??(r.out&&r.out.x)??0).toFixed(1),z:+(r.z??(r.out&&r.out.z)??0).toFixed(1),keys:Object.keys(r).slice(0,6)})).slice(0,10),
      gateWall:q.gate?{x:+q.gate.mesh.position.x.toFixed(1),z:+q.gate.mesh.position.z.toFixed(1)}:null,
      base:{x:+q.base.pos.x.toFixed(1),z:+q.base.pos.z.toFixed(1)},
      hive:q.hive?Object.keys(q.hive):null,
      collideSample:(()=>{const out=[];for(const [x,z] of [[-60,-45],[-50,-50],[-40,-50],[-30,-52],[-20,-52],[-12,-52],[-12,-46],[-25,-46],[-40,-44],[-55,-40],[-62,-30],[-45,-38],[-30,-38],[-30,-45],[-20,-45],[-35,-35]]){try{const c=q.collideWalls?q.collideWalls({x:0,y:0,z:0},0.1,0.1):null;out.push([x,z,'api?']);}catch(e){out.push([x,z,'err']);}}return out.slice(0,3);})()
    };});
  console.log(JSON.stringify(g,null,1).slice(0,4000));
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
