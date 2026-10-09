import * as T from './vendor/three.module.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Original code-built period props. No film footage, downloaded models or modern kit.
export const PERIOD_GUNS={
 rifle:{name:'汉阳造步枪',mag:5,reload:2.4,rate:.8,damage:62,range:90,spread:.014,sound:'sniper'},
 mauser:{name:'驳壳枪',mag:10,reload:1.7,rate:.22,damage:29,range:42,spread:.033,sound:'shoot'},
 zb26:{name:'捷克式轻机枪',mag:20,reload:3.1,rate:.13,damage:27,range:75,spread:.036,sound:'mg'},
 arisaka:{name:'三八式步枪',mag:5,reload:2.5,rate:.95,damage:66,range:100,spread:.01,sound:'sniper'},
};
const material=new T.MeshLambertMaterial({vertexColors:true});
export function compact(root){
 for(const g of [...root.children])if(g.isGroup)compact(g);
 const pieces=root.children.filter(o=>o.isMesh&&o.material!==material&&!o.material.map&&!o.material.transparent&&!o.userData.keep);
 if(!pieces.length)return root;
 const geometries=pieces.map(m=>{m.updateMatrix();const g=m.geometry.clone().applyMatrix4(m.matrix),c=m.material.color,a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}g.setAttribute('color',new T.BufferAttribute(a,3));return g;});
 const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
 if(geometry){const mesh=new T.Mesh(geometry,material);mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);for(const m of pieces){root.remove(m);m.geometry.dispose();m.material.dispose();}}
 return root;
}
export function build(root){
 function part(geo,c,x,y,z,p=root){const m=new T.Mesh(geo,new T.MeshLambertMaterial({color:c}));m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;p.add(m);return m;}
 return {box:(c,x,y,z,w,h,d,p)=>part(new T.BoxGeometry(w,h,d),c,x,y,z,p),cyl:(c,x,y,z,r,h,n=10,p)=>part(new T.CylinderGeometry(r,r,h,n),c,x,y,z,p),ball:(c,x,y,z,r,p)=>part(new T.SphereGeometry(r,10,7),c,x,y,z,p),cone:(c,x,y,z,r,h,n=8,p)=>part(new T.ConeGeometry(r,h,n),c,x,y,z,p)};
}
export function periodGun(id='rifle'){
 const g=new T.Group(),b=build(g),wood=0x694731,steel=0x363b36,pistol=id==='mauser',mg=id==='zb26'||id==='type96';
 const len=pistol?.5:id==='arisaka'?1.55:1.35;
 b.box(wood,0,-.035,-len*.25,.10,.17,len*.42).rotation.x=-.09;
 b.box(steel,0,.025,.07,.105,.1,len*.31);
 if(pistol){b.box(wood,0,-.16,-.1,.07,.25,.1).rotation.x=-.2;b.box(steel,0,-.055,.08,.09,.18,.13);}
 else {b.box(wood,0,-.015,len*.26,.075,.10,len*.48);b.box(steel,.074,.05,.0,.10,.022,.032);b.ball(steel,.12,.052,.0,.026);}
 const barrel=b.cyl(steel,0,.038,len*.46,mg?.027:.019,len*.48,10);barrel.rotation.x=Math.PI/2;
 for(const z of [.22,len*.60])b.box(steel,0,.082,z,.014,.045,.032);
 if(mg){b.box(steel,0,.21,-.02,.06,.33,.19).rotation.x=-.18;for(const s of [-1,1])b.box(steel,s*.09,-.22,.55,.018,.43,.022).rotation.z=s*.25;b.box(wood,0,-.12,-.16,.08,.21,.08);}
 if(id==='arisaka'){b.box(0x9eaaab,0,-.02,len*.87,.018,.025,.32);b.box(steel,0,-.02,len*.70,.10,.015,.025);}
 const muzzle=new T.Object3D();muzzle.position.set(0,.038,len*.70);g.add(muzzle);g.userData={muzzle,weapon:id};return compact(g);
}
export function periodSoldier(team='ally',weapon='rifle',officer=false){
 const g=new T.Group(),b=build(g),enemy=team==='enemy',cloth=enemy?0xa18f50:officer?0x536676:0x6d7d85,leather=0x57402c,skin=0xb99673;
 b.box(cloth,0,1.18,0,.56,.65,.34);b.box(cloth,0,.9,-.01,.64,.24,.40);
 b.box(leather,0,.91,0,.59,.065,.39);b.box(0xb59a57,.0,.91,.21,.07,.06,.025);
 b.box(leather,-.12,1.23,.188,.045,.60,.035).rotation.z=-.4;
 for(const x of [-.23,.21]){b.box(leather,x,1.01,.23,.12,.17,.12);b.box(0x574734,x,1.095,.24,.13,.025,.13);}
 b.box(0x424846,0,1.12,-.24,.42,.48,.16);b.cyl(enemy?0x716b4c:0x727365,0,1.42,-.27,.12,.50,8).rotation.z=Math.PI/2;
 b.ball(skin,0,1.73,0,.205);b.box(skin,0,1.70,.19,.06,.08,.06);b.box(0x2c2925,-.07,1.77,.187,.028,.016,.012);b.box(0x2c2925,.07,1.77,.187,.028,.016,.012);
 if(enemy&&!officer){const h=b.ball(0x696948,0,1.88,-.01,.25);h.scale.y=.59;b.cyl(0x696948,0,1.85,0,.27,.035,12);b.box(leather,0,1.63,.12,.23,.025,.014);}
 else {b.cyl(cloth,0,1.89,-.01,.218,.12,12);b.box(cloth,0,1.86,.17,.33,.028,.19);if(enemy){b.box(cloth,-.19,1.73,-.12,.08,.29,.23);b.box(cloth,.19,1.73,-.12,.08,.29,.23);}else b.box(0xd7d7bf,0,1.905,.205,.055,.023,.015);}
 if(enemy)b.ball(0xcbb05c,0,1.88,.23,.028);
 else {b.box(0xd7d9c7,-.322,1.35,.02,.017,.12,.16);b.box(0x3f4b50,-.333,1.36,.02,.009,.025,.10);}
 const legs=[];for(const s of [-1,1]){const p=new T.Group();p.position.set(s*.16,.84,0);g.add(p);b.box(cloth,0,-.26,0,.24,.52,.25,p);b.box(enemy?0x827447:0x596771,0,-.57,0,.23,.23,.24,p);for(let n=0;n<3;n++)b.box(enemy?0xb3a36e:0x80908e,0,-.51-n*.065,.125,.24,.017,.016,p);b.box(0x33342c,0,-.77,.07,.26,.14,.39,p);legs.push(p);}
 const gun=periodGun(weapon);gun.position.set(.17,1.23,.23);gun.rotation.x=-.04;g.add(gun);
 for(const s of [-1,1]){const arm=b.box(cloth,s*.34,1.29,.11,.19,.44,.23);arm.rotation.x=-.85;b.ball(skin,s*.23,1.18,.31,.085);}
 const saber=new T.Group(),sb=build(saber);sb.box(0xc3c8bd,0,.49,0,.045,.85,.018).rotation.z=-.11;sb.box(leather,0,-.02,0,.07,.18,.06);sb.box(0xb39a59,0,.08,0,.20,.025,.08);saber.position.set(.41,1.30,.22);saber.visible=false;g.add(saber);compact(saber);
 compact(g);g.userData={legs,gun,muzzle:gun.userData.muzzle,saber,team};return g;
}
export function horse(color=0x70503b){
 const g=new T.Group(),b=build(g),hide=color,black=0x302c27;
 const body=b.ball(hide,0,1.18,0,.72);body.scale.set(.55,.68,1.55);
 const neck=b.box(hide,0,1.68,.69,.40,1.0,.46);neck.rotation.x=-.32;
 const head=b.box(hide,0,2.16,1.02,.34,.38,.64);head.rotation.x=-.24;
 for(const s of [-1,1]){b.cone(hide,s*.11,2.48,.83,.072,.25,5);b.ball(0x171b19,s*.173,2.22,1.11,.025);}
 b.box(black,0,2.14,.77,.10,.61,.17);b.box(black,0,2.09,1.25,.36,.035,.25);b.box(0xa49071,0,1.64,-.08,.66,.16,.60);b.box(0x443122,0,1.78,-.26,.63,.18,.16);
 const tail=b.box(black,0,1.06,-1.00,.11,.71,.13);tail.rotation.x=-.30;
 const legs=[];for(const x of [-.24,.24])for(const z of [-.68,.66]){const p=new T.Group();p.position.set(x,1.05,z);g.add(p);b.box(hide,0,-.38,0,.14,.74,.15,p);b.box(black,0,-.83,.045,.18,.16,.25,p);legs.push(p);}
 compact(g);g.userData={legs};return g;
}
export function fieldGun(){
 const g=new T.Group(),b=build(g),green=0x646847,steel=0x373b30;
 for(const s of [-1,1]){const wheel=b.cyl(0x3c3d30,s*1.08,.68,0,.63,.17,16);wheel.rotation.z=Math.PI/2;const hub=b.cyl(green,s*1.19,.68,0,.16,.19,10);hub.rotation.z=Math.PI/2;for(let a=0;a<Math.PI;a+=Math.PI/4){b.box(0x8d7e57,s*1.2,.68,0,.03,1.08,.038).rotation.x=a;}b.box(green,s*.48,.42,-1.15,.16,.18,2.9).rotation.y=s*.24;}
 b.box(green,0,1.11,.04,1.95,1.30,.14);b.box(green,0,.6,-.2,1.4,.23,1.1);
 const tube=new T.Group();tube.position.set(0,1.35,0);g.add(tube);const gun=b.cyl(steel,0,0,1.25,.13,3.0,14,tube);gun.rotation.x=Math.PI/2;b.box(green,0,-.19,.72,.30,.22,1.5,tube);b.box(steel,0,.03,-.34,.34,.30,.58,tube);
 const muzzle=new T.Object3D();muzzle.position.set(0,0,2.75);tube.add(muzzle);compact(g);g.userData={tube,muzzle};return g;
}
export function sign(text,color='#eadfc3',bg='#343b36',width=4,height=.9){
 const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);ctx.strokeStyle='#998360';ctx.lineWidth=8;ctx.strokeRect(4,4,504,120);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 58px sans-serif';ctx.fillText(text,256,66,476);const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;const mesh=new T.Mesh(new T.PlaneGeometry(width,height),new T.MeshBasicMaterial({map:texture,side:T.DoubleSide}));mesh.rotation.y=Math.PI;return mesh;
}
export function buildResistanceMap(chapter){
 const root=new T.Group(),staticRoot=new T.Group(),b=build(staticRoot),colliders=[],objectives={},stations=[],destructibles=[];root.add(staticRoot);
 let seed=1942+chapter;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const bounds={minX:-64,maxX:64,minZ:-38,maxZ:170};
 const solid=(x,z,w,d,h=4,key=null)=>{const c={x,z,w,d,h,key,disabled:false};colliders.push(c);return c;};
 b.box(0x8e8264,0,-.3,68,430,.6,440);b.box(0xa49a75,0,.011,58,9,.018,210);
 // Ground details are geometry batched into one draw; relief stays below walking height.
 for(let i=0;i<480;i++){const x=(rnd()-.5)*125,z=rnd()*205-36;b.box(i%3?0x827758:0xafa082,x,.018,z,.1+rnd()*.6,.024,.15+rnd()*.6);}
 function wall(x,z,w,d,h=2,c=0x8c8776){b.box(c,x,h/2,z,w,h,d);b.box(0xaaa18a,x,h+.08,z,w+.1,.15,d+.12);solid(x,z,w,d,h);for(let i=0;i<w;i+=1.2)b.box(0x6c6b5e,x-w/2+i,h*.5,z+d/2+.006,.025,h,.012);}
 function house(x,z,w=9,d=10,c=0xb9aa84,lift=0){const group=new T.Group(),hb=build(group);group.position.set(x,lift,z);staticRoot.add(group);hb.box(c,0,2,0,w,4,d);if(!lift)solid(x,z,w,d,5.1);hb.box(0x6d6656,0,.33,0,w+.3,.65,d+.3);for(const side of [-1,1]){const roof=hb.box(0x5b6060,side*w*.255,4.54,0,w*.56,.19,d+1.4);roof.rotation.z=-side*.34;}for(let n=0;n<d;n+=.65)hb.box(0x777c76,0,5.03,-d/2+n,.35,.14,.14);hb.box(0x484e48,0,5.1,0,.22,.17,d+1.3);hb.box(0x584631,0,1.35,-d/2-.03,1.7,2.7,.12);for(const side of [-1,1]){hb.box(0x303e3b,side*w*.3,2.2,-d/2-.06,1.5,1.25,.1);for(let k=-1;k<=1;k++)hb.box(0x776b50,side*w*.3+k*.42,2.2,-d/2-.13,.06,1.25,.08);}return {x,z};}
 function sandbags(x,z,w=7,angle=0){const group=new T.Group(),sb=build(group);group.position.set(x,0,z);group.rotation.y=angle;for(let row=0;row<3;row++)for(let n=0;n<Math.floor(w/.9);n++){const bag=sb.box(row%2?0x9f946e:0xaba27e,-w/2+n*.9+(row%2)*.25,.18+row*.29,0,.88,.29,.59);bag.rotation.y=(rnd()-.5)*.15;}staticRoot.add(group);solid(x,z,angle?1:w,angle?w:1,1.08);}
 function tree(x,z){b.cyl(0x65513b,x,2.5,z,.20,5,7);for(let i=0;i<3;i++){const twig=b.box(0x65513b,x+(i-1)*.5,3.9,z,.13,2.9,.13);twig.rotation.z=(i-1)*.5;}if(chapter!==1){const crown=b.ball(0x626c47,x,5,z,2.3);crown.scale.y=.65;}solid(x,z,.65,.65,5);}
 for(let i=0;i<36;i++){const side=i%2?1:-1,x=side*(66+rnd()*64),z=rnd()*270-60;const m=b.cone(chapter===1?0x8a896b:0x8b896e,x,8,z,18+rnd()*30,16+rnd()*20,5);m.rotation.y=rnd()*6.28;}
 for(let i=0;i<22;i++)tree((i%2?1:-1)*(28+rnd()*30),rnd()*170-20);
 function supply(x,z,label='军需箱'){b.box(0x6f623e,x,.5,z,1.3,1,1);for(const a of [-.47,.47])b.box(0x4b513c,x+a,.5,z,.07,1.04,1.04);const tag=sign(label,'#eee1bb','#485247',2.4,.6);tag.position.set(x,1.65,z);root.add(tag);stations.push({x,z,label});}
 function bunker(x,z,key){const group=new T.Group(),bb=build(group);group.position.set(x,0,z);bb.box(0x787562,0,1.5,0,6,3,4);bb.box(0x54594a,0,2.1,-2.02,4,.48,.06);bb.box(0x96917b,0,3.05,0,6.4,.3,4.4);const barrel=bb.cyl(0x353a31,0,1.9,-2.7,.07,1.8);barrel.rotation.x=Math.PI/2;compact(group);root.add(group);const collider=solid(x,z,6,4,3.3,key);const obj={key,x,z,hp:250,maxHp:250,mesh:group,collider,dead:false};destructibles.push(obj);return obj;}
 if(chapter===0){
  // Zigzag breastworks give two real protected approaches, with gaps between sections.
  // Earthen parapets and timber revetments form a traversable communication trench.
  for(const x of [-25,-19]){wall(x,30,2.3,50,1.3,0x85714f);for(let z=6;z<=54;z+=3)b.box(0x625038,x+(x===-25?1.18:-1.18),.65,z,.12,1.35,.18);}
  b.box(0x746548,-22,.03,30,3.4,.05,50);for(let z=6;z<56;z+=2.2)b.box(0x998367,-22,.07,z,3.25,.07,.12);
  for(let i=0;i<4;i++){sandbags(-10+(i%2)*7,13+i*15,11);sandbags(14-(i%2)*6,19+i*15,10);}
  wall(-30,75,28,2,3,0x99845f);wall(30,75,28,2,3,0x99845f);
  bunker(-14,93,'left-bunker');bunker(14,98,'right-bunker');house(-22,133,9,8,0x99937a);house(20,142,10,9,0xa59774);
  objectives.trench={x:-7,z:58};objectives.assault={x:0,z:91};objectives.final={x:0,z:137};supply(-5,-9);supply(-7,58,'前沿弹药');
 }else if(chapter===1){
  for(const z of [30,76]){for(const x of [-30,-18,18,30]){const fence=b.box(0x60503a,x,1,z,9,.16,.17);for(const xx of [-3,0,3])b.box(0x60503a,x+xx,.7,z,.18,1.4,.18);}sandbags(-21,z+6,10);sandbags(22,z+6,10);}
  house(-37,132,10,13);house(39,142,10,14);objectives.charge={x:0,z:83};objectives.final={x:0,z:146};supply(-7,-10);
  const wagon=new T.Group(),wb=build(wagon);wb.box(0x766042,0,1.1,0,2.3,.9,4);for(const x of [-1.2,1.2])for(const z of [-1.2,1.2]){const wheel=wb.cyl(0x39372b,x,.6,z,.56,.14,12);wheel.rotation.z=Math.PI/2;}wb.box(0x9c9070,0,1.6,0,2.0,.25,3.5);compact(wagon);wagon.position.set(-3,0,-5);root.add(wagon);objectives.wagon=wagon;
 }else{
  for(const side of [-1,1])for(const z of [8,33,60,115,143])house(side*(z===60?28:20),z,10+(z%3),11,z%2?0xb2a184:0xa89e88);
  for(const [x,z,t] of [[-20,8,'同兴粮行'],[20,33,'仁和药铺'],[-20,115,'永安茶馆']]){const tag=sign(t,'#e4d1a1','#3c423b',6,1.05);tag.position.set(x,3.5,z-5.65);root.add(tag);}
  for(const side of [-1,1]){wall(side*34,87,51,4,8,0x7d827b);for(let i=0;i<12;i++)b.box(0x94988a,side*(12+i*4),8.75,87,2.3,1.1,4.2);wall(side*49,125,2,72,3,0x8d9185);}
  const gate=new T.Group(),gb=build(gate);gate.position.set(0,0,87);gb.box(0x6b5136,-2.55,3.1,0,5,6.2,.6);gb.box(0x6b5136,2.55,3.1,0,5,6.2,.6);for(const side of [-1,1])for(let y=1;y<6;y+=1.15)for(let x=1;x<5;x+=1.2)gb.ball(0x77715a,side*x,y,-.34,.065);compact(gate);root.add(gate);const collider=solid(0,87,10,1,6.2,'city-gate');destructibles.push({key:'city-gate',x:0,z:87,hp:750,maxHp:750,mesh:gate,collider,dead:false,cannonOnly:true});
  for(const side of [-1,1])wall(side*6.75,87,3.5,4.2,6.2,0x7d827b);
  b.box(0x7d827b,0,7.5,87,17,3,4.2);house(0,88,15,7,0x928977,8.5);
  const plaque=sign('平 安 县 城','#ede1b9','#484e42',6,1.2);plaque.position.set(0,8.1,84.8);root.add(plaque);
  bunker(-12,52,'street-bunker');sandbags(13,43,10);sandbags(-11,23,7);
  const cannon=fieldGun();cannon.position.set(0,0,64);root.add(cannon);objectives.cannon=cannon;objectives.ammo={x:-12,z:59};supply(-12,59,'炮弹木箱');supply(-6,-12);objectives.outpost={x:0,z:42};objectives.final={x:0,z:143};house(0,156,15,9,0xb0a182);
  const command=sign('守 备 队 部','#e6d9b4','#423e33',6,1);command.position.set(0,3.4,151.3);root.add(command);
 }
 // Decorative crates, telephone poles and visible edge embankments establish the period.
 for(const x of [-62,62]){b.box(0x7e775b,x,1.15,65,3,2.3,212);solid(x,65,3,212,2.3);}
 for(let z=-10;z<170;z+=28){b.cyl(0x61513a,35,3.7,z,.14,7.4,7);b.box(0x61513a,35,6.7,z,1.9,.13,.14);}
 for(let i=0;i<16;i++){const x=(i%2?1:-1)*(9+rnd()*26),z=5+rnd()*149;b.box(0x756142,x,.40,z,1,.8,.8);solid(x,z,1,.8,.8);}
 compact(staticRoot);
 return {root,colliders,objectives,stations,destructibles,bounds};
}
export function disposeTree(root){const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m&&m!==material)ms.add(m);});gs.forEach(g=>g.dispose());ms.forEach(m=>{m.map?.dispose();m.dispose();});root.clear();}
