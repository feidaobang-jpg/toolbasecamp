import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
// Original procedural military assets. Shared by the conquest map and its units;
// no external downloads, and no changes to campaign assets.
export const BF_WEAPONS={
  plasma:{name:'M4A1 突击步枪',dmg:23,rate:.12,range:64,speed:125,spread:.027,mag:30,reload:2.2,color:0xffd58b,sfx:'mg',desc:'30发弹匣 · 中距离点射，兼顾精度与机动'},
  missilePod:{name:'AK-101 突击步枪',dmg:28,rate:.15,range:60,speed:118,spread:.04,mag:30,reload:2.5,color:0xffd58b,sfx:'mg',desc:'30发弹匣 · 威力较高，连续射击散布更大'},
  lmg:{name:'M249 班用机枪',dmg:20,rate:.095,range:68,speed:120,spread:.055,mag:80,reload:4.2,color:0xffdd88,sfx:'mg',desc:'80发弹链 · 持续压制，换弹较慢'},
  flamer:{name:'MP5 冲锋枪',dmg:18,rate:.075,range:36,speed:105,spread:.055,mag:30,reload:1.8,color:0xffd58b,sfx:'mg',desc:'30发弹匣 · 近距离快速射击'},
  shotgun:{name:'M870 泵动霰弹枪',dmg:15,rate:.85,range:23,speed:105,spread:.115,pellets:8,mag:6,reload:3.1,color:0xffcc88,sfx:'shoot',desc:'6发弹仓 · 近距离八弹丸散射'},
  laser:{name:'M24 狙击步枪',dmg:95,rate:1.25,range:115,speed:190,spread:.003,mag:5,reload:3.2,color:0xffdda0,sfx:'sniper',desc:'5发弹匣 · 远距离精确射击，开镜辅助观察'},
  launcher:{name:'M203 榴弹发射器',dmg:95,rate:1,range:58,speed:36,spread:.025,mag:1,reload:2.5,explode:4,arc:true,color:0xffb45e,sfx:'cannon',desc:'单发装填 · 抛物线榴弹压制掩体附近步兵'},
  rpg:{name:'RPG-7 火箭筒',dmg:260,rate:1,range:95,speed:65,spread:.015,mag:1,reload:3.8,explode:4.8,color:0xffaa66,sfx:'cannon',desc:'单发装填 · 对装甲和低空直升机有效'},
};
export const BF_KITS={
  assault:{name:'突击兵',weapons:['plasma','missilePod','launcher'],desc:'M4A1 / AK-101 / M203 · 正面夺点'},
  support:{name:'支援兵',weapons:['lmg','flamer'],desc:'M249 / MP5 · 火力压制与弹药补给'},
  medic:{name:'医疗兵',weapons:['plasma','flamer'],desc:'M4A1 / MP5 · 医疗包治疗附近队友'},
  engineer:{name:'工程兵',weapons:['shotgun','rpg','flamer'],desc:'M870 / RPG-7 / MP5 · 维修友军载具'},
  recon:{name:'侦察兵',weapons:['laser','flamer'],desc:'M24 / MP5 · 远距离观察和精确射击'},
};
export const BF_VEHICLES={
  jeep:{name:'HMMWV 机枪越野车',hp:380,speed:20,dmg:23,rate:.11,range:65,seatH:1.8,sfx:'mg',color:0xa3936a},
  tank:{name:'M1A2 主战坦克',hp:1100,speed:9,dmg:250,rate:2.5,range:105,seatH:2.2,sfx:'cannon',explode:5,color:0xa89770},
  mech:{name:'LAV-25 轮式装甲车',hp:680,speed:14,dmg:65,rate:.38,range:80,seatH:2.1,sfx:'cannon',explode:1.8,color:0x77806a},
  heli:{name:'AH-1 武装直升机',hp:480,speed:22,dmg:34,rate:.14,range:85,seatH:1.8,fly:true,sfx:'mg',color:0x647060},
};

