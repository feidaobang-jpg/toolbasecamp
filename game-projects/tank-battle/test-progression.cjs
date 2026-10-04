// Run the actual game controller in a deterministic, DOM-free simulation.
// node game-projects/tank-battle/test-progression.cjs [path/to/tank_battle.html]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(process.argv[2] || path.join(root, 'public/html/game/tank_battle.html'), 'utf8');
let source = html.match(/<script>\s*"use strict";([\s\S]*?)<\/script>/)[1];
source = source.split(/\/\* ---------------- (?:合作联机 WebSocket 大厅|画布缩放：)/)[0];
source = source.replace('beginCampaignFromCoop: function(opts){', `
    test: {
      start(lv, debug=false) {
        level=lv; debugMode=debug; debugBossWave=1; debugBossCleared=false; debugBossDelay=0;
        endless=false; coopMode=false; player=null; lives=30; score=0;
        newLevel(); stateName='playing'; stateTime=0;
      },
      spawn: trySpawnEnemy,
      kill() { for(const e of [...enemies]) if(!e.dead) killTank(e,true); enemies=enemies.filter(e=>!e.dead); },
      tick(dt) { update(dt); },
      next() { stateTime=2; Input.state.startPressed=true; update(0.01); },
      snapshot() { return {level,stateName,enemyQueue,alive:enemies.length,score,clearGrace,
        total:enemyPlanObj.total,bossSpawned,debugBossWave,debugBossDelay,
        boss:enemies.filter(e=>e.type==='boss').length,mini:enemies.filter(e=>e.isMiniBoss).length}; }
    },
    beginCampaignFromCoop: function(opts){`);
const noop = () => {};
const element = {getContext:()=>({}),addEventListener:noop,style:{}};
function harness(shared) {
  const storage = {getItem(){return null;},setItem:noop};
  const context = vm.createContext({console,Math,performance:{now:()=>0},localStorage:storage,
    document:{getElementById:()=>element,addEventListener:noop,hidden:false},
    navigator:{userAgent:'test'},location:{search:''},requestAnimationFrame:noop,
    setTimeout:noop,clearTimeout:noop,setInterval:noop,clearInterval:noop,
    window:{addEventListener:noop}});
  if(shared) {
    vm.runInContext(fs.readFileSync(path.join(root,'public/js/game/game-progress.js'),'utf8'),context);
    context.TBGameProgress=context.window.TBGameProgress;
  }
  vm.runInContext(source+'\nthis.testGame=Game.test;',context);
  return context.testGame;
}
for(const shared of [true,false]) {
  const game=harness(shared);
  // Every chapter end, later cycles, and ordinary next-stage initialization.
  for(const level of [10,20,30,40,50,60,70,80,90,100,110,120,130,200]) {
    game.start(level);
    assert.equal(game.snapshot().enemyQueue,1,`level ${level}: only the boss is pending`);
    game.tick(0.1);
    assert.equal(game.snapshot().stateName,'playing','must not clear before spawning');
    game.spawn();
    assert.equal(game.snapshot().boss,1);
    assert.equal(game.snapshot().enemyQueue,0);
    game.tick(0.1);
    assert.equal(game.snapshot().clearGrace,0,'must not clear with a live boss');
    game.kill();
    game.tick(0.01);
    assert.equal(game.snapshot().clearGrace,4.5);
    const earned=game.snapshot().score;
    for(let i=0;i<100;i++) game.tick(0.05);
    assert.equal(game.snapshot().stateName,'levelClear');
    assert.equal(game.snapshot().score,earned,'clear reward must only be paid once');
    game.next();
    assert.equal(game.snapshot().level,level+1);
    assert.equal(game.snapshot().stateName,'playing');
    assert.ok(game.snapshot().enemyQueue>1);
  }
  for(const level of [1,3,6,9,11,13]) {
    game.start(level);
    const total=game.snapshot().enemyQueue;
    assert.ok(total>1);
    game.spawn();
    assert.equal(game.snapshot().mini,[3,6,9,13].includes(level)?1:0);
    game.kill();game.tick(0.01);
    assert.equal(game.snapshot().clearGrace,0,'remaining mobs still required');
    for(let i=1;i<total;i++){game.spawn();game.kill();}
    for(let i=0;i<100;i++) game.tick(0.05);
    assert.equal(game.snapshot().stateName,'levelClear');
  }
  game.start(5,true);game.spawn();game.kill();
  assert.equal(game.snapshot().debugBossDelay,3);
  for(let i=0;i<61;i++) game.tick(0.05);
  assert.equal(game.snapshot().debugBossWave,2);
  assert.equal(game.snapshot().level,10);
  assert.ok(game.snapshot().enemyQueue>1,'debug boss chain keeps its original queue');
  console.log(`PASS: ${shared?'shared progress':'fallback'}: 14 boss exits, 6 mob/mini stages, debug chain`);
}
