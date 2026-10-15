/* ES5 bootstrap: readable layout and errors even if the game cannot be parsed. */
(function(){
  var E=Element.prototype,d=document;
  if(!E.replaceChildren)E.replaceChildren=function(){while(this.firstChild)this.removeChild(this.firstChild);for(var i=0;i<arguments.length;i++)this.appendChild(typeof arguments[i]==='string'?d.createTextNode(arguments[i]):arguments[i]);};
  if(!Object.hasOwn)Object.hasOwn=function(o,k){return Object.prototype.hasOwnProperty.call(o,k);};
  if(!E.requestFullscreen&&E.webkitRequestFullscreen)E.requestFullscreen=function(){return this.webkitRequestFullscreen();};
  if(!d.exitFullscreen&&d.webkitExitFullscreen)d.exitFullscreen=function(){return d.webkitExitFullscreen();};
  if(!('fullscreenElement' in d)&&('webkitFullscreenElement' in d))Object.defineProperty(d,'fullscreenElement',{get:function(){return d.webkitFullscreenElement;}});
  try{var f=d.createElement('div');f.style.cssText='display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';f.appendChild(d.createElement('div'));f.appendChild(d.createElement('div'));d.body.appendChild(f);if(f.scrollHeight!==1)d.documentElement.classList.add('no-flexgap');f.parentNode.removeChild(f);}catch(e){}
  function fit(){
    if(window.__ccBooted)return;
    var stage=d.getElementById('stage'),v=window.visualViewport||{},w=window.innerWidth||d.documentElement.clientWidth||v.width||screen.width||960,h=window.innerHeight||d.documentElement.clientHeight||v.height||screen.height||540;
    if(!stage)return;
    var rotate=h>w,sw=rotate?h:w,sh=rotate?w:h;
    stage.style.height=(960*sh/sw)+'px';stage.style.transform='translate(-50%,-50%) '+(rotate?'rotate(90deg) ':'')+'scale('+(sw/960)+')';
  }
  window.__ccBootError=function(reason){
    if(window.__ccReady)return;
    window.__ccBooted=false;fit();
    var box=d.getElementById('assetLoad');if(!box){box=d.createElement('div');box.id='assetLoad';d.getElementById('stage').appendChild(box);}
    box.style.display='block';box.style.padding='35px';box.style.background='#101c2e';
    box.textContent='启动没有完成：'+reason+'。请点重试；若仍失败，请将下方浏览器信息截图反馈。';
    var info=d.createElement('p');info.style.cssText='font-size:12px;word-break:break-all;margin:18px';info.textContent=navigator.userAgent;box.appendChild(info);
    var btn=d.createElement('button');btn.className='mbtn';btn.textContent='重新加载';btn.onclick=function(){location.reload();};box.appendChild(btn);
  };
  window.addEventListener('resize',fit);fit();
  var check=setInterval(function(){if(window.__ccReady)clearInterval(check);else fit();},500);
  window.addEventListener('error',function(e){if(!window.__ccReady&&(!e.filename||e.filename.indexOf('game.compat.js')!==-1))window.__ccBootError(e.message||'脚本加载失败');});
  setTimeout(function(){if(!window.__ccReady)window.__ccBootError('等待游戏初始化超时（网络或浏览器兼容问题）');},30000);
})();
