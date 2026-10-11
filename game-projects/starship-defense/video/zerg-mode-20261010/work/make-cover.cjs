// 封面：真实游戏画面 + 排版文字（4:3 首页推荐 / 16:9 个人空间），字体取本机 msyh，不用生成图冒充实机
// 用法：node make-cover.cjs  →  ../final/covers/bili-4x3.png bili-16x9.png
const {execSync,execFileSync}=require('child_process');
const fs=require('fs'),path=require('path');
const W=__dirname, CAP=path.join(W,'capture','zerg-run7');
const OUT=path.join(W,'..','final','covers'); fs.mkdirSync(OUT,{recursive:true});
const TMP=path.join(W,'tmp','covers'); fs.mkdirSync(TMP,{recursive:true});   // drawtext 文本临时件，跑完即清
const SRC=path.join(CAP,'gate-dead.png');   // 母虫正面破门瞬间（实机）
const SRC2=path.join(CAP,'gate-25.png');    // 虫群+酸液弹道（实机）
const BOLD='C\\:/Windows/Fonts/msyhbd.ttc', REG='C\\:/Windows/Fonts/msyh.ttc';   // 实测写法：单引号包裹 + 盘符冒号前反斜杠（见 probe-cover.cjs）
const fp=p=>p.replace(/\\/g,'/').replace(/:/g,'\\:');   // filtergraph 内 Windows 路径需转义盘符冒号
function draw(src,out,w,h,lines,cropX){
  // ffmpeg 9 已移除 -filter_complex_script，这里用 execFileSync 传参数组，避免 shell 引号问题
  const parts=[`[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}:x=${cropX||'(in_w-out_w)/2'}:y=0`];
  lines.forEach((L,i)=>{
    const tf=`t${i}.txt`;
    fs.writeFileSync(path.join(TMP,tf),L.t,'utf8');
    parts.push(`drawtext=fontfile='${i%2?REG:BOLD}':textfile=${tf}:fontsize=${L.size}:fontcolor=${L.color||'white'}:borderw=${Math.round(L.size/14)}:bordercolor=black:box=1:boxcolor=black@0.42:boxborderw=${Math.round(L.size*0.34)}:x=${L.x}:y=${L.y}`);
  });
  parts.push(`format=rgb24[out]`);
  execFileSync('ffmpeg',['-y','-v','error','-i',path.resolve(src),'-filter_complex',parts.join(','),'-map','[out]','-frames:v','1',path.resolve(out)],{cwd:TMP,stdio:['ignore','pipe','pipe']});
  lines.forEach((L,i)=>fs.rmSync(path.join(TMP,`t${i}.txt`),{force:true}));
  const px=execSync(`ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 "${out}"`).toString().trim();
  console.log('COVER',path.basename(out),px,(fs.statSync(out).size/1024|0)+'KB');
}
draw(SRC,path.join(OUT,'bili-4x3.png'),1600,1200,[
  {t:'我是虫族',size:170,x:'(w-text_w)/2',y:110},
  {t:'网友点名 当天上线',size:60,x:'(w-text_w)/2',y:320},
  {t:'城门磨破了 核心却没掉血',size:50,x:'(w-text_w)/2',y:1030}],'(in_w-out_w)');
draw(SRC2,path.join(OUT,'bili-16x9.png'),1920,1080,[
  {t:'我是虫族',size:150,x:1000,y:120},
  {t:'网友点名要的模式 当天上线',size:52,x:1000,y:310},
  {t:'虫潮围城 · 虫族模式',size:44,x:1000,y:900}]);
// 抖音竖版展示封面（3:4，1080×1440）：横屏实机取中部，文字上下分置
draw(SRC,path.join(OUT,'douyin-3x4.png'),1080,1440,[
  {t:'我是虫族',size:132,x:'(w-text_w)/2',y:120},
  {t:'网友点名 当天上线',size:52,x:'(w-text_w)/2',y:290},
  {t:'城门磨破了 核心没掉血',size:46,x:'(w-text_w)/2',y:1310}]);
