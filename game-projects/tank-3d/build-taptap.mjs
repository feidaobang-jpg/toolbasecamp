// Build a self-contained TapTap H5 archive; never uploads or changes website files.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=path.join(root,'public/html/game/tank-3d');
const output=path.join(root,'dist/taptap/tank-3d');
const packageDir=path.join(output,'tank-3d');
const meta=JSON.parse(fs.readFileSync(path.join(root,'game-projects/tank-3d/media-kit/game.json'),'utf8'));
if(!packageDir.startsWith(root+path.sep)||path.dirname(packageDir)!==output)throw Error('Unsafe output path');
fs.mkdirSync(output,{recursive:true});
if(fs.existsSync(packageDir))fs.rmSync(packageDir,{recursive:true});
fs.mkdirSync(packageDir);
const files={};
const hash=data=>createHash('sha256').update(data).digest('hex');
function write(name,data){const target=path.join(packageDir,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);files[name]=hash(data);}
for(const entry of fs.readdirSync(source,{withFileTypes:true})){
  if(entry.isDirectory()){
    if(entry.name!=='sounds')throw Error('Unexpected runtime directory');
    for(const name of fs.readdirSync(path.join(source,entry.name)))write('sounds/'+name,fs.readFileSync(path.join(source,entry.name,name)));
    continue;
  }
  if(!/\.(js|html|css)$/.test(entry.name))throw Error('Unexpected runtime asset');
  let text=fs.readFileSync(path.join(source,entry.name),'utf8')
    .replaceAll('../../../vendor/three/0.170.0/build/three.module.js','./vendor/three.module.js')
    .replaceAll('../../../js/game/drag-look.js','./drag-look.js').replaceAll('../../../js/game/coop.js','./coop-shared.js')
    .replaceAll(/'\.\.\/\.\.\/\.\.\/js\/game\/landscape-typing\.js(\?v=[a-z0-9-]+)?'/g,"'./landscape-typing.js'")
    .replaceAll('../../../favicon.svg','./favicon.svg');
  if(entry.name==='index.html')text=text.replace(/\s*<a data-act="list"[^>]*>[\s\S]*?<\/a>/g,'')
    .replaceAll('data-list-url="../../../games.html"','data-list-url="./index.html"')
    .replaceAll('href="../../../games.html"','href="./index.html"').replaceAll('返回游戏列表</a>','重新载入</a>');
  if(entry.name==='main.js'){
    if(!text.includes("const NS = 'tank3d-v2:';"))throw Error('Save namespace changed; review adapter');
    text=text.replace("const NS = 'tank3d-v2:';","const NS = 'taptap-tank3d-v1:';")
      .replaceAll("'tb-game-tank3d-progress'","'taptap-tank3d-legacy-progress'")
      .replaceAll("'tb-game-tank3d-hi'","'taptap-tank3d-legacy-hi'")
      .replace("app.getAttribute('data-list-url') || '../../../games.html'","app.getAttribute('data-list-url') || './index.html'");
  }
  if(entry.name==='coop.js')text=text.replace(/  if \(typeof location[\s\S]*?\n  }\n/,'');
  if(/\.\.\/\.\.\//.test(text))throw Error('External relative dependency: '+entry.name);
  write(entry.name,Buffer.from(text,'utf8'));
}
for(const [from,to] of [['public/vendor/three/0.170.0/build/three.module.js','vendor/three.module.js'],['public/favicon.svg','favicon.svg'],['public/js/game/drag-look.js','drag-look.js'],['public/js/game/coop.js','coop-shared.js'],['public/js/game/landscape-typing.js','landscape-typing.js']])write(to,fs.readFileSync(path.join(root,from)));
const zip=path.join(output,'tank-3d.zip');
const result=spawnSync(process.env.PYTHON||'python',['-c','import pathlib,sys,zipfile; p=pathlib.Path(sys.argv[1]); z=zipfile.ZipFile(sys.argv[2],"w"); [(z.writestr(zipfile.ZipInfo(f.relative_to(p.parent).as_posix(),(2026,1,1,0,0,0)),f.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=6)) for f in sorted(p.rglob("*")) if f.is_file()]; z.close()',packageDir,zip],{encoding:'utf8',env:{...process.env,PYTHONUTF8:'1'}});
if(result.status!==0)throw Error(result.stderr||result.error?.message);
const manifest={channel:'taptap-h5',title:'坦克大战 3D',version:meta.current_version,source_commit:spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim(),zip_sha256:hash(fs.readFileSync(zip)),zip_bytes:fs.statSync(zip).size,files,archive_root:'tank-3d/',monetization:'none',network:'Optional 2–4 player co-op using existing production WebSocket relay; single-player assets bundled.',status:'built_not_uploaded'};
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(JSON.stringify({zip,manifest},null,2));
