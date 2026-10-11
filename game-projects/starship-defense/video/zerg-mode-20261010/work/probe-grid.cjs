// 网格扫描+BFS：用游戏真实 collideWalls/tooSteep/groundY 找出母虫(半径~0.95)从虫巢 mouth
// 到 基地核心 与 城门外 的可行路线。region x[-58,8] z[-66,30] step 1。
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const GAME_URL='https://www.zhengxiaohui.cn/html/game/starship-defense/index.html?qa=1';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--disable-background-timer-throttling','--disable-renderer-backgrounding','--autoplay-policy=no-user-gesture-required']});
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const p=await context.newPage();
  await p.goto(GAME_URL,{waitUntil:'domcontentloaded',timeout:90000});
  await p.waitForFunction(()=>window.__ccReady&&window.__gameQA,{timeout:90000});
  await p.click('#btnZerg');
  await p.waitForFunction(()=>__gameQA.zergOn()&&__gameQA.Game.state==='battle',{timeout:30000});
  await sleep(800);
  const res=await p.evaluate(()=>{
    const q=__gameQA,R=.95;
    const X0=-78,X1=8,Z0=-66,Z1=186;
    const W=X1-X0+1,D=Z1-Z0+1;
    const walk=new Array(W*D),gy=new Array(W*D),st=new Array(W*D);
    for(let ix=0;ix<W;ix++)for(let iz=0;iz<D;iz++){
      const x=X0+ix,z=Z0+iz,i=ix*D+iz;
      const inW=x>q.base?true:true;
      let blocked=false;
      if(x<-110+3||x>110-3||z<-70+3||z>335-3)blocked=true;
      else{try{blocked=q.collideWalls(x,z,R)||q.tooSteep(x,z);}catch(e){blocked=true;}}
      walk[i]=!blocked;
      try{gy[i]=+q.groundY(x,z).toFixed(2);}catch(e){gy[i]=null;}
    }
    const idx=(x,z)=>[(x-X0)*D,(z-Z0)];
    const ok=(x,z)=>{const[i,o]=idx(x,z);return x>=X0&&x<=X1&&z>=Z0&&z<=Z1&&walk[i+o];};
    // 8向BFS，斜向要求两个正交邻格也可走（防切角）
    function bfs(sx,sz,goal){
      if(!ok(sx,sz))return null;
      const prev=new Map(),key=(x,z)=>x+'_'+z;prev.set(key(sx,sz),null);
      const qu=[[sx,sz]];
      while(qu.length){
        const [cx,cz]=qu.shift();
        if(goal(cx,cz)){
          const path=[];let k=key(cx,cz),cur=[cx,cz];
          while(cur){path.push(cur);const pk=prev.get(key(cur[0],cur[1]));cur=pk?[pk[0],pk[1]]:null;}
          return path.reverse();
        }
        for(const[dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
          const nx=cx+dx,nz=cz+dz;
          if(!ok(nx,nz)||prev.has(key(nx,nz)))continue;
          if(dx&&dz&&(!ok(cx+dx,cz)||!ok(cx,cz+dz)))continue;
          prev.set(key(nx,nz),[cx,cz]);qu.push([nx,nz]);
        }
      }
      return null;
    }
    const mouths=(q.MOUTHS||[]).map(m=>({id:m.id,name:m.name,x:+m.out.x.toFixed(1),z:+m.out.z.toFixed(1)}));
    const wm=mouths.length?mouths.reduce((a,b)=>a.x<b.x?a:b):null;
    const start=wm?[Math.round(wm.x),Math.round(wm.z)]:[-50,20];
    const base=[Math.round(q.base.pos.x),Math.round(q.base.pos.z)];
    const gate=[Math.round(q.gate.mesh.position.x),Math.round(q.gate.mesh.position.z)];
    const pBase=bfs(start[0],start[1],(x,z)=>Math.hypot(x-q.base.pos.x,z-q.base.pos.z)<9);
    const pGate=bfs(start[0],start[1],(x,z)=>Math.abs(z-q.gate.mesh.position.z)<10&&Math.abs(x-q.gate.mesh.position.x)<10);
    const fmt=path=>path?path.map(([x,z])=>[x,z,+q.groundY(x,z).toFixed(1)]):null;
    return{start,mouths,base:[base[0],base[1],+q.base.pos.y.toFixed(1)],gate,gateOpen:q.gate.open,gateDead:q.gate.dead,
      baseHp:Math.round(q.base.hp),gateHp:Math.round(q.gate.hp),
      pathBase:fmt(pBase),pathGate:fmt(pGate)};
  });
  console.log('START',JSON.stringify(res.start),'MOUTHS',JSON.stringify(res.mouths));
  console.log('BASE',JSON.stringify(res.base),'GATE',JSON.stringify(res.gate),'gateOpen',res.gateOpen,'gateDead',res.gateDead,'baseHp',res.baseHp,'gateHp',res.gateHp);
  for(const[name,path] of [['PATH-BASE',res.pathBase],['PATH-GATE',res.pathGate]]){
    if(!path){console.log(name,'NO-PATH');continue;}
    console.log(name,'len',path.length,'ymin',Math.min(...path.map(c=>c[2])),'ymax',Math.max(...path.map(c=>c[2])));
    // 压缩：只留转向点
    const wp=[];for(let i=0;i<path.length;i++){const a=path[Math.max(0,i-1)],b=path[i],c=path[Math.min(path.length-1,i+1)];if((b[0]-a[0])*(c[1]-b[1])!==(b[1]-a[1])*(c[0]-b[0]))wp.push(path[i]);}
    console.log(name+'-WP',JSON.stringify(wp));
    if(path.length<=400)console.log(name+'-FULL',JSON.stringify(path));
  }
  await browser.close();
})().catch(e=>{console.error('PROBE-FAIL',e.message);process.exit(1);});
