// One footprint for the visible alloy wall, movement and projectile impacts.
export const COVER_HEIGHT=1.1;
export const WALL_WIDTH=6,WALL_DEPTH=1;
export function wallLocal(w,x,z){
  const dx=x-w.mesh.position.x,dz=z-w.mesh.position.z,c=Math.cos(w.rotY),s=Math.sin(w.rotY);
  // Inverse of THREE's positive Y rotation: world X = c*x + s*z.
  return {x:c*dx-s*dz,z:s*dx+c*dz};
}
export function wallTouches(w,x,z,r=0){
  const p=wallLocal(w,x,z),dx=Math.max(0,Math.abs(p.x)-WALL_WIDTH/2),dz=Math.max(0,Math.abs(p.z)-WALL_DEPTH/2);
  return dx*dx+dz*dz<=r*r;
}
export function wallSegment(w,a,b){
  const p=wallLocal(w,a.x,a.z),q=wallLocal(w,b.x,b.z),base=w.mesh.position.y;
  let enter=0,exit=1;
  for(const [start,end,min,max] of [[p.x,q.x,-WALL_WIDTH/2,WALL_WIDTH/2],[a.y,b.y,base,base+COVER_HEIGHT],[p.z,q.z,-WALL_DEPTH/2,WALL_DEPTH/2]]){
    const d=end-start;
    if(Math.abs(d)<1e-9){if(start<min||start>max)return null;continue;}
    const t0=(min-start)/d,t1=(max-start)/d;
    enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));
    if(enter>exit)return null;
  }
  return enter;
}
