import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inlineStartup} from './taptap-startup.mjs';

const source = `<div id="loading">正在搭建…</div><script>
window.addEventListener('error', function (e) {});
</script><script src="js/game.min.js?v=old"></script>`;
function run(runtime='document.getElementById("loading").hidden=true;', markup=source, options={}) {
  const listeners={},timers=[],children=[];
  const loading={hidden:false,parentNode:{},classList:{remove(){}},style:{},textContent:'正在搭建…',setAttribute(){},appendChild(el){children.push(el);}};
  const document={getElementById:()=>loading,createElement:tag=>({tagName:tag})};
  const window={addEventListener:(name,fn)=>listeners[name]=fn};
  let reloads=0;
  function Element(){}
  const context=vm.createContext({window,document,Element,setTimeout:fn=>timers.push(fn),location:{reload:()=>reloads++}});
  const html=inlineStartup(markup,runtime,options);
  const scripts=[...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  for(const script of scripts) {
    try { vm.runInContext(script,context); }
    catch(error) { listeners.error({target:window,message:error.message}); }
  }
  return {html,loading,children,window,listeners,timers,reloads:()=>reloads};
}
test('startup works without any external program request and timeout stays hidden after success',()=>{
  const p=run();
  assert.doesNotMatch(p.html,/<script src=/);
  p.timers[0]();
  assert.equal(p.loading.hidden,true);
  assert.equal(p.children.length,0);
});
test('a JS parse failure replaces the indefinite spinner and reload preserves save state',()=>{
  const p=run('invalid syntax !');
  assert.match(p.loading.textContent,/启动失败/);
  assert.equal(p.children[1].textContent,'重新加载');
  p.children[1].onclick();
  assert.equal(p.reloads(),1);
  assert.doesNotMatch(p.html,/localStorage\.clear|removeItem/);
});
test('initialization rejection and no completion both produce actionable failures',()=>{
  const p=run('window.__tapStartup();');
  p.listeners.unhandledrejection({reason:{message:'WebGL failed'}});
  assert.match(p.loading.textContent,/3D 初始化.*WebGL failed/);
  const stalled=run(''); stalled.timers[0]();
  assert.match(stalled.loading.textContent,/超过 20 秒/);
});
test('optional image failures do not abort startup and raw script endings stay inside JavaScript',()=>{
  const p=run('window.value="</script>";');
  assert.equal(p.window.value,'</script>');
  p.listeners.error({target:{tagName:'IMG'}});
  assert.equal(p.children.length,0);
});

test('module entries and import maps become an ordinary inline runtime',()=>{
  const markup=source.replace('<script src="js/game.min.js?v=old">','<script type="module" src="./main.js?v=old">')+'<script type="importmap">{"imports":{}}</script>';
  const p=run(undefined,markup,{kind:'module'});
  assert.doesNotMatch(p.html,/type="module"|importmap|src=/);
  assert.equal(p.loading.hidden,true);
});

test('a dynamic-import entry reports a failure without relying on the module loader',()=>{
  const markup=`<script type="module">import('./main.js?v=old').catch(function(){});</script>`;
  const p=run('throw Error("renderer failed")',markup,{kind:'journey'});
  assert.match(p.loading.textContent,/renderer failed/);
});

test('starship readiness prevents the timeout from obscuring an initialized game',()=>{
  const markup=`<script src="./boot.js?v=old"></script><script defer src="./game.compat.js?v=old" onerror="fail()"></script>`;
  const p=run('window.__ccReady=true;',markup,{kind:'starship',loadingId:'assetLoad',readyFlag:'__ccReady',prelude:'window.__ccBootError=function(){};'});
  p.timers[0]();
  assert.equal(p.children.length,0);
  assert.equal(p.window.__ccBootError,p.window.__tapStartupError);
});

test('an unrecognized entry fails the build rather than silently leaving an old loader',()=>{
  assert.throws(()=>inlineStartup('<script src="new-entry.js"></script>',''),/Startup markup changed/);
});
