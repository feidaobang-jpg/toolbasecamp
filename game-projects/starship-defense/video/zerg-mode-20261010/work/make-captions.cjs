// 侧挂字幕（YouTube 附件）：按整句/短子句重排烧录字幕，时长按字符数在口播区间内比例分配。
// 用法：node make-captions.cjs        → edit/captions-zh.lines.json（含 zh 与成片时间）
//       node make-captions.cjs --en  → 读 edit/glossary.json（整句中文→英文），写 final/youtube-zh/captions-{zh,en}.srt
const fs=require('fs'),path=require('path');
const W=__dirname, ED=path.join(W,'edit'), YT=path.join(W,'..','final','youtube-zh');
const tl=require(path.join(ED,'timeline.json'));
const MAX=20;                       // 单行侧挂字幕上限（比烧录的 16 字宽一点，整句更可读）
const lines=[];
tl.segments.forEach(s=>{
  const t0=s.subs[0].a, t1=s.subs[s.subs.length-1].b, dur=t1-t0;
  const full=s.subs.map(c=>c.t).join('').replace(/\s+/g,'').replace(/——/g,'\u2016');   // —— 视为不可断
  const chars=[...full].length;
  const atoms=full.match(/[^，、；：\u2016。！？…]+[，、；：\u2016。！？…]*/g)||[];   // 以标点为最小断行单位
  const rows=[];let cur='';
  const close=()=>{if(cur){rows.push(cur.replace(/\u2016/g,'——'));cur='';}};
  atoms.forEach(a=>{
    if(cur&&[...cur].length+[...a].length>MAX)close();
    cur+=a;
    if(/[。！？…]$/.test(a))close();          // 句末必断
  });
  close();
  let acc=0;                                   // 时长按字符数在口播区间内比例分配
  rows.forEach(r=>{const n=[...r.replace(/——/g,'\u2016')].length;const a=t0+dur*acc/chars;acc+=n;const b=t0+dur*acc/chars;
    lines.push({seg:s.id,zh:r,fa:s.start+a,fb:s.start+b});});
});
fs.writeFileSync(path.join(ED,'captions-zh.lines.json'),JSON.stringify(lines,null,1),'utf8');
console.log('LINES',lines.length);
lines.forEach((L,i)=>console.log(String(i).padStart(2),L.seg,L.fa.toFixed(2)+'-'+L.fb.toFixed(2),L.zh));

function stamp(t){const ms=Math.round(t*1000),p=(v,n)=>String(v).padStart(n,'0');
  return `${p(Math.floor(ms/3600000),2)}:${p(Math.floor(ms%3600000/60000),2)}:${p(Math.floor(ms%60000/1000),2)},${p(ms%1000,3)}`;}
if(process.argv.includes('--en')){
  const gl=require(path.join(ED,'glossary.json'));
  fs.mkdirSync(YT,{recursive:true});
  const miss=lines.filter(L=>!gl[L.zh]).map(L=>L.zh);
  if(miss.length){console.error('glossary 缺译文：\n'+miss.join('\n'));process.exit(1);}
  const write=(file,key)=>fs.writeFileSync(path.join(YT,file),
    lines.map((L,i)=>`${i+1}\n${stamp(L.fa)} --> ${stamp(L.fb)}\n${key==='zh'?L.zh:gl[L.zh]}\n`).join('\n'),'utf8');
  write('captions-zh.srt','zh');write('captions-en.srt','en');
  console.log('WROTE captions-zh.srt / captions-en.srt');
}
