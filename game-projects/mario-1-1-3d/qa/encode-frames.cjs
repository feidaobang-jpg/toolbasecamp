// Pipe captured JPEG frames through ffmpeg's image2pipe demuxer (this ffmpeg
// build lacks the numbered-file image2 demuxer) and write a webm master.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const framesDir = process.argv[2];
const out = process.argv[3];
const ffmpeg = process.env.FFMPEG || (process.env.USERPROFILE + '/AppData/Local/ms-playwright/ffmpeg-1011/ffmpeg-win64.exe');
const fps = Number(process.argv[4] || 30);
const files = fs.readdirSync(framesDir).filter(f => /^frame-\d+\.jpg$/.test(f)).sort();
if (!files.length) { console.error('no frames'); process.exit(1); }
const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', 'pipe:0', '-c:v', 'libvpx', '-b:v', '2M', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'ignore', 'inherit'] });
ff.on('exit', code => { console.log(code === 0 ? 'encode OK' : 'encode FAIL ' + code); process.exit(code === 0 ? 0 : 1); });
let i = 0;
function pump() {
  let ok = true;
  while (i < files.length && ok) ok = ff.stdin.write(fs.readFileSync(path.join(framesDir, files[i++])));
  if (i >= files.length && ok) ff.stdin.end();
}
ff.stdin.on('error', () => {});
ff.stdin.on('drain', pump);
pump();
