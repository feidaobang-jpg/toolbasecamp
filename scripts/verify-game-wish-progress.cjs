// Isolated frontend fixtures: never writes to the production voting API.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),http=require('http');
const {chromium}=require('C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..'),out=path.join(root,'game-projects/starship-defense/video/wish-versus-20261008/work/qa');
const board=JSON.parse(fs.readFileSync(path.join(out,'board-before.json'))),options=JSON.parse(fs.readFileSync(path.join(out,'options-before.json')));
const progress=JSON.parse(fs.readFileSync(path.join(root,'server/game_wish_progress.json')));
const items=board.wishlist.map(row=>({...row,...(progress[row.id]?.name===row.name&&progress[row.id]?.source===row.source?progress[row.id]:{progress:'pending'})}));
const reports=[];
(async()=>{
 const web=path.join(root,'public');
 const server=http.createServer((req,res)=>{const file=path.resolve(web,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(web+path.sep)){res.statusCode=403;return res.end();}
  fs.readFile(file,(e,data)=>{if(e){res.statusCode=404;return res.end();}res.setHeader('Content-Type',file.endsWith('.html')?'text/html':file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(data);});});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:844,height:390}]){
   const ctx=await browser.newContext({viewport});let voted=false;const requests=[];
   await ctx.route('**/game-votes/**',async route=>{
    const req=route.request(),url=new URL(req.url());requests.push(url.pathname+url.search);
    let data={},status=200;
    if(url.pathname.endsWith('/board')){
     const kind=url.searchParams.get('progress')||'all',offset=Number(url.searchParams.get('offset')||0),selected=items.filter(w=>kind==='all'||w.progress===kind);
     data={...board,wishlist:selected.slice(offset,offset+20),wishlistTotal:selected.length,wishCounts:{pending:items.filter(w=>w.progress==='pending').length,fulfilled:items.filter(w=>w.progress==='fulfilled').length},fulfilled:items.filter(w=>w.progress==='fulfilled')};
    }else if(url.pathname.endsWith('/options'))data=options;
    else if(url.pathname.endsWith('/my-votes'))data={favorite:[],wishlist:voted?['w11']:[],myWishes:[],remaining:{favorite:3,wishlist:voted?4:5,wishSubmit:3}};
    else if(url.pathname.endsWith('/admin/wishes')){status=403;data={detail:'fixture: not admin'};}
    else if(url.pathname.endsWith('/unvote')){voted=false;data={ok:true};}
    else throw Error('Unexpected write in frontend test: '+req.method()+' '+url.pathname);
    await route.fulfill({status,json:data});
   });
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const base='http://127.0.0.1:'+server.address().port;
   await page.goto(base+'/games.html');await page.waitForSelector('.gvb-fulfilled-row');
   assert.equal(await page.locator('.gvb-fulfilled-row').count(),1);
   assert.match(await page.locator('.gvb-fulfilled-row').innerText(),/双人对战塔防/);
   assert.match(await page.locator('.gvb-fulfilled-row').innerText(),/11 票/);
   assert.equal(await page.locator('.gvb-cols section').nth(1).getByText('双人对战塔防',{exact:true}).count(),0);
   const widthCheck=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,
    outliers:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.right>innerWidth+2}).slice(0,10).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,80),right:e.getBoundingClientRect().right}))}));
   assert.ok(await page.locator('.gvb').evaluate(e=>e.scrollWidth<=e.clientWidth+1),JSON.stringify(widthCheck));
   await page.screenshot({path:path.join(out,'wishlist-hub-'+viewport.width+'.png'),fullPage:true});
   await page.goto(base+'/game-vote.html');await page.waitForFunction(()=>document.querySelector('[data-wish-progress="pending"]').textContent.includes('8'));
   assert.equal(await page.locator('#gv-wishlist .gv-row').count(),8);
   await page.click('[data-wish-progress="fulfilled"]');await page.waitForSelector('#gv-wishlist .gv-progress');
   const archived=await page.locator('#gv-wishlist').innerText();assert.match(archived,/双人对战塔防/);assert.match(archived,/升级你的银行/);assert.match(archived,/11 票/);
   assert.equal(await page.locator('#gv-wishlist .gv-vote-btn').count(),0);
   assert.match(await page.locator('#gv-wishlist a').first().getAttribute('href'),/html\/game\/starship-defense\/index.html$/);
   assert.ok(await page.locator('#gv-wish-board').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await page.screenshot({path:path.join(out,'wishlist-fulfilled-'+viewport.width+'.png'),fullPage:true});
   voted=true;await page.click('#gv-refresh');await page.waitForSelector('#gv-wishlist .gv-vote-btn');
   assert.match(await page.locator('#gv-wishlist .gv-vote-btn').innerText(),/取消/);
   await page.click('#gv-wishlist .gv-vote-btn');await page.waitForFunction(()=>!document.querySelector('#gv-wishlist .gv-vote-btn'));
   await page.click('[data-wish-progress="pending"]');await page.waitForFunction(()=>document.querySelectorAll('#gv-wishlist .gv-row').length===8);
   assert.ok(requests.some(u=>u.includes('progress=pending'))&&requests.some(u=>u.includes('progress=fulfilled')));
   assert.deepEqual(errors,[]);reports.push({viewport,ok:true,existingShellOverflow:widthCheck.scroll-widthCheck.width,checked:['pending/fulfilled classification','11 original votes and original demand','play links','no new fulfilled vote button','existing vote cancellation','no wishlist overflow','no JS errors']});
   await ctx.close();
  }
 }finally{await browser.close();server.close();}
 fs.writeFileSync(path.join(out,'wishlist-ui.json'),JSON.stringify({at:new Date().toISOString(),fixtures:true,production_writes:0,reports},null,2));console.log('PASS',JSON.stringify(reports));
})().catch(e=>{console.error(e);process.exit(1);});
