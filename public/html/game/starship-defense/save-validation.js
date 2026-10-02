// Cloud data is untrusted input. Keep legacy normal saves compatible; reject broken structures.
export function validateNormalSave(d,{weapons,buildings,vehicles}){
  const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
  const int=(v,min,max)=>Number.isInteger(v)&&num(v,min,max);
  const list=(v,max,test)=>v===undefined||Array.isArray(v)&&v.length<=max&&v.every(test);
  return !!(d&&typeof d==='object'&&!d.testMode&&['gunner','rifle','medic'].includes(d.cls)&&
    int(d.loop,1,100000)&&int(d.chapter,1,10)&&int(d.level,1,10)&&num(d.gold,0,1e12)&&num(d.score,0,1e12)&&
    Array.isArray(d.weapons)&&d.weapons.length>0&&d.weapons.length<=30&&d.weapons.every(k=>Object.hasOwn(weapons,k))&&Object.hasOwn(weapons,d.curWeapon)&&
    (d.items===undefined||d.items&&num(d.items.medkit,0,100000)&&num(d.items.grenade,0,100000))&&
    (d.hpBonus===undefined||num(d.hpBonus,0,100000))&&(d.baseHp===undefined||num(d.baseHp,0,100000))&&
    (d.squadCount===undefined||int(d.squadCount,0,4))&&num(d.time,0,1e15)&&
    list(d.buildings,32,b=>b&&Object.hasOwn(buildings,b.k)&&num(b.x,-80,80)&&num(b.z,-60,200)&&num(b.r,-1e6,1e6)&&num(b.hp,0,100000))&&
    list(d.vehiclesOwned,4,k=>Object.hasOwn(vehicles,k))&&list(d.pendingDrops,32,it=>it&&['item','vehicle','squad'].includes(it.type)&&typeof it.id==='string'));
}
