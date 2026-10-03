import * as THREE from './vendor/three.module.js';
import {UnitVisuals} from './unit-visuals.js';

// Deep night battlefield look requested by players (closest to the first released
// version): armoured troopers, glossy arachnid bugs with glowing eyes, steel base.
// Merged-part units: body + two limb meshes (+ wings) per unit.
const SOLDIER_COLORS=new Map([[0x3a7bd5,0x3f74c4],[0xd58a3a,0xb8743a],[0x3ad57b,0x3f9a63],[0xd5d53a,0xb9a23c],[0xd53a8a,0xa8445f],[0x3ad5d5,0x3b9aa8],[0xff8833,0xc4682e],[0x4488ff,0x3f74c4]]);
const BUG_COLORS=[0xd2692e,0x8cc63a,0x8a5fb8,0x3fb7c9,0xe0402a,0xa8b336,0x3f6fe6,0x5d5f86,0x8a8f96,0xb3245c];
const shade=(c,k)=>new THREE.Color(c).multiplyScalar(k).getHex();
const mix=(a,b,t)=>new THREE.Color(a).lerp(new THREE.Color(b),t).getHex();

export class DarkVisuals extends UnitVisuals {
  constructor(_,scene,palette){
    super(_,scene);this.palette=palette;this.pointLights=[];
    // Lighter shared primitives: 48 bugs x ~30 parts stays well under phone triangle budgets.
    this.sphere=new THREE.SphereGeometry(1,12,9);this.cylinder=new THREE.CylinderGeometry(1,1,1,8);
    // Vertex attribute aGlow adds the vertex colour as emission: eyes, visors and vents
    // glow in the dark without extra materials or draw calls.
    this.material=new THREE.MeshPhongMaterial({vertexColors:true,shininess:46,specular:0x3a4048});
    this.material.onBeforeCompile=s=>{
      s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\nattribute float aGlow;\nvarying float vGlow;').replace('#include <begin_vertex>','#include <begin_vertex>\nvGlow=aGlow;');
      s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying float vGlow;').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vColor.rgb*vGlow*1.6;');
    };
    this.material.customProgramCacheKey=()=>'chongchao-glow';
  }
  set quality(v){this._quality=v;for(const l of this.pointLights||[])l.visible=v==='high';}
  get quality(){return this._quality;}
  part(list,shape,color,p,s,r=[0,0,0],glow=0){
    const g=this[shape].clone(),d=this.dummy;
    d.position.set(...p);d.scale.set(...s);d.rotation.set(...r);d.quaternion.setFromEuler(d.rotation);d.updateMatrix();g.applyMatrix4(d.matrix);
    this.paint(g,color,glow);list.push(g);
  }
  paint(g,color,glow){
    const c=new THREE.Color(color),n=g.attributes.position.count,a=new Float32Array(n*3),e=new Float32Array(n).fill(glow);
    for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}
    g.setAttribute('color',new THREE.BufferAttribute(a,3));g.setAttribute('aGlow',new THREE.BufferAttribute(e,1));
  }
  // Cylinder between two points (legs, antennae) so limbs read as jointed segments.
  segment(list,color,a,b,radius,glow=0){
    const g=this.cylinder.clone(),A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),dir=B.clone().sub(A),len=dir.length(),d=this.dummy;
    d.position.copy(A).addScaledVector(dir,.5);d.scale.set(radius,len,radius);d.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());d.updateMatrix();
    g.applyMatrix4(d.matrix);this.paint(g,color,glow);list.push(g);
  }
  soldier(color=0x3a7bd5){
    color=SOLDIER_COLORS.get(color)||color;
    const key='dsoldier'+color;
    if(!this.cache.has(key)){
      const A=color,AL=mix(color,0xffffff,.28),D=0x1c2530,T=0x8f9cab,acc=0xe0b040,visor=0x63e9ff,hip=.92;
      const b=[],legs=[],gun=[];
      this.part(b,'box',D,[0,.95,0],[.52,.16,.34]);this.part(b,'box',acc,[0,.95,.175],[.12,.09,.02]);
      this.part(b,'box',D,[0,1.1,0],[.44,.18,.3]);
      this.part(b,'box',A,[0,1.36,0],[.64,.5,.4]);this.part(b,'box',AL,[0,1.4,.21],[.52,.34,.06]);
      this.part(b,'box',visor,[.14,1.49,.245],[.08,.04,.012],[0,0,0],1);
      this.part(b,'box',D,[0,1.62,0],[.4,.08,.3]);
      this.part(b,'box',D,[0,1.36,-.3],[.5,.52,.22]);this.part(b,'box',T,[0,1.64,-.3],[.44,.06,.18]);
      for(const s of [-1,1])this.part(b,'cylinder',0xffa040,[s*.14,1.08,-.4],[.06,.1,.06],[0,0,0],.9);
      this.part(b,'cylinder',D,[0,1.68,0],[.11,.1,.11]);
      this.part(b,'sphere',A,[0,1.86,0],[.25,.25,.27]);this.part(b,'box',AL,[0,2.07,-.02],[.07,.07,.34]);
      this.part(b,'box',visor,[0,1.87,.2],[.34,.1,.1],[0,0,0],1);
      this.part(b,'box',D,[0,1.79,.21],[.3,.05,.12]);this.part(b,'box',D,[0,1.74,.15],[.2,.09,.13]);
      this.segment(b,T,[.18,1.98,-.12],[.18,2.26,-.14],.012);this.part(b,'sphere',0xff4030,[.18,2.27,-.14],[.03,.03,.03],[0,0,0],1);
      for(const s of [-1,1]){
        this.part(b,'cylinder',T,[s*.25,1.86,0],[.07,.06,.07],[0,0,Math.PI/2]);
        this.part(b,'sphere',A,[s*.43,1.56,0],[.21,.15,.23]);this.part(b,'box',acc,[s*.43,1.66,.08],[.05,.03,.18]);
        this.part(b,'box',D,[s*.42,1.34,.04],[.14,.3,.15]);
        this.part(b,'box',A,[s*.3,1.2,.26],[.13,.13,.3]);this.part(b,'box',D,[s*.22,1.18,.42],[.11,.11,.11]);
        const l=[];
        this.part(l,'box',D,[s*.15,.72-hip,0],[.19,.36,.21]);this.part(l,'box',A,[s*.15,.74-hip,.08],[.17,.28,.06]);
        this.part(l,'box',AL,[s*.15,.53-hip,.1],[.16,.11,.07]);this.part(l,'box',A,[s*.15,.32-hip,0],[.17,.36,.19]);
        this.part(l,'box',D,[s*.15,.07-hip,.05],[.19,.14,.32]);
        legs.push(this.merged(l));
      }
      this.part(gun,'box',D,[0,0,0],[.11,.15,.6]);this.part(gun,'box',D,[0,-.02,-.36],[.09,.12,.2]);
      this.part(gun,'cylinder',T,[0,.02,.48],[.035,.4,.035],[Math.PI/2,0,0]);this.part(gun,'cylinder',D,[0,.02,.7],[.05,.06,.05],[Math.PI/2,0,0]);
      this.part(gun,'box',D,[0,-.13,.08],[.07,.16,.11]);this.part(gun,'box',visor,[0,.1,.05],[.04,.04,.12],[0,0,0],1);
      this.part(gun,'box',A,[.06,0,.1],[.012,.06,.3]);
      this.cache.set(key,{body:this.merged(b),legs,gun:this.merged(gun)});
    }
    const data=this.cache.get(key),root=this.root('soldier',data.body,data.legs,2.3);
    root.userData.toy.feet.forEach(m=>m.position.y=.92);
    const gun=this.mesh(data.gun);gun.position.set(.22,1.2,.43);root.add(gun);root.userData.gun=gun;
    return root;
  }
  bug(scale=1,kind='mob',fly=false,species=0){
    const key='dbug'+kind+(fly?'fly':'')+species;
    if(!this.cache.has(key)){
      const C=BUG_COLORS[species]||BUG_COLORS[0],CD=shade(C,.55),CL=mix(C,0xffe6c0,.25),U=0x2a2026,bone=0xe6d6ae,eye=0xff2a14,gold=0xf2c14e;
      const big=kind==='boss'||kind==='queen',b=[],legs=[],wings=[],pivot=.9;
      this.part(b,'sphere',C,[0,.98,-.6],[.7,.56,.82]);
      for(let i=0;i<4;i++)this.part(b,'sphere',CD,[0,1.25+(i===0?.04:0)-i*.03,-.18-i*.28],[.6-i*.06,.17,.15]);
      this.part(b,'sphere',U,[0,.78,-.55],[.6,.38,.72]);
      this.part(b,'sphere',C,[0,.98,.22],[.46,.4,.46]);this.part(b,'sphere',CL,[0,1.18,.22],[.36,.18,.36]);
      this.part(b,'sphere',C,[0,.94,.78],[.36,.31,.36]);this.part(b,'sphere',CD,[0,1.12,.72],[.26,.12,.26]);
      for(const s of [-1,1]){
        this.part(b,'sphere',eye,[s*.15,1.02,1.08],[.075,.075,.05],[0,0,0],1);
        this.part(b,'sphere',eye,[s*.27,.97,1.0],[.045,.045,.035],[0,0,0],1);
        this.part(b,'cone',bone,[s*.16,.78,1.17],[.07*(big?1.4:1),.42*(big?1.3:1),.07*(big?1.4:1)],[Math.PI/2.1,0,-s*.45]);
      }
      [[0,1.48,-.3],[0,1.4,-.75],[0,1.26,-1.1]].forEach(p=>this.part(b,'cone',bone,p,[.08,.3,.08],[-.5,0,0]));
      this.part(b,'cone',CD,[0,.9,-1.42],[.12,.4,.12],[-Math.PI/2,0,0]);
      if(kind==='elite'||kind==='miniboss')for(let i=-1;i<=1;i++)this.part(b,'cone',gold,[i*.2,1.36-Math.abs(i)*.06,.6],[.07,.32,.07],[-.3,0,-i*.4],.25);
      if(kind==='miniboss')for(const s of [-1,1])this.part(b,'sphere',CD,[s*.42,1.12,.2],[.22,.16,.3]);
      if(big){
        for(let i=-2;i<=2;i++)this.part(b,'cone',gold,[i*.13,1.28-Math.abs(i)*.05,.86],[.06,.42-Math.abs(i)*.08,.06],[-.25,0,-i*.3],.35);
        for(const s of [-1,1])this.part(b,'cylinder',0xff7a2a,[s*.3,1.33,-.5],[.07,.08,.07],[0,0,0],1);
      }
      if(kind==='queen'){
        this.part(b,'sphere',mix(C,0xff6080,.4),[0,1.15,-1.75],[1.0,.82,1.25],[0,0,0],.35);
        for(let i=0;i<5;i++)this.part(b,'sphere',0xff9a5a,[Math.sin(i*1.3)*.5,1.5+Math.cos(i*2.1)*.2,-1.4-i*.22],[.12,.12,.12],[0,0,0],1);
      }
      for(const s of [-1,1]){
        const l=[];
        for(const [z,splay] of [[.5,.5],[.1,.05],[-.3,-.45]]){
          const hipP=[s*.42,.95-pivot,z],knee=[s*1.0,1.28-pivot,z+splay*.5],foot=[s*1.32,.03-pivot,z+splay];
          this.segment(l,CD,hipP,knee,.075);this.segment(l,CD,knee,foot,.055);this.part(l,'cone',bone,[foot[0],foot[1]+.05,foot[2]],[.05,.14,.05],[Math.PI,0,0]);
        }
        legs.push(this.merged(l));
        if(fly){const w=[];this.part(w,'sphere',0x9fe8ff,[s*.95,0,-.1],[.95,.05,.42],[0,s*.3,0],.4);wings.push(this.merged(w));}
      }
      this.cache.set(key,{body:this.merged(b),legs,wings});
    }
    const data=this.cache.get(key),root=this.root('bug',data.body,data.legs,1.75);
    root.userData.toy.feet.forEach(m=>m.position.y=.9);
    if(data.wings.length){root.userData.toy.wings=data.wings.map(g=>{const m=this.mesh(g);m.position.set(0,1.35,.05);root.add(m);return m;});}
    root.scale.setScalar(scale);root.userData.toy.fly=fly;return root;
  }
  mech(){
    const key='dmech';
    if(!this.cache.has(key)){
      const O=0x56623f,OD=0x343c28,T=0x8f9cab,D=0x1c2228,glass=0x63e9ff,hip=2.1,b=[],legs=[],gun=[];
      this.part(b,'box',OD,[0,2.15,0],[1.2,.35,.9]);
      this.part(b,'box',O,[0,2.75,0],[1.6,1.0,1.25]);this.part(b,'box',shade(O,1.2),[0,3.3,-.05],[1.4,.14,1.1]);
      this.part(b,'box',glass,[0,2.95,.64],[.9,.34,.06],[0,0,0],1);
      this.part(b,'box',D,[0,2.62,.64],[1.1,.2,.06]);
      for(const s of [-1,1]){this.part(b,'box',O,[s*1.0,2.95,0],[.42,.56,.8]);this.part(b,'box',0xe0b040,[s*1.0,3.25,.32],[.3,.06,.12]);
        this.part(b,'box',D,[s*1.0,2.95,-.55],[.3,.3,.3]);this.part(b,'cylinder',0xffa040,[s*.45,2.5,-.66],[.1,.12,.1],[Math.PI/2,0,0],.9);
        const l=[];
        this.part(l,'box',OD,[s*.5,1.65-hip,0],[.42,.8,.5]);this.part(l,'box',O,[s*.5,1.25-hip,.18],[.36,.22,.2]);
        this.part(l,'box',O,[s*.5,.7-hip,0],[.38,.95,.44]);this.part(l,'box',D,[s*.5,.12-hip,.12],[.5,.24,.86]);
        legs.push(this.merged(l));
      }
      this.segment(b,T,[-.5,3.35,-.4],[-.5,4.1,-.45],.03);this.part(b,'sphere',0xff4030,[-.5,4.12,-.45],[.06,.06,.06],[0,0,0],1);
      this.part(gun,'box',D,[0,0,0],[.36,.36,1.1]);this.part(gun,'cylinder',T,[-.1,0,.75],[.07,.6,.07],[Math.PI/2,0,0]);this.part(gun,'cylinder',T,[.1,0,.75],[.07,.6,.07],[Math.PI/2,0,0]);
      this.part(gun,'box',glass,[0,.2,.2],[.1,.06,.3],[0,0,0],1);
      this.cache.set(key,{body:this.merged(b),legs,gun:this.merged(gun)});
    }
    const data=this.cache.get(key),root=this.root('soldier',data.body,data.legs,4.2);
    root.userData.toy.feet.forEach(m=>m.position.y=2.1);
    const gun=this.mesh(data.gun);gun.position.set(1.05,2.75,.43);root.add(gun);root.userData.gun=gun;
    root.userData.turret=new THREE.Group();return root;
  }
  animate(root,dt,state,camera){
    super.animate(root,dt,state,camera);
    const a=root&&root.userData.toy;if(!a||!a.wings)return;
    const flap=Math.sin(a.time*30)*.55;a.wings[0].rotation.z=.25+flap;a.wings[1].rotation.z=-.25-flap;
  }
  restyle(root){
    const colors=new Map([[0xf6dfae,0x7a8796],[0x53b4ae,0x3e8f96],[0xf5b957,0xc8953f],[0x8899aa,0x6d7b8c],[0x667788,0x4b5866],[0x88aacc,0x7f98b5],[0x77879a,0x5f6d7d],[0x5c6b7d,0x46525f],[0x7c8aa0,0x6a788a],[0x9aa8ba,0x7d8ea3],[0x2a5d3a,0x24442f],[0x222222,0x1c2228],[0x111111,0x161b20]]);
    root.traverse(o=>{if(!o.isMesh||!(o.material&&o.material.isMeshLambertMaterial)||o.material.vertexColors||o.userData.keepMaterial)return;
      const old=o.material,color=colors.get(old.color.getHex())||old.color.getHex();
      o.material=new THREE.MeshPhongMaterial({color,shininess:18,specular:0x2a3038,transparent:old.transparent,opacity:old.opacity,side:old.side});
      if(o.geometry.type==='BoxGeometry'){
        const {width:w,height:h,depth:d}=o.geometry.parameters,r=Math.min(w,h,d,.65)*.12;
        if(r>.025){const key=`dbox-${w}-${h}-${d}`;if(!this.cache.has(key)){
          const shape=new THREE.Shape();shape.moveTo(-w/2+r,-h/2+r);shape.lineTo(w/2-r,-h/2+r);shape.lineTo(w/2-r,h/2-r);shape.lineTo(-w/2+r,h/2-r);shape.closePath();
          const g=new THREE.ExtrudeGeometry(shape,{depth:d-2*r,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:r,bevelThickness:r});g.translate(0,0,-d/2+r);g.computeVertexNormals();this.cache.set(key,g);
        }o.geometry=this.cache.get(key);}
      }
    });return root;
  }
  environment(terrainH){
    const scene=this.scene,P=this.palette;
    scene.background=new THREE.Color(P.sky);scene.fog=new THREE.Fog(P.fog,P.fogNear,P.fogFar);
    scene.traverse(o=>{
      if(o.isHemisphereLight){o.color.set(0x9db4e6);o.groundColor.set(0x2c2b22);o.intensity=.62;}
      if(o.isDirectionalLight){o.color.set(0xffe9cc);o.intensity=1.35;}
      if(o.isPointLight)this.pointLights.push(o);
    });
    this.restyle(scene);this.quality=this._quality;
    const sky=new THREE.Mesh(new THREE.SphereGeometry(820,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
      vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec3 p;void main(){vec3 n=normalize(p);float h=n.y;vec3 c=mix(vec3(.10,.16,.27),vec3(.015,.03,.075),smoothstep(-.02,.55,h));c+=vec3(.05,.12,.14)*exp(-abs(h)*14.)*(.6+.4*sin(atan(n.x,n.z)*3.));gl_FragColor=vec4(c,1.);}'
    }));sky.renderOrder=-2;scene.add(sky);
    const sp=[],sc=[];for(let i=0;i<1100;i++){const a=Math.random()*Math.PI*2,e=Math.random()*1.35+.08,r=760;sp.push(Math.cos(a)*Math.cos(e)*r,Math.sin(e)*r,Math.sin(a)*Math.cos(e)*r);const k=.6+Math.random()*.4;sc.push(k*.8,k*.9,k);}
    const starG=new THREE.BufferGeometry();starG.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));starG.setAttribute('color',new THREE.Float32BufferAttribute(sc,3));
    scene.add(new THREE.Points(starG,new THREE.PointsMaterial({vertexColors:true,size:1.7,sizeAttenuation:false,fog:false,depthWrite:false})));
    const planet=new THREE.Group();
    planet.add(new THREE.Mesh(new THREE.SphereGeometry(70,32,24),new THREE.MeshBasicMaterial({color:0xd8c9a0,fog:false})));
    const shadow=new THREE.Mesh(new THREE.SphereGeometry(70.6,32,24,0,Math.PI),new THREE.MeshBasicMaterial({color:0x1b2233,transparent:true,opacity:.55,fog:false,depthWrite:false}));shadow.rotation.y=-.9;planet.add(shadow);
    const ring=new THREE.Mesh(new THREE.RingGeometry(92,128,64),new THREE.MeshBasicMaterial({color:0xb7a982,transparent:true,opacity:.42,side:THREE.DoubleSide,fog:false,depthWrite:false}));ring.rotation.set(1.25,.2,0);planet.add(ring);
    planet.position.set(-260,230,640);planet.lookAt(0,0,0);scene.add(planet);
    const moon=new THREE.Mesh(new THREE.SphereGeometry(16,20,14),new THREE.MeshBasicMaterial({color:0x9fb0c8,fog:false}));moon.position.set(330,280,520);scene.add(moon);
    const dummy=new THREE.Object3D();
    const batch=(geo,mat,items)=>{const m=new THREE.InstancedMesh(geo,mat,items.length);items.forEach((v,i)=>{dummy.position.set(...v[0]);dummy.scale.set(...v[1]);dummy.rotation.set(0,i*1.37,0);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});m.receiveShadow=true;scene.add(m);return m;};
    // Jagged silhouette ring marks the playable edge without a visible wall of fog.
    const peaks=[];
    for(let i=0;i<38;i++){const z=-90+i*12;peaks.push([[-158-Math.sin(i*2.3)*10,0,z],[16,26+Math.sin(i*1.7)*12,15]],[[158+Math.cos(i*1.9)*10,0,z],[16,24+Math.cos(i*1.3)*12,15]]);}
    for(let i=0;i<28;i++){const x=-160+i*12;peaks.push([[x,0,372+Math.sin(i*1.4)*10],[16,30+Math.sin(i*2.1)*14,15]]);}
    batch(new THREE.DodecahedronGeometry(1,0),new THREE.MeshLambertMaterial({color:0x232c38,flatShading:true}),peaks);
    const lamps=[];for(let i=0;i<10;i++){const z=-12+i*2.2;lamps.push([[-6.6,terrainH(-6.6,z)+.2,z],[.16,.16,.16]],[[6.6,terrainH(6.6,z)+.2,z],[.16,.16,.16]]);}
    batch(this.sphere,new THREE.MeshBasicMaterial({color:0xffc35a}),lamps);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,2,32,32,31);g.addColorStop(0,'rgba(0,0,0,.45)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
    this.contactGeometry=new THREE.PlaneGeometry(2,2);this.contactMaterial=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false});
  }
}
