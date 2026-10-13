import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Period masonry is cosmetic: the original map, destructibles and collision remain authoritative.
export function addPinganHouseDetail(b,w,d,root,color){
 const peak=4.54+Math.tan(.34)*w*.255-.07,half=(peak-4)/Math.tan(.34);
 const shape=new T.Shape();shape.moveTo(-half,4);shape.lineTo(half,4);shape.lineTo(0,peak);shape.closePath();
 for(const side of [-1,1]){const face=new T.Mesh(new T.ShapeGeometry(shape),new T.MeshLambertMaterial({color}));face.position.z=side*d/2;face.rotation.y=side<0?Math.PI:0;face.castShadow=face.receiveShadow=true;root.add(face);}
  for(let x=-w/2+.35;x<w/2;x+=.72){
   const tile=b.box(0x6c7371,x,4.54+Math.tan(.34)*(w*.255-Math.abs(x)),0,.055,.045,d+1.32);
   tile.rotation.z=x<0?.34:-.34;
  }

 for(const side of [-1,1]){
  b.box(0x584d3e,0,3.88,side*(d/2+.03),w+.3,.15,.16);
  for(let row=0;row<3;row++)for(let col=0;col<Math.floor(w/1.15);col++){
   const x=-w/2+.6+col*1.15+(row%2)*.18;
   // Doorways stay legible and unobstructed.
   if(side<0&&Math.abs(x)<1.1)continue;
   b.box(row%2?0x8b8170:0x958c7a,x,.76+row*.25,side*(d/2+.034),1.06,.215,.045);
  }
 }
}

export function addPinganUniformDetail(b,enemy,cloth){
 const seam=enemy?0x817144:0x465862;
 b.box(seam,0,1.28,.177,.024,.40,.015);
 for(const x of [-.16,.16]){b.box(seam,x,1.37,.181,.135,.10,.012);b.box(cloth,x,1.425,.19,.145,.026,.026);}
 for(const y of [1.11,1.23,1.35,1.46])b.ball(0xb4ab8c,.025,y,.19,.015);
 for(const side of [-1,1])b.box(seam,side*.20,1.52,.02,.17,.03,.22);
}

export function addPinganCannonDetail(b,tube){
 for(const x of [-.86,.86])for(const y of [.61,1.1,1.6])b.ball(0xa7a081,x,y,.124,.037);
 for(const x of [-.92,.92])b.box(0x85866c,x,1.1,.14,.065,1.18,.08);
 b.box(0x8b8a6b,0,1.72,.12,1.85,.065,.08);
 for(const z of [.4,1.05,1.95]){const ring=b.cyl(0x717762,0,0,z,.143,.065,12,tube);ring.rotation.x=Math.PI/2;}
}

export function createPinganDressing(root,gate){
 let seed=1945;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const group=new T.Group();group.name='pingan-masonry';root.add(group);
 const parts=[],doorParts=[],dummy=new T.Object3D(),unit=new T.BoxGeometry(1,1,1);
 function brick(list,c,x,y,z,w,h,d){
  const g=unit.clone();dummy.position.set(x,y,z);dummy.rotation.set(0,0,0);dummy.scale.set(w,h,d);dummy.updateMatrix();g.applyMatrix4(dummy.matrix);
  const color=new T.Color(c),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=color.r;a[i+1]=color.g;a[i+2]=color.b;}g.setAttribute('color',new T.BufferAttribute(a,3));list.push(g);
 }
 const stone=[0x737973,0x85877f,0x8c8c80,0x7a7e77];
 for(const face of [-1,1])for(let row=0;row<12;row++)for(let col=-35;col<=35;col++){
  const x=col*1.63+(row%2)*.815,y=.36+row*.65;
  if(Math.abs(x)<5.35&&y<6.3||Math.abs(x)<8.6&&y>6.1)continue;
  brick(parts,stone[Math.floor(rnd()*stone.length)],x,y,87+face*2.105,1.56,.59,.095);
 }
 for(const side of [-1,1])for(let row=0;row<7;row++)brick(parts,row%2?0x87867a:0x979282,side*5.55,.48+row*.90,84.77,.56,.84,.14);
 // The street surface is only 6 cm high, below the existing walking clearance.
 for(let row=0;row<238;row++)for(let col=-4;col<=4;col++){
  if(rnd()<.12)continue;
  brick(parts,[0x8b8471,0x9b917b,0xa39882][Math.floor(rnd()*3)],col*.95+(row%2)*.22,.031,-12+row*.67,.87,.059,.60);
 }
 // Door fittings belong to the destructible gate, so they disappear when the shell opens it.
 for(let x=-4;x<=4;x++)brick(doorParts,0x423e30,x,3.1,-.325,.027,6,.035);
 for(const y of [1.75,4.45])brick(doorParts,0x41453d,0,y,-.35,9.7,.15,.10);
 function finish(list,parent,name){
  if(!list.length)return;const geometry=mergeGeometries(list);list.forEach(g=>g.dispose());
  const mesh=new T.Mesh(geometry,new T.MeshPhongMaterial({vertexColors:true,shininess:8,specular:0x242822}));mesh.name=name;mesh.userData.keep=true;mesh.castShadow=false;mesh.receiveShadow=true;parent.add(mesh);
 }
 finish(parts,group,'pingan-stonework');finish(doorParts,gate,'gate-ironwork');unit.dispose();
 // One small procedural texture replaces a large downloaded ground asset.
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
 ctx.fillStyle='#918268';ctx.fillRect(0,0,128,128);
 for(let i=0;i<1800;i++){const v=Math.floor(105+rnd()*70);ctx.fillStyle=`rgba(${v},${v-10},${v-25},.16)`;ctx.fillRect(rnd()*128,rnd()*128,1+rnd()*2,1+rnd()*2);}
 const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(32,52);
 const ground=new T.Mesh(new T.PlaneGeometry(128,208),new T.MeshLambertMaterial({map:texture}));ground.rotation.x=-Math.PI/2;ground.position.set(0,.024,66);ground.receiveShadow=true;ground.name='pingan-ground-grain';group.add(ground);
 const smokeCanvas=document.createElement('canvas');smokeCanvas.width=smokeCanvas.height=64;const smokeCtx=smokeCanvas.getContext('2d'),gradient=smokeCtx.createRadialGradient(32,32,0,32,32,32);gradient.addColorStop(0,'rgba(111,105,96,.5)');gradient.addColorStop(.5,'rgba(127,117,101,.23)');gradient.addColorStop(1,'rgba(127,117,101,0)');smokeCtx.fillStyle=gradient;smokeCtx.fillRect(0,0,64,64);
 const smokeTexture=new T.CanvasTexture(smokeCanvas),smoke=[];
 for(let i=0;i<6;i++){const sprite=new T.Sprite(new T.SpriteMaterial({map:smokeTexture,transparent:true,depthWrite:false,opacity:.5,rotation:i*.9}));sprite.position.set(-22+i*.65,8+i*2.7,108);sprite.scale.setScalar(7+i*.9);group.add(sprite);smoke.push(sprite);}
 let elapsed=0;
 return {group,update(dt,touch){elapsed+=dt;smoke.forEach((s,i)=>{s.visible=!touch||i%2===0;s.position.x=-22+i*.65+Math.sin(elapsed*.12+i)*.65;s.material.opacity=.42+Math.sin(elapsed*.19+i)*.04;});}};
}
