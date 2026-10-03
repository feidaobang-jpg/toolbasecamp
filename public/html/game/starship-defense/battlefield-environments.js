import * as THREE from './vendor/three.module.js';
import {BATTLEFIELD_PALETTE} from './battlefield-palette.js';
import {MOUTHS,HIVE,tunnelDistance} from './hive-world.js';

// One art direction, three campaign locations. Chapter is the source of truth:
// saves need no extra field, and returning from an operation restores the same place.
export const ENVIRONMENTS={
  desert:{id:'desert',name:'暮色荒漠',chapters:'第 1–3 章',
    ground:[0x75604b,0x91714d,0xa7865b],lane:0x5d4c40,ridge:0x71604e,tunnelFloor:0x46353d,
    rock:0x876c54,pebble:0x76614e,sky:0x151827,fog:0x63504c,
    horizon:0x976454,zenith:0x111c36,glow:0xcf8052,peak:0x5c4850,
    hemi:0xc8c6d4,groundLight:0x534135,sun:0xffd6ab,intensity:1.22,
    accent:0xeac384,planet:0xe2be8e,moon:0xcac0b5,detail:0xb09063},
  frost:{id:'frost',name:'极光冰原',chapters:'第 4–6 章',
    ground:[0x839fae,0xb4c6cc,0xd3dfdf],lane:0x4c687c,ridge:0x718796,tunnelFloor:0x354656,
    rock:0x718c9e,pebble:0x8fa6b4,sky:0x0b2132,fog:0x4e7389,
    horizon:0x4c889b,zenith:0x0b1b36,glow:0x5bbba7,peak:0x516e86,
    hemi:0xc4e7ff,groundLight:0x456475,sun:0xd5edff,intensity:1.08,
    accent:0xa3e7f0,planet:0xbedbe4,moon:0xe2eaf0,detail:0xc2e2e7},
  hive:{id:'hive',name:'虫巢边境',chapters:'第 7–10 章',
    ground:[0x303343,0x424553,0x535766],lane:0x5b4a5f,ridge:0x4c4253,tunnelFloor:0x47374c,
    rock:0x504e67,pebble:0x49495b,sky:0x111728,fog:0x384354,
    horizon:0x465366,zenith:0x10172c,glow:0x638e9d,peak:0x303e50,
    hemi:0xb8cee6,groundLight:0x39434f,sun:0xd7e0f1,intensity:1.17,
    accent:0x7bdfc7,planet:0x9bacb9,moon:0xb8cfdd,detail:0x557b83}
};
export function environmentForChapter(chapter){
  const n=((Math.max(1,Math.floor(Number(chapter)||1))-1)%10)+1;
  return ENVIRONMENTS[n<=3?'desert':n<=6?'frost':'hive'];
}
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
const segmentDistance=(x,z,ax,az,bx,bz)=>{const vx=bx-ax,vz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*vx+(z-az)*vz)/(vx*vx+vz*vz)));return Math.hypot(x-ax-vx*t,z-az-vz*t);};

// Only colours change: positions, slopes, tunnel mouths and collision remain fixed.
export function paintBattlefieldGround(ground,palette){
  const pos=ground.geometry.attributes.position,p={...BATTLEFIELD_PALETTE,...palette};
  const colors=ground.geometry.getAttribute('color')||new THREE.Float32BufferAttribute(new Float32Array(pos.count*3),3);
  const [c1,c2,c3]=p.ground.map(c=>new THREE.Color(c));
  const laneC=new THREE.Color(p.lane),plateauC=new THREE.Color(p.plateau),ridgeC=new THREE.Color(p.ridge),tunnelC=new THREE.Color(p.tunnelFloor),creepC=new THREE.Color(p.hive.shell);
  const trails=MOUTHS.map(m=>[m.out.x,m.out.z,m.x*.25,70]);
  const c=new THREE.Color(),accent=new THREE.Color(palette.id==='hive'?0x567c7b:p.ground[2]);
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=pos.getZ(i)+ground.position.z,h=pos.getY(i);
    const t=Math.max(0,Math.min(1,h/8)),n=Math.sin(x*.31+z*.17)*Math.cos(z*.23-x*.11);
    c.copy(c1).lerp(c2,Math.abs(Math.sin(x*.045)*Math.cos(z*.05))*.7).lerp(c3,t*.5).multiplyScalar(.9+n*.1);
    if(palette.id==='desert')c.lerp(accent,(.5+.5*Math.sin(x*.35+z*.08+Math.sin(z*.1)*2))*.10);
    if(palette.id==='frost')c.lerp(accent,(.5+.5*Math.sin(x*.11-z*.24))*.21);
    if(palette.id==='hive'){
      const vein=Math.abs(Math.sin(x*.16+Math.sin(z*.10)*2)*Math.cos(z*.12-x*.05));
      c.lerp(accent,(1-smooth(vein/.07))*.42);
    }
    const lane=(1-smooth((Math.abs(x-Math.sin(z*.022)*3)-6)/5))*(1-smooth((z-250)/30));
    if(z>-18)c.lerp(laneC,lane*.85);
    let trail=0;for(const[ax,az,bx,bz]of trails)trail=Math.max(trail,1-smooth((segmentDistance(x,z,ax,az,bx,bz)-2.5)/4));
    if(trail>0)c.lerp(laneC,trail*.55);
    if(z<-13&&Math.abs(x)<35)c.lerp(plateauC,.85);
    if(h>1&&h<4.8&&z<2&&Math.abs(x)>12)c.lerp(ridgeC,.7);
    const td=tunnelDistance(x,z);if(td<9)c.lerp(tunnelC,1-smooth((td-6)/3));
    const hd=Math.hypot(x-HIVE.x,z-HIVE.z-4);if(hd<HIVE.r+8)c.lerp(creepC,(1-smooth((hd-HIVE.r+6)/12))*.8);
    colors.setXYZ(i,c.r,c.g,c.b);
  }
  colors.needsUpdate=true;ground.geometry.setAttribute('color',colors);
}

