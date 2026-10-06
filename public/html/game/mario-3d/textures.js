// 赤色要塞式自然色哑光石材与木材面板，不使用原版像素画风。
import * as THREE from './three.js?v=2.1.0';

const PAL = {
  overworld: { brick: '#c84c0c', mortar: '#000000', light: '#fcbcb0', mid: '#e45c10', ground: '#c84c0c', groundLine: '#000000', groundLight: '#fcbcb0' },
  underground: { brick: '#00808c', mortar: '#003c3c', light: '#7cf0f4', mid: '#0aa0a8', ground: '#00808c', groundLine: '#003c3c', groundLight: '#7cf0f4' }
};

function canvas16(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d'); draw(g); return c;
}
function px(g, color, x, y, w = 1, h = 1) { g.fillStyle = color; g.fillRect(x, y, w, h); }
export function pixelTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

function brick(theme) {
  const p = PAL[theme];
  return canvas16(g => {
    px(g, p.brick, 0, 0, 16, 16);
    for (let r = 0; r < 4; r++) {
      const y = r * 4;
      px(g, p.mortar, 0, y + 3, 16, 1);
      const off = r % 2 ? 4 : 0;
      for (const x of [off + 3, off + 11]) px(g, p.mortar, x % 16, y, 1, 3);
      px(g, p.light, 0, y, 16, 1);
      for (const x of [off + 4, off + 12]) px(g, p.light, x % 16, y, 1, 3);
    }
    px(g, p.mortar, 0, 15, 16, 1);
  });
}
function groundBlock(theme) {
  const p = PAL[theme];
  return canvas16(g => {
    px(g, p.ground, 0, 0, 16, 16);
    px(g, p.groundLight, 0, 0, 16, 1); px(g, p.groundLight, 0, 0, 1, 16);
    px(g, p.groundLine, 15, 0, 1, 16); px(g, p.groundLine, 0, 15, 16, 1);
    px(g, p.groundLine, 9, 1, 1, 9); px(g, p.groundLine, 1, 9, 9, 1);
    px(g, p.groundLight, 10, 1, 1, 9); px(g, p.groundLight, 1, 10, 9, 1);
    px(g, p.groundLine, 10, 10, 1, 5); px(g, p.groundLine, 6, 11, 4, 1);
    px(g, p.groundLight, 11, 11, 1, 4);
    px(g, p.groundLine, 3, 4, 2, 1); px(g, p.groundLine, 12, 5, 2, 1);
  });
}
function hardBlock(theme) {
  const p = PAL[theme];
  return canvas16(g => {
    px(g, p.brick, 0, 0, 16, 16);
    for (let i = 0; i < 3; i++) { px(g, p.light, i, i, 16 - i * 2, 1); px(g, p.light, i, i, 1, 16 - i * 2); px(g, p.mortar, i, 15 - i, 16 - i * 2, 1); px(g, p.mortar, 15 - i, i, 1, 16 - i * 2); }
    px(g, p.mid, 4, 4, 8, 8);
  });
}
function question() {
  return canvas16(g => {
    px(g, '#fc9838', 0, 0, 16, 16);
    px(g, '#c84c0c', 0, 15, 16, 1); px(g, '#c84c0c', 15, 0, 1, 16);
    px(g, '#000000', 0, 15, 16, 1); px(g, '#000000', 15, 1, 1, 15);
    px(g, '#fcbcb0', 0, 0, 15, 1); px(g, '#fcbcb0', 0, 0, 1, 15);
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px(g, '#000000', x, y);
    const q = ['..XXXX..', '.XX..XX.', '.XX..XX.', '....XX..', '...XX...', '...XX...', '........', '...XX...'];
    q.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === 'X') { px(g, '#000000', 5 + x, 4 + y); px(g, '#c84c0c', 4 + x, 3 + y); }
    }));
  });
}
function usedBlock() {
  return canvas16(g => {
    px(g, '#c84c0c', 0, 0, 16, 16);
    px(g, '#000000', 0, 0, 16, 1); px(g, '#000000', 0, 0, 1, 16); px(g, '#000000', 15, 0, 1, 16); px(g, '#000000', 0, 15, 16, 1);
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px(g, '#000000', x, y);
  });
}
function lift() {
  return canvas16(g => {
    px(g, '#fca044', 0, 0, 16, 16);
    px(g, '#fcfcfc', 0, 0, 16, 2);
    px(g, '#c84c0c', 0, 14, 16, 2);
    for (const x of [2, 7, 12]) { px(g, '#000000', x, 5, 3, 6); }
  });
}
function pipeStripes() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 4;
  const g = c.getContext('2d');
  // 沿圆周的条纹：亮边高光 + 深色阴影（原作水管的竖向明暗）
  const stops = [['#0c5a14', 0], ['#2ea836', 6], ['#8ce860', 14], ['#d8fca0', 18], ['#58d040', 22], ['#1e8a2a', 36], ['#0c5a14', 52], ['#08400e', 64]];
  for (let i = 0; i < stops.length - 1; i++) px(g, stops[i][0], stops[i][1], 0, stops[i + 1][1] - stops[i][1], 4);
  const t = pixelTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}
