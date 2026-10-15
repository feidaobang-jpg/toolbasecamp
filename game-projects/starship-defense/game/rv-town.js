// 独立城镇地图：道路互通，设施与感染区分开；碰撞和视线共用建筑边界。
import {partBuilder} from './rv-art.js';
export const TOWN={minX:-176,maxX:176,minZ:1500,maxZ:1868,start:{x:0,z:1525}};
export const RV_SITES=[
  {id:'fuel-west',kind:'fuel',name:'西街加油站',x:-112,z:1565},
  {id:'garage-south',kind:'garage',name:'南街汽车修理厂',x:112,z:1545},
  {id:'market',kind:'market',name:'废弃超市 · 应急售货机',x:-112,z:1700},
  {id:'garage-north',kind:'garage',name:'北街汽车修理厂',x:112,z:1805},
  {id:'fuel-north',kind:'fuel',name:'北街加油站',x:0,z:1795},
  {id:'exit',kind:'exit',name:'撤离营地',x:0,z:1848},
];
export const RV_ZONES=[
  {id:'homes',name:'旧住宅区',x:-55,z:1585,n:5,r:18},
  {id:'school',name:'废弃学校',x:57,z:1600,n:6,r:19},
  {id:'square',name:'市政广场',x:0,z:1688,n:7,r:19},
  {id:'warehouse',name:'旧仓库',x:57,z:1730,n:7,r:20},
  {id:'park',name:'荒废公园',x:-57,z:1785,n:6,r:20},
  {id:'clinic',name:'旧诊所',x:144,z:1680,n:5,r:15},
];
export function buildTown(T,scene){
  const group=new T.Group();group.name='rv-abandoned-town';scene.add(group);
  const solids=[],geos=[],mats=[],textures=[],batches=new Map(),matrix=new T.Matrix4();
  const colors={ground:0x697269,road:0x3c4654,walk:0x92928a,wall:0x87949d,plaster:0xc6b39b,brick:0x9e7666,roof:0x455566,window:0x294452,rust:0x80644f,yellow:0xe3c28b,cyan:0x71bac5,green:0x75997c,red:0xa16755,trim:0xc9c7b8,lit:0xe8bb76,asphalt:0x333e4a,leaf:0x627b62};
  const cube=new T.BoxGeometry(1,1,1);geos.push(cube);
  const mat={};for(const [key,color] of Object.entries(colors)){mat[key]=new T.MeshPhongMaterial({color,shininess:key==='window'?75:key==='road'?14:6,specular:key==='window'?0x90bbc8:0x24272c,emissive:key==='lit'?0x39210a:0});mats.push(mat[key]);}
  // World-space grain stays stationary under instancing and camera movement.
  for(const key of ['ground','road','walk','asphalt']){
    mat[key].onBeforeCompile=shader=>{
      shader.vertexShader='varying vec2 rvSurface;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvec4 rvWorld=vec4(transformed,1.);\n#ifdef USE_INSTANCING\nrvWorld=instanceMatrix*rvWorld;\n#endif\nrvSurface=(modelMatrix*rvWorld).xz;');
      shader.fragmentShader='varying vec2 rvSurface;\nfloat rvHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\nvec2 cell=floor(rvSurface*5.),f=fract(rvSurface*5.);f=f*f*(3.-2.*f);float grain=mix(mix(rvHash(cell),rvHash(cell+vec2(1.,0.)),f.x),mix(rvHash(cell+vec2(0.,1.)),rvHash(cell+vec2(1.,1.)),f.x),f.y);diffuseColor.rgb*=mix(.9,1.04,grain);');
    };mat[key].customProgramCacheKey=()=> 'rv-world-grain-v2';
  }
  function box(w,h,d,x,y,z,key='wall',solid=false){
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push([w,h,d,x,y,z]);
    if(solid)solids.push({x,z,hw:w/2,hd:d/2});
  }
  const label=(text,sub,x,z,color='#9ee4df',width=20,y=6)=>{
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;
    const c=canvas.getContext('2d');c.fillStyle='#13252c';c.fillRect(0,0,768,192);c.strokeStyle=color;c.lineWidth=6;c.strokeRect(4,4,760,184);
    c.textAlign='center';c.fillStyle=color;c.font='bold 44px Microsoft YaHei';c.fillText(text,384,76);c.fillStyle='#e6d7ad';c.font='29px Microsoft YaHei';c.fillText(sub,384,142);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;const material=new T.MeshBasicMaterial({map:texture}),geo=new T.PlaneGeometry(width,width/4);textures.push(texture);mats.push(material);geos.push(geo);
    for(const back of [false,true]){const sign=new T.Mesh(geo,material);sign.position.set(x,y,z+(back?.06:0));sign.rotation.y=back?0:Math.PI;group.add(sign);}
  };
  box(390,.5,410,0,-.3,1684,'ground');
  for(const x of [-112,0,112])box(22,.08,366,x,.01,1684,'road');
  for(const z of [1525,1640,1750,1850])box(348,.08,22,0,.06,z,'road');
  for(const x of [-112,0,112])for(let z=1510;z<1864;z+=14)box(.2,.03,5,x,.12,z,'yellow');
  for(const z of [1525,1640,1750,1850])for(let x=-163;x<174;x+=14)box(5,.03,.2,x,.15,z,'yellow');
  // Narrow curbs and recessed asphalt patches add depth without new collisions.
  for(const x of [-112,0,112])for(const side of [-1,1]){
    box(.55,.26,344,x+side*11.45,.14,1684,'walk');
    for(let z=1548;z<1850;z+=42){
      // Lights sit outside the full-width drivable road, on the verge.
      const lx=x+side*13;box(.22,6.5,.22,lx,3.25,z,'roof');box(2,.18,.2,lx-side*.85,6.5,z,'roof');box(.65,.13,.5,lx-side*1.6,6.37,z,'lit');
      box(1,.4,1,lx,.2,z,'walk');
    }
  }
  for(const z of [1640,1750])for(const x of [-112,0,112])for(let i=0;i<6;i++){
    box(.9,.025,4,x-4+i*1.6,.125,z-7.5,'trim');box(.9,.025,4,x-4+i*1.6,.125,z+7.5,'trim');
  }
  for(let i=0;i<58;i++){const lane=[-112,0,112][i%3],z=1510+(i*47)%340;box(1.6+i%4,.026,2.8+i%3,lane+Math.sin(i*2.4)*7,.108,z,'asphalt');}
  // 房屋成组留出街巷与庭院；感染区中心和设施停车区保持可达。
  const blocks=[[-79,1558],[-34,1558],[-78,1613],[-34,1613],[34,1572],[79,1572],[36,1622],[80,1622],[-78,1670],[-38,1707],[33,1670],[79,1670],[83,1713],[-81,1810],[-31,1812],[40,1779],[76,1840],[-143,1602],[145,1625],[-145,1794],[147,1744]];
  blocks.forEach(([x,z],i)=>{
    const w=15+i%3*3,d=15+(i%2)*4,h=7+i%4*2;
    box(w+3,.24,d+3,x,.15,z,'walk');box(w,h,d,x,h/2+.27,z,['brick','wall','plaster','wall'][i%4],true);
    box(w+1,.45,d+1,x,h+.45,z,'roof');
    box(w+.3,.5,d+.3,x,.7,z,'roof');
    for(const side of [-1,1]){
      box(w+.2,.18,.18,x,h+.85,z+side*d*.5,'trim');box(.18,.18,d,x+side*w*.5,h+.85,z,'trim');
      for(let f=0;f<Math.floor(h/3);f++){
        box(w+.12,.16,.2,x,3.25+f*3,z+side*(d/2+.1),'trim');
        for(const off of [-w*.28,w*.28]){
          const wz=z+side*(d/2+.08),wy=2.3+f*3;
          box(2.8,1.8,.15,x+off,wy,wz,'roof');box(2.4,1.42,.18,x+off,wy,wz+side*.12,(i+f)%5===0?'lit':'window');
          box(.12,1.5,.21,x+off,wy,wz+side*.18,'trim');box(2.9,.17,.45,x+off,wy-.87,wz+side*.2,'trim');
        }
        for(const off of [-d*.27,d*.27]){box(.16,1.8,2.65,x+side*(w/2+.08),2.3+f*3,z+off,'roof');box(.18,1.42,2.25,x+side*(w/2+.2),2.3+f*3,z+off,'window');}
      }
    }
    box(2.8,3,.15,x,1.8,z-d/2-.1,'window');
    if(i%3===0){box(3,.3,.16,x,1.9,z-d/2-.2,'rust');box(.25,3,.18,x+.4,1.8,z-d/2-.24,'rust');}
    box(3,1.2,2,x+w*.25,h+1.2,z,'roof');
    box(3.3,.12,2.3,x+w*.25,h+1.87,z,'trim');box(.18,2.6,.18,x-w*.25,h+1.8,z+2,'rust');
    box(4,.25,2.2,x,3.5,z-d/2-.9,i%2?'green':'rust');
    // Paving, service vents and low planters stay within existing building pads.
    for(const s of [-1,1]){box(2.6,.7,1.1,x+s*(w*.32),.62,z-d/2-.85,'roof');box(2.25,.6,.8,x+s*(w*.32),1.1,z-d/2-.85,'leaf');}
  });
  // 锈车、倒塌招牌、断木与碎砖落在路边，主车道保持畅通。
  for(const [x,z] of [[-132,1537],[22,1631],[133,1720],[-133,1760],[23,1832]]){
    box(2.8,.7,5.4,x,.7,z,'rust',true);box(2.3,.8,2.4,x,1.4,z-.3,'roof');box(2,.5,.12,x,1.55,z+1,'window');
    for(const side of [-1,1])for(const dz of [-1.6,1.6])box(.45,.7,.8,x+side*1.5,.5,z+dz,'window');
    for(let j=0;j<4;j++)box(.8,.3,.6,x+3+j%2,.3,z-2+j,'rust');
  }
  for(const [x,z] of [[-139,1650],[-31,1769],[-78,1766],[88,1694],[23,1551],[137,1838]]){
    box(.8,4,.8,x,2,z,'rust',true);box(2.6,.45,.45,x+.8,3.3,z,'rust');box(.4,1.7,.4,x-1,4,z,'rust');
  }
  for(const x of [-18,18]){box(4,.35,1.2,x,1,1688,'rust');for(const off of [-1.4,1.4])box(.25,.8,.7,x+off,.4,1688,'roof');}
  for(const site of RV_SITES){
    const {x,z,kind}=site,key=kind==='garage'?'yellow':kind==='market'?'green':'cyan';
    box(27,.12,26,x,.18,z,'walk');
    for(const side of [-1,1]){box(.3,.03,24,x+side*12,.27,z,key);box(24,.03,.3,x,.27,z+side*12,key);}
    if(kind==='garage'){
      // 塌掉中央屋顶的敞口车间，第三人称在车位中也能看清车辆。
      box(.65,5.2,20,x-11,2.6,z,'wall',true);box(.65,5.2,20,x+11,2.6,z,'wall',true);box(22,5.2,.6,x,2.6,z+10,'wall',true);
      for(const side of [-1,1])box(3,.6,21,x+side*10,5.5,z,'roof');box(18,.6,3,x,5.5,z+9,'roof');
      box(.3,.06,15,x-2,.31,z,'yellow');box(.3,.06,15,x+2,.31,z,'yellow');
      box(.3,3,.3,x+18,1.5,z-7,'rust');label(site.name,'驶入黄框 · 车内也可维修 / 改装',x+18,z-7,'#e9c986',11,3.6);
    }else if(kind==='fuel'){
      for(const side of [-1,1]){box(1.6,2.5,1.2,x+side*8,1.25,z,'cyan',true);box(.8,.55,.08,x+side*8,1.8,z-.64,'window');}
      for(const side of [-1,1])box(4,.45,14,x+side*8,5.8,z,'roof');
      box(.3,3,.3,x+17,1.5,z+8,'rust');label(site.name,'自由加油 · 不设通行路障',x+17,z+8,'#9ee4df',10,3.6);
    }else if(kind==='market'){
      box(25,7,12,x,3.5,z+16,'rust',true);box(3,3,1,x+7,1.5,z+8,'green',true);box(2,1.5,.1,x+7,1.8,z+7.45,'window');
      label('废弃超市','应急售货机 · 密封罐头 / 医疗包',x,z+8);
    }else{box(10,3.8,6,x+16,1.9,z,'green',true);label(site.name,'随时结束探索 · 自愿撤离',x,z+10);}
  }
  for(const zone of RV_ZONES){box(9,.04,9,zone.x,.13,zone.z,'rust');box(2.3,1.4,1.5,zone.x,.85,zone.z,'yellow');label(zone.name,'感染区 · 搜索物资箱可得零件',zone.x,zone.z+7,'#e3aa82');}
  // Low distant silhouettes hide the finite map edge, without entering the map.
  for(let i=0;i<28;i++){const x=-210+i*16,h=13+(i*17)%31;for(const z of [1466-i%3*8,1896+i%3*9])box(11+i%3*2,h,14,x,h/2,z,i%2?'roof':'wall');}
  for(let i=0;i<24;i++)for(const x of [-204-i%3*8,204+i%3*8]){const h=12+(i*13)%27;box(14,h,12,x,h/2,1490+i*16,i%2?'roof':'wall');}
  // 实体围墙清楚标示地图边界；路网内没有剧情空气墙。
  for(const x of [-179,179])box(1.5,3.3,374,x,1.6,1684,'wall',true);
  for(const z of [1497,1871])box(359,3.3,1.5,0,1.6,z,'wall',true);
  for(const [key,rows] of batches){const mesh=new T.InstancedMesh(cube,mat[key],rows.length);rows.forEach(([w,h,d,x,y,z],i)=>{matrix.makeScale(w,h,d);matrix.setPosition(x,y,z);mesh.setMatrixAt(i,matrix);});mesh.receiveShadow=true;mesh.castShadow=!['road','ground','walk'].includes(key);group.add(mesh);}
  const blocked=(x,z,r=.8)=>x<TOWN.minX+r||x>TOWN.maxX-r||z<TOWN.minZ+r||z>TOWN.maxZ-r||solids.some(b=>Math.abs(x-b.x)<b.hw+r&&Math.abs(z-b.z)<b.hd+r);
  const visible=(a,b)=>{
    // Slab intersection in XZ. Walls obstruct acquisition and gunfire, including garage walls.
    for(const s of solids){let lo=0,hi=1;for(const [p,d,min,max] of [[a.x,b.x-a.x,s.x-s.hw,s.x+s.hw],[a.z,b.z-a.z,s.z-s.hd,s.z+s.hd]]){if(Math.abs(d)<1e-8){if(p<min||p>max){hi=-1;break;}}else{let u=(min-p)/d,v=(max-p)/d;if(u>v)[u,v]=[v,u];lo=Math.max(lo,u);hi=Math.min(hi,v);}}if(lo<=hi&&hi>=0&&lo<=1)return false;}return true;
  };
  return {group,solids,blocked,visible,dispose(){scene.remove(group);geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}

export function zombieFactory(T){
  const material=new T.MeshPhongMaterial({vertexColors:true,shininess:8}),geos=[];
  const build=fn=>{const b=partBuilder(T);fn(b);const m=b.mesh(material);geos.push(m.geometry);return m.geometry;};
  const bodies=[0x667b8c,0x8c7667,0x698574].map(cloth=>build(b=>{
    b.box(.68,.86,.4,0,1.45,0,cloth);b.box(.4,.12,.42,0,1.06,0,0x303b47);b.box(.07,.68,.035,0,1.46,.219,0x3a4550);
    b.box(.2,.21,.035,-.19,1.5,.225,0x98a396);b.box(.2,.09,.44,0,1.93,.015,0x5f7557);
    b.box(.49,.51,.46,0,2.16,.04,0x96ab83);b.box(.5,.16,.47,0,2.39,.02,0x35434a);
    for(const x of [-.13,.13]){b.box(.13,.08,.035,x,2.2,.29,0x263a35);b.box(.065,.045,.04,x,2.19,.313,0xf5d388);b.box(.13,.04,.045,x,2.28,.297,0x49624b);}
    b.box(.09,.12,.1,0,2.14,.32,0x7c946b);b.box(.18,.05,.04,.03,2,.29,0x42594b);
  }));
  const legGeo=build(b=>{b.box(.27,.8,.32,0,-.4,0,0x3b4858);b.box(.28,.19,.34,0,-.65,.02,0x4c5e6a);b.box(.3,.2,.46,0,-.84,.09,0x28343e);});
  const armGeo=build(b=>{b.box(.24,.57,.28,0,-.25,0,0x687e8b);b.box(.23,.16,.28,0,-.59,0,0x8c9c90);b.box(.21,.25,.26,0,-.8,.01,0x96ab83);});
  function make(i){
    const root=new T.Group(),body=new T.Group();root.add(body);
    const mesh=new T.Mesh(bodies[i%3],material);mesh.castShadow=true;mesh.receiveShadow=true;body.add(mesh);
    const legs=[],arms=[];
    for(const sign of [-1,1]){const leg=new T.Mesh(legGeo,material);leg.position.set(sign*.2,1.05,0);leg.castShadow=true;body.add(leg);legs.push(leg);
      const arm=new T.Mesh(armGeo,material);arm.position.set(sign*.45,1.74,0);arm.castShadow=true;body.add(arm);arms.push(arm);}
    root.userData.zombie={body,legs,arms,phase:i*.8};root.scale.setScalar(i%7===0?1.15:1);return root;
  }
  function animate(mesh,dt,moving,attacking){const d=mesh.userData.zombie;if(!d)return;d.phase+=dt*(moving?6:1);d.body.rotation.z=Math.sin(d.phase)*.055;d.body.position.y=moving?Math.abs(Math.sin(d.phase))*.045:0;d.legs.forEach((o,i)=>o.rotation.x=moving?Math.sin(d.phase+i*Math.PI)*.48:0);d.arms.forEach((o,i)=>o.rotation.x=-.8+(attacking?-.5:Math.sin(d.phase+i)*.14));}
  return {make,animate,dispose(){geos.forEach(g=>g.dispose());material.dispose();}};
}
