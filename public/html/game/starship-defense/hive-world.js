import * as THREE from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Enemy hive at the far centre of the map, reached overland or through a network of
// long, interconnected walkable bug tunnels. Waves emerge from the tunnel mouths;
// guards and the hive queen stay home. Centre lines are XZ world coordinates.
export const HIVE={x:0,z:302,r:30};
const TUNNEL_LINES=[
  {id:'W',pts:[[-74,176],[-80,204],[-77,234],[-58,262],[-34,281],[-22,289]],mouth:'start',name:'西侧虫洞'},
  {id:'E',pts:[[78,184],[84,212],[79,242],[58,266],[32,283],[22,290]],mouth:'start',name:'东侧虫洞'},
  {id:'C',pts:[[4,212],[2,236],[-1,258],[0,278]],mouth:'start',name:'中央主洞',main:true},
  {id:'X',pts:[[-79,222],[-46,238],[-14,247],[2,248],[20,247],[52,240],[80,228]],mouth:null},
  {id:'S1',pts:[[-46,238],[-44,216],[-40,195]],mouth:'end',name:'西南支洞'},
  {id:'S2',pts:[[52,240],[50,220],[46,199]],mouth:'end',name:'东南支洞'},
];
const HALF=4,ARCH_H=5.7,STEP=2;
const hash=(a,b)=>{const s=Math.sin(a*127.1+b*311.7)*43758.5453;return s-Math.floor(s);};

function sampleLine(pts){
  const curve=new THREE.CatmullRomCurve3(pts.map(([x,z])=>new THREE.Vector3(x,0,z)),false,'centripetal');
  const n=Math.max(2,Math.ceil(curve.getLength()/STEP));
  return curve.getSpacedPoints(n).map((p,i,arr)=>{
    const a=arr[Math.max(0,i-1)],b=arr[Math.min(arr.length-1,i+1)],t=new THREE.Vector3(b.x-a.x,0,b.z-a.z).normalize();
    return {x:p.x,z:p.z,tx:t.x,tz:t.z,nx:-t.z,nz:t.x};
  });
}
export const TUNNELS=TUNNEL_LINES.map(t=>({...t,samples:sampleLine(t.pts)}));

// Nearest centre-line distance, used for floor colouring and "inside a tunnel" checks.
const grid=new Map();
for(const t of TUNNELS)for(const s of t.samples){const k=Math.floor(s.x/10)*4096+Math.floor(s.z/10);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(s);}
export function tunnelDistance(x,z){
  let best=Infinity;const cx=Math.floor(x/10),cz=Math.floor(z/10);
  for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++){const cell=grid.get((cx+i)*4096+cz+j);if(cell)for(const s of cell)best=Math.min(best,Math.hypot(x-s.x,z-s.z));}
  return best;
}
function distToOther(t,x,z){let best=Infinity;for(const o of TUNNELS)if(o!==t)for(const s of o.samples)best=Math.min(best,Math.hypot(x-s.x,z-s.z));return best;}

export const MOUTHS=TUNNELS.filter(t=>t.mouth).map(t=>{
  const s=t.mouth==='start'?t.samples[0]:t.samples[t.samples.length-1],sign=t.mouth==='start'?-1:1;
  const dx=s.tx*sign,dz=s.tz*sign;
  return {id:t.id,name:t.name,main:!!t.main,x:s.x,z:s.z,dx,dz,out:{x:s.x+dx*5,z:s.z+dz*5}};
});

