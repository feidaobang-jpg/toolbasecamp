// A labelled QA lineup of the exact runtime meshes, not a gameplay screenshot.
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('node:path');require('node:fs').mkdirSync(path.join(__dirname,'media-kit/releases/web-insects-v0.17.0/captures'),{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:990}});
  await page.goto('http://127.0.0.1:8898/html/game/starship-defense/index.html?qa=1');await page.waitForFunction(()=>window.__gameQA);
  await page.evaluate(async()=>{
   const THREE=await import('./vendor/three.module.js'),q=__gameQA;q.Game.state='paused';
   document.getElementById('stage').style.display='none';
   const layer=document.createElement('div');layer.style.cssText='position:fixed;inset:0;background:#111f30;color:#e6edf2;font:16px Microsoft YaHei,sans-serif';document.body.appendChild(layer);
   layer.innerHTML='<div style="position:absolute;left:40px;top:24px;font-size:29px;letter-spacing:2px">虫潮围城 · 甲壳虫族</div><div style="position:absolute;right:40px;top:36px;color:#b3c5d4">当前游戏模型 · 造型展示 / 非战斗截图</div>';
   const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setSize(1500,900);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.domElement.style.cssText='position:absolute;left:0;top:82px';layer.appendChild(renderer.domElement);
   const definitions=q.CHAPTERS.map((c,i)=>[i,'mob',!!c.fly,c.name,'普通虫群 · '+['近战','远程喷射','重甲','飞行','爆炸','分裂','远程电弧','高速隐身','重型装甲','远程亲卫'][i]]);
   definitions.push([0,'elite',false,'精英甲虫','头部甲刺 · 词缀标记'],[2,'miniboss',false,'小 Boss · 虫族先锋','多足甲壳 · 加厚护甲'],[0,'boss',false,'大 Boss · 攻城巨虫','六足支撑 · 巨型虫颚'],[3,'boss',true,'大 Boss · 飞行巨虫','振翅飞行 · 甲刺'],[9,'queen',false,'母皇 · 虫巢核心','膨大腹部 · 多足甲壳']);
   const entries=definitions.map(([species,kind,fly,name,desc],i)=>{
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,0.1,30);camera.position.set(2.8,2.5,4.5);if(kind==='queen'||(kind==='boss'&&fly))camera.position.multiplyScalar(1.2);camera.lookAt(0,1,0);
    scene.add(new THREE.HemisphereLight(0xc6e8ff,0x566371,.85));const light=new THREE.DirectionalLight(0xffecd8,1.5);light.position.set(-3,5,5);scene.add(light);
    const rim=new THREE.DirectionalLight(0x8fcfe9,.5);rim.position.set(3,2,-3);scene.add(rim);
    const root=q.visuals.bug(1,kind,fly,species);scene.add(root);
    const label=document.createElement('div');label.style.cssText=`position:absolute;text-align:center;width:300px;left:${i%5*300}px;top:${82+Math.floor(i/5)*300+247}px;pointer-events:none`;
    label.innerHTML=`<div style="font-weight:bold;font-size:20px">${name}</div><div style="margin-top:7px;color:#a1b3c5;font-size:13px">${desc}</div>`;layer.appendChild(label);
    return {scene,camera,root};
   });
   const render=()=>{renderer.setScissorTest(true);entries.forEach(({scene,camera,root},i)=>{q.visuals.animate(root,1/60,'Idle',camera);const x=i%5*300,y=900-(Math.floor(i/5)+1)*300+50;renderer.setViewport(x,y,300,250);renderer.setScissor(x,y,300,250);renderer.render(scene,camera);});requestAnimationFrame(render);};render();
  });
  await page.waitForTimeout(700);await page.screenshot({path:path.join(__dirname,'media-kit/releases/web-insects-v0.17.0/captures/enemy-lineup.png')});
  await page.setViewportSize({width:512,height:512});await page.reload();await page.waitForFunction(()=>window.__gameQA);
  await page.evaluate(()=>{
   const q=__gameQA;q.newGame(true);q.clearEntities(true);q.sandboxWave.enabled=false;q.Game.state='paused';
   q.player.pos.set(3,q.groundY(3,19),19);q.player.mesh.position.copy(q.player.pos);q.player.mesh.rotation.y=.3;
   for(const [species,kind,x,z] of [[0,'mob',-2,20],[1,'mob',1.5,22],[3,'mob',-5,25],[9,'miniboss',-2,27],[0,'boss',1,33]]){
    const m=q.spawnMonster(kind,x,z,{ch:q.CHAPTERS[species],quiet:true});m.mesh.rotation.y=Math.PI+.4;m.bar.visible=false;
   }
   q.camera.position.set(13,10,13);q.camera.lookAt(-.2,2.8,27);q.camera.fov=43;q.camera.aspect=1;q.camera.updateProjectionMatrix();
   q.renderer.setPixelRatio(2);q.renderer.setSize(512,512,false);
   document.querySelectorAll('#stage > :not(#c3d)').forEach(n=>n.style.display='none');
   document.getElementById('c3d').style.cssText='position:fixed;inset:0;width:100%;height:100%';
   document.getElementById('stage').style.cssText='position:fixed;inset:0;width:512px;height:512px;transform:none';
  });
  await page.waitForTimeout(150);await page.screenshot({path:path.join(__dirname,'media-kit/releases/web-insects-v0.17.0/captures/cover-candidate.jpg'),type:'jpeg',quality:94});
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