function flag() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fcfcfc'; g.beginPath(); g.moveTo(32, 0); g.lineTo(0, 0); g.lineTo(32, 32); g.closePath(); g.fill();
  g.fillStyle = '#00a800'; g.beginPath(); g.arc(23, 9, 6, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fcfcfc'; g.fillRect(20, 6, 2, 2); g.fillRect(24, 6, 2, 2); g.fillRect(21, 11, 4, 1);
  return pixelTexture(c);
}
function starFlag() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fcfcfc'; g.fillRect(0, 0, 32, 22);
  g.fillStyle = '#d82800'; g.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 4 : 9, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(16 + Math.cos(a) * r, 11 + Math.sin(a) * r); }
  g.closePath(); g.fill();
  return pixelTexture(c);
}

export function textTexture(text, opts = {}) {
  const size = opts.size || 48, pad = 10;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  const font = `900 ${size}px "Courier New", "Consolas", monospace`;
  g.font = font;
  c.width = Math.ceil(g.measureText(text).width) + pad * 2; c.height = size + pad * 2;
  g.font = font; g.textBaseline = 'middle'; g.textAlign = 'center';
  if (opts.stroke) { g.lineWidth = size * 0.18; g.strokeStyle = opts.stroke; g.strokeText(text, c.width / 2, c.height / 2); }
  g.fillStyle = opts.color || '#ffffff'; g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { texture: t, aspect: c.width / c.height };
}

const cache = new Map();
export function tex(name, theme = 'overworld') {
  const k = name + ':' + theme;
  if (cache.has(k)) return cache.get(k);
  let t;
  if (name === 'pipe') {
    // 管身只用绿色底色；圆周明暗交给真实灯光，不能套石块的棕色边框。
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = '#4db457'; g.fillRect(0, 0, 16, 16);
    t = pixelTexture(c); cache.set(k, t); return t;
  }
  if (['brick','ground','hard','question','used','lift','pipe'].includes(name)) {
    const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');
    const under=theme==='underground';
    const color=name==='question'?'#d8b56a':name==='pipe'?'#668c70':name==='ground'?(under?'#607981':'#a59378'):name==='lift'?'#bca16d':name==='used'?'#988c75':(under?'#78929a':'#b3a38a');
    g.fillStyle=color;g.fillRect(0,0,128,128);g.strokeStyle=under?'#4e666d':'#867b66';g.lineWidth=3;g.strokeRect(3,3,122,122);
    if(name==='brick'){g.beginPath();g.moveTo(0,64);g.lineTo(128,64);g.moveTo(64,0);g.lineTo(64,64);g.moveTo(32,64);g.lineTo(32,128);g.moveTo(96,64);g.lineTo(96,128);g.stroke();}
    if(name==='question'){g.fillStyle='#fff1c7';g.font='bold 94px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('?',64,67);}
    t=pixelTexture(c);cache.set(k,t);return t;
  }
  switch (name) {
    case 'brick': t = pixelTexture(brick(theme)); break;
    case 'ground': t = pixelTexture(groundBlock(theme)); break;
    case 'hard': t = pixelTexture(hardBlock(theme)); break;
    case 'question': t = pixelTexture(question()); break;
    case 'used': t = pixelTexture(usedBlock()); break;
    case 'lift': t = pixelTexture(lift()); break;
    case 'pipe': t = pipeStripes(); break;
    case 'flag': t = flag(); break;
    case 'starFlag': t = starFlag(); break;
  }
  cache.set(k, t);
  return t;
}
