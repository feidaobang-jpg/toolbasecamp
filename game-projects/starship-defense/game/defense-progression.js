// One budget shared by placement, the build menu and save validation.
export const MAX_BUILDINGS=96;
const loopIndex=game=>Math.max(0,Math.min(99999,Math.floor(Number(game.loop)||1)-1));
export function buildingLimit(game,operation=false){
  return game.testMode?MAX_BUILDINGS:operation?64:Math.min(MAX_BUILDINGS,64+16*loopIndex(game));
}
export function turretDamageMul(game,operation=false){
  return game.testMode||operation?1:1+.5*loopIndex(game);
}
