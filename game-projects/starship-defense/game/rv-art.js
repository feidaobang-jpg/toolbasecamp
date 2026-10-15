import {mergeGeometries} from './vendor/BufferGeometryUtils.js';

// Shared geometry with vertex colours keeps detailed vehicle/zombie models cheap
// enough for the existing mobile renderer; this module has no gameplay state.
export function partBuilder(T){
  const parts=[];
  return {
    box(w,h,d,x,y,z,color,rotation=0){
      let geo;
      if(Math.min(w,h,d)>.35&&w*h*d>.1){
        const bevel=Math.min(.055,w*.06,h*.06,d*.06),shape=new T.Shape(),x0=w/2-bevel,y0=h/2-bevel;
        shape.moveTo(-x0,-y0);shape.lineTo(x0,-y0);shape.lineTo(x0,y0);shape.lineTo(-x0,y0);shape.closePath();
        geo=new T.ExtrudeGeometry(shape,{depth:d-2*bevel,steps:1,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1});geo.translate(0,0,-d/2+bevel);
      }else geo=new T.BoxGeometry(w,h,d).toNonIndexed();
      geo.rotateZ(rotation);geo.translate(x,y,z);
      const c=new T.Color(color),a=new Float32Array(geo.attributes.position.count*3);
      for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b;}
      geo.setAttribute('color',new T.BufferAttribute(a,3));parts.push(geo);
    },
    mesh(material){const geo=mergeGeometries(parts);parts.forEach(g=>g.dispose());parts.length=0;const mesh=new T.Mesh(geo,material);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;}
  };
}

export function makeDetailedRV(T){
  const root=new T.Group();root.name='rv-armoured-expedition';
  const metal=new T.MeshPhongMaterial({vertexColors:true,shininess:42,specular:0x687480});
  const glass=new T.MeshPhongMaterial({color:0x73c8d5,emissive:0x0c3039,shininess:100,specular:0xb7f4ff});
  const glow=new T.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  const b=partBuilder(T),g=partBuilder(T),lamps=partBuilder(T);
  const steel=0x879ba8,edge=0xbac7c9,dark=0x283544,blue=0x416674,rust=0x775e4a;
  b.box(2.8,.48,6.2,0,.76,0,dark);b.box(2.7,2.25,4.8,0,2.02,-.6,steel);
  b.box(2.6,1.8,1.8,0,1.68,2.4,steel);b.box(2.48,.12,1.7,0,2.65,2.4,edge);
  b.box(2.75,.12,4.85,0,3.21,-.6,edge);b.box(2.78,.36,4.85,0,1.27,-.6,blue);
  b.box(2.36,.16,.12,0,2.51,3.32,dark);b.box(2.36,.14,.12,0,1.66,3.32,dark);
  b.box(.1,.72,.13,0,2.11,3.34,dark);g.box(2.22,.7,.07,0,2.1,3.32,0xffffff);
  for(const s of [-1,1]){
    b.box(.13,2.14,.12,s*1.31,2.04,-2.94,edge);b.box(.12,2.14,.12,s*1.31,2.04,1.75,edge);
    b.box(.07,.95,1.25,s*1.365,2.38,2.33,dark);g.box(.08,.75,1.06,s*1.41,2.39,2.33,0xffffff);
    for(const z of [-1.5,.25]){b.box(.08,.8,1.1,s*1.37,2.39,z,dark);g.box(.085,.62,.9,s*1.42,2.4,z,0xffffff);}
    b.box(.09,1.75,1,s*1.38,1.96,-2.05,edge);b.box(.1,.08,.26,s*1.45,1.8,-1.72,dark);
    b.box(.2,.14,4.65,s*1.46,1.11,-.5,dark);b.box(.35,.14,.8,s*1.57,.98,1.5,edge);
    b.box(.4,.1,.13,s*1.47,2.16,3,edge);b.box(.12,.38,.35,s*1.7,2.28,3,dark);
    b.box(.6,.51,.18,s*.92,1.35,3.35,dark);lamps.box(.45,.32,.2,s*.92,1.38,3.46,0xffe5a7);
    lamps.box(.16,.2,.1,s*1.15,1.1,-3.04,0xf65b35);lamps.box(.14,.12,.1,s*1.08,3.29,1.82,0xffb657);
    b.box(.13,.15,5.25,s*1.12,3.5,-.52,dark);for(const z of [-2.5,-.5,1.5])b.box(.13,.26,.13,s*1.12,3.34,z,dark);
    // Solid fenders and metal hubs create readable wheel silhouettes.
    for(const z of [-2,2]){b.box(.38,.2,1.63,s*1.47,1.36,z,dark);b.box(.38,.46,.18,s*1.47,1.13,z-.73,dark);b.box(.38,.46,.18,s*1.47,1.13,z+.73,dark);}
    for(let i=0;i<5;i++)b.box(.03,.055,.22,s*1.435,1.53+i*.13,-.62,edge);
  }
  b.box(2.93,.24,.32,0,.88,3.49,dark);b.box(2.7,.14,.14,0,1.04,3.68,edge);
  b.box(1.04,.48,.1,0,1.32,3.38,dark);for(let i=0;i<4;i++)b.box(.9,.04,.05,0,1.15+i*.12,3.46,edge);
  b.box(1.5,.06,1.9,-.2,3.38,-.8,blue);for(let i=0;i<5;i++)b.box(1.48,.02,.025,-.2,3.418,-1.6+i*.39,edge);
  b.box(.72,.55,.85,.54,3.54,-2.05,rust);b.box(.76,.08,.09,.54,3.57,-2.05,dark);
  b.box(.12,2.1,.12,.73,2.02,-3.06,dark);b.box(.12,2.1,.12,1.15,2.02,-3.06,dark);
  for(let i=0;i<6;i++)b.box(.48,.065,.1,.94,1.05+i*.32,-3.13,edge);
  root.add(b.mesh(metal),g.mesh(glass),lamps.mesh(glow));
  const tyre=new T.MeshPhongMaterial({color:0x17232d,shininess:10}),hub=new T.MeshPhongMaterial({color:0x9cabb3,shininess:70});
  const tyreGeo=new T.CylinderGeometry(.68,.68,.42,12),hubGeo=new T.CylinderGeometry(.35,.35,.45,8);
  tyreGeo.rotateZ(Math.PI/2);hubGeo.rotateZ(Math.PI/2);
  const wheels=[];for(const s of [-1,1])for(const z of [-2,2]){const wheel=new T.Group();wheel.position.set(s*1.49,.68,z);const t=new T.Mesh(tyreGeo,tyre),h=new T.Mesh(hubGeo,hub);t.castShadow=true;h.castShadow=true;wheel.add(t,h);root.add(wheel);wheels.push(wheel);}
  const turret=new T.Group();turret.position.set(0,3.48,.6);root.add(turret);
  const tb=partBuilder(T);tb.box(.85,.34,.85,0,0,0,dark);tb.box(.45,.25,.7,0,.24,.42,blue);tb.box(.27,.32,.45,-.32,.2,.25,rust);turret.add(tb.mesh(metal));
  const gun=new T.Mesh(new T.BoxGeometry(.18,.18,1.65),tyre);gun.position.set(0,.22,.9);gun.castShadow=true;turret.add(gun);
  const headlights=[];for(const s of [-1,1]){const l=new T.SpotLight(0xffd49a,2.7,28,.44,.75,1.4);l.position.set(s*.92,1.45,3.55);l.target.position.set(s*1.8,.1,20);l.castShadow=false;root.add(l,l.target);headlights.push(l);}
  root.userData.turret=turret;root.userData.gun=gun;root.userData.rvArt={wheels,headlights};
  root.userData.dispose=()=>{const geos=new Set(),mats=new Set();root.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)mats.add(o.material);});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());};
  return root;
}

