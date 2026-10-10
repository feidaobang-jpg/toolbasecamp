// 虫潮对战平衡模拟：无界面加速时钟，电脑对电脑批量打完整局，统计对局时长、胜率和打法。
// 用法：GAME_URL=http://127.0.0.1:8794/html/game/starship-defense/index.html RUNS=20 node verify-versus-balance.cjs
// 可选 OUT=结果 JSON 路径；PW=playwright 模块路径；SIZE=每队人数（1–4，默认 1）。
const fs=require('node:fs'),path=require('node:path');
const pw=process.env.PW||['D:/project/godot/absurd-3d-daily/node_modules/playwright','C:/Users/37818/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'].find(p=>fs.existsSync(p));
const {chromium}=require(pw);
const url=process.env.GAME_URL||'http://127.0.0.1:8794/html/game/starship-defense/index.html';
const RUNS=+(process.env.RUNS||12),SIZE=+(process.env.SIZE||1),IDLE=process.env.IDLE_SCAN==null?null:+process.env.IDLE_SCAN,OUT=process.env.OUT||path.join(__dirname,'qa','out','versus-balance.json');
// 打法：在默认难度表上派生，只改经济/出兵倾向，仍走同一套规则。
const STRATEGIES={
  normal:null,hard:null,easy:null,
  greedy:{base:'hard',patch:{bankMax:5,bankAt:[0,0,40,120,240],wave:'t=>Math.min(3200,1400+Math.max(0,t-240)*4)',baseDef:500,defPerSec:1}},
  nbig:{base:'normal',patch:{wave:'t=>Math.min(1800,900+t)',maxGroups:3}},nslow:{base:'normal',patch:{think:10}},hbig:{base:'hard',patch:{wave:'t=>Math.min(2200,1000+t*1.2)',maxGroups:4}},hnc:{base:'hard',patch:{turrets:[1,300],defPerSec:.4,heroPush:false}},
  nnp:{base:'normal',patch:{heroPush:false}},nnw:{base:'normal',patch:{weapons:[]}},nb2:{base:'normal',patch:{bankMax:2}},nt1:{base:'normal',patch:{turrets:[1,300],defPerSec:.4}},nnpt:{base:'normal',patch:{prepTurret:false}},
  hardnp:{base:'hard',patch:{heroPush:false}},hardt4:{base:'hard',patch:{think:4}},hardnw:{base:'hard',patch:{weapons:[],walls:0}},
  easyr:{base:'easy',patch:{reserve:400,waveGap:35}},normr:{base:'normal',patch:{reserve:200}},nr0:{base:'normal',patch:{reserve:0}},nhf:{base:'normal',patch:{reserve:0,heroFire:.7}},normr2:{base:'normal',patch:{reserve:200,heroFire:.75}},easyr2:{base:'easy',patch:{reserve:600,waveGap:40,bankMax:1}},
  rush:{base:'hard',patch:{bankMax:1,wave:'t=>300',baseDef:0,defPerSec:0,only:['swarm','gunners','assault']}},
};
const MONO=['swarm','gunners','assault','carapace','flyers','bombers','jeep'];
const MATCHUPS=(process.env.MATCHUPS||'normal:normal,hard:normal,easy:normal,hard:hard,greedy:rush,rush:normal').split(',').map(s=>s.split(':'));
(async()=>{
  const b=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=d3d11']});
  const out={url,runs:RUNS,size:SIZE,started:new Date().toISOString(),matchups:{}};
  try{
    const p=await b.newPage({viewport:{width:960,height:540}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(url+'?qa=1');await p.waitForFunction(()=>window.__gameQA&&window.__ccReady,null,{timeout:60000});
    await p.evaluate(()=>{window.__gameQA.AudioSys.master&&(window.__gameQA.AudioSys.master.gain.value=0);});
    const mono=(process.env.MONO==='1')?MONO.map(u=>['mono_'+u,'normal']):[];
    for(const [blue,red] of [...MATCHUPS,...mono]){
      const rows=[];
      for(let i=0;i<RUNS;i++){
        const r=await p.evaluate(({blue,red,STRATEGIES,SIZE,IDLE})=>{
          const q=window.__gameQA,AI=q.VS_AI;
          const make=(name)=>{
            if(name.startsWith('mono_')){const id=name.slice(5),key='__'+name;AI[key]={...AI.normal,only:[id],name};return key;}
            const st=STRATEGIES[name];if(!st)return name;const key='__'+name;
            const patch={...st.patch};if(typeof patch.wave==='string')patch.wave=eval(patch.wave);
            AI[key]={...AI[st.base],...patch,name};return key;
          };
          q.startVersusSim(make(blue),make(red),SIZE);const v=q.versus.state;if(IDLE!=null)v.idleScan=IDLE;
          let steps=0,maxUnits=0;while(!q.versusSimStep(.05)&&steps<20*60*19){steps++;if(v.units.length>maxUnits)maxUnits=v.units.length;}v.maxUnits=maxUnits;
          const res=v.result||{winner:null,reason:'未结束',time:v.time};
          const pick=t=>{const st=q.versus.teamSummary(t);return {sent:st.sent,first:st.firstSend??null,bank:q.versus.members(t).map(s=>s.bank).join('/'),kills:st.kills,built:st.built,heroDeaths:st.heroDeaths,deathsBy:st.deathsBy||{},deathZone:st.deathZone||{},lostBuildings:st.lostBuildings,byUnit:st.byUnit||{},hq:+(v.hq[t].hp/v.hq[t].maxHp).toFixed(3),maxUnits:v.maxUnits||0};};
          const row={winner:res.winner,reason:res.reason,time:Math.round(res.time),blue:pick('blue'),red:pick('red')};
          q.exitVersus();return row;
        },{blue,red,STRATEGIES,SIZE,IDLE});
        rows.push(r);
      }
      const n=rows.length,wins=t=>rows.filter(r=>r.winner===t).length,avg=a=>Math.round(a.reduce((s,x)=>s+x,0)/Math.max(1,a.length));
      const summary={blueWins:wins('blue'),redWins:wins('red'),draws:rows.filter(r=>!r.winner).length,avgTime:avg(rows.map(r=>r.time)),minTime:Math.min(...rows.map(r=>r.time)),maxTime:Math.max(...rows.map(r=>r.time)),
        timeouts:rows.filter(r=>/时间到|加时/.test(r.reason)).length,maxUnits:Math.max(...rows.map(r=>r.blue.maxUnits)),before180:rows.filter(r=>r.winner&&r.time<180).length,avgFirstSend:{blue:avg(rows.map(r=>r.blue.first??0)),red:avg(rows.map(r=>r.red.first??0))}};
      out.matchups[blue+' vs '+red]={summary,rows};
      console.log(blue.padEnd(14),'vs',red.padEnd(8),JSON.stringify(summary));
    }
    out.errors=errors;if(errors.length)console.log('PAGE ERRORS',errors.slice(0,5));
  }finally{await b.close();}
  fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(out,null,1));console.log('saved',OUT);
})().catch(e=>{console.error(e);process.exit(1);});
