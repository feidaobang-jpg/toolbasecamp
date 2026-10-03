const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const url=process.env.GAME_URL||'http://127.0.0.1:8895/html/game/starship-defense/index.html';
const output=process.env.QA_OUTPUT||path.join(__dirname,'media-kit/releases/web-clear-landmarks-v0.13.1');
(async()=>{
  fs.mkdirSync(output,{recursive:true});const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  try{
    const p=await b.newPage({viewport:{width:1280,height:720}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady);
    const results={};
    results.landmarks=await p.evaluate(()=>{
      const q=__gameQA;q.newGame(false);let tallBeams=0,mouthCurtains=0;
      q.scene.traverse(o=>{if(!o.isMesh)return;const g=o.geometry,m=o.material;
        if(g.type==='CylinderGeometry'&&g.parameters.height>=100&&m.transparent)tallBeams++;
        if(o.isInstancedMesh&&g.type==='PlaneGeometry'&&m.transparent&&m.opacity===.28)mouthCurtains++;
      });return {tallBeams,mouthCurtains,mouths:q.MOUTHS.length};
    });
    assert.deepEqual(results.landmarks,{tallBeams:0,mouthCurtains:0,mouths:5});
    for(const difficulty of ['normal','hard','nightmare']){
      const result=await p.evaluate(d=>{
        const q=__gameQA;q.newGame(false);q.Game.chapter=6;q.startPrep();q.operations.start('toxic',d);q.Game.state='paused';q.clearEntities(false);
        const a=q.operations.active;a.spawned=a.cfg.total;q.player.hp=80;q.player.invulnerable=0;q.player.shield=0;
        const o=a.objects[0];q.player.pos.copy(o.mesh.position);q.player.pos.x+=5;
        for(let i=0;i<40;i++)q.operations.update(.25);const outerHp=q.player.hp;
        for(const node of a.objects){q.player.pos.copy(node.mesh.position);for(let i=0;i<13;i++)q.operations.update(.25);}
        const collected=a.objects.every(o=>o.done),innerHp=q.player.hp,name=a.cfg.name;
        const chapter=q.Game.chapter;q.player.pos.set(a.center.x,q.groundY(a.center.x,a.center.z),a.center.z);q.operations.update(.1);
        const key=d==='normal'?'toxic':'toxic_'+d;
        return {outerHp,innerHp,collected,name,finished:!q.operations.active,rewardKey:q.Game.opsCompleted[key],chapter:q.Game.chapter,expectedChapter:chapter};
      },difficulty);
      assert.equal(result.outerHp,80);assert.equal(result.innerHp,80);assert.equal(result.collected,true);assert.equal(result.finished,true);assert.equal(result.name,'虫巢采样');assert.equal(result.rewardKey,'1:6');assert.equal(result.chapter,result.expectedChapter);results[difficulty]=result;
    }
    console.log('PASS no landmark beams or entrance curtains; sampling never damages HP in all three difficulties, rewards preserved');
    await p.evaluate(()=>{const q=__gameQA;q.newGame(false);q.CombatControls.set('fire','hold');q.player.pos.set(0,q.groundY(0,280),280);q.player.mesh.position.copy(q.player.pos);q.setCamYaw(0);q.setCamMode('third',false);});
    await p.waitForTimeout(800);await p.screenshot({path:path.join(output,'hive-clear.jpg'),type:'jpeg',quality:88});
    results.tunnel=await p.evaluate(()=>{
      const q=__gameQA;q.clearEntities(false);q.Game.cls='gunner';q.Game.regen=false;q.player.hp=80;q.player.invulnerable=0;q.player.shield=0;
      const m=q.MOUTHS.find(m=>m.main);q.player.pos.set(m.x,q.groundY(m.x,m.z),m.z);q.player.mesh.position.copy(q.player.pos);
      q.setCamYaw(Math.atan2(-m.dx,-m.dz));return {x:m.x,z:m.z};
    });
    await p.waitForTimeout(2200);assert.equal(await p.evaluate(()=>__gameQA.player.hp),80);
    assert.doesNotMatch(await p.locator('#baseGuide').textContent(),/光柱/);
    await p.screenshot({path:path.join(output,'entrance-clear.jpg'),type:'jpeg',quality:88});
    assert.deepEqual(errors,[]);results.errors=errors;results.checkedAt=new Date().toISOString();
    fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(results,null,2)+'\n');
    console.log('PASS unoccupied tunnel entrance is harmless; base direction/distance remain; no browser errors');
  }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
