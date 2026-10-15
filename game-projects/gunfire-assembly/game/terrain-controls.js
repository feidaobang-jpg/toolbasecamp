// A flat summit leaves room for an accessible fort; the smooth skirt stays walkable.
export const HILL_FORTS=[{x:-43,z:84,r:30,top:9,h:6},{x:43,z:114,r:32,top:10,h:7}];
export function hillHeight(x,z){
  let h=0;
  for(const f of HILL_FORTS.concat([{x:-42,z:49,r:20,top:4,h:3.2}])){
    const t=Math.max(0,Math.min(1,(Math.hypot(x-f.x,z-f.z)-f.top)/(f.r-f.top)));
    h=Math.max(h,f.h*(1-t*t*(3-2*t)));
  }
  return h;
}
export function slopeSpeed(height,x,z,dx,dz){
  const length=Math.hypot(dx,dz);if(length<.001)return 1;
  const gradient=(height(x+dx/length*.6,z+dz/length*.6)-height(x-dx/length*.6,z-dz/length*.6))/1.2;
  return Math.max(.58,Math.min(1.3,1-gradient*.8));
}
