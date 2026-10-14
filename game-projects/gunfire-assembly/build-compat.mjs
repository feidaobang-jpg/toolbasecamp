// One classic-script entry for older tablet browsers and Toy webviews.
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
await build({entryPoints:[path.join(root,'public/html/game/gunfire-assembly/game.js')],
  outfile:path.join(root,'public/html/game/gunfire-assembly/game.compat.js'),
  bundle:true,format:'iife',target:['chrome58'],minify:true,legalComments:'eof',logLevel:'info',
  plugins:[{name:'local-version-query',setup(b){b.onResolve({filter:/\?v=/},a=>({path:path.resolve(a.resolveDir,a.path.split('?')[0])}));}}]});
// 抗战战役「亮剑战役」重做版（苍云岭 / 平安县城等章节共用一个页面）：同样出一个经典脚本包
await build({entryPoints:[path.join(root,'public/html/game/gunfire-assembly/liangjian/js/main.js')],
  outfile:path.join(root,'public/html/game/gunfire-assembly/liangjian/game.compat.js'),
  bundle:true,format:'iife',target:['chrome58'],minify:true,legalComments:'eof',logLevel:'info'});
