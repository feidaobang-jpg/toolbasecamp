// 帧序列 → CFR 30fps mp4：读 frames.json 真实时间戳生成 concat 时长表，ffmpeg 合成。
// 用法：node make-clip.cjs zerg-run1 [zerg-run2 ...]
const fs=require('fs'),path=require('path'),{execSync}=require('child_process');
const CAP=path.join(__dirname,'capture');
const takes=process.argv.slice(2);
if(!takes.length){console.log('usage: node make-clip.cjs <take...>');process.exit(1);}
for(const take of takes){
  const dir=path.join(CAP,take);
  const frames=JSON.parse(fs.readFileSync(path.join(dir,'frames.json'),'utf8'));
  if(!frames.length){console.log(take,'no frames');continue;}
  const lines=['ffconcat version 1.0'];
  for(let i=0;i<frames.length;i++){
    const dur=i<frames.length-1?Math.min(.5,Math.max(1/60,frames[i+1].timestamp-frames[i].timestamp)):.4;
    lines.push(`file '${frames[i].file}'`);lines.push(`duration ${dur.toFixed(4)}`);
  }
  lines.push(`file '${frames[frames.length-1].file}'`);
  fs.writeFileSync(path.join(dir,'concat.txt'),lines.join('\n')+'\n');
  const t0=frames[0].timestamp,t1=frames[frames.length-1].timestamp;
  fs.writeFileSync(path.join(dir,'clip-meta.json'),JSON.stringify({t0,t1,duration:t1-t0,frames:frames.length},null,2));
  execSync(`ffmpeg -y -f concat -safe 0 -i concat.txt -vf "fps=30,format=yuv420p" -c:v libx264 -crf 18 -preset medium "${path.join(dir,'clip.mp4')}"`,{cwd:dir,stdio:'pipe'});
  const sz=fs.statSync(path.join(dir,'clip.mp4')).size;
  console.log('CLIP OK',take,(t1-t0).toFixed(1)+'s',frames.length,'frames',(sz/1e6).toFixed(1)+'MB');
}
