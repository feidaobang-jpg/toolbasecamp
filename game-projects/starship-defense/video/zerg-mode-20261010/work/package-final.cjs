// 打包投稿入口：把成片与封面按平台命名放进 final/<平台>/，并输出哈希/尺寸供 publish.json 使用
// 用法：node package-final.cjs
const fs=require('fs'),path=require('path'),{execSync}=require('child_process');
const W=__dirname, ROOT=path.join(W,'..'), F=path.join(ROOT,'final'), ED=path.join(W,'edit');
const sh=(c)=>execSync(c,{stdio:['ignore','pipe','pipe']}).toString();
const jpg=(src,out,w,h)=>sh(`ffmpeg -y -v error -i "${src}" -vf "scale=${w}:${h}" -q:v 2 "${out}"`);
const copy=(src,dst)=>{try{fs.linkSync(src,dst);}catch(e){fs.copyFileSync(src,dst);} };   // 相同成片用硬链接复用
const job=[
  [path.join(ED,'final-zh.mp4'),'bilibili-zh/gameplay-zh-final.mp4'],
  [path.join(ED,'final-zh.mp4'),'douyin-zh/gameplay-zh-final.mp4'],
  [path.join(ED,'final-youtube-clean.mp4'),'youtube-zh/gameplay-youtube-final.mp4'],
];
const covers=[
  [path.join(F,'covers/bili-4x3.png'),'bilibili-zh/cover-home-4x3.jpg',1600,1200],
  [path.join(F,'covers/bili-16x9.png'),'bilibili-zh/cover-space-16x9.jpg',1920,1080],
  [path.join(F,'covers/bili-4x3.png'),'douyin-zh/cover-horizontal-4x3.jpg',1600,1200],
  [path.join(F,'covers/douyin-3x4.png'),'douyin-zh/cover-portrait-3x4.jpg',1080,1440],
  [path.join(F,'covers/bili-16x9.png'),'youtube-zh/cover-zh-16x9.jpg',1920,1080],
];
['bilibili-zh','douyin-zh','youtube-zh'].forEach(d=>fs.mkdirSync(path.join(F,d),{recursive:true}));
job.forEach(([s,d])=>{const t=path.join(F,d);if(fs.existsSync(t))fs.unlinkSync(t);copy(s,t);});
covers.forEach(([s,d,w,h])=>jpg(s,path.join(F,d),w,h));
const out={};
fs.readdirSync(F).filter(d=>fs.statSync(path.join(F,d)).isDirectory()).forEach(d=>{
  out[d]={};fs.readdirSync(path.join(F,d)).forEach(f=>{
    const p=path.join(F,d,f);const st=fs.statSync(p);
    const rec={bytes:st.size,sha256:sh(`certutil -hashfile "${p}" SHA256`).split('\n')[1].trim().toLowerCase()};
    if(/\.(mp4)$/.test(f)){const i=JSON.parse(sh(`ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate -show_entries format=duration -of json "${p}"`));
      const v=i.streams.find(s=>s.codec_type==='video'),a=i.streams.find(s=>s.codec_type==='audio');
      rec.width=v.width;rec.height=v.height;rec.fps=v.r_frame_rate;rec.duration_seconds=+i.format.duration;rec.audio=!!a;}
    if(/\.jpg$/.test(f)){const [w,h]=sh(`ffprobe -v error -select_streams v -show_entries stream=width,height -of csv=p=0 "${p}"`).trim().split(',');rec.width=+w;rec.height=+h;}
    out[d][f]=rec;
  });
});
fs.writeFileSync(path.join(ED,'file-hashes.json'),JSON.stringify(out,null,1),'utf8');
console.log(JSON.stringify(out,null,1));
