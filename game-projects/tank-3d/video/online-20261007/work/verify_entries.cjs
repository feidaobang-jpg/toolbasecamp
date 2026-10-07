// Read-only verification and public screenshots for the closing guide.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const W=__dirname,dir=path.join(W,'qa');fs.mkdirSync(dir,{recursive:true});
 const b=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--use-angle=d3d11','--enable-gpu']});try{
 const p=await b.newPage({viewport:{width:1920,height:1080}});await p.goto('https://www.bilibili.com/toy/feidao-tank-3d/index.html');await p.waitForSelector('iframe');const frame=await(await p.$('iframe')).contentFrame();await frame.waitForFunction(()=>window.__tankReady);
 const main=await frame.evaluate(async()=>await(await fetch('main.js')).text());const record={toy_url:p.url(),content_url:frame.url(),version:main.match(/const VERSION = '([^']+)'/)?.[1],main_sha256:crypto.createHash('sha256').update(main).digest('hex'),lobby_text:await frame.locator('[data-act="coop"]').innerText(),checked_at:new Date().toISOString()};
 await p.screenshot({path:path.join(dir,'toy-public.png')});await frame.click('[data-act="coop"]');await p.waitForTimeout(700);await p.screenshot({path:path.join(dir,'toy-lobby.png')});record.lobby_connected=await frame.locator('#coop-message').innerText();
 await p.goto('https://www.zhengxiaohui.cn/game-vote.html');await p.waitForTimeout(1000);await p.screenshot({path:path.join(dir,'vote-page.png')});record.vote_url=p.url();record.vote_title=await p.title();fs.writeFileSync(path.join(W,'entry-verification.json'),JSON.stringify(record,null,2));console.log(JSON.stringify(record));
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1);});
