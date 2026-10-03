import assert from 'node:assert/strict';
import {createCombatControls} from '../../public/html/game/starship-defense/combat-controls.js';
const saved=new Map();const storage={getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)};
const c=createCombatControls(storage);
assert.deepEqual(c.settings,{input:'mouse',aim:'auto',fire:'auto'});
assert.equal(c.firing(false),false);assert.equal(c.firing(true),true);
c.press('mouse');assert.equal(c.firing(false),true);c.release('mouse');assert.equal(c.firing(false),false);
c.set('fire','hold');assert.equal(c.firing(true),false);
c.press('KeyJ');c.press('mouse');c.release('mouse');assert.equal(c.firing(),true);c.release('KeyJ');assert.equal(c.firing(),false);
c.set('fire','toggle');c.press('KeyJ');c.press('KeyJ');c.release('KeyJ');assert.equal(c.firing(),true);
c.press('mouse');c.release('mouse');assert.equal(c.firing(),false);
c.press('KeyJ');c.reset();assert.equal(c.firing(),false);
c.set('input','keyboard');c.set('aim','manual');assert.equal(c.mouseEnabled,false);assert.equal(c.autoAim,false);
assert.equal(c.set('fire','bad'),false);assert.equal(c.set('__proto__','bad'),false);
const reloaded=createCombatControls(storage);assert.deepEqual(reloaded.settings,c.settings);assert.equal(reloaded.firing(),false);
for(const value of ['null','[]','{broken','{"fire":"invalid","aim":"manual"}']){
  const safe=createCombatControls({getItem:()=>value,setItem:()=>{throw Error('unavailable');}});
  assert.equal(safe.settings.fire,'auto');safe.set('fire','hold');assert.equal(safe.firing(true),false);
}
console.log('Combat control preferences, persistence, input edges, reset and invalid storage checks passed.');
