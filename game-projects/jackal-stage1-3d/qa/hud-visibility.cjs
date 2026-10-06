// Boss 测试用传送建立局面；以完整 DOM 截图和实际模型投影检查遮挡。
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const fs = require('node:fs'), path = require('node:path');
const BASE = process.env.JK_BASE || 'http://127.0.0.1:8926/html/game/jackal-stage1-3d/index.html';
// 默认写到不入库的 qa/out/，避免覆盖 v0.7.2 任务留在 task-artifacts 的历史截图
const OUT = process.env.JK_OUT || path.join(__dirname, 'out/hud-visibility');
const results = [];
function check(name, ok, data) { results.push({ name, ok: !!ok, data }); console.log(ok ? 'PASS' : 'FAIL', name, JSON.stringify(data ?? '')); }
async function measure(page) {
  return page.evaluate(() => {
    const q = __JK_TEST__, s = q.snapshot(), { W, H } = s.ui.display;
    const rect = el => {
      const r = el.getBoundingClientRect(), a = q.toLocal(r.left, r.top), b = q.toLocal(r.right, r.bottom);
      return { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), w: Math.abs(a.x-b.x), h: Math.abs(a.y-b.y) };
    };
    const blocks = [...document.querySelectorAll('#hud,#hud-top,#boss-bar,#toast,#banner,#joy-base,#touch .act')]
      .filter(e => !e.hidden && e.getClientRects().length && getComputedStyle(e).display !== 'none').map(e => ({ id: e.id, ...rect(e) }));
    const camera = q._cam.cam;
    const projected = q.cheat.state().ents.filter(e => e.alive && (e.type === 'bust' || e.type === 'boss')).map(e => {
      const points = [];
      e.objRoot.updateMatrixWorld(true);
      e.objRoot.traverse(o => { if (!o.isMesh || !o.visible) return; o.geometry.computeBoundingBox(); const b=o.geometry.boundingBox;
        for(const x of [b.min.x,b.max.x]) for(const y of [b.min.y,b.max.y]) for(const z of [b.min.z,b.max.z]) {
          const p = camera.position.clone().set(x,y,z).applyMatrix4(o.matrixWorld).project(camera); points.push({x:(p.x+1)*W/2,y:(1-p.y)*H/2,z:p.z});
        }
      });
      const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
      return { id:e.bossId, x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys),clipped:points.some(p=>p.z>1||p.z< -1) };
    });
    const center=camera.position.clone().set(q._cam.tx,0,-q._cam.ty);
    const cameraState={id:q._cam.preset().id,distance:camera.position.distanceTo(center),height:camera.position.y,fog:q._scene.fog===null};
    return { W,H,blocks,projected,state:s,cameraState,armor:rect(document.getElementById('hc-armor')), rescue:getComputedStyle(document.querySelector('.hud-rescue')).display };
  });
}
// 用户要求恢复旧预设距离；不再用完整庭院适配来强制拉远。
const distances={oblique:34,top:42,low:24,wide:48,front:18};
const fixedDistance=m=>m.cameraState.id==='fp'?Math.abs(m.cameraState.height-1.5)<.001:Math.abs(m.cameraState.distance-distances[m.cameraState.id])<.1;
const overlap = (a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const browserPage=await browser.newPage({viewport:{width:1280,height:720}}), errors=[];
  let page=browserPage;
  browserPage.on('pageerror',e=>errors.push(e.message));
  try {
    await browserPage.goto(BASE+(BASE.includes('?')?'&':'?')+'test=1&stage=2&q=low&seed=123');
    // Toy 外层不是游戏；对已确认的游戏 iframe 执行同一套检查。
    if(process.env.JK_FRAME_SRC) {
      await browserPage.locator('iframe[src*="'+process.env.JK_FRAME_SRC+'"]').waitFor();
      const element=await browserPage.locator('iframe[src*="'+process.env.JK_FRAME_SRC+'"]').elementHandle();
      page=await element.contentFrame();
    }
    await page.waitForFunction(()=>window.__JK_TEST__);
    await page.locator('[data-control-mode=hide]').first().click();
    await page.locator('[data-act=start]').click();
    await page.evaluate(()=>{const q=__JK_TEST__;q.manual(true);q.step(240);q.cheat.invuln(999);q.cheat.carry(3);q.step(1);});
    const ordinary=await measure(page);
    check('ordinary rescue stays visible',ordinary.rescue!=='none');
    check('ordinary stage2 also has no fog',ordinary.cameraState.fog);
    await page.evaluate(()=>{const q=__JK_TEST__;q.cheat.teleport(0,325);q.step(180);});
    const presets=['oblique','top','low','wide','front','fp'];
    for(const viewport of [{width:1280,height:720},{width:844,height:390},{width:667,height:375},{width:390,height:844}]) {
      if (await page.evaluate(()=>!__JK_TEST__.snapshot().ui.overlay)) { await page.locator('#btn-pause').click(); }
      await browserPage.setViewportSize(viewport);
      await page.locator('[data-control-mode=show]:visible').click();await page.locator('[data-act=resume]').click();
      await page.evaluate(()=>__JK_TEST__.step(120));
      for(let i=0;i<6;i++) {
        const m=await measure(page), label=viewport.width+'x'+viewport.height+' '+presets[i];
        check(label+' boss fight and four targets',m.state.boss.state==='fight'&&m.projected.length===4,m.projected);
        check(label+' armor and toolbar do not overlap',!overlap(m.armor,m.blocks.find(b=>b.id==='hud-top'))&&m.armor.w>0);
        check(label+' rescue folds',m.rescue==='none');
        check(label+' keeps original preset distance',fixedDistance(m),m.cameraState);
        check(label+' has no distance fog',m.cameraState.fog,{camera:m.cameraState,targets:m.projected,blocks:m.blocks});
        if(i===0)await browserPage.screenshot({path:path.join(OUT,label.replaceAll(' ','-')+'.png')});
        await browserPage.keyboard.press('KeyC');await page.evaluate(()=>__JK_TEST__.step(120));
      }
    }
    await browserPage.setViewportSize({width:844,height:390});
    for (let i=0;i<4;i++) {
      await browserPage.keyboard.down('KeyE');await page.evaluate(()=>__JK_TEST__.step(60));await browserPage.keyboard.up('KeyE');
      const m=await measure(page);
      check('rotated arena '+i+' does not auto zoom or restore fog',fixedDistance(m)&&m.cameraState.fog,{camera:m.cameraState,projected:m.projected});
    }
    // Reset the preset after a full Q/E turn through the real pause option.
    await page.locator('#btn-pause').click();await page.locator('[data-opt=camera]:visible').click();await page.locator('[data-act=resume]').click();await page.evaluate(()=>__JK_TEST__.step(1));
    await page.evaluate(()=>{__JK_TEST__.cheat.armor(1);__JK_TEST__.step(1);});
    check('low armor retains visible warning',await page.locator('#hc-armor').evaluate(e=>e.classList.contains('low')&&e.querySelectorAll('.on').length===1));
    await browserPage.keyboard.press('Escape');await page.evaluate(()=>__JK_TEST__.step(1));
    check('pause exposes score and rescued detail',(await page.locator('#pause-stats').innerText()).includes('车上 3'));
    const before=await page.evaluate(()=>__JK_TEST__.snapshot());
    await page.locator('[data-control-mode=hide]:visible').click();await page.locator('[data-act=resume]').click();await page.evaluate(()=>__JK_TEST__.step(1));
    check('mode switch keeps boss, armor and progress',await page.evaluate(b=>{const s=__JK_TEST__.snapshot();return s.stage===b.stage&&s.carried===b.carried&&s.player.armor===b.player.armor&&s.boss.killed===b.boss.killed&&!s.ui.display.touchOn;},before));
    await page.evaluate(()=>{const q=__JK_TEST__;q.cheat.weapon(4);q.cheat.teleport(-3.5,338);q.cheat.face(0);q.step(1);});
    const hpBefore=await page.evaluate(()=>__JK_TEST__.cheat.state().ents.filter(e=>e.type==='bust').reduce((a,e)=>a+e.hp,0));
    await browserPage.keyboard.down('KeyK');await page.evaluate(()=>__JK_TEST__.step(180));await browserPage.keyboard.up('KeyK');
    check('real K rockets damage boss',await page.evaluate(hp=>__JK_TEST__.cheat.state().ents.filter(e=>e.type==='bust').reduce((a,e)=>a+e.hp,0)<hp,hpBefore));
    await browserPage.keyboard.press('Escape');await page.evaluate(()=>__JK_TEST__.step(1));await page.locator('[data-act=title]:visible').click();
    check('return to menu clears boss layout',await page.locator('#stage').evaluate(e=>!e.classList.contains('boss-fight')));
    await page.locator('[data-opt=stage]').first().click();await page.locator('[data-act=start]').click();
    await page.evaluate(()=>{const q=__JK_TEST__;q.step(240);q.cheat.invuln(999);q.cheat.teleport(0,310);q.step(900);});
    const first=await measure(page);
    check('first stage tank boss remains playable',first.state.stage===1&&first.state.boss.state==='fight'&&first.state.boss.spawned===4);
    check('first stage armor remains visible and fixed camera has no fog',first.armor.w>0&&!overlap(first.armor,first.blocks.find(b=>b.id==='hud-top'))&&fixedDistance(first)&&first.cameraState.fog);
    await browserPage.screenshot({path:path.join(OUT,'stage1-boss.png')});
    check('no runtime errors',errors.length===0,errors);
  } finally { await browser.close();fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2)); }
  process.exitCode=results.every(r=>r.ok)?0:1;
})();
