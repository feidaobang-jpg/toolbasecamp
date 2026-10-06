// Capture the exact TapTap package using normal game buttons and keyboard input.
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'../..');
const source = path.join(root,'dist/taptap/chongchao-qianshao');
const out = path.join(__dirname,'media-kit/releases/taptap-trial-20261006');
const server = http.createServer((req,res) => {
  const file = path.resolve(source,'.'+new URL(req.url,'http://localhost').pathname);
  if (!file.startsWith(source+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);return res.end();}
  res.setHeader('content-type', {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async()=>{
  fs.mkdirSync(out,{recursive:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  try {
    const ctx=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:path.join(out,'raw-video'),size:{width:1920,height:1080}}});
    const page=await ctx.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port+'/chongchao-qianshao/index.html');
    await page.waitForFunction(()=>window.__ccReady);
    await page.locator('#btnStart').click();
    await page.keyboard.press('KeyC');await page.keyboard.press('KeyC');
    await page.keyboard.down('KeyW');await page.waitForTimeout(3500);await page.keyboard.up('KeyW');
    await page.locator('#readyBtn').click();await page.waitForTimeout(800);
    await page.screenshot({path:path.join(out,'gameplay-01.jpg'),type:'jpeg',quality:88});
    await page.waitForTimeout(14000);
    await page.keyboard.press('KeyC');
    await page.keyboard.down('KeyD');await page.waitForTimeout(1200);await page.keyboard.up('KeyD');
    await page.keyboard.press('KeyU');await page.waitForTimeout(1500);
    await page.screenshot({path:path.join(out,'gameplay-02.jpg'),type:'jpeg',quality:88});
    await page.keyboard.press('KeyC');await page.keyboard.press('KeyC');
    await page.keyboard.down('KeyA');await page.waitForTimeout(1200);await page.keyboard.up('KeyA');
    await page.waitForTimeout(12000);
    await page.screenshot({path:path.join(out,'gameplay-03.jpg'),type:'jpeg',quality:88});
    await page.waitForTimeout(4000);
    const video=page.video();await ctx.close();const videoPath=await video.path();
    const result=spawnSync(process.env.FFMPEG || 'ffmpeg',['-hide_banner','-loglevel','error','-y','-ss','6','-i',videoPath,'-t','30','-an','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',path.join(out,'gameplay.mp4')],{encoding:'utf8'});
    if(result.status!==0)throw new Error(result.stderr || result.error?.message);
    // Rasterize the game's existing vector icon with square, opaque corners.
    const iconPage=await browser.newPage({viewport:{width:1024,height:1024}});
    const svg=fs.readFileSync(path.join(source,'chongchao-qianshao/icon.svg'),'utf8').replace(' rx="16"','');
    await iconPage.setContent('<style>html,body{margin:0;width:1024px;height:1024px;background:#acd4c4}svg{display:block;width:1024px;height:1024px}</style>'+svg);
    await iconPage.screenshot({path:path.join(out,'icon.png')});await iconPage.close();
    fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify({package_sha256:JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8')).zip_sha256,method:'Normal new-game button, camera presets, movement and grenade keyboard input; no QA scene mutation or invulnerability.',device:'desktop Edge, 1920x1080',video:'gameplay.mp4',audio:false,video_trim:{start_seconds:6,duration_seconds:30},screenshots:['gameplay-01.jpg','gameplay-02.jpg','gameplay-03.jpg'],icon_source:'Existing game icon.svg rasterized at 1024px with square opaque corners',banner_status:'not_prepared',captured_at:new Date().toISOString()},null,2)+'\n','utf8');
    console.log('Captured real gameplay, three screenshots and existing icon.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
