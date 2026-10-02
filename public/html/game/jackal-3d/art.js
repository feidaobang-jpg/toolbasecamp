import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
const shapes={box:new T.BoxGeometry(1,1,1),sphere:new T.SphereGeometry(1,12,8),cyl:new T.CylinderGeometry(1,1,1,12),cone:new T.ConeGeometry(1,1,7),rock:new T.IcosahedronGeometry(1,0)};
const material=new T.MeshStandardMaterial({vertexColors:true,roughness:.87,metalness:.05,flatShading:true});
const cache=new Map(),dummy=new T.Object3D();
export const C={olive:0x6b8760,dark:0x263e3c,rubber:0x24312e,steel:0x526b64,cream:0xf0e5bd,red:0xb45746,orange:0xf4b95d,green:0x40836a,leaf:0x43876a,trunk:0x6b6350};
function part(list,shape,color,p,s,r=[0,0,0]){const g=shapes[shape].index?shapes[shape].toNonIndexed():shapes[shape].clone();dummy.position.set(...p);dummy.scale.set(...s);dummy.rotation.set(...r);dummy.updateMatrix();g.applyMatrix4(dummy.matrix);const c=new T.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}g.setAttribute('color',new T.BufferAttribute(a,3));list.push(g);}
function baked(key,build){if(!cache.has(key)){const list=[];build((...args)=>part(list,...args));const g=mergeGeometries(list);list.forEach(x=>x.dispose());cache.set(key,g);}return cache.get(key);}
export function mesh(geometry){const m=new T.Mesh(geometry,material);m.castShadow=true;m.receiveShadow=true;return m;}
function body(key,build){return mesh(baked(key,build));}
export function jeep(){const root=new T.Group();root.add(body('jeep',p=>{
 p('box',C.dark,[0,.57,0],[1.6,.32,2.5]);p('box',C.olive,[0,.89,-.55],[1.66,.42,1.28]);p('box',0x78956a,[0,1.14,-.59],[1.7,.16,1.28]);p('box',C.olive,[0,.98,1],[1.68,.6,.26]);
 for(const s of [-1,1]){p('box',C.olive,[s*.76,.84,.48],[.16,.5,.9]);p('box',C.dark,[s*.39,.9,.45],[.49,.15,.46]);p('box',C.dark,[s*.39,1.12,.65],[.49,.5,.13]);p('box',C.cream,[s*.62,.94,-1.22],[.28,.18,.04]);p('box',C.steel,[s*.69,1.4,-.04],[.09,.7,.1],[.15,0,0]);
 p('box',C.olive,[s*.8,.93,-.65],[.35,.18,1.0]);p('box',C.olive,[s*.8,.92,.74],[.35,.17,.72]);}
 p('box',C.steel,[0,1.72,-.05],[1.46,.1,.11]);p('box',0x8ab3ac,[0,1.48,-.09],[1.31,.4,.04],[.15,0,0]);p('box',C.dark,[0,.69,-1.39],[1.8,.19,.15]);p('box',C.dark,[0,.7,1.28],[1.8,.16,.14]);
 for(let i=-2;i<=2;i++)p('box',C.dark,[i*.19,.91,-1.202],[.07,.24,.03]);
 p('cyl',C.rubber,[.45,1.1,1.31],[.4,.25,.4],[Math.PI/2,0,0]);p('cyl',C.olive,[.45,1.1,1.45],[.22,.04,.22],[Math.PI/2,0,0]);
 p('sphere',0x9caa6d,[-.37,1.43,.42],[.24,.33,.2]);p('sphere',0xe0b48a,[-.37,1.78,.34],[.2,.23,.2]);p('sphere',C.olive,[-.37,1.9,.35],[.25,.17,.24]);
 p('box',C.cream,[0,1.225,-.65],[.5,.016,.12]);p('box',C.cream,[0,1.226,-.65],[.12,.018,.5]);p('cyl',C.dark,[-.63,1.6,.95],[.025,1.25,.025]);
 }));const wheels=[];for(const x of [-.91,.91])for(const z of [-.78,.8]){const w=body('wheel',p=>{p('cyl',C.rubber,[0,0,0],[.43,.3,.43],[0,0,Math.PI/2]);p('cyl',C.steel,[.16,0,0],[.24,.03,.24],[0,0,Math.PI/2]);});w.position.set(x,.46,z);root.add(w);wheels.push(w);}const gun=body('jeepgun',p=>{p('cyl',C.dark,[0,1.53,.26],[.09,.65,.09]);p('box',C.dark,[0,1.93,.03],[.2,.2,.7]);p('cyl',C.steel,[0,1.93,-.46],[.06,.65,.06],[Math.PI/2,0,0]);});root.add(gun);root.userData={wheels,gun};return root;}
