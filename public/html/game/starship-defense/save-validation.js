import {OP_COMPLETION_KEYS} from './operations.js';
// Cloud data is untrusted input. Keep legacy normal saves compatible; reject broken structures.
export function validateNormalSave(d,{weapons,buildings,vehicles}){
  const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  const int=(v,min,max)=>Number.isInteger(v)&&num(v,min,max);
  const list=(v,max,test)=>v===undefined||Array.isArray(v)&&v.length<=max&&v.every(test);
  const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
  return !!(d&&typeof d==='object'&&!d.testMode&&['gunner','rifle','medic'].includes(d.cls)&&
    int(d.loop,1,100000)&&int(d.chapter,1,10)&&int(d.level,1,10)&&num(d.gold,0,1e12)&&num(d.score,0,1e12)&&
    Array.isArray(d.weapons)&&d.weapons.length>0&&d.weapons.length<=30&&d.weapons.every(k=>Object.hasOwn(weapons,k))&&Object.hasOwn(weapons,d.curWeapon)&&
    (d.items===undefined||d.items&&num(d.items.medkit,0,100000)&&(d.items.grenade===undefined||num(d.items.grenade,0,100000)))&&
    (d.hpBonus===undefined||num(d.hpBonus,0,100000))&&(d.baseHp===undefined||num(d.baseHp,0,1e7))&&
    (d.squadCount===undefined||int(d.squadCount,0,4))&&num(d.time,0,1e15)&&
    (d.weaponLv===undefined||plain(d.weaponLv)&&Object.entries(d.weaponLv).length<=30&&Object.entries(d.weaponLv).every(([k,v])=>Object.hasOwn(weapons,k)&&int(v,0,10)))&&
    (d.squadOrder===undefined||['follow','defend','attack'].includes(d.squadOrder))&&
    (d.hive===undefined||plain(d.hive)&&num(d.hive.queen,0,1)&&typeof d.hive.killed==='boolean'&&int(d.hive.chapter,1,10)&&int(d.hive.loop,1,100000))&&
    list(d.squadGear,4,g=>plain(g)&&int(g.weapon,0,5)&&int(g.armor,0,5))&&
    (d.opsCompleted===undefined||plain(d.opsCompleted)&&Object.entries(d.opsCompleted).length<=OP_COMPLETION_KEYS.length&&Object.entries(d.opsCompleted).every(([k,v])=>OP_COMPLETION_KEYS.includes(k)&&typeof v==='string'&&/^\d{1,6}:\d{1,2}$/.test(v)))&&
    list(d.buildings,64,b=>b&&Object.hasOwn(buildings,b.k)&&num(b.x,-120,120)&&num(b.z,-80,340)&&num(b.r,-1e6,1e6)&&num(b.hp,0,1e7))&&
    list(d.vehiclesOwned,4,k=>Object.hasOwn(vehicles,k))&&list(d.pendingDrops,32,it=>it&&['item','vehicle','squad'].includes(it.type)&&typeof it.id==='string'));
}
