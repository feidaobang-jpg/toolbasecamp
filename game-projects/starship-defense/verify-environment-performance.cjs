// Desktop GPU + phone viewport/4x CPU throttling; not a physical phone benchmark.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8899/html/game/starship-defense/index.html';
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  try{
    const p=await b.newPage({viewport:{width:960,height:540},hasTouch:true,isMobile:true}),errors=[];
    p.on('pageerror',e=>errors.push(e.message));await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA?.battlefield);
    const cdp=await p.context().newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
    const runs=[];
    for(const chapter of [1,4,7]){
      await p.evaluate(ch=>{
        const q=__gameQA;q.newGame(true);q.Game.chapter=ch;q.startPrep();q.clearEntities(false);q.sandboxWave.enabled=false;
        q.player.pos.set(0,0,35);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.CombatControls.set('fire','hold');
        for(let i=0;i<48;i++){const m=q.spawnMonster('mob',(i%8-3.5)*4,53+Math.floor(i/8)*5,{ch:q.CHAPTERS[i%10],quiet:true});m.hp=m.maxHp=1e7;m.emerge=0;}
      },chapter);
      await p.waitForTimeout(700);await p.evaluate(()=>__gameQA.startMeasure());
      await p.keyboard.down('KeyJ');await p.waitForTimeout(4500);await p.keyboard.up('KeyJ');
      const result=await p.evaluate(()=>{
        const q=__gameQA,m=q.endMeasure();delete m.raw;
        q.renderer.render(q.scene,q.camera);const full=q.renderer.info.render.calls,triangles=q.renderer.info.render.triangles;
        q.battlefield.decor.visible=false;q.renderer.render(q.scene,q.camera);
        const extraDraws=full-q.renderer.info.render.calls,extraTriangles=triangles-q.renderer.info.render.triangles;q.battlefield.decor.visible=true;
        return {environment:q.battlefield.current.id,bugs:q.monsters.length,extraDraws,extraTriangles,...m};
      });
      assert.equal(result.bugs,48);assert.ok(result.extraDraws<=7);assert.ok(result.extraTriangles<20000);
      runs.push(result);console.log(JSON.stringify({environment:result.environment,fps:Math.round(result.averageFPS),p95:Math.round(result.p95Ms),extraDraws:result.extraDraws,extraTriangles:result.extraTriangles}));
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(__dirname,'media-kit/releases/web-environments-v0.12.0/performance.json'),JSON.stringify({method:'Headless Edge / desktop D3D11 GPU, 960x540 mobile viewport, 4x CPU throttling, 48 mixed enemies, 4.5 s firing; not physical phone hardware',runs,errors},null,2)+'\n');
  }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
