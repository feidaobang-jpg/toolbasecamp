// Campaign rules are fixed when a run starts; operations retain their own difficulty.
export const CAMPAIGN_DIFFICULTIES=Object.freeze({
  casual:Object.freeze({name:'休闲',hp:.85,damage:.7,baseHp:1.35,wave:1,interval:1.25,elite:.5,eliteBonus:0,doubleAffix:.15,mobGold:1,
    hint:'敌人伤害较低、基地更耐打，适合探索与尝试搭配。'}),
  normal:Object.freeze({name:'普通',hp:1,damage:1,baseHp:1,wave:1,interval:1,elite:1,eliteBonus:0,doubleAffix:.35,mobGold:1,
    hint:'保留现有守线节奏，整备、建造与小队协同应战。'}),
  hard:Object.freeze({name:'困难',hp:1.12,damage:1.3,baseHp:1,wave:1.25,interval:.65,elite:1,eliteBonus:.1,doubleAffix:.6,mobGold:.55,
    hint:'增援更紧凑、精英更多；小兵击杀金币减少，需及时回防与调配装备。'}),
});
export function campaignDifficultyId(id){return Object.hasOwn(CAMPAIGN_DIFFICULTIES,id)?id:'normal';}
export function campaignDifficulty(id){return CAMPAIGN_DIFFICULTIES[campaignDifficultyId(id)];}
export function campaignEliteChance(id,chapter,loop,wild=false){
  const d=campaignDifficulty(id),base=wild?(loop>1||chapter>3?.12:.05):Math.min(.28,.04+(loop-1)*.05+(chapter-1)*.012);
  return Math.min(.38,base*d.elite+d.eliteBonus);
}
export function campaignWaveCount(id,chapter,level,loop,queenKilled=false){
  const d=campaignDifficulty(id);
  let n=Math.round((8+level*1.8+chapter*1.6)*(1+(loop-1)*.3));
  n=Math.round(n*d.wave);
  return queenKilled?Math.round(n*.65):n;
}
export function campaignSpawnInterval(id,chapter,level,loop){
  const old=Math.max(.45,2.2-level*.1-chapter*.05-(loop-1)*.25);
  return Math.max(.35,old*campaignDifficulty(id).interval);
}
