// 虫潮对战媒体采集：干净 16:9 截图 + 实时录像（电脑对电脑中局交战，镜头跟蓝方英雄）。
// 用法：GAME_URL=... OUT=media-kit/releases/web-versus-v0.26.0/captures node capture-versus.cjs
// 截图录像只留本机（.gitignore 已排除 media-kit 下的图片和视频）。
const fs=require('node:fs'),path=require('node:path');
const pw=process.env.PW||['D:/project/godot/absurd-3d-daily/node_modules/playwright','C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].find(p=>fs.existsSync(p));
const {chromium}=require(pw);
const url=process.env.GAME_URL||'http://127.0.0.1:8794/html/game/starship-defense/index.html';
const OUT=path.resolve(process.env.OUT||path.join(__dirname,'media-kit','releases','web-versus-v0.26.0','captures'));
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
  const manifest={url,at:new Date().toISOString(),files:[]};
  const shot=async(p,name,note)=>{const f=path.join(OUT,name);await p.screenshot({path:f});manifest.files.push({file:name,kind:'screenshot',note});};
  try{
    // 静态画面
    const p=await b.newPage({viewport:{width:1280,height:720}});
    await p.goto(url+'?qa=1&clean=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
    await shot(p,'01-main-menu.png','主菜单「⚔ 虫潮对战 · 1 对 1」入口');
    await p.click('#btnVersus');await sleep(300);await shot(p,'02-versus-menu.png','对战菜单：三档电脑 + 好友联机，规则速览');
    await p.click('[data-vs-ai="normal"]');await sleep(1500);
    await p.evaluate(()=>{const v=__gameQA.versus;v.state.time=200;v.team('blue').gold=2600;});
    await p.keyboard.press('KeyR');await sleep(400);await shot(p,'03-command-panel.png','出兵面板：银行 + 9 兵种，价格/冷却/解锁时间');
    await p.keyboard.press('Digit1');await sleep(200);await p.keyboard.press('Digit2');await sleep(200);await p.keyboard.press('Digit4');await sleep(900);
    await p.keyboard.press('KeyR');await sleep(1500);await shot(p,'04-sent-wave.png','派出小虫群、机枪小队、甲壳战虫，带蓝色阵营环');
    await p.close();
    // 录像：电脑对电脑快进到中局，再实时录 45 秒
    const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:OUT,size:{width:1280,height:720}}});
    const v=await ctx.newPage();
    await v.goto(url+'?qa=1&clean=1');await v.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
    await v.evaluate(()=>{const q=__gameQA;q.startVersusSim('hard','hard');for(let i=0;i<20*330;i++)if(q.versusSimStep(.05))break;});
    await sleep(45000);
    await shot(v,'05-midgame.png','中局（约 6 分钟后）双方交战，镜头跟随蓝方英雄');
    await v.evaluate(()=>{const q=__gameQA;q.setCamMode&&q.setCamMode('third');});
    const video=v.video();await ctx.close();
    const raw=await video.path(),dest=path.join(OUT,'06-midgame-battle.webm');fs.renameSync(raw,dest);
    manifest.files.push({file:'06-midgame-battle.webm',kind:'video',note:'电脑困难对困难，加速快进到 5:30 后实时录制约 45 秒；画面为当前构建实时渲染，不含解说'});
    // 结算
    const r=await b.newPage({viewport:{width:1280,height:720}});
    await r.goto(url+'?qa=1&clean=1');await r.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
    await r.click('#btnVersus');await r.click('[data-vs-ai="hard"]');await sleep(800);
    await r.evaluate(()=>{const v=__gameQA.versus;v.state.time=611;v.damage(v.hq('red'),1e6,'blue','unit');});await sleep(1200);
    await shot(r,'07-result.png','胜利结算：双方数据对比');
  }finally{await b.close();}
  fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,1));console.log('saved',OUT,manifest.files.length);
})().catch(e=>{console.error(e);process.exit(1);});
