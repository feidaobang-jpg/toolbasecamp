export const WALL_TOP=9.6;
export {COVER_HEIGHT as PARAPET_HEIGHT} from './wall-geometry.js';
// Outside perimeter only; the front gate and courtyard ramps stay open.
export const PARAPETS=[[-23,-10.3,30,.6],[23,-10.3,30,.6],[-37.7,-36,.6,52],[37.7,-36,.6,52],[0,-61.7,76,.6]];
export function legacyRampartWall(b){
  return b.k==='wall'&&Math.abs(b.z+16)<.01&&Math.abs(Math.sin(b.r||0))<.01&&[-31,-25,-19,-13,13,19,25,31].some(x=>Math.abs(b.x-x)<.01);
}
// Eight-metre-wide side/rear walks, ten-metre-deep frontal firing platforms.
export const RAMPARTS=[[-23,-16,15,6],[23,-16,15,6],[-34,-38,4,22],[34,-38,4,22],[0,-58,38,4]];
export function rampartHeight(x,z){
  for(const [cx,cz,w,d] of RAMPARTS)if(Math.abs(x-cx)<=w&&Math.abs(z-cz)<=d)return WALL_TOP;
  if(Math.abs(x)>=20&&Math.abs(x)<=28&&z>=-46&&z<-22)return 5+(WALL_TOP-5)*(z+46)/24;
  return 0;
}
export function rampartNavigation(from,to){
  const on=p=>rampartHeight(p.x,p.z)>=WALL_TOP-.01,toTop=on(to),fromTop=on(from);
  const side=(fromTop?from.x:to.x)<0?-1:1,x=24*side;
  const inRamp=Math.abs(from.x)>=20&&Math.abs(from.x)<=28&&from.z>=-49&&from.z<-22;
  if(inRamp)return {x:24*Math.sign(from.x),z:toTop?-20:-49};
  if(fromTop&&toTop){
    const clear=(a,b)=>{const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z));for(let i=0;i<=n;i++)if(!on({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n}))return false;return true;};
    if(clear(from,to))return null;
    const nodes=[from,{x:-34,z:-18},{x:-34,z:-58},{x:34,z:-58},{x:34,z:-18},to],dist=nodes.map(()=>Infinity),prev=[],done=new Set();dist[0]=0;
    for(let k=0;k<nodes.length;k++){let u=-1;for(let i=0;i<nodes.length;i++)if(!done.has(i)&&(u<0||dist[i]<dist[u]))u=i;if(u<0||!Number.isFinite(dist[u]))break;done.add(u);
      for(let v=1;v<nodes.length;v++)if(!done.has(v)&&clear(nodes[u],nodes[v])){const d=dist[u]+Math.hypot(nodes[v].x-nodes[u].x,nodes[v].z-nodes[u].z);if(d<dist[v]){dist[v]=d;prev[v]=u;}}
    }
    let v=nodes.length-1;if(prev[v]===undefined)return null;while(prev[v]!==0)v=prev[v];return nodes[v];
  }
  if(fromTop===toTop)return null;
  if(Math.abs(from.x-x)<3.7&&from.z>=-50&&from.z<=-19)return {x,z:toTop?-20:-49};
  if(fromTop)return {x,z:-20};
  // Reach the ramp foot around the core, rather than trying to climb a ramp's side.
  if(from.z>-47)return Math.abs(from.x)>3?{x:0,z:-30}:{x:0,z:-49};
  return {x,z:-49};
}
