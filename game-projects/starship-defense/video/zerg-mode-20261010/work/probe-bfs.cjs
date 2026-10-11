// 探针 v35：全图 BFS 寻路。1.5u 网格采样 collideWalls+tooSteep(r=.95)，从巢穴(1,176)到口袋(-16,-46)最短路径，
// 输出视距简化后的路点序列（可直接烘焙进采集脚本）。
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
  const res=await p.evaluate(()=>{
    const q=__gameQA,STEP=1.5,X0=-82,X1=12,Z0=-74,Z1=182;
    const NX=Math.round((X1-X0)/STEP),NZ=Math.round((Z1-Z0)/STEP);
    const idx=(ix,iz)=>iz*NX+ix;
    const walk=new Uint8Array(NX*NZ);
    for(let iz=0;iz<NZ;iz++)for(let ix=0;ix<NX;ix++){
      const x=X0+ix*STEP,z=Z0+iz*STEP;
      walk[idx(ix,iz)]=(!q.collideWalls(x,z,.95)&&!q.tooSteep(x,z))?1:0;
    }
    const sx=Math.round((1-X0)/STEP),sz=Math.round((176-Z0)/STEP);
    const gx=Math.round((-16-X0)/STEP),gz=Math.round((-46-Z0)/STEP);
    // 城门建筑本体不是 wall 几何，手动封锁门体区域（门(0,-16)，含门柱余量）
    for(let iz=0;iz<NZ;iz++)for(let ix=0;ix<NX;ix++){
      const x=X0+ix*STEP,z=Z0+iz*STEP;
      if(x>=-8&&x<=8&&z>=-19&&z<=-13)walk[idx(ix,iz)]=0;
    }
    // BFS 8 邻域
    const prev=new Int32Array(NX*NZ).fill(-1);const Q=[idx(sx,sz)];prev[idx(sx,sz)]=idx(sx,sz);
    const DIR=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    let found=-1;
    for(let h=0;h<Q.length&&found<0;h++){
      const cur=Q[h],cx=cur%NX,cz=(cur/NX)|0;
      for(const [dx,dz] of DIR){
        const nx2=cx+dx,nz2=cz+dz;if(nx2<0||nz2<0||nx2>=NX||nz2>=NZ)continue;
        const ni=idx(nx2,nz2);if(prev[ni]>=0||!walk[ni])continue;
        // 禁止斜穿对角缝隙：两个正交邻格都必须可走
        if(dx&&dz&&(!walk[idx(cx+dx,cz)]||!walk[idx(cx,cz+dz)]))continue;
        prev[ni]=cur;Q.push(ni);if(nx2===gx&&nz2===gz){found=ni;break;}
      }
    }
    if(found<0)return{ok:false};
    const path=[];let cur=found;
    while(cur!==idx(sx,sz)){path.push({x:X0+(cur%NX)*STEP,z:Z0+((cur/NX)|0)*STEP});cur=prev[cur];}
    path.push({x:1,z:176});path.reverse();
    // 视距简化：Bresenham 逐格检查
    const los=(a,b)=>{const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/1);for(let i=0;i<=n;i++){const x=a.x+(b.x-a.x)*i/n,z=a.z+(b.z-a.z)*i/n;const ix=Math.round((x-X0)/STEP),iz=Math.round((z-Z0)/STEP);if(!walk[idx(ix,iz)])return false;}return true;};
    const wp=[path[0]];let i=0;
    while(i<path.length-1){let j=path.length-1;while(j>i+1&&!los(path[i],path[j]))j--;wp.push(path[j]);i=j;}
    return{ok:true,cells:Q.length,wp:wp.map(w=>[+w.x.toFixed(1),+w.z.toFixed(1)]),raw:path.length};
  });
  console.log('BFS',JSON.stringify(res));
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
