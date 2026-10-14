import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone } from './vendor/SkeletonUtils.js';

// Geometry, textures and clips are shared; each actor owns its own skeleton.
export class WorldsVisuals {
  constructor(_, scene) { this.scene = scene; this.templates = {}; this.quality = 'high'; this.corpses=[]; }
  async load() {
    const loader = new GLTFLoader();
    await Promise.all(['roach', 'soldier', 'elite', 'queen', 'mech'].map(async name => {
      const asset = await loader.loadAsync(new URL(`./assets/${name}.glb`, import.meta.url).href);
      asset.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(asset.scene);
      const size = bounds.getSize(new THREE.Vector3());
      asset.scene.traverse(mesh => {
        if (!mesh.isMesh) return;
        mesh.frustumCulled = false; // Bind-pose bounds do not cover animated limbs.
        mesh.castShadow = true; mesh.receiveShadow = false;
        for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          mat.roughness = name === 'roach' ? .57 : .72;
          mat.metalness = name === 'roach' ? .08 : .22;
          if(name==='mech')mat.color.multiply(new THREE.Color(0x7a895a));
          if(name==='queen'&&!mat.map){mat.color.multiply(new THREE.Color(0x8c8a68));mat.roughness=.85;}
          if (mat.map) mat.map.anisotropy = 4;
        }
      });
      this.templates[name] = { asset, size, bounds };
    }));
  }
  actor(name, scale = 1) {
    const { asset, size, bounds } = this.templates[name];
    const root = new THREE.Group(), body = clone(asset.scene);
    const factor = name === 'soldier' ? 2.15 / size.y : name === 'mech' ? 4.2 / size.y : 2.85 / Math.max(size.x, size.z);
    body.scale.setScalar(factor);
    body.rotation.y = Math.PI; // Breachline's front is -Z; website actors face +Z.
    const center = bounds.getCenter(new THREE.Vector3());
    body.position.set(center.x * factor, -bounds.min.y * factor, center.z * factor);
    root.add(body); root.scale.setScalar(scale);root.userData.visualHeight=size.y*factor;
    const mixer = new THREE.AnimationMixer(body);
    const actions = new Map(asset.animations.map(clip => [clip.name, mixer.clipAction(clip)]));
    const idle = actions.get('Idle') || actions.values().next().value;
    idle?.play(); mixer.update(Math.random() * 2);
    const renderMeshes=[];body.traverse(mesh=>{if(mesh.isMesh)renderMeshes.push(mesh);});
    root.userData.worlds = { body, mixer, actions, renderMeshes, current: idle, time: Math.random() * .08, phase:Math.random() };
    if(this.contactMaterial){const shadow=new THREE.Mesh(new THREE.PlaneGeometry(name==='roach'?2.8:1.2,name==='roach'?2:1.2),this.contactMaterial);shadow.rotation.x=-Math.PI/2;shadow.position.y=.035;root.add(shadow);}
    // Legacy controller keeps these arrays; animation is driven by the real rig.
    root.userData.legs = []; root.userData.legGroup = [];
    if (name === 'soldier') {
      const gun = new THREE.Group();
      const metal = new THREE.MeshStandardMaterial({ color: 0x252c2b, roughness: .45, metalness: .7 });
      const polymer = new THREE.MeshStandardMaterial({ color: 0x333c32, roughness: .88 });
      const part = (geometry, material, x, y, z) => {
        const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); gun.add(mesh); return mesh;
      };
      part(new THREE.BoxGeometry(.13, .16, .48), metal, 0, 0, 0);
      part(new THREE.BoxGeometry(.12, .12, .3), polymer, 0, .005, -.32);
      part(new THREE.BoxGeometry(.1, .26, .12), metal, 0, -.15, -.02).rotation.x = -.2;
      part(new THREE.BoxGeometry(.08, .15, .1), polymer, 0, -.12, -.19).rotation.x = -.3;
      const barrel = part(new THREE.CylinderGeometry(.035, .035, .42, 8), metal, 0, .02, .43); barrel.rotation.x = Math.PI / 2;
      part(new THREE.BoxGeometry(.055, .06, .13), metal, 0, .11, .03);
      gun.position.set(.3, 1.28, .45);root.add(gun);root.userData.gun = gun;
    }
    return root;
  }
  bug(scale,kind='mob') { return this.actor(kind==='boss'?'queen':kind==='miniboss'||kind==='elite'?'elite':'roach', scale); }
  soldier() { return this.actor('soldier'); }
  mech(){const root=this.actor('mech');root.userData.turret=new THREE.Group();return root;}
  animate(root, dt, state, camera) {
    const actor = root?.userData.worlds;
    if (!actor) return;
    const next = actor.actions.get(state) || actor.actions.get('Walk') || actor.current;
    if (next && next !== actor.current) {
      next.reset();if(state==='Walk'||state==='Run')next.time=actor.phase;next.play(); actor.current?.crossFadeTo(next, .16, false);actor.current = next;
    }
    actor.time += dt;
    const distance = root.position.distanceToSquared(camera.position);
    const rate = distance < 28 * 28 ? 1 / 60 : distance < 65 * 65 ? 1 / 24 : 1 / 12;
    if (actor.time >= rate) { actor.mixer.update(actor.time); actor.time = 0; }
    for(const mesh of actor.renderMeshes)mesh.castShadow = this.quality === 'high' && distance < 50 * 50;
  }
  release(root){
    const actor=root?.userData.worlds;
    if(actor){actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.body);const seen=new Set();for(const mesh of actor.renderMeshes){if(mesh.skeleton&&!seen.has(mesh.skeleton)){seen.add(mesh.skeleton);mesh.skeleton.dispose();}}}
    // Only dispose actor-owned UI and weapon props; imported materials are shared.
    root?.traverse(mesh=>{if(mesh.isSprite){mesh.material.map?.dispose();mesh.material.dispose();}});
    const gun=root?.userData.gun;gun?.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose();}});
  }
  death(root){
    const actor=root?.userData.worlds;if(!actor)return false;
    while(this.corpses.length>=8){const old=this.corpses.shift();this.release(old.root);old.root.removeFromParent();}
    root.children.filter(child=>child.isSprite||child.geometry?.type==='OctahedronGeometry').forEach(child=>{if(child.isSprite){child.material.map?.dispose();child.material.dispose();}root.remove(child);});
    actor.mixer.stopAllAction();const action=actor.actions.get('Death');
    if(action){action.reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();}
    root.userData.corpse=true;this.corpses.push({root,life:1.8});return true;
  }
  update(dt){for(let i=this.corpses.length-1;i>=0;i--){const corpse=this.corpses[i];corpse.life-=dt;corpse.root.userData.worlds.mixer.update(dt);if(corpse.life<.5)corpse.root.scale.multiplyScalar(Math.max(.01,1-dt*5));if(corpse.life<=0){this.release(corpse.root);corpse.root.removeFromParent();this.corpses.splice(i,1);}}}
  clearCorpses(){for(const corpse of this.corpses){this.release(corpse.root);corpse.root.removeFromParent();}this.corpses.length=0;}
  environment(terrainH) {
    const scene = this.scene;
    scene.background = new THREE.Color(0x576b75);
    scene.fog = new THREE.Fog(0x738081, 85, 245);
    const rock = new THREE.TextureLoader().load(new URL('./assets/rock-diffuse.jpg', import.meta.url).href);
    rock.colorSpace = THREE.SRGBColorSpace;rock.wrapS = rock.wrapT = THREE.RepeatWrapping;rock.repeat.set(18, 24);rock.anisotropy = 4;
    const stone = rock.clone();stone.repeat.set(1,1);stone.needsUpdate = true;
    const staticLights = [];
    scene.traverse(object => {
      if (object.isPointLight) staticLights.push(object);
      if (object.isHemisphereLight) { object.color.set(0xc7d9e1);object.groundColor.set(0x4a4436);object.intensity = 1.5; }
      if (object.isDirectionalLight) { object.color.set(0xffe1b4);object.intensity = 2; }
      if (!object.isMesh || !object.material?.isMeshLambertMaterial) return;
      const old = object.material;
      const material = new THREE.MeshStandardMaterial({ color: old.color, vertexColors: old.vertexColors, roughness: .82, metalness: .08, side: old.side });
      if (object.geometry.type === 'PlaneGeometry' && object.geometry.attributes.position.count > 1000) {
        material.map = rock;material.color.set(0xb8b1a0);material.roughness = 1;
      } else if (object.geometry.type === 'DodecahedronGeometry') { material.map = stone; material.color.set(0x999a91); }
      object.material = material;
    });
    // Emissive bulbs keep their appearance without six full-scene light passes.
    for (const light of staticLights) light.removeFromParent();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12),new THREE.ShaderMaterial({
      side: THREE.BackSide,depthWrite:false,uniforms:{},
      vertexShader:'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec3 vPos;void main(){float h=normalize(vPos).y;vec3 col=mix(vec3(.56,.57,.50),vec3(.13,.24,.32),smoothstep(-.05,.8,h));float sun=pow(max(0.,dot(normalize(vPos),normalize(vec3(.5,.3,-.4)))),180.);col+=vec3(1.,.72,.40)*sun;gl_FragColor=vec4(col,1.);}'
    }));sky.renderOrder=-1;scene.add(sky);
    // Low draw-call rock ridges and dark openings establish a source of the swarm.
    const rockMaterial = new THREE.MeshStandardMaterial({ color:0x8a867a,map:stone,roughness:1 });
    const ridge = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),rockMaterial,22),dummy=new THREE.Object3D();
    for(let i=0;i<22;i++){
      const x=-110+i*10,z=193+Math.sin(i*2.31)*16;
      dummy.position.set(x,terrainH(x,z)-2,z);dummy.scale.set(9+Math.sin(i)*3,11+Math.cos(i*1.9)*5,11);dummy.rotation.set(0,i*1.7,.1*Math.sin(i));dummy.updateMatrix();ridge.setMatrixAt(i,dummy.matrix);
    }ridge.receiveShadow=true;scene.add(ridge);
    const openings=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,8),new THREE.MeshBasicMaterial({color:0x121a1b}),5);
    for(let i=0;i<5;i++){dummy.position.set(-60+i*30,3,183);dummy.scale.set(4.2,3.8,1.5);dummy.rotation.set(0,0,0);dummy.updateMatrix();openings.setMatrixAt(i,dummy.matrix);}scene.add(openings);
    // Armoured panel seams, bolts and hazard marks on the front ramp.
    const trim=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x363f40,metalness:.6,roughness:.6}),42);
    for(let i=0;i<42;i++){const side=i%2?-1:1;dummy.position.set(side*(8+Math.floor(i/2)*1.35),6.65,-15.55);dummy.scale.set(.045,2.6,.08);dummy.rotation.set(0,0,0);dummy.updateMatrix();trim.setMatrixAt(i,dummy.matrix);}scene.add(trim);
    const marks=new THREE.InstancedMesh(new THREE.BoxGeometry(.5,.015,1.6),new THREE.MeshStandardMaterial({color:0xbca35f,roughness:.9}),18);
    for(let i=0;i<18;i++){const x=i%2?5.7:-5.7,z=-11+Math.floor(i/2)*1.9;dummy.position.set(x,terrainH(x,z)+.04,z);dummy.scale.set(1,1,1);dummy.rotation.set(0,.3,0);dummy.updateMatrix();marks.setMatrixAt(i,dummy.matrix);}scene.add(marks);
    // Projected contact spots anchor feet without per-character point lights.
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,31);gradient.addColorStop(0,'rgba(0,0,0,.5)');gradient.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
    this.contactMaterial=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false});
  }
}
