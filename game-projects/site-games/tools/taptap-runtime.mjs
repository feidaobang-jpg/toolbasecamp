// npm --prefix game-projects/site-games ci
import {build} from 'esbuild';
import path from 'node:path';
export {build};

// Bundle the already adapted package so its save namespace and channel behavior stay intact.
export async function bundleRuntime(directory, entry) {
  const result=await build({
    absWorkingDir:directory,entryPoints:[entry],bundle:true,format:'iife',
    target:['chrome58','safari15'],minify:true,write:false,charset:'utf8',legalComments:'eof',metafile:true,
    plugins:[{name:'local-query-paths',setup(b){
      b.onResolve({filter:/\?v=/},args=>({path:path.resolve(args.resolveDir,args.path.split('?')[0])}));
    }}],logLevel:'warning',
  });
  if(Object.values(result.metafile.outputs).some(o=>o.imports.length))throw Error('Runtime still has an external module dependency');
  return result.outputFiles[0].text;
}
