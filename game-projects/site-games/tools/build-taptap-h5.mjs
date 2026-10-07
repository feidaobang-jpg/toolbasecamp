// Build existing remake runtimes as standalone TapTap H5 ZIPs, without uploading.
// Usage: node game-projects/site-games/tools/build-taptap-h5.mjs <game-directory>
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {inlineStartup,STARTUP_ADAPTER} from './taptap-startup.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const games={
  'jackal-stage1-3d':{title:'赤色要塞 3D',namespace:['jk3d-stage1:','taptap-jackal-v1:']},
  'cadillacs-stage1-3d':{title:'恐龙快打 3D',namespace:['cd3d-stage1:','taptap-cadillacs-v1:'],inlineRuntime:'js/game.min.js'},
  'mario-3d':{title:'超级玛丽 3D',namespace:['mario3d-v2:','taptap-mario-v1:']},
  'journey-west-3d':{title:'西游降魔 3D',namespace:null},
};
const slug=process.argv[2];
if(!Object.hasOwn(games,slug))throw Error('Choose an existing supported game directory');
const config=games[slug];
const source=path.join(root,'public/html/game',slug);
const output=path.join(root,'dist/taptap',slug);
const packageDir=path.join(output,slug);
const meta=JSON.parse(fs.readFileSync(path.join(root,'game-projects',slug,'media-kit/game.json'),'utf8'));
if(!packageDir.startsWith(path.join(root,'dist/taptap')+path.sep)||path.dirname(packageDir)!==output)throw Error('Unsafe output path');
fs.mkdirSync(output,{recursive:true});
if(fs.existsSync(packageDir))fs.rmSync(packageDir,{recursive:true});
fs.mkdirSync(packageDir);
const hash=data=>createHash('sha256').update(data).digest('hex');
const files={},sourceHashes={};
function write(name,data){const file=path.join(packageDir,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);files[name]=hash(data);}
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
let namespaceRewrites=0;
function adaptText(text){
  text=text.replaceAll('gamehub-','taptap-gamehub-');
  if(config.namespace){const [from,to]=config.namespace;namespaceRewrites+=text.split(from).length-1;text=text.replaceAll(from,to);}
  return text;
}
for(const file of walk(source)){
  const name=path.relative(source,file).replaceAll('\\','/');
  const data=fs.readFileSync(file);sourceHashes[name]=hash(data);
  if(name===config.inlineRuntime)continue;
  if(!/\.(html|js|css)$/.test(name)){write(name,data);continue;}
  let text=data.toString('utf8')
    .replaceAll('../../../vendor/three/0.170.0/build/three.module.js','./vendor/three.module.js')
    .replaceAll('../../../vendor/three/0.170.0/examples/jsm/utils/BufferGeometryUtils.js','./vendor/BufferGeometryUtils.js')
    .replaceAll('../../../js/game/drag-look.js','./drag-look.js')
    .replaceAll(/'\.\.\/\.\.\/\.\.\/js\/game\/landscape-typing\.js(\?v=[a-z0-9-]+)?'/g,"'./landscape-typing.js'")
    .replaceAll('../../../js/game/sample-audio.js','./sample-audio.js')
    .replaceAll('../../../css/base.css','./base.css')
    .replaceAll('../../../favicon.svg','./favicon.svg');
  if(name==='index.html')text=text
    .replace(/\s*<a data-act="list"[^>]*>[\s\S]*?<\/a>/g,'')
    .replace(/\s*<a id="back"[^>]*>[\s\S]*?<\/a>/g,'<a id="back" class="tb-btn" href="./index.html" hidden></a>')
    .replaceAll('data-list-url="../../../games.html"','data-list-url="./index.html"')
    .replace(/<a href="\.\.\/\.\.\/\.\.\/games.html"[^>]*>[\s\S]*?<\/a>/g,'');
  text=text.replaceAll('../../../games.html','./index.html');
  if(name==='index.html'&&config.inlineRuntime)text=inlineStartup(text,fs.readFileSync(path.join(source,config.inlineRuntime),'utf8'));
  text=adaptText(text);
  if(/\.\.\/\.\.\//.test(text))throw Error('Unbundled relative dependency in '+name);
  write(name,Buffer.from(text,'utf8'));
}
if(config.namespace&&!namespaceRewrites)throw Error('Save namespace changed; review adapter');
for(const [from,to] of [
  ['public/vendor/three/0.170.0/build/three.module.js','vendor/three.module.js'],
  ['public/vendor/three/0.170.0/examples/jsm/utils/BufferGeometryUtils.js','vendor/BufferGeometryUtils.js'],
  ['public/js/game/drag-look.js','drag-look.js'],
  ['public/js/game/landscape-typing.js','landscape-typing.js'],
  ['public/js/game/sample-audio.js','sample-audio.js'],
  ['public/css/base.css','base.css'],['public/favicon.svg','favicon.svg'],
  ['game-projects/starship-defense/THREE-LICENSE.txt','vendor/THREE-LICENSE.txt'],
]){
  let data=fs.readFileSync(path.join(root,from));
  if(to==='vendor/BufferGeometryUtils.js')data=Buffer.from(data.toString('utf8').replace(/from 'three'/g,"from './three.module.js'"));
  write(to,data);
}
const zip=path.join(output,slug+'.zip');
const zipped=spawnSync(process.env.PYTHON||'python',['-c','import pathlib,sys,zipfile; p=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],"w"); [(z.writestr(zipfile.ZipInfo(f.relative_to(p.parent).as_posix(),(2026,1,1,0,0,0)),f.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)) for f in sorted(p.rglob("*")) if f.is_file()]; z.close()',packageDir,zip],{encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'}});
if(zipped.status!==0)throw Error(zipped.stderr||zipped.error?.message);
const manifest={channel:'taptap-h5',game:slug,title:config.title,version:meta.current_version,startup_adapter:config.inlineRuntime?STARTUP_ADAPTER:null,source_commit:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),source_hashes:sourceHashes,files,zip_sha256:hash(fs.readFileSync(zip)),zip_bytes:fs.statSync(zip).size,archive_root:slug+'/',storage_namespace:config.namespace?.[1]??'no persistent gameplay save',monetization:'none',status:'built_not_uploaded'};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(JSON.stringify({zip,version:manifest.version,sha256:manifest.zip_sha256,bytes:manifest.zip_bytes}));
