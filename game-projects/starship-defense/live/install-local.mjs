// Install a self-contained copy outside the checkout. Preserve user configuration
// in LOCALAPPDATA/ChongchaoLive; never copy secrets from the repository.
import {cp,mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const source=path.resolve(import.meta.dirname,'../../..');
const destination=path.join(process.env.LOCALAPPDATA,'ChongchaoLive','app');
const liveDestination=path.join(destination,'game-projects/starship-defense/live');
await mkdir(liveDestination,{recursive:true});
for(const file of ['server.mjs','bilibili.mjs','host-ai.mjs','tts.ps1','package.json','package-lock.json','config.example.json','start-live.ps1','README.md'])await cp(path.join(import.meta.dirname,file),path.join(liveDestination,file));
// Windows PowerShell 5.1 otherwise decodes Chinese UTF-8 source as the ANSI
// code page. Keep exactly one BOM and CRLF even after a Git checkout/editor save.
for(const file of ['start-live.ps1','tts.ps1']){
  const text=(await readFile(path.join(import.meta.dirname,file),'utf8')).replace(/^\uFEFF/,'').replace(/\r?\n/g,'\r\n');
  await writeFile(path.join(liveDestination,file),'\uFEFF'+text,'utf8');
}
await cp(path.join(source,'public/html/game/starship-defense'),path.join(destination,'public/html/game/starship-defense'),{recursive:true});
for(const file of ['public/css/base.css','public/js/game/thumb-preview.js']){await mkdir(path.dirname(path.join(destination,file)),{recursive:true});await cp(path.join(source,file),path.join(destination,file));}
// Use the task's verified dependency lock and modules; the installed app starts offline.
await cp(path.join(import.meta.dirname,'node_modules'),path.join(liveDestination,'node_modules'),{recursive:true});
const starter=path.join(destination,'启动虫潮AI直播.cmd');
await writeFile(starter,'@echo off\r\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0game-projects\\starship-defense\\live\\start-live.ps1"\r\nif errorlevel 1 pause\r\n','utf8');
const scene={name:'虫潮AI直播',current_scene:'虫潮AI直播',current_program_scene:'虫潮AI直播',scene_order:[{name:'虫潮AI直播'}],sources:[{name:'虫潮战场',id:'browser_source',versioned_id:'browser_source',settings:{url:'http://127.0.0.1:18765/html/game/starship-defense/live.html?capture=1',width:1920,height:1080,reroute_audio:true,shutdown:false,restart_when_active:false},mixers:255,volume:1,enabled:true},{name:'虫潮AI直播',id:'scene',versioned_id:'scene',settings:{items:[{name:'虫潮战场',visible:true,locked:true,pos:{x:0,y:0},scale:{x:1,y:1},rot:0,align:5,bounds_type:0,bounds:{x:0,y:0}}]}}]};
await writeFile(path.join(destination,'OBS-虫潮AI直播.json'),JSON.stringify(scene,null,2),'utf8');
await writeFile(path.join(destination,'build.json'),JSON.stringify({version:'live-v0.1.0',commit:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),installedAt:new Date().toISOString(),source},null,2),'utf8');
console.log(JSON.stringify({destination,starter,obsScene:path.join(destination,'OBS-虫潮AI直播.json')}));