export class BattlefieldEnvironment{
  constructor(scene,ground,objects){
    this.scene=scene;this.ground=ground;this.objects=objects;this.current=null;this.decor=null;this.elapsed=0;this.rebuilds=0;
    // Reuse the original sky mesh and lights; no second scene or light stack.
    const m=objects.sky.material;
    m.uniforms={horizon:{value:new THREE.Color()},zenith:{value:new THREE.Color()},glow:{value:new THREE.Color()},aurora:{value:0}};
    m.fragmentShader=`varying vec3 p;uniform vec3 horizon;uniform vec3 zenith;uniform vec3 glow;uniform float aurora;
      void main(){vec3 n=normalize(p);float h=n.y;float a=atan(n.x,n.z);
        vec3 c=mix(horizon,zenith,smoothstep(-.03,.6,h));
        c+=glow*.15*exp(-abs(h)*12.);
        float ribbon=exp(-abs(h-(.31+.055*sin(a*4.)+.025*sin(a*9.)))*62.);
        c+=glow*ribbon*.27*aurora*smoothstep(.04,.2,h);
        gl_FragColor=vec4(c,1.);}`;
    m.needsUpdate=true;
  }
  applyChapter(chapter){return this.apply(environmentForChapter(chapter));}
  apply(profile){
    if(this.current===profile)return false;
    this.current=profile;this.rebuilds++;const p=profile,s=this.scene,o=this.objects;
    paintBattlefieldGround(this.ground,p);
    s.background.set(p.sky);s.fog.color.set(p.fog);s.fog.near=130;s.fog.far=430;
    s.traverse(m=>{
      if(m.isHemisphereLight){m.color.set(p.hemi);m.groundColor.set(p.groundLight);m.intensity=.68;}
      if(m.isDirectionalLight){m.color.set(p.sun);m.intensity=p.intensity;}
      if(m.name==='battlefield-cover')m.material.color.set(p.rock);
      if(m.name==='battlefield-pebbles')m.material.color.set(p.pebble);
    });
    const u=o.sky.material.uniforms;u.horizon.value.set(p.horizon);u.zenith.value.set(p.zenith);u.glow.value.set(p.glow);u.aurora.value=p.id==='frost'?1:0;
    o.peaks.visible=false;o.stars.material.opacity=p.id==='desert'?.48:.75;o.stars.material.transparent=true;
    o.moon.material.color.set(p.moon);
    this.clearDecor();this.buildDecor(p);return true;
  }
  clearDecor(){
    if(!this.decor)return;
    const geometries=new Set(),materials=new Set();
    this.decor.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);if(o.isInstancedMesh)o.dispose();});
    this.decor.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.decor=null;this.weather=null;
  }
  buildDecor(p){
    const group=new THREE.Group();group.name='chapter-environment';this.decor=group;this.scene.add(group);
    const dummy=new THREE.Object3D();
    const batch=(geometry,color,items,emissive=false)=>{
      const material=emissive?new THREE.MeshBasicMaterial({color}):new THREE.MeshLambertMaterial({color,flatShading:true});
      const mesh=new THREE.InstancedMesh(geometry,material,items.length);
      items.forEach((a,i)=>{dummy.position.set(...a[0]);dummy.scale.set(...a[1]);dummy.rotation.set(0,i*1.37,a[2]||0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
      mesh.receiveShadow=false;mesh.castShadow=false;group.add(mesh);return mesh;
    };
    // Large silhouettes live beyond the playable boundary (x +/-110, z <=335).
    const landmarks=[];
    for(let i=0;i<16;i++)for(const side of [-1,1])landmarks.push([side*(136+(i%3)*10),-35+i*24,5+(i%4)*2]);
    for(let i=0;i<9;i++)landmarks.push([-115+i*29,372+(i%2)*14,8+(i%3)*2]);
    // Horizon fill surrounds the playable terrain; a full plane would slice through underground galleries.
    const horizon=[];
    for(const [x0,x1,z0,z1] of [[-950,-110,-820,1080],[110,950,-820,1080],[-110,110,-820,-70],[-110,110,335,1080]]){
      for(const [x,z] of [[x0,z0],[x0,z1],[x1,z1],[x0,z0],[x1,z1],[x1,z0]])horizon.push(x,-1.6,z);
    }
    const horizonGeo=new THREE.BufferGeometry();horizonGeo.setAttribute('position',new THREE.Float32BufferAttribute(horizon,3));horizonGeo.computeVertexNormals();
    const land=new THREE.Mesh(horizonGeo,new THREE.MeshLambertMaterial({color:p.ground[0]}));land.name='outside-world-horizon';group.add(land);
    if(p.id==='desert'){
      batch(new THREE.CylinderGeometry(1,.8,1,6),p.rock,landmarks.map(([x,z,h])=>[[x,h*.9,z],[17,h*1.8,15]]));
      batch(new THREE.CylinderGeometry(1,1,1,6),p.detail,landmarks.map(([x,z,h])=>[[x,h*1.73,z],[17.7,.8,15.5]]));
      batch(new THREE.DodecahedronGeometry(1,0),p.ground[1],landmarks.map(([x,z,h])=>[[x-3,1,z-8],[18,3+h*.2,15]]));
    }else if(p.id==='frost'){
      batch(new THREE.DodecahedronGeometry(1,0),p.rock,landmarks.map(([x,z,h])=>[[x,h*.5,z],[13,h,11]]));
      batch(new THREE.ConeGeometry(1,1,5),p.detail,landmarks.map(([x,z,h])=>[[x,h*1.9,z],[10,h*3.2,9],(x<0?1:-1)*.15]));
      batch(new THREE.ConeGeometry(1,1,5),0xe0e8e7,landmarks.map(([x,z,h])=>[[x+5,h,z+7],[6,h*1.7,5],-.14]));
    }else{
      batch(new THREE.DodecahedronGeometry(1,0),p.rock,landmarks.map(([x,z,h])=>[[x,h*.35,z],[14,h*.8,12]]));
      batch(new THREE.TorusGeometry(1,.14,4,10,Math.PI),p.detail,landmarks.map(([x,z,h])=>[[x,0,z],[10,h*3,7]]));
      const stalks=[],caps=[],lights=[];
      landmarks.forEach(([x,z,h],i)=>{const y=h*.6;stalks.push([[x-8,y,z+7],[1.1,y*2,1.1]]);caps.push([[x-8,y*2,z+7],[4.5,1.6,3.8]]);lights.push([[x-8,y*2-.8,z+7],[3.6,.12,3]]);});
      batch(new THREE.CylinderGeometry(.7,1,1,7),p.peak,stalks);
      batch(new THREE.SphereGeometry(1,8,5),p.detail,caps);
      batch(new THREE.SphereGeometry(1,8,5),p.accent,lights,true);
    }
    // One small points draw, no particle meshes, lights, textures or per-frame uploads.
    const points=[],seeds=[],count=p.id==='frost'?160:70;
    for(let i=0;i<count;i++){points.push(Math.sin(i*127.1)*75,4+(i*7.13)%22,Math.cos(i*31.7)*75);seeds.push((i*.618)%1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,1));
    const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},tint:{value:new THREE.Color(p.accent)},snow:{value:p.id==='frost'?1:0}},
      vertexShader:`attribute float seed;uniform float time;uniform float snow;varying float alpha;void main(){vec3 v=position;v.x+=sin(time*.2+seed*20.)*3.;v.y=3.+mod(position.y+time*mix(.25,-1.6,snow),22.);vec4 mv=modelViewMatrix*vec4(v,1.);alpha=clamp(1.-length(mv.xyz)/80.,0.,1.)*.40;gl_PointSize=mix(2.2,3.0,snow);gl_Position=projectionMatrix*mv;}`,
      fragmentShader:'uniform vec3 tint;varying float alpha;void main(){float r=length(gl_PointCoord-.5);if(r>.48)discard;gl_FragColor=vec4(tint,alpha*(1.-smoothstep(.15,.48,r)));}'
    });
    const weather=new THREE.Points(geometry,material);weather.frustumCulled=false;group.add(weather);this.weather=weather;
  }
  update(dt,player,quality){
    if(!this.weather)return;
    this.elapsed+=dt;this.weather.visible=quality==='high';
    this.weather.position.set(player.x,0,player.z);this.weather.material.uniforms.time.value=this.elapsed;
  }
}
