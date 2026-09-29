// Compute build fingerprint (sha256 over concatenated runtime files) and the
// captures manifest hash, printed as JSON for the handoff document.
const fs = require('fs');
const path = require('node:path');
const crypto = require('node:crypto');
const GAME = 'D:/project/toolbasecamp/public/html/game/mario-1-1-3d';
const CAP = 'D:/project/toolbasecamp/game-projects/mario-1-1-3d/media-kit/releases/v0.1.0/captures';
const runtime = ['index.html', 'main.js', 'world.js', 'scene.js', 'audio.js', 'style.css', 'file-warning.css'];
const h = crypto.createHash('sha256');
for (const f of runtime) h.update(fs.readFileSync(path.join(GAME, f)));
const files = fs.readdirSync(CAP).filter(f => fs.statSync(path.join(CAP, f)).isFile()).sort();
const list = files.map(f => f + ':' + crypto.createHash('sha256').update(fs.readFileSync(path.join(CAP, f))).digest('hex')).join('\n');
console.log(JSON.stringify({
  buildFingerprint: h.digest('hex'),
  capturesSha256: crypto.createHash('sha256').update(list).digest('hex'),
  captures: files.map(f => ({ file: f, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(CAP, f))).digest('hex'), bytes: fs.statSync(path.join(CAP, f)).size }))
}, null, 2));
