// One classic-script entry for older tablet browsers and Toy webviews.
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
await build({entryPoints:[path.join(root,'public/html/game/gunfire-assembly/game.js')],
  outfile:path.join(root,'public/html/game/gunfire-assembly/game.compat.js'),
  bundle:true,format:'iife',target:['chrome58'],minify:true,legalComments:'eof',logLevel:'info',
  plugins:[{name:'local-version-query',setup(b){b.onResolve({filter:/\?v=/},a=>({path:path.resolve(a.resolveDir,a.path.split('?')[0])}));}}]});
// 抗战战役第三章「平安县城」重做版：独立页面，同样出一个经典脚本包
await build({entryPoints:[path.join(root,'public/html/game/gunfire-assembly/pingan/js/main.js')],
  outfile:path.join(root,'public/html/game/gunfire-assembly/pingan/game.compat.js'),
  bundle:true,format:'iife',target:['chrome58'],minify:true,legalComments:'eof',logLevel:'info'});
