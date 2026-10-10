// 虫潮对战多人媒体采集：干净 16:9 截图 + 实时录像（4 对 4 电脑对电脑中局交战，镜头跟蓝方 0 号英雄）。
// 用法：GAME_URL=... OUT=media-kit/releases/web-versus-teams-v0.27.0/captures node capture-versus-teams.cjs
// 截图录像只留本机（.gitignore 已排除 media-kit 下的图片和视频）。
const fs=require('node:fs'),path=require('node:path');
const pw=process.env.PW||['D:/project/godot/absurd-3d-daily/node_modules/playwright','C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].find(p=>fs.existsSync(p));
const {chromium}=require(pw);
const url=process.env.GAME_URL||'http://127.0.0.1:8794/html/game/starship-defense/index.html';
const OUT=path.resolve(process.env.OUT||path.join(__dirname,'media-kit','releases','web-versus-teams-v0.27.0','captures'));
fs.mkdirSync(OUT,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11','--autoplay-policy=no-user-gesture-required']});
  const manifest={url,at:new Date().toISOString(),files:[]};
  const shot=async(p,name,note)=>{const f=path.join(OUT,name);await p.screenshot({path:f});manifest.files.push({file:name,kind:'screenshot',note});};
  try{
    const p=await b.newPage({viewport:{width:1280,height:720}});
    await p.goto(url+'?qa=1&clean=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
    await p.click('#btnVersus');await p.click('[data-vs-size="4"]');await sleep(300);await shot(p,'01-size-menu.png','对战菜单：规模 1 对 1 到 4 对 4');
    await p.click('[data-vs-ai="normal"]');await sleep(1500);
    await p.evaluate(()=>{const v=__gameQA.versus;v.state.time=200;v.seat('blue0').gold=2600;});
    await p.keyboard.press('KeyT');await sleep(400);await shot(p,'02-team-panel.png','队伍页：3 名电脑队友的金币、银行，点一下转 200 金');
    await p.keyboard.press('KeyT');await p.keyboard.press('KeyR');await sleep(200);await p.keyboard.press('Digit1');await sleep(200);await p.keyboard.press('Digit2');await sleep(900);
    await p.keyboard.press('KeyR');await sleep(1500);await shot(p,'03-four-heroes.png','开局：蓝方 4 名英雄和 4 座银行，派出第一波');
    await p.close();
    const ctx=await b.newContext({viewport:{width:1280,height:720},recordVideo:{dir:OUT,size:{width:1280,height:720}}});
    const v=await ctx.newPage();
    await v.goto(url+'?qa=1&clean=1');await v.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
    await v.evaluate(()=>{const q=__gameQA;q.startVersusSim('hard','hard',4);for(let i=0;i<20*400;i++)if(q.versusSimStep(.05))break;});
    await sleep(40000);
    await shot(v,'04-midgame-4v4.png','4 对 4 中局（约 6:40 后）双方交战，镜头跟随蓝方 0 号英雄');
    const video=v.video();await ctx.close();
    const raw=await video.path(),dest=path.join(OUT,'05-midgame-4v4.webm');fs.renameSync(raw,dest);
    manifest.files.push({file:'05-midgame-4v4.webm',kind:'video',note:'4 对 4 电脑困难对困难，加速快进到约 6:40 后实时录制约 40 秒；开头有快进期间的静止画面，剪辑时裁掉；不含解说'});
    const r=await b.newPage({viewport:{width:1280,height:720}});
    await r.goto(url+'?qa=1&clean=1');await r.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
    await r.evaluate(()=>__gameQA.startVersusAI('hard',3));await sleep(800);
    await r.evaluate(()=>{const v=__gameQA.versus;v.state.time=640;v.damage(v.hq('red'),1e7,'blue','unit');});await sleep(1200);
    await shot(r,'06-result-3v3.png','3 对 3 胜利结算：全队对比 + 每人数据');
  }finally{await b.close();}
  fs.writeFileSync(path.join(OUT,'manifest.json'),JSON.stringify(manifest,null,1));console.log('saved',OUT,manifest.files.length);
})().catch(e=>{console.error(e);process.exit(1);});
