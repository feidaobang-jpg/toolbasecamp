// 从实际路面几何核对可走边缘；夹具只清场/定位，移动使用真实键盘和触控。
const {launch,BASE}=require('./lib'),fs=require('fs'),path=require('path');
const observe=process.argv.includes('--observe');
const dir=path.resolve(__dirname,'../media-kit/releases/v0.11.0-preview.2');
fs.mkdirSync(path.join(dir,'captures'),{recursive:true});
(async()=>{const browser=await launch(),results=[],errors=[];
const check=(name,pass,detail)=>{results.push({name,pass,detail});console.log(pass?'PASS':'FAIL',name,JSON.stringify(detail));};
try{
 for(const [w,h,touch]of [[1280,720,false],[844,390,true],[390,844,true]]){
  const ctx=await browser.newContext({viewport:{width:w,height:h},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE+'?stage=3&test=1');await page.waitForFunction(()=>window.__CD_TEST__);
  await page.locator('#menu [data-act="select"]').click();await page.locator('#sel-go').click();await page.evaluate(()=>__CD_TEST__.manual(true));
  const step=n=>page.evaluate(n=>__CD_TEST__.step(n,true),n);
  const prep=area=>page.evaluate(area=>{const T=__CD_TEST__,C=T.cheat;C.newGame({area,hero:0,demo:true});if(area===7)C.wreck();
    const G=C.G;G.wave=99;G.waveOn=false;G.pending=[];G.focusX=G.lockX=16;G.road.summon=999;
    for(const e of G.actors)if(e.side!=='player'){e.alive=false;e.removed=true;e.model.root.visible=false;e.blob.visible=false;}
    G.boss=null;const p=G.player;p.x=16;p.z=.5;p.y=0;p.vy=p.vx=p.vz=0;p.state='idle';p.st=0;p.sub={};p.invul=999;T.setCamera(0);
  },area);
  const roadInfo=()=>page.evaluate(()=>{const T=__CD_TEST__,p=T.cheat.G.player;let box;
    T._scene.traverse(o=>{if(o.name==='hellroad-asphalt'||(o.geometry?.parameters?.width===500&&o.geometry?.parameters?.height===9.4)){o.geometry.computeBoundingBox();box=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);}});
    return {z:p.z,x:p.x,roadMin:box.min.z,roadMax:box.max.z,feet:T.project(p.x,0,p.z),body:[T.project(p.x-.45,1,p.z),T.project(p.x+.45,1,p.z)],area:T.areaDef()};
  });
  const move=async(forward)=>{
   if(!touch){await page.keyboard.down(forward?'s':'w');await step(300);await page.keyboard.up(forward?'s':'w');}
   else {const cdp=await ctx.newCDPSession(page),joy=await page.locator('#joy-zone').boundingBox(),j={x:joy.x+joy.width*.45,y:joy.y+joy.height*.5};
    const target=w<h?{x:j.x+(forward?-55:55),y:j.y}:{x:j.x,y:j.y+(forward?55:-55)};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...j,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...target,id:1}]});await step(300);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
   await step(30);
  };
  for(const area of [6,7]){
   await prep(area);await move(true);let f=await roadInfo();
   check(`${w}x${h}区域${area}走到道路下白线`,f.roadMax-f.z<.35&&f.roadMax-f.z>.2,{z:f.z,edge:f.roadMax,gap:f.roadMax-f.z});
   check(`${w}x${h}区域${area}前排脚下可见`,f.feet[1]>.75&&f.feet[1]<.98,f.feet);
   await page.screenshot({path:path.join(dir,'captures',`${observe?'before':'after'}-${area}-${w}-bottom.png`)});
   if(!touch)for(const [key,side]of [['a','左'],['d','右']]){await page.keyboard.down(key);await step(300);await page.keyboard.up(key);await step(30);const e=await roadInfo();check(`区域${area}底部${side}角人物完整可见`,e.body[0][0]>0&&e.body[1][0]<1,e);}
   await move(false);const back=await roadInfo();check(`${w}x${h}区域${area}走到道路上白线`,back.z-back.roadMin<.35&&back.z-back.roadMin>.2,{z:back.z,edge:back.roadMin});
  }
  await page.evaluate(()=>{__CD_TEST__.cheat.newGame({area:7,demo:true});__CD_TEST__.setCamera(0);});
  await move(true);let car=await page.evaluate(()=>{const T=__CD_TEST__,c=T.cheat.G.car;let max=-Infinity,min=Infinity;c.traverse(o=>{if(o.geometry){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);max=Math.max(max,b.max.z);min=Math.min(min,b.min.z);}});return {center:T.cheat.G.road.z,min,max};});
  check(`${w}x${h}车辆贴下白线且车身在路内`,car.max<=5.42&&5.4-car.max<.3,car);
  await move(false);car=await page.evaluate(()=>{const T=__CD_TEST__;let min=Infinity;T.cheat.G.car.traverse(o=>{if(o.geometry){o.geometry.computeBoundingBox();min=Math.min(min,o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld).min.z);}});return {center:T.cheat.G.road.z,min};});
  check(`${w}x${h}车辆贴上白线且车身在路内`,car.min>=-4.02&&car.min+4<.3,car);
  if(!touch){await prep(6);await move(true);for(let c=0;c<4;c++){await page.evaluate(c=>__CD_TEST__.setCamera(c),c);await step(60);await page.screenshot({path:path.join(dir,'captures',`${observe?'before':'after'}-bottom-camera-${c}.png`)});}}
  await ctx.close();
 }
 check('无运行时异常',errors.length===0,errors);
}finally{fs.writeFileSync(path.join(dir,observe?'before.json':'qa-depth.json'),JSON.stringify({results,errors},null,2));await browser.close();}
if(!observe&&results.some(x=>!x.pass))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
