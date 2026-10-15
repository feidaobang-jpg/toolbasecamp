import * as THREE from './vendor/three.module.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

// Shared mesh assembly, animation and corpse lifecycle for battlefield units.
export class UnitVisuals {
  constructor(_, scene) {
    this.scene=scene;this.quality='high';this.corpses=[];this.cache=new Map();
    this.box=new THREE.BoxGeometry(1,1,1);
    this.cone=new THREE.ConeGeometry(1,1,10);
    this.dummy=new THREE.Object3D();
  }
  async load() {}
  merged(list) {const g=mergeGeometries(list,false);list.forEach(x=>x.dispose());return g;}
  mesh(g){const m=new THREE.Mesh(g,this.material);m.castShadow=true;return m;}
  root(kind,bodyGeometry,limbs,height=2.4){
    const root=new THREE.Group(),body=this.mesh(bodyGeometry);root.add(body);
    const feet=limbs.map(g=>{const m=this.mesh(g);root.add(m);return m;});
    // Historical rig field, also used by gameplay and QA; independent of art style.
    root.userData.toy={kind,body,feet,time:Math.random()*6,elapsed:0};
    root.userData.worlds=true;root.userData.visualHeight=height;
    root.userData.legs=[];root.userData.legGroup=[];
    if(this.contactMaterial){const m=new THREE.Mesh(this.contactGeometry,this.contactMaterial);m.rotation.x=-Math.PI/2;m.position.y=.035;m.scale.set(kind==='bug'?1.5:.85,kind==='bug'?1.2:.85,1);root.add(m);}
    return root;
  }
  animate(root,dt,state,camera){
    const a=root&&root.userData.toy;if(!a)return;a.elapsed+=dt;
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
  release(root){if(root)root.traverse(o=>{if(o.isSprite){if(o.material.map)o.material.map.dispose();o.material.dispose();}else if(o.isMesh&&o.material!==this.material&&o.material!==this.contactMaterial&&o.material.transparent){o.material.dispose();}});}
  death(root){
    if(!root||!root.userData.toy)return false;
    while(this.corpses.length>=8){const c=this.corpses.shift();this.release(c.root);c.root.removeFromParent();}
    root.children.filter(o=>o.isSprite).forEach(o=>{if(o.material.map)o.material.map.dispose();o.material.dispose();root.remove(o);});
    root.userData.corpse=true;this.corpses.push({root,life:.75,scale:root.scale.x});return true;
  }
  update(dt){for(let i=this.corpses.length-1;i>=0;i--){const c=this.corpses[i];c.life-=dt;c.root.rotation.z+=(Math.PI/2-c.root.rotation.z)*Math.min(1,dt*16);if(c.life<.25)c.root.scale.setScalar(c.scale*Math.max(0,c.life/.25));if(c.life<=0){this.release(c.root);c.root.removeFromParent();this.corpses.splice(i,1);}}}
  clearCorpses(){for(const c of this.corpses){this.release(c.root);c.root.removeFromParent();}this.corpses.length=0;}
}