export function createRVAtmosphere(T,{scene,renderer,sun,hemi,sunOffset,skyObjects}){
  const saved={background:scene.background,fog:scene.fog,exposure:renderer.toneMappingExposure,sun:sun.color.clone(),sunPower:sun.intensity,hemi:hemi.color.clone(),ground:hemi.groundColor.clone(),hemiPower:hemi.intensity,offset:sunOffset.clone(),sky:skyObjects.map(o=>[o,o.visible])};
  skyObjects.forEach(o=>o.visible=false);
  const group=new T.Group();group.name='rv-sunset-atmosphere';scene.add(group);
  const skyMat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,fog:false,uniforms:{},
    vertexShader:'varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 direction;void main(){vec3 n=normalize(direction);float h=max(n.y,0.);vec3 c=mix(vec3(.68,.43,.34),vec3(.16,.25,.43),smoothstep(0.,.52,h));float a=dot(n,normalize(vec3(-.65,.33,.75)));c+=vec3(.7,.32,.10)*pow(max(a,0.),28.)*.5;float cloud=sin(n.x*24.+n.z*17.)*sin(n.z*32.-n.x*14.);c=mix(c,vec3(.45,.34,.4),smoothstep(.3,.7,cloud)*smoothstep(.06,.22,h)*(1.-smoothstep(.26,.5,h))*.32);gl_FragColor=vec4(c,1.);}'
  });
  const sky=new T.Mesh(new T.SphereGeometry(680,24,12),skyMat);sky.renderOrder=-4;group.add(sky);
  const fog=new T.Fog(0xa98b83,95,295);scene.fog=fog;
  const sunDisc=new T.Mesh(new T.SphereGeometry(13,16,10),new T.MeshBasicMaterial({color:0xffdfaa,fog:false,toneMapped:false}));sunDisc.position.set(-325,165,375);group.add(sunDisc);
  let oldPosition=null;
  return {
    update(dt,vehicle,quality){
      const p=vehicle.mesh.position;group.position.copy(p);scene.fog=fog;renderer.toneMappingExposure=1.08;
      sun.color.setHex(0xffbf80);sun.intensity=1.65;hemi.color.setHex(0x9cbee7);hemi.groundColor.setHex(0x55546a);hemi.intensity=.92;sunOffset.set(-65,45,75);
      const art=vehicle.mesh.userData.rvArt;if(art){const travel=oldPosition?p.distanceTo(oldPosition):0;for(const w of art.wheels)w.rotation.x+=travel/.68;for(const l of art.headlights)l.intensity=quality==='high'?2.7:1.5;}
      if(!oldPosition)oldPosition=new T.Vector3();oldPosition.copy(p);
    },
    dispose(){scene.remove(group);sky.geometry.dispose();skyMat.dispose();sunDisc.geometry.dispose();sunDisc.material.dispose();scene.background=saved.background;scene.fog=saved.fog;renderer.toneMappingExposure=saved.exposure;sun.color.copy(saved.sun);sun.intensity=saved.sunPower;hemi.color.copy(saved.hemi);hemi.groundColor.copy(saved.ground);hemi.intensity=saved.hemiPower;sunOffset.copy(saved.offset);saved.sky.forEach(([o,v])=>o.visible=v);}
  };
}