export class HiveWorld {
  constructor(scene,height,palette,solids){
    const P=palette.hive,arch=[],ribs=[],rocks=[],fungus=[],dummy=new THREE.Object3D();
    const color=new THREE.Color(),cRock=new THREE.Color(P.rock),cFlesh=new THREE.Color(P.flesh),cShell=new THREE.Color(P.shell);
    const M=14;
    for(const t of TUNNELS){
      const S=t.samples,cut=S.map(s=>distToOther(t,s.x,s.z)<HALF+1.4);
      const rings=S.map((s,i)=>{
        const y0=height(s.x,s.z),pts=[];
        for(let j=0;j<=M;j++){
          const th=j/M*Math.PI,w=HALF+.55+(hash(i,j)-.5)*.5,h=ARCH_H+.4+(hash(j,i)-.5)*.6;
          pts.push(new THREE.Vector3(s.x+s.nx*Math.cos(th)*w,y0-.25+Math.sin(th)*h,s.z+s.nz*Math.cos(th)*w));
        }
        return pts;
      });
      const pos=[],col=[];
      for(let i=0;i<S.length-1;i++){
        if(cut[i]||cut[i+1])continue;
        for(let j=0;j<M;j++){
          const a=rings[i][j],b=rings[i][j+1],c=rings[i+1][j+1],d=rings[i+1][j];
          for(const v of [a,b,c,a,c,d]){
            pos.push(v.x,v.y,v.z);
            const k=hash(i*3+j,v.y);color.copy(cRock).lerp(cFlesh,(Math.sin(i*.7+j*.9)*.5+.5)*.28+k*.1).lerp(cShell,(j===0||j===M-1)?.3:0);
            col.push(color.r,color.g,color.b);
          }
        }
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();arch.push(g);
      S.forEach((s,i)=>{
        if(cut[i])return;
        const y0=height(s.x,s.z);
        for(const side of [-1,1])solids.push({x:s.x+s.nx*side*(HALF+1.1),z:s.z+s.nz*side*(HALF+1.1),r:1.25,bottom:y0-1,top:y0+6.9,tunnel:true});
        solids.push({x:s.x,z:s.z,r:HALF+1.4,bottom:y0+5,top:y0+7.4,tunnel:true,roof:true});
        if(i%6===3){const rib=new THREE.TorusGeometry(HALF+.95,.32,5,14,Math.PI);rib.rotateY(Math.atan2(s.tx,s.tz));rib.scale(1,ARCH_H/(HALF+.95)*1.02,1);rib.translate(s.x,y0-.25,s.z);ribs.push(rib.toNonIndexed());rib.dispose();}
        if(i%3===1){const side=i%2?1:-1;dummy.position.set(s.x+s.nx*side*(HALF-.2),y0+.25+hash(i,7)*1.4,s.z+s.nz*side*(HALF+.15));dummy.scale.setScalar(.07+hash(i,3)*.09);dummy.updateMatrix();fungus.push(dummy.matrix.clone());}
      });
    }
    for(const m of MOUTHS){
      const y0=height(m.x,m.z),side={x:-m.dz,z:m.dx};
      for(let j=0;j<=10;j++){
        const th=j/10*Math.PI,w=HALF+1.3,h=ARCH_H+1.1;
        const x=m.x+side.x*Math.cos(th)*w,z=m.z+side.z*Math.cos(th)*w;
        dummy.position.set(x,y0+Math.sin(th)*h,z);dummy.scale.set(1.5+hash(j,1)*.8,1.4+hash(j,2)*.9,1.6);dummy.rotation.set(hash(j,3)*3,hash(j,4)*3,0);dummy.updateMatrix();rocks.push(dummy.matrix.clone());
      }
      for(const s of [-1,1]){dummy.position.set(m.x+side.x*s*(HALF+2.6)+m.dx*1.5,y0+2,m.z+side.z*s*(HALF+2.6)+m.dz*1.5);dummy.scale.set(1,4.5,1);dummy.rotation.set(m.dz*.5*s,0,-m.dx*.5*s);dummy.updateMatrix();rocks.push(dummy.matrix.clone());}
    }
    const archMat=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
    const archMesh=new THREE.Mesh(mergeGeometries(arch,false),archMat);archMesh.castShadow=archMesh.receiveShadow=true;scene.add(archMesh);arch.forEach(g=>g.dispose());
    if(ribs.length){const r=new THREE.Mesh(mergeGeometries(ribs,false),new THREE.MeshPhongMaterial({color:P.shell,shininess:30}));r.castShadow=true;scene.add(r);ribs.forEach(g=>g.dispose());}
    const inst=(geo,mat,list,shadow=true)=>{const im=new THREE.InstancedMesh(geo,mat,list.length);list.forEach((m,i)=>im.setMatrixAt(i,m));im.castShadow=shadow;im.receiveShadow=true;scene.add(im);return im;};
    inst(new THREE.DodecahedronGeometry(1,0),new THREE.MeshPhongMaterial({color:P.rock,flatShading:true,shininess:6}),rocks);
    inst(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial({color:P.fungus}),fungus,false);
    this.buildHive(scene,height,P,solids,dummy,inst);
    this.mouths=MOUTHS;this.tunnels=TUNNELS;this.hive=HIVE;
  }
  buildHive(scene,height,P,solids,dummy,inst){
    const y=height(HIVE.x,HIVE.z);
    const dome=new THREE.Mesh(new THREE.SphereGeometry(9,28,18),new THREE.MeshPhongMaterial({color:P.shell,shininess:40,specular:0x553344}));
    dome.scale.set(1,.62,1);dome.position.set(HIVE.x,y-.5,HIVE.z+14);dome.castShadow=dome.receiveShadow=true;scene.add(dome);
    solids.push({x:HIVE.x,z:HIVE.z+14,r:8.6,bottom:y-1,top:y+5.6});
    const veins=new THREE.Group();
    for(let i=0;i<3;i++){const v=new THREE.Mesh(new THREE.TorusGeometry(6+i*1.4,.18,6,40),new THREE.MeshBasicMaterial({color:P.vein}));v.rotation.x=Math.PI/2;v.position.set(HIVE.x,y+1.4+i*.9,HIVE.z+14);v.scale.set(1,1,1);veins.add(v);}
    scene.add(veins);
    const eggs=[];for(let i=0;i<14;i++){const a=i/14*Math.PI*2,r=11+hash(i,5)*3;dummy.position.set(HIVE.x+Math.cos(a)*r,y+.4,HIVE.z+14+Math.sin(a)*r*.8);dummy.scale.set(1.1,1.4,1.1).multiplyScalar(.8+hash(i,6)*.5);dummy.rotation.set(0,0,0);dummy.updateMatrix();eggs.push(dummy.matrix.clone());}
    inst(new THREE.SphereGeometry(1,12,10),new THREE.MeshBasicMaterial({color:P.glow}),eggs,false);
    const spires=[];
    for(let i=0;i<22;i++){
      const a=i/22*Math.PI*2,front=Math.abs(Math.atan2(Math.sin(a),Math.cos(a))+Math.PI/2)<.55;
      if(front)continue; // open approach facing the player's base
      const r=HIVE.r+4+hash(i,8)*4,x=HIVE.x+Math.cos(a)*r,z=HIVE.z+Math.sin(a)*r;
      if(tunnelDistance(x,z)<HALF+5)continue;
      const h=10+hash(i,9)*9;dummy.position.set(x,height(x,z)+h*.45,z);dummy.scale.set(1.8,h,1.8);dummy.rotation.set((hash(i,1)-.5)*.35,0,(hash(i,2)-.5)*.35);dummy.updateMatrix();spires.push(dummy.matrix.clone());
      solids.push({x,z,r:1.9,bottom:0,top:height(x,z)+h*.9});
    }
    inst(new THREE.ConeGeometry(1,1,7),new THREE.MeshPhongMaterial({color:P.rock,flatShading:true,shininess:8}),spires);
    const creep=new THREE.Mesh(new THREE.CircleGeometry(HIVE.r+2,48),new THREE.MeshLambertMaterial({color:P.shell,transparent:true,opacity:.55,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
    creep.rotation.x=-Math.PI/2;creep.position.set(HIVE.x,y+.06,HIVE.z+4);creep.userData.keepMaterial=true;scene.add(creep);
    this.dome=dome;
  }
}