// Merge static pieces by material while keeping animated pivots and muzzle meshes.
function batchRig(T,root){
  const keep=new Set();root.traverse(o=>{for(const v of Object.values(o.userData))if(v?.isObject3D)keep.add(v);});
  function visit(parent){for(const c of [...parent.children])if(c.isGroup)visit(c);
    const bins=new Map();for(const c of [...parent.children])if(c.isMesh&&!keep.has(c)){const key=c.material.color.getHex();if(!bins.has(key))bins.set(key,[]);bins.get(key).push(c);}
    for(const list of bins.values()){if(list.length<2)continue;const geos=list.map(m=>{m.updateMatrix();return m.geometry.clone().applyMatrix4(m.matrix);});const geo=mergeGeometries(geos);geos.forEach(g=>g.dispose());if(!geo)continue;const joined=new T.Mesh(geo,list[0].material);joined.castShadow=joined.receiveShadow=true;parent.add(joined);for(const m of list){parent.remove(m);m.geometry.dispose();}}
  }visit(root);return root;
}
function builder(T,root){
  const mats=new Map();
  const mat=c=>{if(!mats.has(c))mats.set(c,new T.MeshLambertMaterial({color:c}));return mats.get(c);};
  const mesh=(geo,c,x,y,z,parent=root)=>{const m=new T.Mesh(geo,mat(c));m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;};
  return {box:(c,x,y,z,w,h,d,p)=>mesh(new T.BoxGeometry(w,h,d),c,x,y,z,p),
    cyl:(c,x,y,z,r,h,n=10,p)=>mesh(new T.CylinderGeometry(r,r,h,n),c,x,y,z,p),
    sphere:(c,x,y,z,r,p)=>mesh(new T.SphereGeometry(r,10,7),c,x,y,z,p)};
}
export function militaryGun(T,id='plasma'){
  const g=new T.Group(),b=builder(T,g),steel=0x30383b,black=0x192023,tan=0x817858;
  const sniper=id==='laser',rpg=id==='rpg',shot=id==='shotgun',lmg=id==='lmg',smg=id==='flamer',ak=id==='missilePod';
  if(rpg){
    const tube=b.cyl(tan,0,0,0,.065,.86);tube.rotation.x=Math.PI/2;
    const head=b.sphere(0x58634a,0,0,.5,.085);head.scale.z=2;
    b.box(black,0,-.13,-.15,.045,.23,.06);b.box(black,0,-.12,.14,.045,.2,.06);b.box(steel,.065,.07,.02,.04,.08,.15);
  }else{
    const len=sniper?.82:shot?.74:smg?.42:.62;
    b.box(steel,0,0,0,.075,.105,len*.45);b.box(ak?0x786146:tan,0,-.01,-len*.42,.06,.12,len*.38);
    b.box(black,0,-.13,-.04,.048,.2,.075).rotation.x=-.22;
    b.box(lmg?0x596349:black,lmg?-.045:0,-.14,.1,lmg?.16:.05,lmg?.18:.22,lmg?.17:.08).rotation.x=ak?-.25:0;
    b.box(steel,0,.003,len*.29,.068,.07,len*.34);
    const barrel=b.cyl(black,0,.018,len*.62,.015,len*.4);barrel.rotation.x=Math.PI/2;g.userData.gun=barrel;
    b.box(black,0,.076,.2,.02,.035,.34);
    for(let i=0;i<6;i++)b.box(0x68706d,0,.098,.07+i*.035,.045,.009,.01);
    if(sniper){for(const z of [-.12,.13]){const ring=new T.Mesh(new T.TorusGeometry(.04,.012,6,16),new T.MeshLambertMaterial({color:black}));ring.position.set(0,.14,z);g.add(ring);}for(const x of [-.046,.046])b.box(black,x,.14,.005,.013,.045,.26);}
    else {for(const x of [-.027,.027])b.box(black,x,.125,.06,.01,.09,.035);for(const y of [.083,.167])b.box(black,0,y,.06,.064,.01,.035);b.box(0xbe4739,0,.121,.08,.004,.004,.006);b.box(black,0,.075,len*.65,.014,.06,.025);}
    if(shot)b.box(0x625a40,0,-.032,.25,.09,.065,.18);
    if(id==='launcher'){const gl=b.cyl(0x575c4e,0,-.11,.23,.05,.3);gl.rotation.x=Math.PI/2;}
    if(lmg)for(const s of [-1,1]){const leg=b.box(black,.035*s,-.16,.32,.012,.25,.015);leg.rotation.z=.24*s;}
  }
  g.userData.military=true;return batchRig(T,g);
}
export function militarySoldier(T,team='blue',weapon='plasma'){
  const g=new T.Group(),b=builder(T,g),cloth=team==='red'?0x777258:0x59634d,armor=team==='red'?0x5b5343:0x3d493e,skin=0xa98668;
  b.box(cloth,0,1.16,0,.7,.75,.42);b.box(armor,0,1.23,.25,.63,.52,.12);
  for(const x of [-.21,0,.21])b.box(0x8b856b,x,1.16,.34,.16,.22,.1);
  b.box(armor,0,1.28,-.29,.54,.59,.22);b.box(0x242b26,0,.79,0,.68,.12,.45);
  b.sphere(skin,0,1.82,.015,.24);const helm=b.sphere(armor,0,1.96,-.02,.285);helm.scale.y=.66;
  b.box(0x242e2d,0,1.88,.226,.36,.08,.04);b.box(team==='blue'?0x5aa9db:0xda735c,-.364,1.4,0,.023,.16,.16);
  const legs=[];for(const s of [-1,1]){const p=new T.Group();p.position.set(s*.19,.79,0);g.add(p);b.box(cloth,0,-.3,0,.26,.6,.27,p);b.box(0x282e28,0,-.64,.08,.29,.16,.43,p);legs.push(p);}
  const gun=militaryGun(T,weapon);gun.scale.setScalar(1.12);gun.position.set(.21,1.32,.43);g.add(gun);
  for(const s of [-1,1]){const arm=b.box(cloth,s*.4,1.23,.23,.22,.46,.25);arm.rotation.x=-.85;b.sphere(0x424837,s*.32,1.23,.49,.12);}
  g.userData={legs,gun,military:true};return batchRig(T,g);
}
export function militaryVehicle(T,kind){
  const g=new T.Group(),b=builder(T,g),tan=BF_VEHICLES[kind]?.color||0xa89770,dark=0x303831,black=0x202827,glass=0x52747b;
  const turret=new T.Group();g.add(turret);let gun;
  const wheel=(x,y,z,r)=>{const w=b.cyl(black,x,y,z,r,.4,12);w.rotation.z=Math.PI/2;const hub=b.cyl(tan,x*1.015,y,z,r*.52,.42,10);hub.rotation.z=Math.PI/2;};
  if(kind==='tank'){
    b.box(tan,0,1.12,0,3.9,.83,6.2);b.box(tan,0,1.59,.25,3.3,.42,4.7);
    for(const s of [-1,1]){b.box(dark,s*1.8,.62,0,.78,1.05,6.05);for(let i=0;i<7;i++)wheel(s*2,.63,-2.5+i*.83,.46);b.box(tan,s*1.94,1.2,0,.25,.58,5.7);}
    turret.position.y=1.95;b.box(tan,0,.23,-.35,2.8,.8,2.8,turret);b.box(tan,0,.21,1.09,1.4,.55,1.25,turret);
    gun=b.box(dark,0,.29,3.08,.19,.19,3.85,turret);b.box(tan,0,.29,1.6,.3,.3,1.4,turret);
    b.cyl(dark,-.75,.73,-.5,.38,.15,12,turret);b.box(dark,-.7,1.02,.03,.12,.15,1.3,turret);
    b.box(tan,0,.34,-1.87,2.6,.7,.28,turret);
  }else if(kind==='heli'){
    const fus=b.sphere(tan,0,1.6,0,1.3);fus.scale.set(.62,.82,2.5);
    const cockpit=b.sphere(glass,0,1.95,1.4,1);cockpit.scale.set(.59,.64,1.5);
    b.box(tan,0,2.05,-.15,.14,.18,3.7);b.box(tan,0,1.5,-3.8,.3,.4,4.2);
    b.box(tan,0,2.08,-5.4,.16,1.55,.85).rotation.x=-.25;
    b.box(tan,0,1.8,-4.8,2.25,.13,.65);
    b.box(tan,0,1.33,-.1,3.9,.18,.8);
    for(const s of [-1,1]){b.box(dark,s*.86,.48,0,.12,.13,3.85);for(const z of [-1,1])b.box(dark,s*.75,.84,z,.08,.8,.1).rotation.z=s*.28;const pod=b.cyl(dark,s*1.63,1.13,.03,.28,1.28,10);pod.rotation.x=Math.PI/2;}
    const rotor=new T.Group();rotor.position.y=3.12;g.add(rotor);b.cyl(dark,0,2.8,-.35,.13,.7);
    for(const r of [0,Math.PI/2])b.box(black,0,0,-.3,.24,.055,11,rotor).rotation.y=r;
    const tail=new T.Group();tail.position.set(.24,2.25,-5.42);g.add(tail);b.box(black,0,0,0,.05,2,.12,tail);b.box(black,0,0,0,.05,.12,2,tail);
    turret.position.set(0,.95,1.95);gun=b.box(dark,0,0,.57,.14,.13,1.15,turret);g.userData.rotor=rotor;g.userData.tailRotor=tail;
  }else{
    const apc=kind==='mech';b.box(tan,0,1.12,0,apc?3:2.6,1,apc?5.4:4.2);
    if(apc){b.box(tan,0,1.72,-.25,2.55,.6,4.1);for(const s of [-1,1])for(const z of [-1.85,-.63,.63,1.85])wheel(s*1.55,.64,z,.57);}
    else {b.box(tan,0,1.92,-.1,2.3,.95,2.45);b.box(glass,0,2.04,1.14,1.94,.55,.035);b.box(tan,0,2.04,1.18,.09,.59,.06);for(const s of [-1,1]){b.box(glass,s*1.16,2.05,-.07,.03,.49,1.8);for(const z of [-1.35,1.35])wheel(s*1.32,.6,z,.6);}b.box(tan,0,1.59,1.77,2.45,.25,1.25);}
    turret.position.y=apc?2.25:2.62;b.cyl(tan,0,0,0,.59,.32,10,turret);b.box(dark,0,.3,.1,.36,.42,.7,turret);gun=b.box(dark,0,.33,apc?1.2:.8,apc?.13:.085,apc?.13:.085,apc?2.1:1.5,turret);
    for(const s of [-1,1])b.box(0xd3cbb1,s*.87,1.34,apc?2.73:2.13,.3,.2,.055);
  }
  if(kind!=='heli'){b.cyl(dark,-1.05,2.8,-1.7,.028,3.4,5);for(let i=0;i<3;i++)b.box(0x625e48,-.6+i*.6,1.61,-2,.4,.15,.45);}
  g.userData={...g.userData,turret,gun,military:true};return batchRig(T,g);
}

