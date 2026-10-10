// Check the local review artifact without starting video playback or uploading.
const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1360,height:1080}});
  await page.goto(pathToFileURL(path.join(__dirname,'review/index.html')).href);
  await page.waitForFunction(()=>document.querySelector('video').readyState>=1);
  const shared=await page.locator('video').evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,paused:v.paused,error:v.error?.message||null}));
  if(shared.error||shared.width!==1920||shared.height!==1080||!shared.paused)throw new Error('Review video does not load correctly');
  await page.getByRole('button',{name:'YouTube（中英可切换字幕）'}).click();
  await page.waitForFunction(()=>document.querySelector('video').readyState>=1);
  await page.locator('video').evaluate(v=>{for(const t of v.textTracks)t.mode='hidden';});
  await page.waitForFunction(()=>{const ts=[...document.querySelector('video').textTracks];return ts.length===2&&ts.every(t=>t.cues?.length===52);});
  const tracks=await page.locator('video').evaluate(v=>[...v.textTracks].map(t=>({language:t.language,label:t.label,cues:t.cues.length})));
  await page.getByRole('button',{name:'B站 / 抖音（烧录中文）'}).click();
  await page.waitForFunction(()=>document.querySelector('video').readyState>=1);
  await page.screenshot({path:path.join(__dirname,'qa/review-page.png'),fullPage:true});
  const result={at:new Date().toISOString(),local_video_metadata:'pass',shared_video:shared,local_blob_subtitles:'pass',youtube_tracks:tracks,no_autoplay:true,no_upload:true};
  fs.writeFileSync(path.join(__dirname,'qa/review-page.json'),JSON.stringify(result,null,2)+'\n');
  console.log('PASS local review: 1080p media and both 52-cue subtitle tracks load; playback remains paused.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