export function person(friendly=false,officer=false){return body('person'+friendly+officer,p=>{const uniform=friendly?(officer?0xe4b958:0xd8cfab):0xb45d49;
 p('sphere',uniform,[0,.7,0],[.31,.4,.22]);p('box',C.dark,[0,.47,0],[.48,.14,.31]);p('sphere',0xdfaf80,[0,1.22,0],[.23,.25,.22]);p('sphere',friendly?uniform:C.red,[0,1.4,0],[.31,.18,.29]);
 for(const s of [-1,1]){p('box',C.dark,[s*.15,.24,0],[.19,.38,.22]);p('box',C.rubber,[s*.15,.08,-.08],[.22,.13,.35]);p('sphere',uniform,[s*.31,.82,0],[.14,.26,.14]);}if(!friendly)p('box',C.dark,[.2,.7,-.35],[.13,.16,.65]);else p('box',officer?0xffffff:0x699388,[0,.82,-.229],[.16,.15,.04]);});}
export function tank(boss=false){const root=new T.Group();const s=boss?1.28:1;root.scale.setScalar(s);root.add(body('tank',p=>{
 p('box',C.red,[0,.69,0],[2.5,.55,3.3]);p('box',0xc07758,[0,1.01,-.1],[2.22,.22,2.8]);p('box',C.dark,[0,.5,0],[1.5,.4,3.5]);
 for(const side of [-1,1]){p('box',C.rubber,[side*1.35,.49,0],[.61,.72,3.7]);for(let z=-1.25;z<=1.3;z+=.63)p('cyl',C.steel,[side*1.68,.47,z],[.27,.045,.27],[0,0,Math.PI/2]);p('box',C.red,[side*1.3,.91,0],[.8,.16,3.8]);}
 p('box',C.orange,[0,1.15,1.15],[.6,.06,.35]);}));const turret=body('tankturret',p=>{p('cyl',C.red,[0,1.4,0],[.94,.57,.94]);p('box',0xc67b5b,[0,1.62,-.23],[1.3,.3,1.3]);p('cyl',C.dark,[0,1.51,-1.53],[.17,2.35,.17],[Math.PI/2,0,0]);p('box',C.red,[0,1.51,-2.58],[.36,.31,.37]);p('cyl',C.dark,[.4,1.89,.28],[.25,.12,.25]);});root.add(turret);root.userData.turret=turret;return root;}
export function cannon(){const root=new T.Group();root.add(body('cannonbase',p=>{p('cyl',0x879480,[0,.35,0],[1.55,.7,1.55]);p('cyl',C.dark,[0,.79,0],[1.0,.2,1.0]);for(let a=0;a<6;a++)p('box',0xb5aa83,[Math.sin(a*Math.PI/3)*1.34,.8,Math.cos(a*Math.PI/3)*1.34],[.65,.45,.36],[0,a*Math.PI/3,0]);}));const gun=body('cannongun',p=>{p('sphere',C.red,[0,1.15,0],[.7,.49,.66]);p('cyl',C.dark,[0,1.2,-1],[.15,1.9,.15],[Math.PI/2,0,0]);p('box',C.red,[0,1.2,-1.95],[.34,.32,.25]);});root.add(gun);root.userData.turret=gun;return root;}
export function hut(officer=false){return body('hut'+officer,p=>{
 p('box',0x535e50,[0,.2,0],[5.6,.4,5]);p('box',officer?0xae956b:0x8d9473,[0,1.6,0],[5,2.8,4.4]);p('box',C.dark,[0,1.2,2.23],[1.52,2,.08]);
 for(const s of [-1,1]){p('box',0x3c544b,[s*1.7,1.9,2.25],[.86,.76,.08]);p('box',0xc4c69e,[s*1.7,1.9,2.31],[.07,.78,.04]);p('box',0xc4c69e,[s*1.7,1.9,2.32],[.87,.07,.04]);p('box',0x486b61,[s*1.38,3.12,0],[2.96,.2,5.1],[0,0,-s*.28]);}
 for(let i=-2;i<=2;i++)p('box',0x98a384,[i,1.7,2.255],[.04,2.7,.04]);p('box',officer?C.orange:C.cream,[0,2.7,2.36],[1.0,.48,.08]);
 });}
