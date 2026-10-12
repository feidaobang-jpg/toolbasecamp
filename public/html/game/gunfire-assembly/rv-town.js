// 独立城镇地图：道路互通，设施与感染区分开；碰撞和视线共用建筑边界。
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
  const colors={ground:0x28332f,road:0x1d282d,walk:0x47514e,wall:0x566263,roof:0x303d43,window:0x182a33,rust:0x685747,yellow:0xc3a567,cyan:0x56bac3,green:0x6eb994,red:0x986660};
  const cube=new T.BoxGeometry(1,1,1);geos.push(cube);
  const mat={};for(const [key,color] of Object.entries(colors)){mat[key]=new T.MeshLambertMaterial({color});mats.push(mat[key]);}
  function box(w,h,d,x,y,z,key='wall',solid=false){
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push([w,h,d,x,y,z]);
    if(solid)solids.push({x,z,hw:w/2,hd:d/2});
  }
  const label=(text,sub,x,z,color='#9ee4df',width=20,y=6)=>{
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=192;
    const c=canvas.getContext('2d');c.fillStyle='#13252c';c.fillRect(0,0,768,192);c.strokeStyle=color;c.lineWidth=6;c.strokeRect(4,4,760,184);
    c.textAlign='center';c.fillStyle=color;c.font='bold 44px Microsoft YaHei';c.fillText(text,384,76);c.fillStyle='#e6d7ad';c.font='29px Microsoft YaHei';c.fillText(sub,384,142);
    const texture=new T.CanvasTexture(canvas),material=new T.MeshBasicMaterial({map:texture}),geo=new T.PlaneGeometry(width,width/4);textures.push(texture);mats.push(material);geos.push(geo);
    for(const back of [false,true]){const sign=new T.Mesh(geo,material);sign.position.set(x,y,z+(back?.06:0));sign.rotation.y=back?0:Math.PI;group.add(sign);}
  };
  box(390,.5,410,0,-.3,1684,'ground');
  for(const x of [-112,0,112])box(22,.08,366,x,.01,1684,'road');
  for(const z of [1525,1640,1750,1850])box(348,.08,22,0,.06,z,'road');
  for(const x of [-112,0,112])for(let z=1510;z<1864;z+=14)box(.2,.03,5,x,.12,z,'yellow');
  for(const z of [1525,1640,1750,1850])for(let x=-163;x<174;x+=14)box(5,.03,.2,x,.15,z,'yellow');
  // 房屋成组留出街巷与庭院；感染区中心和设施停车区保持可达。
  const blocks=[[-79,1558],[-34,1558],[-78,1613],[-34,1613],[34,1572],[79,1572],[36,1622],[80,1622],[-78,1670],[-38,1707],[33,1670],[79,1670],[83,1713],[-81,1810],[-31,1812],[40,1779],[76,1840],[-143,1602],[145,1625],[-145,1794],[147,1744]];
  blocks.forEach(([x,z],i)=>{
    const w=15+i%3*3,d=15+(i%2)*4,h=7+i%4*2;
    box(w+3,.24,d+3,x,.15,z,'walk');box(w,h,d,x,h/2+.27,z,i%4===0?'rust':'wall',true);
    box(w+1,.45,d+1,x,h+.45,z,'roof');
    for(const side of [-1,1])for(let f=0;f<Math.floor(h/3);f++)for(const off of [-w*.28,w*.28])box(2.5,1.5,.13,x+off,2.3+f*3,z+side*(d/2+.08),'window');
    box(2.8,3,.15,x,1.8,z-d/2-.1,'window');
    if(i%3===0){box(3,.3,.16,x,1.9,z-d/2-.2,'rust');box(.25,3,.18,x+.4,1.8,z-d/2-.24,'rust');}
    box(3,1.2,2,x+w*.25,h+1.2,z,'roof');
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
  const geo=new T.BoxGeometry(1,1,1),skin=new T.MeshLambertMaterial({color:0x8b9d79}),cloth=new T.MeshLambertMaterial({color:0x56646a}),pants=new T.MeshLambertMaterial({color:0x303d42}),eyes=new T.MeshBasicMaterial({color:0xdbbd6a});
  function make(i){
    const root=new T.Group(),body=new T.Group();root.add(body);
    const box=(w,h,d,x,y,z,mat,parent=body)=>{const m=new T.Mesh(geo,mat);m.scale.set(w,h,d);m.position.set(x,y,z);parent.add(m);return m;};
    box(.65,.85,.38,0,1.45,0,cloth);box(.48,.53,.46,0,2.1,.05,skin);box(.43,.25,.48,0,2.3,.03,pants);
    for(const x of [-.13,.13])box(.09,.07,.03,x,2.16,.29,eyes);
    const legs=[],arms=[];
    for(const sign of [-1,1]){const leg=new T.Group();leg.position.set(sign*.2,1.05,0);body.add(leg);box(.26,.86,.3,0,-.42,0,pants,leg);box(.28,.18,.48,0,-.86,.08,pants,leg);legs.push(leg);
      const arm=new T.Group();arm.position.set(sign*.45,1.74,0);body.add(arm);box(.22,.8,.25,0,-.37,0,cloth,arm);box(.2,.25,.24,0,-.87,0,skin,arm);arms.push(arm);}
    root.userData.zombie={body,legs,arms,phase:i*.8};root.scale.setScalar(i%7===0?1.15:1);return root;
  }
  function animate(mesh,dt,moving,attacking){const d=mesh.userData.zombie;if(!d)return;d.phase+=dt*(moving?6:1);d.body.rotation.z=Math.sin(d.phase)*.055;d.body.position.y=moving?Math.abs(Math.sin(d.phase))*.045:0;d.legs.forEach((o,i)=>o.rotation.x=moving?Math.sin(d.phase+i*Math.PI)*.48:0);d.arms.forEach((o,i)=>o.rotation.x=-.8+(attacking?-.5:Math.sin(d.phase+i)*.14));}
  return {make,animate,dispose(){geo.dispose();[skin,cloth,pants,eyes].forEach(m=>m.dispose());}};
}
