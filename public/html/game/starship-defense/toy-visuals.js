import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

// Original toy-like models. Shared vertex-colour meshes keep each creature to
// three animated parts, without a skeleton, texture downloads or per-part draws.
export class ToyVisuals {
  constructor(_, scene) {
    this.scene=scene;this.quality='high';this.corpses=[];this.cache=new Map();
    this.material=new THREE.MeshPhongMaterial({vertexColors:true,shininess:32,specular:0x343c40});
    this.sphere=new THREE.SphereGeometry(1,16,12);
    this.box=new THREE.BoxGeometry(1,1,1);
    this.cylinder=new THREE.CylinderGeometry(1,1,1,12);
    this.cone=new THREE.ConeGeometry(1,1,10);
    this.dummy=new THREE.Object3D();
  }
  async load() {}
  part(list,shape,color,p,s,r=[0,0,0]) {
    const g=this[shape].clone(),d=this.dummy;
    d.position.set(...p);d.scale.set(...s);d.rotation.set(...r);d.updateMatrix();g.applyMatrix4(d.matrix);
    const c=new THREE.Color(color),a=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}
    g.setAttribute('color',new THREE.BufferAttribute(a,3));list.push(g);
  }
  merged(list) {const g=mergeGeometries(list,false);list.forEach(x=>x.dispose());return g;}
  mesh(g){const m=new THREE.Mesh(g,this.material);m.castShadow=true;return m;}
  root(kind,bodyGeometry,limbs,height=2.4){
    const root=new THREE.Group(),body=this.mesh(bodyGeometry);root.add(body);
    const feet=limbs.map(g=>{const m=this.mesh(g);root.add(m);return m;});
    root.userData.toy={kind,body,feet,time:Math.random()*6,elapsed:0};
    root.userData.worlds=true;root.userData.visualHeight=height;
    root.userData.legs=[];root.userData.legGroup=[];
    if(this.contactMaterial){const m=new THREE.Mesh(this.contactGeometry,this.contactMaterial);m.rotation.x=-Math.PI/2;m.position.y=.035;m.scale.set(kind==='bug'?1.5:.85,kind==='bug'?1.2:.85,1);root.add(m);}
    return root;
  }
  soldier(color=0x40b6cf){
    // Roles use distinct friendly colours; navy joints and ivory armour unify them.
    const palette={0x4488ff:0x46b8dc,0xd5d53a:0xf2bd57,0xd53a8a:0xe781a4,0x3ad5d5:0x45cbb8,0xff8833:0xf3a159};
    color=palette[color]||color;
    const key='soldier'+color;
    if(!this.cache.has(key)){
      const b=[],legs=[],gun=[],navy=0x29465d,white=0xfff4d9;
      this.part(b,'sphere',color,[0,1.03,0],[.48,.55,.32]);
      this.part(b,'sphere',white,[0,1.12,.27],[.31,.33,.12]);
      this.part(b,'box',navy,[0,.65,0],[.65,.18,.42]);
      this.part(b,'sphere',color,[0,1.94,0],[.66,.61,.55]);
      this.part(b,'sphere',white,[0,1.89,.24],[.58,.48,.39]);
      this.part(b,'sphere',navy,[0,1.99,.60],[.49,.28,.14]);
      for(const s of [-1,1]){
        this.part(b,'sphere',0x94f5ed,[s*.19,2.01,.741],[.055,.095,.025]);
        this.part(b,'sphere',color,[s*.62,1.35,0],[.24,.25,.25]);
        this.part(b,'sphere',white,[s*.56,1.05,.22],[.19,.29,.2],[-.4,0,s*.15]);
        this.part(b,'sphere',navy,[s*.49,.92,.41],[.18,.17,.18]);
        this.part(b,'sphere',0xf1b953,[s*.63,1.91,0],[.09,.21,.22]);
        const l=[];
        this.part(l,'sphere',navy,[s*.25,.37,0],[.18,.3,.17]);
        this.part(l,'sphere',white,[s*.25,.18,.11],[.24,.19,.32]);legs.push(this.merged(l));
      }
      this.part(b,'box',0xe8a34b,[0,1.13,.4],[.14,.14,.035]);
      this.part(b,'sphere',navy,[0,1.1,-.34],[.33,.37,.18]);
      this.part(b,'cylinder',white,[0,2.52,0],[.065,.14,.065]);
      this.part(b,'sphere',0xf2b94d,[0,2.62,0],[.105,.105,.105]);
      this.part(gun,'sphere',navy,[0,0,0],[.19,.2,.43]);
      this.part(gun,'box',white,[0,.07,.05],[.27,.19,.44]);
      this.part(gun,'cylinder',color,[0,0,.47],[.115,.35,.115],[Math.PI/2,0,0]);
      this.part(gun,'cylinder',navy,[0,0,.66],[.08,.035,.08],[Math.PI/2,0,0]);
      this.cache.set(key,{body:this.merged(b),legs,gun:this.merged(gun)});
    }
    const data=this.cache.get(key),root=this.root('soldier',data.body,data.legs,2.72);
    const gun=this.mesh(data.gun);gun.position.set(.36,1.06,.43);root.add(gun);root.userData.gun=gun;
    return root;
  }
  bug(scale=1,kind='mob',fly=false,species=0){
    const key=kind+(fly?'fly':'')+species;
    if(!this.cache.has(key)){
      const palette=[0xed8562,0xa9cb62,0xa694ce,0x65bed0,0xf39b56,0xb9bd64,0x789cdb,0xa395bd,0x9ab2b7,0xda8ca9];
      const b=[],legs=[],shell=palette[species]||palette[0];
      const dark=0x553d56,cream=0xffe8b1;
      this.part(b,'sphere',dark,[0,.53,-.1],[.77,.38,.93]);
      // Two glossy shell halves and a contrasting seam make the silhouette legible.
      for(const s of [-1,1]){
        this.part(b,'sphere',shell,[s*.33,.88,-.2],[.43,.53,.89],[0,0,s*-.09]);
        this.part(b,'sphere',cream,[s*.39,1.29,-.29],[.14,.055,.2],[0,0,s*-.35]);
        this.part(b,'sphere',cream,[s*.56,1.1,.12],[.095,.045,.13],[0,0,s*-.65]);
        this.part(b,'sphere',cream,[s*.25,.79,.98],[.21,.23,.16]);
        this.part(b,'sphere',dark,[s*.25,.81,1.117],[.09,.12,.055]);
        this.part(b,'sphere',0xffffff,[s*.23,.86,1.164],[.029,.033,.018]);
        this.part(b,'cone',cream,[s*.31,.37,1.03],[.12,.36,.12],[.9,0,-s*.3]);
        this.part(b,'cylinder',dark,[s*.32,1.14,.66],[.04,.44,.04],[.3,0,-s*.45]);
        this.part(b,'sphere',shell,[s*.43,1.34,.72],[.1,.1,.1]);
        const l=[];
        for(let j=0;j<3;j++){
          const z=(j-1)*.6;
          this.part(l,'sphere',dark,[s*.79,.47,z],[.42,.12,.14],[0,s*(j-1)*-.2,s*.45]);
          this.part(l,'sphere',dark,[s*1.08,.21,z+.06],[.12,.29,.13],[0,0,s*-.25]);
          this.part(l,'sphere',shell,[s*1.1,.09,z+.13],[.18,.095,.23]);
        }
        legs.push(this.merged(l));
        if(fly)this.part(b,'sphere',0xd4f1e2,[s*.95,1.05,-.25],[.82,.075,.44],[0,s*.35,s*.12]);
      }
      this.part(b,'sphere',shell,[0,.64,.64],[.5,.4,.4]);
      // Face details must sit in front of the head.
      if(kind==='boss'||kind==='miniboss'||kind==='elite')for(let i=-1;i<=1;i++)this.part(b,'cone',0xf9cb62,[i*.32,1.6-Math.abs(i)*.1,-.23],[.17,.5,.17],[0,0,-i*.25]);
      this.cache.set(key,{body:this.merged(b),legs});
    }
    const data=this.cache.get(key),root=this.root('bug',data.body,data.legs,1.7);
    root.scale.setScalar(scale);root.userData.toy.fly=fly;return root;
  }
  mech(){const root=this.soldier(0x65c5b2);root.scale.setScalar(1.7);root.userData.visualHeight=2.72;root.userData.turret=new THREE.Group();return root;}
  animate(root,dt,state,camera){
    const a=root?.userData.toy;if(!a)return;a.elapsed+=dt;
    const distance=root.position.distanceToSquared(camera.position);
    if(a.elapsed<(distance<900?1/60:distance<4225?1/24:1/12))return;
    a.time+=a.elapsed;a.elapsed=0;const moving=state==='Walk'||state==='Run',t=a.time;
    a.body.position.y=Math.sin(t*(moving?11:3))*(moving?.045:.018);
    a.body.rotation.z=Math.sin(t*9)*(moving?.045:.008);
    a.body.rotation.x=state==='Attack'?Math.sin(t*15)*.13:0;
    a.feet.forEach((m,i)=>{m.rotation.x=moving?Math.sin(t*(a.kind==='bug'?13:10)+i*Math.PI)*.35:0;});
    if(root.userData.gun)root.userData.gun.position.z=.43+Math.sin(t*11)*(moving?.035:0);
    for(const mesh of [a.body,...a.feet])mesh.castShadow=this.quality==='high'&&distance<2025;
  }
  release(root){root?.traverse(o=>{if(o.isSprite){o.material.map?.dispose();o.material.dispose();}else if(o.isMesh&&o.material!==this.material&&o.material!==this.contactMaterial&&o.material.transparent){o.material.dispose();}});}
  death(root){
    if(!root?.userData.toy)return false;
    while(this.corpses.length>=8){const c=this.corpses.shift();this.release(c.root);c.root.removeFromParent();}
    root.children.filter(o=>o.isSprite).forEach(o=>{o.material.map?.dispose();o.material.dispose();root.remove(o);});
    root.userData.corpse=true;this.corpses.push({root,life:.75,scale:root.scale.x});return true;
  }
  update(dt){for(let i=this.corpses.length-1;i>=0;i--){const c=this.corpses[i];c.life-=dt;c.root.rotation.z+=(Math.PI/2-c.root.rotation.z)*Math.min(1,dt*16);if(c.life<.25)c.root.scale.setScalar(c.scale*Math.max(0,c.life/.25));if(c.life<=0){this.release(c.root);c.root.removeFromParent();this.corpses.splice(i,1);}}}
  clearCorpses(){for(const c of this.corpses){this.release(c.root);c.root.removeFromParent();}this.corpses.length=0;}
  restyle(root){
    const colors=new Map([[0x8899aa,0xf2e8d0],[0x667788,0x398b9e],[0x556677,0x337c8c],[0x7788aa,0xffeacf],[0x664433,0x478d91],[0x996644,0xf5ba64],[0x332211,0x29485a],[0x445566,0x448d9b],[0x3d4a5c,0x337b8e],[0x6688aa,0xefeee0],[0x223344,0x29485a],[0x777f66,0xece6ce],[0x99a077,0x63b7b5],[0x88aacc,0xffefd3],[0x77879a,0xf8ebcf],[0x5c6b7d,0x4ea6af],[0x7c8aa0,0x4fa3af],[0x9aa8ba,0x68adb3],[0x99aabb,0xffefd3],[0x778899,0xf1e7d0],[0x2a5d3a,0x5fb69b],[0x6d5a35,0xdb8a53],[0x8a6d3b,0xedb363],[0x222222,0x314753],[0x111111,0x314753]]);
    root.traverse(o=>{if(!o.isMesh||!o.material?.isMeshLambertMaterial||o.material.vertexColors)return;
      const old=o.material,color=colors.get(old.color.getHex())||old.color.getHex();
      o.material=new THREE.MeshPhongMaterial({color,shininess:22,specular:0x273b40,transparent:old.transparent,opacity:old.opacity,side:old.side});
      // Round the silhouette through bevelled geometry, retaining exact dimensions.
      if(o.geometry.type==='BoxGeometry'){
        const {width:w,height:h,depth:d}=o.geometry.parameters,r=Math.min(w,h,d,.65)*.16;
        if(r>.025){const key=`box-${w}-${h}-${d}`;if(!this.cache.has(key)){
          const shape=new THREE.Shape();shape.moveTo(-w/2+r,-h/2+r);shape.lineTo(w/2-r,-h/2+r);shape.lineTo(w/2-r,h/2-r);shape.lineTo(-w/2+r,h/2-r);shape.closePath();
          const g=new THREE.ExtrudeGeometry(shape,{depth:d-2*r,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:r,bevelThickness:r});g.translate(0,0,-d/2+r);g.computeVertexNormals();this.cache.set(key,g);
        }o.geometry=this.cache.get(key);}
      }
    });return root;
  }
  environment(terrainH){
    const scene=this.scene;scene.background=new THREE.Color(0xb5e3e6);scene.fog=new THREE.Fog(0xc5e3d9,100,235);
    const lights=[];scene.traverse(o=>{if(o.isPointLight)lights.push(o);if(o.isPoints)o.visible=false;
      if(o.isHemisphereLight){o.color.set(0xdaf5ff);o.groundColor.set(0xa39b77);o.intensity=.8;}
      if(o.isDirectionalLight){o.color.set(0xffedd2);o.intensity=1.15;o.position.set(-35,65,20);}
    });lights.forEach(o=>o.removeFromParent());this.restyle(scene);
    const sky=new THREE.Mesh(new THREE.SphereGeometry(400,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,
      vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec3 p;void main(){float h=normalize(p).y;gl_FragColor=vec4(mix(vec3(.76,.88,.80),vec3(.24,.65,.79),smoothstep(-.05,.8,h)),1.);}'
    }));sky.renderOrder=-1;scene.add(sky);
    const dummy=new THREE.Object3D();
    const batch=(geo,color,items)=>{const m=new THREE.InstancedMesh(geo,new THREE.MeshPhongMaterial({color,shininess:4,flatShading:true}),items.length);items.forEach((v,i)=>{dummy.position.set(...v[0]);dummy.scale.set(...v[1]);dummy.rotation.set(0,i*1.37,0);dummy.updateMatrix();m.setMatrixAt(i,dummy.matrix);});m.receiveShadow=true;scene.add(m);return m;};
    batch(new THREE.DodecahedronGeometry(1,0),0x85bfa8,Array.from({length:24},(_,i)=>[[-140+i*12,0,205+Math.sin(i*1.7)*12],[13,13+Math.sin(i)*7,12]]));
    // Puffy clouds are geometry, not a sky photograph.
    batch(new THREE.SphereGeometry(1,12,8),0xfff7dd,Array.from({length:27},(_,i)=>{const k=Math.floor(i/3);return[[-140+k*36+(i%3)*6,38+Math.sin(k*2)*8,165+Math.sin(k)*30],[8,3.5+(i%3)*1.1,4]];}));
    // Flower clumps and mint shrubs are instanced; keep the central firing lane clear.
    const stems=[],flowers=[],shrubs=[];
    for(let i=0;i<160;i++){const x=Math.sin(i*127.1)*72,z=14+(i*17.13)%170;if(Math.abs(x)<8)continue;const y=terrainH(x,z);stems.push([[x,y+.2,z],[.12,.4,.12]]);flowers.push([[x,y+.43,z],[.23,.15,.23]]);if(i%4===0)shrubs.push([[x+1,y+.3,z],[.7,.55,.6]]);}
    batch(new THREE.CylinderGeometry(1,1,1,5),0x508b67,stems);batch(new THREE.IcosahedronGeometry(1,0),0xffdf88,flowers);batch(new THREE.IcosahedronGeometry(1,0),0x4fae8b,shrubs);
    // Crisp runway markers guide the player through the only ramp.
    const marks=[];for(let i=0;i<14;i++){const z=-12+i*2.4;marks.push([[-5.4,terrainH(-5.4,z)+.17,z],[.24,.14,.4]],[[5.4,terrainH(5.4,z)+.17,z],[.24,.14,.4]]);}batch(this.sphere,0xffd884,marks);
    // Base-front teal panels and cream posts establish a coherent toy fortress.
    const panels=[];for(let i=0;i<12;i++){const x=(i<6?-1:1)*(12+(i%6)*3.25);panels.push([[x,6.15,-15.42],[2.5,.48,.16]]);}batch(this.box,0x55a5b0,panels);
    const windows=[];for(let i=0;i<8;i++){const a=i*Math.PI/4;windows.push([[-12+Math.sin(a)*3.1,9.1,-42+Math.cos(a)*3.1],[.56,.65,.56]]);}batch(this.sphere,0x347c97,windows);
    const detail=[];
    for(let i=0;i<5;i++)detail.push([[-15.1,5.1,-41+i*1.2],[.12,.1,.7]]);
    batch(this.box,0xffcc69,detail);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,2,32,32,31);g.addColorStop(0,'rgba(29,55,50,.3)');g.addColorStop(1,'rgba(29,55,50,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);
    this.contactGeometry=new THREE.PlaneGeometry(2,2);this.contactMaterial=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false});
  }
}
