// Short, cached detours around solid scenery. Every edge is swept through the
// same collision/slope query as ordinary movement; no burrowing or wall jumps.
export function clearMonsterSegment(a,b,canMove){
  const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.65));
  for(let i=1;i<=n;i++)if(!canMove(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n))return false;
  return true;
}
function detour(start,target,canMove){
  const step=1.5,limit=24,dx=target.x-start.x,dz=target.z-start.z,d=Math.hypot(dx,dz)||1;
  const goal={x:start.x+dx*Math.min(1,28/d),z:start.z+dz*Math.min(1,28/d)};
  const h=(x,z)=>Math.hypot(x-goal.x,z-goal.z),first={i:0,j:0,x:start.x,z:start.z,g:0,h:h(start.x,start.z)},open=[first],nodes=new Map([['0,0',first]]);
  let best=first;
  for(let iterations=0;open.length&&iterations<650;iterations++){
    let at=0;for(let k=1;k<open.length;k++)if(open[k].g+open[k].h<open[at].g+open[at].h)at=k;
    const n=open.splice(at,1)[0];if(n.closed)continue;n.closed=true;if(n.h<best.h)best=n;if(n.h<step)break;
    for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
      const i=n.i+di,j=n.j+dj;if(Math.abs(i)>limit||Math.abs(j)>limit)continue;
      const key=i+','+j,x=start.x+i*step,z=start.z+j*step,g=n.g+Math.hypot(di,dj)*step,old=nodes.get(key);
      if(old&&(old.closed||old.g<=g))continue;
      const next={i,j,x,z,g,h:h(x,z),parent:n};if(!clearMonsterSegment(n,next,canMove))continue;
      nodes.set(key,next);open.push(next);
    }
  }
  if(best===first||best.h>first.h-.75)return null;
  const path=[];for(let n=best;n.parent;n=n.parent)path.push({x:n.x,z:n.z});return path.reverse();
}
export function monsterStep(mo,dir,dt,speed,goal,canMove){
  const p=mo.mesh.position,step=speed*dt;
  mo.navCooldown=Math.max(0,(mo.navCooldown||0)-dt);
  if(mo.navPath&&(!goal||Math.hypot(goal.x-mo.navTarget.x,goal.z-mo.navTarget.z)>5))mo.navPath=null;
  const direct={x:p.x+dir.x*step,z:p.z+dir.z*step};
  if(!mo.navPath&&clearMonsterSegment(p,direct,canMove))return direct;
  if(goal&&!mo.navPath&&mo.navCooldown<=0){mo.navCooldown=.8;mo.navPath=detour(p,goal,canMove);mo.navTarget={x:goal.x,z:goal.z};}
  if(mo.navPath){
    while(mo.navPath.length&&Math.hypot(mo.navPath[0].x-p.x,mo.navPath[0].z-p.z)<.45)mo.navPath.shift();
    const wp=mo.navPath[0];
    if(wp){const dx=wp.x-p.x,dz=wp.z-p.z,d=Math.hypot(dx,dz),k=Math.min(1,step/d),next={x:p.x+dx*k,z:p.z+dz*k};if(clearMonsterSegment(p,next,canMove))return next;}
    mo.navPath=null;
  }
  // A wandering insect hitting the map boundary turns back into the field.
  const side=mo.avoidSide||(mo.avoidSide=p.x<0?1:-1);
  for(const angle of [.7,1.25,1.8,2.5,Math.PI,-.7,-1.25]){
    const a=angle*side,c=Math.cos(a),s=Math.sin(a),x=dir.x*c-dir.z*s,z=dir.x*s+dir.z*c,next={x:p.x+x*step,z:p.z+z*step};
    if(clearMonsterSegment(p,next,canMove)){if(!goal&&mo.wander)mo.wander.set(x,0,z);return next;}
  }
  return {x:p.x,z:p.z};
}
