import * as THREE from './vendor/three.module.js';
import {hiveCeiling} from './hive-world.js';

// Always keep the same two lights in the shader; fading intensity avoids a
// shader recompile at cave entrances, including on the smooth mobile preset.
export class ExplorationLight{
  constructor(scene){
    this.blend=0;this.direction=new THREE.Vector3();
    this.torch=new THREE.SpotLight(0xe6eff5,0,48,.82,.65,1);
    this.torch.name='player-exploration-torch';this.torch.castShadow=false;
    this.fill=new THREE.PointLight(0xc1d1df,0,16,1);this.fill.name='player-nearby-fill';
    scene.add(this.torch,this.torch.target,this.fill);
  }
  update(dt,position,camera,forward,firstPerson,environment,active=true){
    const ceiling=hiveCeiling(position.x,position.z);
    const covered=active&&Number.isFinite(ceiling)&&position.y+1<ceiling;
    const t=covered?Math.max(0,Math.min(1,(position.z-184)/12)):0;
    const target=t*t*(3-2*t);
    this.blend+=(target-this.blend)*(1-Math.exp(-dt*7));
    if(Math.abs(target-this.blend)<.001)this.blend=target;
    environment.setCaveBlend(this.blend);
    if(firstPerson)this.torch.position.copy(camera.position);
    else this.torch.position.copy(position).addScaledVector(forward,.6).y+=1.7;
    // A slight downward bias keeps the sloping floor inside the broad beam
    // while horizontal turning and first-person pitch still steer the torch.
    this.direction.copy(forward);this.direction.y-=.22;this.direction.normalize();
    this.torch.target.position.copy(this.torch.position).addScaledVector(this.direction,30);
    this.fill.position.copy(position);this.fill.position.y+=2;
    this.torch.intensity=6*this.blend;this.fill.intensity=1.3*this.blend;
  }
}