export const BF_MAP={z:900,halfX:148,halfZ:162,points:[{id:'A',name:'旧镇',x:-72,z:884},{id:'B',name:'通信站',x:0,z:900},{id:'C',name:'补给仓库',x:72,z:916}]};
export function buildMilitaryMap(T){
  const root=new T.Group();root.name='conquest-dustline';const solids=[],bins=new Map(),objects=[];
  const geom={box:new T.BoxGeometry(1,1,1),cyl:new T.CylinderGeometry(1,1,1,10),rock:new T.DodecahedronGeometry(1,0)};
  function add(type,color,x,y,z,w,h,d,rot=0){const key=type+':'+color;if(!bins.has(key))bins.set(key,[]);bins.get(key).push({x,y,z,w,h,d,rot});}
  const box=(c,x,y,z,w,h,d)=>add('box',c,x,y,z,w,h,d);
  function solid(x,z,w,d,h,bottom=0){solids.push({x,z,hw:w/2,hd:d/2,bottom,top:bottom+h});}
  function wall(x,z,w,d,h=1.4,c=0x96876b){box(c,x,h/2,z,w,h,d);solid(x,z,w,d,h);}
  // Stamped, deterministic surface detail avoids texture downloads and shimmer.
  box(0x938569,0,-.25,900,316,.5,344);
  box(0x615e51,0,.025,900,15,.05,298);
  for(const x of [-72,72])box(0x736b58,x,.02,900,12,.05,270);
  for(const z of [818,900,982])box(0x6a6555,0,.035,z,240,.055,12);
  for(let z=752;z<1050;z+=13)box(0xb3aa85,0,.07,z,.22,.025,5);
  for(let i=0;i<270;i++){const x=Math.sin(i*127.1)*145,z=900+Math.sin(i*311.7)*155;if(Math.abs(x)<10||Math.abs(Math.abs(x)-72)<9||[818,900,982].some(q=>Math.abs(z-q)<8))continue;add('rock',i%2?0x847961:0xa39573,x,.01,z,1.8+(i%4),.08,1.6+(i%3));}
  function building(x,z,w,d,h,c=0xb5a58a){
    box(c,x,h/2,z,w,h,d);solid(x,z,w,d,h);
    box(0xc5b99f,x,h+.15,z,w+.6,.3,d+.6);
    for(const s of [-1,1]){box(0x8a7e68,x,h+.65,z+s*d/2,w+.4,1,.3);box(0x8a7e68,x+s*w/2,h+.65,z,.3,1,d+.4);}
    for(const s of [-1,1])for(let i=1;i<Math.floor(w/2.5);i++)for(let y=2;y<h;y+=3)box(0x3f4d4d,x-w/2+i*2.5,y,z+s*(d/2+.015),1.1,1.5,.04);
    box(0x504b3f,x,1.2,z+d/2+.03,1.35,2.4,.06);box(0x77725e,x+1,h+.65,z-1,1.5,1.1,1.4);
  }
  // Compact village blocks with broad streets and alleys. Capture circles stay open.
  for(const [x,z,w,d,h] of [[-101,859,14,12,7],[-46,858,12,15,10],[-104,918,15,11,7],[-46,923,13,14,7],[-113,893,12,10,10],[-39,890,10,10,5]])building(x,z,w,d,h);
  for(const [x,z,w,d,h] of [[-24,862,11,12,5],[24,938,11,12,5],[-23,943,10,11,4],[24,856,12,10,4]])building(x,z,w,d,h,0x94988a);
  // Depot: corrugated warehouses, shipping containers, cylindrical fuel tanks.
  building(106,939,21,16,6,0x969b91);building(104,877,19,14,6,0xa59b80);
  for(const [x,z,c] of [[51,941,0x697c7a],[53,886,0x8b7159],[93,906,0x747c5c],[111,912,0x9a765b]]){box(c,x,1.7,z,5.5,3.4,12);solid(x,z,5.5,12,3.4);for(let i=0;i<11;i++)box(0x555f54,x+2.78,1.7,z-5+i,.06,3.3,.06);}
  for(const x of [123,134]){add('cyl',0x9da39a,x,3.2,955,4,6.4,4);solids.push({x,z:955,r:4,top:6.4,bottom:0});}
  // Radio compound: a lattice mast with dish, low sandbag positions on both sides.
  for(const [x,z] of [[-11,884],[11,916]]){for(let i=0;i<8;i++){add('box',0x566054,x,1+i*2,z,.25,2,.25);add('box',0x566054,x,1+i*2,z,3-i*.25,.1,.2,i*.5);}add('cyl',0x879a94,x,14,z,2,.25,2);}
  for(const p of BF_MAP.points){for(const s of [-1,1]){wall(p.x+s*13,p.z+8,8,1.3,1.25);wall(p.x+s*13,p.z-8,8,1.3,1.25);}box(0x6c7059,p.x+9,.65,p.z+13,2.5,1.3,2);solid(p.x+9,p.z+13,2.5,2,1.3);}
  // Both deployment camps: maintenance shelters, helipads, barriers, watchtowers.
  for(const s of [-1,1]){const z=900+s*137;
    building(-27,z,15,10,4,0x7e8776);building(30,z+3*s,16,11,4,0x8e907c);
    box(0x5a6057,56,.04,z,18,.07,18);for(const x of [53,59])box(0xd5ceb3,x,.085,z,1,.035,8);box(0xd5ceb3,56,.085,z,7,.035,1);
    for(const x of [-40,-30,30,40])wall(x,900+s*112,6,1.2,1.4);
    for(const x of [-119,119]){for(const xx of [-1.5,1.5])for(const zz of [-1.5,1.5])box(0x6b7565,x+xx,3,z+zz,.22,6,.22);box(0x8b9077,x,6,z,4.5,.4,4.5);box(0x4d584d,x,8,z,5,.25,5);}
    for(let i=0;i<5;i++){box(0x817455,-16+i*2,.6,z+9*s,1.6,1.2,1.5);}
  }
  // Palm silhouettes and distant ridges define a military desert, not MOBA lanes.
  for(let i=0;i<34;i++){const x=i%2?132:-132,z=758+(i>>1)*18;add('cyl',0x746548,x,3.4,z,.28,6.8,.28);for(let j=0;j<5;j++)add('box',0x5e6d43,x+Math.sin(j*1.256)*1.8,6.65,z+Math.cos(j*1.256)*1.8,.65,.16,4,j*1.256);}
  for(let i=0;i<32;i++){const a=i*Math.PI/16;add('rock',0x887b61,Math.cos(a)*215,9+Math.sin(i*2)*4,900+Math.sin(a)*220,30+i%5*5,24+i%4*5,29,i);}
  for(const [key,rows] of bins){const [type,c]=key.split(':'),m=new T.InstancedMesh(geom[type],new T.MeshLambertMaterial({color:+c}),rows.length),o=new T.Object3D();for(let i=0;i<rows.length;i++){const r=rows[i];o.position.set(r.x,r.y,r.z);o.rotation.set(0,r.rot,0);o.scale.set(r.w,r.h,r.d);o.updateMatrix();m.setMatrixAt(i,o.matrix);}m.castShadow=m.receiveShadow=true;root.add(m);}
  // Interactive flags are separate so captures update their colors without rebuilding the map.
  for(const p of BF_MAP.points){const flag=new T.Group(),b=builder(T,flag);b.cyl(0x65726a,0,3.4,0,.09,6.8,6);const cloth=b.box(0xd2c7a7,1,5.8,0,2,1.1,.05);const ring=new T.Mesh(new T.RingGeometry(11.8,12,48),new T.MeshBasicMaterial({color:0xd2c7a7,transparent:true,opacity:.55,depthWrite:false,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.095;flag.add(ring);flag.position.set(p.x,0,p.z);root.add(flag);objects.push({id:p.id,flag,cloth,ring});}
  return {root,solids,flags:objects,dispose(){const gs=new Set(),ms=new Set();root.traverse(o=>{if(o.geometry)gs.add(o.geometry);if(o.material)ms.add(o.material);});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());}};
}