export function helicopter(){const root=new T.Group();root.add(body('heli',p=>{p('sphere',0x677e60,[0,0,0],[1.65,1.3,2.9]);p('sphere',0x264c51,[0,.2,-1.7],[1.45,1.03,1.4]);p('box',C.olive,[0,.2,3.5],[.6,.7,4.7]);p('box',C.olive,[0,1.12,5.3],[.15,1.9,1.1],[.15,0,0]);p('box',C.cream,[0,.29,4.8],[2.8,.17,.7]);p('cyl',C.dark,[0,1.53,0],[.12,1.0,.12]);for(const s of [-1,1]){p('box',C.dark,[s*1.1,-1.5,-.1],[.17,.18,4.1]);for(const z of [-1,1])p('cyl',C.steel,[s*1.1,-1,z],[.07,1.3,.07],[0,0,s*.25]);p('box',C.orange,[s*1.6,0,.5],[.04,.16,1.1]);}}));const rotor=body('rotor',p=>{p('box',C.dark,[0,2,0],[.35,.08,10]);p('box',C.dark,[0,2,0],[10,.08,.35]);p('cyl',C.steel,[0,2,0],[.35,.25,.35]);});root.add(rotor);root.userData.rotor=rotor;return root;}
export function rubble(building=false){return body('rubble'+building,p=>{const scale=building?2.2:1;p('cyl',0x726e50,[0,.03,0],[2.1*scale,.06,1.7*scale]);for(let i=0;i<9;i++){const a=i*2.4;p('rock',i%2?0x7e8067:0x535e50,[Math.sin(a)*scale,.15+(i%3)*.14,Math.cos(a)*scale],[.45*scale,.28+(i%3)*.1,.4*scale],[a,0,a*.3]);}if(building){p('box',0x6b735c,[-2,.36,0],[.3,.7,4.1]);p('box',0x6b735c,[2,.29,0],[.3,.55,3.8]);}});}
export function sign(text,color='#f5df9d',width=4){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='#183a35';ctx.fillRect(0,0,512,128);ctx.strokeStyle=color;ctx.lineWidth=5;ctx.strokeRect(6,6,500,116);ctx.fillStyle=color;ctx.font='bold 54px Microsoft YaHei';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,65);const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;const m=new T.Mesh(new T.PlaneGeometry(width,width/4),new T.MeshBasicMaterial({map:tex,side:T.DoubleSide}));return m;}
export function makeWorld(scene){const chunks=new Map(),colliders=[];let seed=91422;const rand=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
 function staticPart(shape,color,p,s,r){const key=Math.floor(-p[2]/30);if(!chunks.has(key))chunks.set(key,[]);part(chunks.get(key),shape,color,p,s,r);}
 const b=(color,p,s,r)=>staticPart('box',color,p,s,r);
 // Solid banks are split around the river; no overlapping coplanar terrain.
 b(0x80986b,[0,-.65,-26],[62,1.2,84]);b(0x7d946b,[0,-.65,-157],[62,1.2,154]);
 b(0xbda16e,[0,-.025,-25],[20,.05,83]);b(0xbda677,[0,-.025,-148],[20,.05,134]);
 b(0x639493,[0,-.6,-74],[64,.18,16]);
 for(let i=0;i<100;i++){const x=rand()*62-31,z=-67-rand()*14;b(0x8bb4ac,[x,-.486,z],[.35+rand()*1.2,.025,.08]);}
 // Small crossing on the left, with raised rails and individual planks.
 b(C.dark,[-10,-.12,-74],[9,.3,17]);for(let z=-82;z<=-66;z+=.8)b(0xbeb38d,[-10,.12,z],[8.4,.2,.7]);
 for(const x of [-14.5,-5.5]){b(0x718677,[x,.78,-74],[.18,.18,17]);for(let z=-82;z<=-66;z+=3.2)b(C.steel,[x,.43,z],[.27,1.2,.27]);}
 // Branching dirt tracks, pads, tire ruts, scattered stones.
 b(0xc2b187,[-10,-.018,-62],[12,.075,9]);b(0xc2b187,[-10,-.018,-86],[12,.075,8]);
 for(let z=9;z>-219;z-=3){if(z<-65&&z>-84)continue;for(const x of [-2.4,2.4])b(0x9b8f68,[x,.009,z],[.18,.014,1.7]);}
 for(let i=0;i<220;i++){const z=10-rand()*184,x=(rand()<.5?-1:1)*(9.8+rand()*9);if(z<-65&&z>-83)continue;staticPart('rock',i%3?0x718c57:0x90a165,[x,.035,z],[.35+rand()*1.2,.05,.4+rand()*.9]);for(let t=0;t<3;t++)staticPart('cone',i%2?0x658653:0x829953,[x+(t-1)*.18,.16,z],[.055,.42,.08],[.1,0,(t-1)*.4]);}
 for(let i=0;i<50;i++){const z=7-rand()*181,x=(rand()<.5?-1:1)*(10.5+rand()*7);if(z<-63&&z>-85)continue;for(let j=0;j<3;j++)staticPart('sphere',j===2?0x7e995d:0x658657,[x+(j-1)*.45,.3+j*.11,z],[.65,.55,.6]);}
 b(0x849986,[7,.05,-145],[16,.22,15]);b(0xe2d6a8,[4.5,.175,-145],[.4,.022,6]);b(0xe2d6a8,[9.5,.175,-145],[.4,.022,6]);b(0xe2d6a8,[7,.177,-145],[5.4,.026,.45]);for(const x of [0,14])for(const z of [-138,-152])b(0xefba5d,[x,.2,z],[.7,.09,.7]);
 b(0x9da18a,[0,.0,-195],[38,.16,42]);for(const x of [-17,17]){b(0x667865,[x,.6,-197],[.8,1.4,41]);for(let z=-178;z>-216;z-=2.5)b(C.cream,[x-.03,1.32,z],[.81,.07,.6]);}
 for(const x of [-20,20])for(const z of [-185,-204]){b(0x647564,[x,1.6,z],[4.8,3.2,7]);b(0x345149,[x,3.4,z],[5.6,.45,8]);b(C.dark,[x+(x<0?2.42:-2.42),1.15,z],[.1,2.4,4.5]);}
 function tree(x,z,scale=1){staticPart('cyl',C.trunk,[x,1.1*scale,z],[.22*scale,2.3*scale,.22*scale]);for(let i=0;i<3;i++)staticPart('cone',[0x37715b,0x4c8861,0x648e64][i],[x,(2.4+i*.77)*scale,z],[(1.65-i*.32)*scale,2.6*scale,(1.65-i*.32)*scale]);}
 for(let i=0;i<270;i++){const z=14-rand()*246,x=(rand()<.5?-1:1)*(19+rand()*12);if(z<-65&&z>-83)continue;tree(x,z,.65+rand()*.8);}
 for(let i=0;i<150;i++){const z=10-rand()*229,x=(rand()<.5?-1:1)*(11+rand()*6);if((z<-64&&z>-85)||(z<-174))continue;staticPart('rock',i%3?0x75956a:0x89927c,[x,.25,z],[.4+rand(),.2+rand()*.4,.5+rand()]);}
 // Barricades have real collision matching visible bags.
 for(const [x,z] of [[-9,-30],[9,-35],[-4,-58],[5,-92],[-8,-128],[13,-130]]){for(let i=-2;i<=2;i++)staticPart('sphere',0xae9e76,[x+i*.8,.42,z],[.53,.4,.52]);colliders.push({x,z,w:4.4,d:1,r:.5});}
 for(const x of [-17,17])for(let z=-98;z>=-122;z-=3){b(C.trunk,[x,.9,z],[.12,1.8,.12]);b(0x72866e,[x,.75,z-1.5],[.065,.08,3]);b(0x72866e,[x,1.35,z-1.5],[.065,.08,3]);}
 for(const [x,z] of [[-13,-6],[14,-39],[-15,-88],[15,-121]]){for(let i=0;i<3;i++){b(0x9e8154,[x+i*.85,.5,z],[.75,1,.75]);b(0x544f3d,[x+i*.85,.53,z+.39],[.1,.95,.03]);}}
 const chunkMeshes=[];for(const [key,parts] of chunks){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());g.computeBoundingBox();const m=mesh(g);scene.add(m);chunkMeshes.push({key,mesh:m});}
 for(const [txt,x,z,col,w] of [['前线营区',-12,-3,'#f1cf8a',5],['← 河桥',3,-61,'#e7dca9',4],['营救区',0,-97,'#eadcaf',5],['直升机接应',7,-153,'#9ce6bc',6],['装甲封锁区',0,-175,'#ffb486',7]]){const m=sign(txt,col,w);m.position.set(x,3,z);m.rotation.x=-.2;scene.add(m);}
 return {colliders,chunks:chunkMeshes};
}
export {T};
