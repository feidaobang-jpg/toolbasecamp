// BASELINE=1 records the dark models before the shared animation extraction.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const out=path.join(__dirname,'media-kit/releases/web-dark-only-v0.10.4');
const url=process.env.GAME_URL||'http://127.0.0.1:8892/html/game/starship-defense/index.html';
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'?qa=1');await page.waitForFunction(()=>window.__gameQA);
    const models=await page.evaluate(()=>{
      const v=__gameQA.visuals;
      const roots={soldier:v.soldier(),bug:v.bug(),flying:v.bug(1,'mob',true,2),boss:v.bug(2,'boss',false,4),queen:v.bug(3,'queen',false,5),mech:v.mech()};
      function hash(array){let h=2166136261;for(const b of new Uint8Array(array.buffer,array.byteOffset,array.byteLength)){h^=b;h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
      return Object.fromEntries(Object.entries(roots).map(([name,root])=>{
        const meshes=[];root.traverse(o=>{if(!o.isMesh)return;const g=o.geometry;
          meshes.push({position:o.position.toArray(),scale:o.scale.toArray(),attributes:Object.fromEntries(Object.entries(g.attributes).map(([k,a])=>[k,{count:a.count,hash:hash(a.array)}])),index:g.index?hash(g.index.array):null});
        });return [name,meshes];
      }));
    });
    if(process.env.BASELINE==='1'){
      fs.writeFileSync(path.join(out,'dark-model-baseline.json'),JSON.stringify(models,null,2)+'\n');
      console.log('Recorded six dark model geometry fingerprints');return;
    }
    assert.deepEqual(models,JSON.parse(fs.readFileSync(path.join(out,'dark-model-baseline.json'),'utf8')));
    console.log('PASS six dark model geometries unchanged');
    const animations=await page.evaluate(()=>{
      const q=__gameQA,v=q.visuals,r=v.soldier();r.position.copy(q.camera.position);r.userData.toy.time=0;
      v.animate(r,.1,'Run',q.camera);const walks=r.userData.toy.feet.some(m=>Math.abs(m.rotation.x)>.01);
      v.animate(r,.1,'Attack',q.camera);const attacks=Math.abs(r.userData.toy.body.rotation.x)>.01;
      q.scene.add(r);const dies=v.death(r);v.update(1);return {walks,attacks,dies,removed:r.parent===null,corpses:v.corpses.length};
    });
    assert.deepEqual(animations,{walks:true,attacks:true,dies:true,removed:true,corpses:0});
    console.log('PASS shared walk/attack animation and corpse cleanup');
    await page.evaluate(()=>localStorage.setItem('chongchao-theme','toy'));
    await page.goto(url+'?qa=1&theme=toy');await page.waitForFunction(()=>window.__gameQA);
    assert.equal(await page.evaluate(()=>__gameQA.THEME),'dark');
    assert.equal(await page.locator('html').getAttribute('class'),'theme-dark');
    assert.equal(await page.locator('#themeBtn,#themeBtnMenu').count(),0);
    await page.locator('#btnStart').click();await page.keyboard.press('Escape');
    await page.locator('#menuPause').waitFor({state:'visible'});
    for(const id of ['personBtnMenu','qualityBtnMenu','muteBtnMenu'])assert.equal(await page.locator('#'+id).isVisible(),true);
    await page.keyboard.press('Escape');
    await page.screenshot({path:path.join(out,'dark-battlefield.jpg'),type:'jpeg',quality:85});
    console.log('PASS legacy Q theme URL/storage falls back to dark; pause options work');
    assert.deepEqual(errors,[]);console.log('PASS no browser runtime errors');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
