import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,utimes,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {HostAI} from '../host-ai.mjs';
test('语音清理保留刚生成及最近播放的WAV，避免达到40个文件后出现404',{skip:process.platform!=='win32'},async()=>{
  const prefix=path.join(os.tmpdir(),'chongchao-tts-'),dir=await mkdtemp(prefix);
  try{
    for(let i=0;i<40;i++){const f=path.join(dir,'ffffffff-'+i+'.wav');await writeFile(f,'old');const old=new Date(Date.now()-600000);await utimes(f,old,old);}
    const recent=path.join(dir,'00000000-recent.wav');await writeFile(recent,'recent');
    const config=JSON.parse(await readFile(new URL('../config.example.json',import.meta.url),'utf8'));
    const host=new HostAI(config,dir,()=>{}),url=await host.tts('守住基地。');
    assert.equal((await readFile(path.join(dir,path.basename(url)))).subarray(0,4).toString(),'RIFF');
    assert.equal(await readFile(recent,'utf8'),'recent');
  }finally{assert(dir.startsWith(prefix));await rm(dir,{recursive:true});}
});
