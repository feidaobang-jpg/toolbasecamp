// 片段索引生成器：扫描 capture/ 下全部 take，输出 index.md（源时间码—操作—画面反馈—口播—成片时间码 对账表）与 index.json
// 用法：node build-index.cjs [take1 take2 ...]（缺省=全部含 capture.json 的目录）
const fs=require('fs'),path=require('path');
const CAP=path.join(__dirname,'capture');
const SHOTS={
  1:'开场钩子',2:'入口与开局',3:'战况面板',4:'J撕咬',5:'K酸液',6:'U/I召唤',7:'生物量不足提示',
  8:'O蜕皮',9:'L冲刺',10:'人类反击/阵亡',11:'破门',12:'城内攻坚',13:'胜利结算',14:'触屏布局',15:'收尾余镜'};
const EVENT_SHOT={start:2,dash:'9,1',view:'1',acid:'5,1','summon-warrior':6,'summon-flyer':6,molt:8,
  'bug-down':10,respawn:10,fallback:10,siege:'10,5',front:1,'first-bite':'4,1','core-engage':'12,4',
  'gate-75':11,'gate-50':11,'gate-25':11,'gate-dead':11,'base-75':12,'base-50':12,'base-25':12,
  'round-over':'13,15','final-result':13,'smoke-stop':0,'gate-only-stop':0};
function shotOf(name){const key=Object.keys(EVENT_SHOT).find(k=>name===k||name.startsWith(k+'-')||name.startsWith(k));return key?EVENT_SHOT[key]:'';}
function frameAt(frames,t){
  if(!frames||!frames.length)return'';
  const base=frames[0].timestamp;const at=base+t;   // 事件 t 是相对秒，帧戳是绝对 epoch 秒
  let lo=0,hi=frames.length-1,best=frames[0];
  while(lo<=hi){const m=(lo+hi)>>1;if(frames[m].timestamp<=at){best=frames[m];lo=m+1;}else hi=m-1;}
  return best.file;
}
const takes=process.argv.slice(2).length?process.argv.slice(2)
  :fs.readdirSync(CAP).filter(d=>fs.existsSync(path.join(CAP,d,'capture.json'))).sort();
const rows=[],json={generated:new Date().toISOString(),takes:[]};
for(const take of takes){
  const dir=path.join(CAP,take);
  const meta=JSON.parse(fs.readFileSync(path.join(dir,'capture.json'),'utf8'));
  const frames=fs.existsSync(path.join(dir,'frames.json'))?JSON.parse(fs.readFileSync(path.join(dir,'frames.json'),'utf8')):[];
  json.takes.push({take,duration_s:meta.duration_s,frames:frames.length,overTitle:meta.finalState?.overTitle||'',
    gateHp:meta.finalState?.gateHp,baseHp:meta.finalState?.baseHp,strategy:meta.strategy,events:meta.events});
  rows.push(`\n## ${take} · ${meta.duration_s}s · ${frames.length}帧 · 结局「${meta.finalState?.overTitle||'?'}」\n`);
  rows.push(`打法：${meta.strategy||''}\n`);
  rows.push('| 源时间码 | 帧 | 事件/操作 | 门血 | 核心血 | 母虫HP | 生物量 | 虫群 | 镜头# | 画面反馈 | 口播要点 | 成片时间码 |');
  rows.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for(const e of meta.events){
    const st=e.state||{};
    rows.push(`| ${e.t}s | ${frameAt(frames,e.t)||'—'} | ${e.name} | ${st.gateHp??''} | ${st.baseHp??''} | ${st.bhp??''} | ${st.biomass??''} | ${st.swarm??''} | ${shotOf(e.name)||'—'} | | | |`);
  }
}
fs.writeFileSync(path.join(__dirname,'capture','index.md'),rows.join('\n')+'\n');
fs.writeFileSync(path.join(__dirname,'capture','index.json'),JSON.stringify(json,null,2));
console.log('INDEX OK takes:',takes.join(', '));
console.log('shot map:',Object.entries(SHOTS).map(([k,v])=>k+'='+v).join(' '));
