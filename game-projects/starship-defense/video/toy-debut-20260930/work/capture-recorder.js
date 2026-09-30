/* Recording-only harness: real-time render + scripted normal key input, no stat/AI changes. */
(() => {
  const bar = document.createElement('div');
  bar.style.cssText='position:fixed;z-index:9999;left:12px;top:12px;background:#061422;color:white;padding:10px;border:1px solid #79b6db;font:14px sans-serif';
  bar.innerHTML='<button id="capSortie">录制出击</button> <button id="capDefense">录制守卫</button> <button id="capStop">停止并保存</button><span id="capStatus"> 待机</span>';
  document.body.appendChild(bar);
  let rec, chunks=[], frames=[], times=[], start=0, timer, captureName, captureCanvas;
  const status=document.getElementById('capStatus');
  const key=(code,down)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code,key:code, bubbles:true}));
  const tap=code=>{key(code,true);setTimeout(()=>key(code,false),100);};
  const at=(s,fn)=>times.push(setTimeout(fn,s*1000));
  async function stop(){
    if(!rec||rec.state==='inactive')return;
    times.forEach(clearTimeout);times=[];clearInterval(timer);
    ['KeyW','KeyA','KeyS','KeyD','KeyJ','KeyK'].forEach(k=>key(k,false));
    rec.stop();
  }
  async function record(name){
    if(rec?.state==='recording')return;
    captureName=name;frames=[];chunks=[];
    // Increase only capture resolution; camera, physics, enemies and rules are unchanged.
    renderer.setPixelRatio(2);
    document.getElementById('btnStart').click();
    AudioSys.init();await AudioSys.ctx.resume();
    AudioSys.master.disconnect();
    AudioSys.master.gain.value=0.5;
    const audio=AudioSys.ctx.createMediaStreamDestination();AudioSys.master.connect(audio);
    captureCanvas=document.createElement('canvas');captureCanvas.width=1920;captureCanvas.height=1080;
    const ctx=captureCanvas.getContext('2d');
    const stream=captureCanvas.captureStream(30);audio.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
    rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9,opus',videoBitsPerSecond:10000000,audioBitsPerSecond:128000});
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    rec.onstop=async()=>{
      status.textContent=' 保存中';
      await fetch('/capture/'+name+'.webm',{method:'POST',body:new Blob(chunks,{type:'video/webm'})});
      await fetch('/capture/'+name+'.json',{method:'POST',body:JSON.stringify({capture_mode:'realtime-automation',gameplay_modified:false,presentation:'canvas plus live telemetry overlay; silent local speaker, recorded WebAudio',duration:(performance.now()-start)/1000,frames})});
      stream.getTracks().forEach(t=>t.stop());status.textContent=' 已保存 '+name;
    };
    start=performance.now();rec.start(1000);
    function paint(){
      if(rec.state!=='recording')return;
      ctx.drawImage(document.getElementById('c3d'),0,0,1920,1080);
      // Clean recording HUD derived from the same live game values, not a simulated score.
      ctx.fillStyle='rgba(5,14,27,.78)';ctx.fillRect(28,28,420,148);
      ctx.fillStyle='#e4f5ff';ctx.font='bold 28px Microsoft YaHei';ctx.fillText('虫潮前哨  /  第 '+Game.level+' 关',50,70);
      ctx.font='24px Microsoft YaHei';ctx.fillText('生命 '+Math.ceil(player.hp)+'   基地 '+Math.ceil(base.hp),50,112);
      ctx.fillStyle='#ffd670';ctx.fillText('金币 '+Game.gold+'   分数 '+Game.score,50,153);
      ctx.font='22px Microsoft YaHei';ctx.textAlign='right';ctx.fillStyle='#e4f5ff';ctx.fillText('试玩版 · 实机录制',1880,60);ctx.textAlign='left';
      requestAnimationFrame(paint);
    }
    requestAnimationFrame(paint);
    timer=setInterval(()=>{
      const t=(performance.now()-start)/1000;
      frames.push({t,state:Game.state,level:Game.level,hp:player.hp,base:base.hp,gold:Game.gold,score:Game.score,grenades:Game.items.grenade,pos:player.pos.toArray(),enemies:monsters.filter(m=>!m.dead).length});
      status.textContent=' '+name+' '+t.toFixed(0)+'s / '+Game.state+' / 第'+Game.level+'关';
    },500);
    if(name==='sortie'){
      at(1,()=>key('KeyW',true));at(4.5,()=>key('KeyW',false));
      at(4.6,()=>key('KeyJ',true));
      at(6,()=>key('KeyD',true));at(7.2,()=>key('KeyD',false));
      at(9,()=>tap('KeyU'));at(12,()=>tap('KeyK'));
      at(16,()=>key('KeyW',true));at(18,()=>key('KeyW',false));
      at(21,()=>tap('KeyU'));at(24,()=>tap('KeyI'));
      at(30,()=>key('KeyJ',false));at(34,stop);
    }else{
      at(1,()=>document.getElementById('readyBtn').click());
      at(3,()=>tap('KeyI'));
      at(3.5,()=>key('KeyW',true));at(6.5,()=>key('KeyW',false));
      at(6.6,()=>key('KeyJ',true));
      at(12,()=>tap('KeyU'));at(18,()=>tap('KeyI'));
      at(22,()=>tap('KeyU'));at(30,()=>tap('KeyI'));at(35,()=>tap('KeyU'));
      at(42,()=>key('KeyS',true));at(44,()=>key('KeyS',false));
      at(80,()=>key('KeyJ',false));at(88,stop);
    }
  }
  document.getElementById('capSortie').onclick=()=>record('sortie');
  document.getElementById('capDefense').onclick=()=>record('defense');
  document.getElementById('capStop').onclick=stop;
})();
