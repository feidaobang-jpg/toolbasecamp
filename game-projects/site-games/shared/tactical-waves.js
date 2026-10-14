import {campaignWaveCount} from './campaign-difficulty.js';

// The preview and spawning use the same schedule. Later chapters keep their
// original enemy progression; only the first loop's opening five rounds mix species.
const OPENING=[
  {title:'守住城门',mouths:['C'],acid:0,air:0,hint:'先熟悉城门与墙顶火力。通关补给可以雇佣第一名队友。'},
  {title:'建立防线',mouths:['C','W'],acid:0,air:0,hint:'西侧开始增援；可添一座炮塔，或雇队友分担守线。'},
  {title:'远程掩护',mouths:['C','E'],acid:.18,air:0,hint:'酸液虫跟在地面虫后，优先清理远程单位；工程兵留守维修。'},
  {title:'空地夹击',mouths:['W','C'],acid:0,air:.2,hint:'飞虫会越过城墙。检查防空塔，也可以用激光远程处理。'},
  {title:'分队出击',mouths:['W','C','E'],acid:.16,air:.16,hint:'三路混合虫潮：留人守家，再带人出击；也可以全队守住防线。'},
];
export function openingSupply(chapter,level,loop){
  return chapter===1&&loop===1?([180,220,240,260,300][level-1]||0):0;
}
export function tacticalWavePlan({difficulty,chapter,level,loop,queenKilled}){
  const opening=chapter===1&&loop===1?OPENING[level-1]:null;
  const n=campaignWaveCount(difficulty,chapter,level,loop,queenKilled);
  const mobCount=level===10?Math.round(n*.6):n;
  const schedule=Array.from({length:mobCount},(_,i)=>({kind:'mob',species:chapter-1,mouth:opening?opening.mouths[i%opening.mouths.length]:['W','C','E'][i%3]}));
  if(opening){
    const acid=Math.round(mobCount*opening.acid),air=Math.round(mobCount*opening.air);
    // Spread support enemies through the wave rather than releasing all of one kind at once.
    const special=acid+air;
    for(let i=0;i<special;i++){
      const at=Math.min(mobCount-1,Math.floor((i+1)*mobCount/(special+1)));
      schedule[at].species=i<acid?1:3;
    }
  }
  if(level===3||level===6||level===9)schedule.splice(Math.floor(schedule.length*.65),0,{kind:'miniboss',species:chapter-1,mouth:'C'});
  if(level===10)schedule.push({kind:'boss',species:chapter-1,mouth:'C'});
  return {title:opening?opening.title:'守住基地',hint:opening?opening.hint:'按本章虫种与首领特点准备防线。',opening:!!opening,schedule};
}
