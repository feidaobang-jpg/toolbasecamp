import * as THREE from './vendor/three.module.js';

// Three sloping galleries share one continuous underground chamber. All geometry,
// collision, radar and marching routes derive from these same centre lines.
export const HIVE={x:0,z:302,r:28,depth:22};
const LINES=[
  {id:'W',name:'西侧虫洞',pts:[[-68,184],[-68,214],[-54,247],[-30,276],[-12,294]]},
  {id:'C',name:'中央主洞',main:true,pts:[[0,184],[0,219],[0,253],[0,284]]},
  {id:'E',name:'东侧虫洞',pts:[[68,184],[68,214],[54,247],[30,276],[12,294]]}
];
const WIDTH=8,HEIGHT=10,clamp=v=>Math.max(0,Math.min(1,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v);};
export const TUNNELS=LINES.map(t=>{
  const curve=new THREE.CatmullRomCurve3(t.pts.map(([x,z])=>new THREE.Vector3(x,0,z)),false,'centripetal');
  const points=curve.getSpacedPoints(Math.ceil(curve.getLength()/1.5));
  return {...t,samples:points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],d=b.clone().sub(a).normalize();return {x:p.x,z:p.z,tx:d.x,tz:d.z,nx:-d.z,nz:d.x};})};
});
const grid=new Map();
for(const t of TUNNELS)for(let i=1;i<t.samples.length;i++){
  const a=t.samples[i-1],b=t.samples[i],s={a,b};
  for(let x=Math.floor(Math.min(a.x,b.x)/12)-1;x<=Math.floor(Math.max(a.x,b.x)/12)+1;x++)for(let z=Math.floor(a.z/12)-1;z<=Math.floor(b.z/12)+1;z++){
    const key=x+','+z;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(s);
  }
}
export function tunnelDistance(x,z){
  let best=Infinity;const cell=grid.get(Math.floor(x/12)+','+Math.floor(z/12));
  if(cell)for(const {a,b} of cell){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz));best=Math.min(best,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));}
  return best;
}
export function hiveDepth(z){return -HIVE.depth*smooth((z-184)/98);}
export function hiveField(x,z){return Math.min(tunnelDistance(x,z)-WIDTH,Math.hypot(x-HIVE.x,z-HIVE.z)-HIVE.r);}
export function hiveFloor(x,z,surface=0){
  if(z<184)return surface;
  const blend=smooth(-hiveField(x,z)/2.5);return surface*(1-blend)+hiveDepth(z)*blend;
}
export function hiveCeiling(x,z){
  if(z<184||hiveField(x,z)>=0)return Infinity;
  const td=tunnelDistance(x,z)/WIDTH,hd=Math.hypot(x-HIVE.x,z-HIVE.z)/HIVE.r;
  const arch=td<1?HEIGHT*Math.sqrt(1-td*td):0,room=hd<1?15*Math.sqrt(1-hd*hd):0;
  return Math.max(hiveFloor(x,z)+.1,hiveDepth(z)+Math.max(arch,room));
}
export const MOUTHS=TUNNELS.map(t=>{const s=t.samples[0];return {id:t.id,name:t.name,main:!!t.main,x:s.x,z:s.z,dx:-s.tx,dz:-s.tz,out:{x:s.x-s.tx*5,z:s.z-s.tz*5}};});
// Waypoints include the chamber approach and the outside lip; no teleporting spawns.
export function hiveRoute(id){const t=TUNNELS.find(t=>t.id===id)||TUNNELS[1],m=MOUTHS.find(m=>m.id===t.id);return [...t.samples].reverse().filter((_,i)=>i%3===0).concat([t.samples[0],m.out]);}
export function hiveNavigation(from,to){
  if(from.z<182&&to.z<182)return null;
  const nearest=p=>{let best=null;for(const t of TUNNELS)for(let i=0;i<t.samples.length;i++){const s=t.samples[i],d=Math.hypot(p.x-s.x,p.z-s.z);if(!best||d<best.d)best={t,i,d};}return best;};
  const a=nearest(from),b=nearest(to),inRoom=p=>Math.hypot(p.x-HIVE.x,p.z-HIVE.z)<24;
  if(inRoom(from)&&inRoom(to))return null;
  if(from.z<184||hiveField(from.x,from.z)>-2.5){
    if(to.z<182)return null;
    const m=inRoom(to)?MOUTHS.reduce((best,m)=>Math.hypot(from.x-m.x,from.z-m.z)<Math.hypot(from.x-best.x,from.z-best.z)?m:best):MOUTHS.find(m=>m.id===b.t.id);
    const t=TUNNELS.find(t=>t.id===m.id);
    const aligned=Math.abs((from.x-m.x)*m.dz-(from.z-m.z)*m.dx)<3;
    return aligned&&Math.hypot(from.x-m.x,from.z-m.z)<11?t.samples[5]:m.out;
  }
  if(inRoom(from)){if(to.z>=182&&!inRoom(to))return b.t.samples[b.t.samples.length-5];return a.t.samples[a.t.samples.length-5];}
  const inward=to.z>=182&&(inRoom(to)||a.t!==b.t||b.i>a.i);
  if(a.t===b.t&&Math.hypot(from.x-to.x,from.z-to.z)<7)return null;
  if(inward&&a.i>=a.t.samples.length-4)return {x:HIVE.x,z:HIVE.z};
  if(!inward&&a.i<4)return MOUTHS.find(m=>m.id===a.t.id).out;
  return a.t.samples[Math.max(0,Math.min(a.t.samples.length-1,a.i+(inward?4:-4)))];
}
export class HiveWorld {
  constructor(scene,height,palette,solids){
    this.mouths=MOUTHS;this.tunnels=TUNNELS;this.hive=HIVE;
    const P=palette.hive,positions=[],colors=[],caps=[],c=new THREE.Color(),rock=new THREE.Color(P.rock),flesh=new THREE.Color(P.flesh),step=1;
    const roof=(x,z)=>{const y=hiveCeiling(x,z);return Number.isFinite(y)?y:0;};
    // A single union surface covers every junction: no cut-out strips or overlapping end walls.
    for(let x=-80;x<80;x+=step)for(let z=184;z<332;z+=step){
      const corners=[[x,z],[x+step,z],[x+step,z+step],[x,z+step]];
      if(corners.every(([a,b])=>hiveField(a,b)>1.5))continue;
      const ys=corners.map(([a,b])=>roof(a,b));
      for(const j of [0,2,1,0,3,2]){const [a,b]=corners[j];positions.push(a,ys[j],b);c.copy(rock).lerp(flesh,.14+.1*Math.sin(a*.6+b*.21));colors.push(c.r,c.g,c.b);}
      if(Math.max(...ys)<-2)for(const j of [0,2,1,0,3,2]){const [a,b]=corners[j];caps.push(a,0,b);}
      const cx=x+.5,cz=z+.5,ceiling=hiveCeiling(cx,cz),floor=height(cx,cz);
      if(Number.isFinite(ceiling))solids.push({x:cx,z:cz,hw:.51,hd:.51,bottom:Math.max(floor+.15,Math.min(...ys)),top:Math.max(0,...ys)+.7,tunnel:true,roof:true});
    }
    const mesh=(pos,mat,col,name)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));if(col)g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.name=name;m.castShadow=m.receiveShadow=true;scene.add(m);return m;};
    this.roof=mesh(positions,new THREE.MeshLambertMaterial({vertexColors:true,emissive:0x231c24,side:THREE.DoubleSide}),colors,'hive-continuous-roof');
    mesh(caps,new THREE.MeshLambertMaterial({color:palette.rock,side:THREE.DoubleSide}),null,'hive-overburden');
    // Entrance collars are open arches. Interior readability uses ambient light, never glowing dots.
    const collarMat=new THREE.MeshLambertMaterial({color:P.shell});
    for(const m of MOUTHS){const g=new THREE.TorusGeometry(WIDTH,.48,5,22,Math.PI);g.scale(1,HEIGHT/WIDTH,1);const ring=new THREE.Mesh(g,collarMat);ring.rotation.y=Math.atan2(-m.dx,-m.dz);ring.position.set(m.x,0,m.z);scene.add(ring);}
    const y=height(HIVE.x,HIVE.z),nest=new THREE.Mesh(new THREE.SphereGeometry(8,20,12),new THREE.MeshLambertMaterial({color:P.shell}));
    nest.scale.set(1,.5,1);nest.position.set(0,y-1,HIVE.z+15);nest.name='underground-brood-nest';scene.add(nest);this.dome=nest;
    solids.push({x:0,z:HIVE.z+15,r:7,bottom:y-2,top:y+3});
    const eggs=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,8),new THREE.MeshLambertMaterial({color:0x79634d}),12),dummy=new THREE.Object3D();
    for(let i=0;i<12;i++){const a=i/12*Math.PI*2;dummy.position.set(Math.cos(a)*10,y+.4,HIVE.z+14+Math.sin(a)*5);dummy.scale.set(.8,1.1,.8);dummy.updateMatrix();eggs.setMatrixAt(i,dummy.matrix);}eggs.name='brood-eggs';scene.add(eggs);
  }
}
