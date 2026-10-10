// 虫族模式更新视频 · 自动剪辑：解说分段 → 对应实机片段 + 游戏原声侧链闪避 + 真实时间戳烧录字幕 → 成片
// 用法：node build-video.cjs            （读 audio/segments.json + audio/mp3/*.mp3，输出 work/edit/seg-*.mp4 与 final-zh.mp4）
//       node build-video.cjs --clean    （同一时间线但无烧录字幕，供 YouTube 侧挂字幕版：edit/final-youtube-clean.mp4）
const fs=require('fs'),path=require('path'),{execSync}=require('child_process');
const W=__dirname, CAP=path.join(W,'capture','zerg-run7');
const CLIP=path.join(CAP,'clip.mp4'), GAMEWAV=path.join(CAP,'game-audio.wav');
const MP3=path.join(W,'audio','mp3'), ED=path.join(W,'edit');
fs.mkdirSync(ED,{recursive:true});
const cfg=JSON.parse(fs.readFileSync(path.join(W,'audio','segments.json'),'utf8'));
const sh=(c,cd)=>{execSync(c,{stdio:['ignore','pipe','pipe'],cwd:cd});};
const dur=(f)=>+execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${f}"`).toString().trim();
const srtTime=t=>{const h=Math.floor(t/3600),m=Math.floor(t%3600/60),s=Math.floor(t%60),ms=Math.round((t-Math.floor(t))*1000);
  return [h,m,s].map(v=>String(v).padStart(2,'0')).join(':')+','+String(ms).padStart(3,'0');};
const LEAD=0.20, TAIL=0.35;   // 每段前后留白，口播不贴脸、字幕有呼吸
const esc=p=>p.replace(/\\/g,'/');
let tl=0; const plan=[];
for(const s of cfg.segments){
  const mp3=path.join(MP3,s.id+'.mp3'), marks=JSON.parse(fs.readFileSync(path.join(MP3,s.id+'.json'),'utf8')).marks;
  const nd=dur(mp3), segDur=+(LEAD+nd+TAIL).toFixed(3);
  const [a,b]=s.src||[0,0];
  const vDur=Math.max(segDur, (b-a)||0);
  const start=+tl.toFixed(3); tl+=vDur;
  // 字幕：SentenceBoundary 真实时间戳；长句按标点/长度切成 ≤16 字的读得完的小句，时间按字数比例分配
  const subs=[]; const sents=marks.filter(m=>m.type==='SentenceBoundary');
  const chunk=t=>{const out=[];let cur='';for(const ch of t){cur+=ch;if(/[，。！？、；：]/.test(ch)&&cur.replace(/[，。！？、；：]/g,'').length>=12||cur.length>=16){out.push(cur);cur='';}}if(cur.trim())out.push(cur);return out;};
  if(sents.length)for(const m of sents){
    const a=LEAD+m.offset/1e7,b=LEAD+(m.offset+m.duration)/1e7,parts=chunk(m.text);
    const tot=parts.reduce((x,p)=>x+p.length,0)||1;let acc=a;
    parts.forEach((p,k)=>{const d=(b-a)*p.length/tot;subs.push({a:acc,b:acc+d,t:p});acc+=d;});
  }
  else{
    const words=marks.filter(m=>m.type==='WordBoundary');
    if(words.length){const a=LEAD+words[0].offset/1e7,b=LEAD+words[words.length-1].offset/1e7+words[words.length-1].duration/1e7;
      const parts=chunk(s.text);const tot=parts.reduce((x,p)=>x+p.length,0)||1;let acc=a;
      parts.forEach(p=>{const d=(b-a)*p.length/tot;subs.push({a:acc,b:acc+d,t:p});acc+=d;});}
  }
  plan.push({id:s.id,src:s.src,narr_s:+nd.toFixed(3),segDur:vDur,start,subs,text:s.text});
}
fs.writeFileSync(path.join(ED,'timeline.json'),JSON.stringify({fps:30,total:+tl.toFixed(3),segments:plan},null,2));
console.log('TIMELINE total',tl.toFixed(1)+'s');
for(const s of plan){console.log(' ',s.id,'start',s.start.toFixed(2),'dur',s.segDur.toFixed(2),'src',JSON.stringify(s.src),'subs',s.subs.length);}

// 分段渲染：画面=对应实机片段（30fps CFR），音频=游戏原声切片侧链闪避 + 解说
// CLEAN=1（--clean）时不烧字幕，输出到 edit/clean/，供 YouTube 侧挂字幕母版
const CLEAN=process.argv.includes('--clean');
const SEGDIR=path.join(ED,CLEAN?'clean':'.'); fs.mkdirSync(SEGDIR,{recursive:true});
plan.forEach((s,i)=>{
  const [a,b]=s.src;
  const srt=path.join(ED,`seg-${i}-${s.id}.srt`);
  fs.writeFileSync(srt,s.subs.map((x,n)=>`${n+1}\n${srtTime(x.a)} --> ${srtTime(x.b)}\n${x.t}\n`).join('\n'),'utf8');
  const out=path.join(SEGDIR,`seg-${i}-${s.id}.mp4`);
  if(fs.existsSync(out)&&!process.env.FORCE){console.log('SEG-SKIP',s.id);return;}
  const subChain=CLEAN?`[0:v]fps=30,scale=1920:1080,setsar=1,tpad=stop_mode=clone:stop_duration=15,format=yuv420p[v]`
    :`[0:v]fps=30,scale=1920:1080,setsar=1,tpad=stop_mode=clone:stop_duration=15,format=yuv420p[sub];`+
     `[sub]subtitles='${esc(srt).replace(/:/g,'\\:')}':force_style='FontName=Microsoft YaHei,FontSize=13,Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&HAA000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=64'[v]`;
  sh(`ffmpeg -y -v error -ss ${a} -t ${s.segDur} -i "${esc(CLIP)}" -ss ${a} -t ${s.segDur} -i "${esc(GAMEWAV)}" -i "${esc(path.join(MP3,s.id+'.mp3'))}" `+
    `-filter_complex "${subChain};`+
    `[1:a]volume=0.9,asplit=2[gam][gk];[2:a]adelay=${Math.round(LEAD*1000)}|${Math.round(LEAD*1000)},volume=1.7[vo];`+
    `[gam][gk]sidechaincompress=threshold=0.03:ratio=8:attack=25:release=350[duck];`+
    `[duck][vo]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]" `+
    `-map "[v]" -map "[a]" -t ${s.segDur} -c:v libx264 -crf 18 -preset veryfast  -ac 2 -c:a aac -b:a 192k -ar 48000 "${esc(out)}"`);
  console.log('SEG',s.id,'->',path.basename(out),dur(out).toFixed(2)+'s');
});

// 拼接 + 末段淡出
fs.writeFileSync(path.join(SEGDIR,'concat.txt'),plan.map((s,i)=>`file 'seg-${i}-${s.id}.mp4'`).join('\n')+'\n');
const FIN=CLEAN?path.join(ED,'final-youtube-clean.mp4'):path.join(ED,'final-zh.mp4');
sh(`ffmpeg -y -v error -f concat -safe 0 -i concat.txt -vf "fade=t=out:st=${(tl-1.2).toFixed(2)}:d=1.2" -c:v libx264 -crf 18 -preset medium  -ac 2 -af loudnorm=I=-16:TP=-1.5:LRA=11 -c:a aac -b:a 192k -ar 48000 "${esc(FIN)}"`, SEGDIR);
console.log('FINAL',FIN,dur(FIN).toFixed(2)+'s',(fs.statSync(FIN).size/1e6).toFixed(1)+'MB');
