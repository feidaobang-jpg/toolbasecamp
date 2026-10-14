// 对战专用非人形单位。静态部件合为一个顶点色网格，共享模板避免每只兵创建材质。
export function createVersusCreatures(T){
  const cache=new Map(),material=new T.MeshLambertMaterial({vertexColors:true,flatShading:true});
  function geometry(style,color){
    const positions=[],normals=[],colors=[];
    const part=(type,size,pos,tint,rot=0)=>{
      let g=type==='ball'?new T.IcosahedronGeometry(1,1):type==='cone'?new T.ConeGeometry(1,1,6):new T.BoxGeometry(1,1,1);
      g.scale(...size);g.rotateX(rot);g.translate(...pos);if(g.index){const old=g;g=g.toNonIndexed();old.dispose();}
      const p=g.attributes.position,n=g.attributes.normal,c=new T.Color(tint);for(let i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));colors.push(c.r,c.g,c.b);}g.dispose();
    };
    const dark=0x263238,bone=0xc4bc8c;
    part('ball',[.85,.55,1.05],[0,.8,0],color);part('ball',[.53,.3,.48],[0,.8,.91],dark);
    for(const x of [-.24,.24])part('box',[.14,.12,.08],[x,.93,1.32],0xf2e6a9);
    for(const side of [-1,1])for(const z of [-.62,.05,.66]){part('box',[.75,.16,.18],[side*.91,.44,z],dark);part('cone',[.14,.65,.14],[side*1.23,.29,z+.13],bone);}
    if(style==='guard'){part('ball',[1.12,.7,.28],[0,.9,.95],0x747a6c);for(const x of [-.6,0,.6])part('cone',[.15,.6,.15],[x,1.62,.5],bone);}
    else if(style==='siege'){part('ball',[1.03,.8,1.15],[0,1.05,-.1],0x8a7553);part('box',[.58,.55,2.3],[0,1.65,.75],dark);part('box',[.75,.7,.28],[0,1.65,1.91],color);}
    else if(style==='medic'){part('ball',[.8,.9,.8],[0,1.42,-.25],0x66aa79);for(const side of [-1,1])part('ball',[.85,.12,.5],[side*1.05,1.45,-.4],0x77d6b5);part('box',[.12,.55,.08],[0,1.75,.56],0xe1ffc1);part('box',[.5,.12,.08],[0,1.75,.57],0xe1ffc1);}
    else if(style==='assault'){for(const x of [-.43,0,.43])part('cone',[.23,1.1,.23],[x,1.25,.92],bone,Math.PI/2);part('ball',[.7,.48,.9],[0,1.1,-.4],0xb39b6a);}
    else if(style==='energy'||style==='rage'||style==='titan'||style==='brood'){
      const glow=style==='energy'?0x69bede:style==='rage'?0xd78353:style==='titan'?0xae94cf:0xabc276;
      part('ball',[.95,1,.95],[0,1.2,-.1],color);for(const x of [-.62,0,.62])part('cone',[.3,1.1,.3],[x,2.05,-.2],glow);
      for(const s of [-1,1]){part('ball',[.55,.4,.75],[s*1.05,1.1,.4],dark);part('cone',[.2,1,.2],[s*1.12,.9,1.08],bone,Math.PI/2);}
    }else{part('ball',[.7,.7,.6],[0,1.22,-.45],0x739883);part('cone',[.3,1.1,.3],[0,1.1,1.2],bone,Math.PI/2);}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeBoundingSphere();return g;
  }
  function make(style,team,scale=1){
    const key=style+team;let geo=cache.get(key);if(!geo){geo=geometry(style,team==='blue'?0x507b9a:team==='red'?0x98635b:0x797b62);cache.set(key,geo);}
    const root=new T.Group(),body=new T.Mesh(geo,material);body.castShadow=true;root.add(body);body.scale.setScalar(scale);root.userData.vsCreature={style,body,phase:0,scale};return root;
  }
  function animate(mesh,dt,moving,attack){const d=mesh.userData.vsCreature;if(!d)return;d.phase+=dt*(moving?12:2);d.body.position.y=(moving?Math.abs(Math.sin(d.phase))*.09:Math.sin(d.phase)*.025)+(attack?.06:0);d.body.rotation.z=moving?Math.sin(d.phase)*.035:0;d.body.rotation.x=attack?-.1:0;}
  return {make,animate,dispose(){for(const geo of cache.values())geo.dispose();cache.clear();material.dispose();}};
}

// 对称野区：双方各有能量、狂怒和普通营地，河道两侧有争夺目标。
export const JUNGLE_CAMPS=[
  {id:'blue-energy',name:'能量守卫',x:-29,z:-32,prof:'energy',first:20,respawn:80,gold:70,xp:90,buff:'energy'},
  {id:'red-energy',name:'能量守卫',x:29,z:32,prof:'energy',first:20,respawn:80,gold:70,xp:90,buff:'energy'},
  {id:'blue-rage',name:'狂怒守卫',x:29,z:-32,prof:'rage',first:20,respawn:80,gold:70,xp:90,buff:'rage'},
  {id:'red-rage',name:'狂怒守卫',x:-29,z:32,prof:'rage',first:20,respawn:80,gold:70,xp:90,buff:'rage'},
  {id:'blue-pack',name:'拾荒虫巢',x:-31,z:-57,prof:'scavenger',first:20,respawn:50,gold:45,xp:65},
  {id:'red-pack',name:'拾荒虫巢',x:31,z:57,prof:'scavenger',first:20,respawn:50,gold:45,xp:65},
  {id:'river-brood',name:'裂地母虫',x:-33,z:0,prof:'brood',first:120,respawn:180,gold:120,xp:160,teamBuff:'siege'},
  {id:'river-titan',name:'晶甲巨兽',x:33,z:0,prof:'titan',first:120,respawn:180,gold:120,xp:160,teamBuff:'ward'},
];
