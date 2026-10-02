import {cpSync,mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.dirname(fileURLToPath(import.meta.url));
const dest=path.resolve(root,'../../public/html/game/jackal-3d');
mkdirSync(dest,{recursive:true});cpSync(path.join(root,'src'),dest,{recursive:true});
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const manifest=files(dest).filter(p=>!p.endsWith('build.json')&&!path.basename(p).startsWith('.')).sort().map(p=>({file:path.relative(dest,p).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(readFileSync(p)).digest('hex')}));
const fingerprint=crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
writeFileSync(path.join(dest,'build.json'),JSON.stringify({version:'v0.1.0',fingerprint,files:manifest},null,2));
console.log(JSON.stringify({dest,fingerprint,files:manifest.length}));
