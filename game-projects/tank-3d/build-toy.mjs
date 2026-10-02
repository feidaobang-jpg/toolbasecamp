// Reproducible Chinese-only standalone package; never publishes by itself.
// node game-projects/tank-3d/build-toy.mjs
import {readFileSync,writeFileSync,mkdirSync,cpSync,readdirSync} from 'node:fs';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=join(root,'public/html/game/tank-3d');
const meta=JSON.parse(readFileSync(join(root,'game-projects/tank-3d/media-kit/game.json'),'utf8'));
const version=meta.current_version;
const out=join(root,'game-projects/tank-3d/dist',version,'package');
mkdirSync(out,{recursive:true});
const writes=new Set();
function write(name,text){const p=join(out,name);mkdirSync(dirname(p),{recursive:true});writeFileSync(p,text,'utf8');writes.add(name);}
function copy(from,name){const p=join(out,name);mkdirSync(dirname(p),{recursive:true});cpSync(join(root,from),p);writes.add(name);}
for(const name of readdirSync(source)){
 if(!/\.(js|html|css)$/.test(name))throw Error('Unexpected runtime asset: '+name);
 let text=readFileSync(join(source,name),'utf8').replaceAll('../../../js/','./js/').replaceAll('../../../css/','./css/').replaceAll('../../../favicon.svg','./favicon.svg').replaceAll('../../../vendor/three/0.170.0/build/three.module.js','./vendor/three.module.js');
 if(name==='index.html')text=text.replace(/<a\b[^>]*href="\.\.\/\.\.\/\.\.\/games\.html"[^>]*>[\s\S]*?<\/a>/g,'');
 write(name,text);
}
copy('public/vendor/three/0.170.0/build/three.module.js','vendor/three.module.js');
copy('public/css/base.css','css/base.css');
copy('public/favicon.svg','favicon.svg');
copy('public/js/i18n.js','js/i18n.js');
copy('public/js/game/demo-controls.js','js/game/demo-controls.js');
copy('public/js/locales/game-demo-zh-CN.js','js/locales/game-demo-zh-CN.js');
const sandbox={window:{TB_LOCALES:{}}};
runInNewContext(readFileSync(join(root,'public/js/locales/zh-CN.js'),'utf8'),sandbox);
const zh=sandbox.window.TB_LOCALES['zh-CN'];
write('js/locales/zh-CN.js','window.TB_LOCALES = {"zh-CN":'+JSON.stringify({tank3d:zh.tank3d,common:zh.common})+'};\n');
// Fail rather than silently uploading leftovers from another package generation.
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);}
for(const p of walk(out))if(!writes.has(relative(out,p).replaceAll('\\','/')))throw Error('Unexpected package file: '+p);
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const manifest={version,source:'public/html/game/tank-3d',source_sha256:Object.fromEntries(readdirSync(source).map(n=>[n,sha(join(source,n))])),files:Object.fromEntries([...writes].sort().map(n=>[n,sha(join(out,n))])),status:'built_not_submitted'};
const manifestPath=join(root,'game-projects/tank-3d/media-kit/releases',version,'toy-build.json');
mkdirSync(dirname(manifestPath),{recursive:true});writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({package:out,files:writes.size,manifest:manifestPath}));
