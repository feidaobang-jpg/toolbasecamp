// Preserve the existing Toy's offline-only package layout.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const version='boss-clear-20261004';
const out=path.join(__dirname,'dist',version,'package');
const release=path.join(__dirname,'media-kit/releases',version);
fs.mkdirSync(path.join(out,'shared/game'),{recursive:true});
fs.mkdirSync(release,{recursive:true});
let html=fs.readFileSync(path.join(root,'public/html/game/tank_battle.html'),'utf8').replaceAll('\r\n','\n');
html=html.replace(/<script src="\.\.\/\.\.\/js\/game\/thumb-preview\.js"><\/script>/,'')
  .replaceAll('../../js/game/','./shared/game/')
  .replace('const MENU_COUNT=7;','const MENU_COUNT=6;')
  .replace(',\n      "🌐 合作联机（最多 8 人）"','');
const start=html.indexOf('/* ---------------- 合作联机 WebSocket 大厅 ---------------- */');
const end=html.indexOf('/* ---------------- 画布缩放：',start);
if(start<0||end<0) throw Error('Toy offline adapter markers missing');
html=html.slice(0,start)+html.slice(end);
fs.writeFileSync(path.join(out,'index.html'),html);
const files=['index.html'];
for(const name of ['game-progress.js','touch-ui.js']){
  const file='shared/game/'+name;
  fs.copyFileSync(path.join(root,'public/js/game',name),path.join(out,file));files.push(file);
}
const hashes=Object.fromEntries(files.map(file=>[file,crypto.createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex')]));
const packageHash=crypto.createHash('sha256').update(JSON.stringify(hashes)).digest('hex');
fs.writeFileSync(path.join(release,'toy-build.json'),JSON.stringify({version,toyId:39043362707456,slug:'feidao-tank-battle',package:out,files:hashes,packageHash},null,2)+'\n');
console.log(JSON.stringify({out,packageHash}));
