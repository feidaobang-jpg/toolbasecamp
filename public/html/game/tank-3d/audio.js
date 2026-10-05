// 坦克大战 3D · 音效：开炮、打砖、爆炸、道具、开场曲、GAME OVER 等用原版 FC 音效（sounds/*.mp3）；
// 引擎声、奖命、魔改 Boss 招式等原作没有的声音用 Web Audio 程序合成。解码失败时自动回退到合成音。
const SAMPLES = ['bullet_shot', 'bullet_hit_1', 'bullet_hit_2', 'explosion_1', 'explosion_2', 'game_over', 'pause', 'powerup_appear', 'powerup_pick', 'snow_slide', 'stage_start', 'statistics_1'];

export class GameAudio {
  constructor(base = './sounds/') {
    this.base = base; this.volume = .7; this.ctx = null; this.buffers = {}; this.raw = {}; this.engineLevel = 0; this.paused = false;
    // 先下载原始数据，音频上下文要等玩家第一次按键 / 触屏才能创建
    if (typeof fetch === 'function') for (const n of SAMPLES) fetch(base + n + '.mp3?v=merge1').then(r => r.ok ? r.arrayBuffer() : null).then(b => { if (b) { this.raw[n] = b; this.decode(n); } }).catch(() => {});
  }
  decode(n) {
    if (!this.ctx || !this.raw[n] || this.buffers[n]) return;
    const data = this.raw[n]; this.raw[n] = null;
    this.ctx.decodeAudioData(data).then(buf => { this.buffers[n] = buf; }).catch(() => {});
  }
  unlock() {
    if (!this.visibilityBound) { this.visibilityBound = true; document.addEventListener('visibilitychange', () => this.syncPause()); } if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.volume * .55; this.master.connect(this.ctx.destination);
      for (const n of SAMPLES) this.decode(n);
      // 引擎：两路失谐锯齿波过低通，音量随 tick() 变化
      this.engGain = this.ctx.createGain(); this.engGain.gain.value = 0;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
      this.eng = [this.ctx.createOscillator(), this.ctx.createOscillator()];
      this.eng[0].type = 'sawtooth'; this.eng[1].type = 'square'; this.eng[0].frequency.value = 52; this.eng[1].frequency.value = 26.5;
      for (const o of this.eng) { o.connect(lp); o.start(); }
      lp.connect(this.engGain); this.engGain.connect(this.master);
    }
    this.syncPause();
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v * .55; }
  syncPause() { if (!this.ctx || this.ctx.state === 'closed') return; const op = this.paused || document.hidden ? this.ctx.suspend() : this.ctx.resume(); if (op?.catch) op.catch(() => {}); }
 pause(on) { this.paused = !!on; this.syncPause(); }
  play(name, vol = 1, rate = 1) {
    if (!this.ctx || this.volume <= 0) return false;
    const buf = this.buffers[name]; if (!buf) return false;
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate; g.gain.value = vol; src.connect(g); g.connect(this.master); src.start();
    if (name === 'stage_start') this.music = src;
    return true;
  }
  stopMusic() { try { this.music && this.music.stop(); } catch (e) { /* 已停止 */ } this.music = null; }
  tone(freq, duration = .1, type = 'square', delay = 0, volume = .25, slideTo = 0) {
    if (!this.ctx || this.volume <= 0) return;
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + duration + .02);
  }
  noise(duration = .3, delay = 0, volume = .3, cutoff = 900) {
    if (!this.ctx || this.volume <= 0) return;
    const t = this.ctx.currentTime + delay, len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  }
  arp(notes, step = .08, type = 'square', volume = .2, len = .12) { notes.forEach((f, i) => this.tone(f, len, type, i * step, volume)); }
  // 世界事件 → 声音。原版只给玩家的开炮、打墙配音；敌军开炮无声
  effect(e) {
    const p = e.team === 'player';
    switch (e.type) {
      case 'fire': if (p) this.play('bullet_shot') || this.tone(420, .07, 'square', 0, .16, 180); else if (e.big) this.noise(.25, 0, .25, 700); break;
      case 'brick': if (p) this.play('bullet_hit_2') || this.noise(.16, 0, .3, 1300); else if (e.flame) this.noise(.3, 0, .2, 900); break;
      case 'steel': case 'border': if (p) this.play('bullet_hit_1') || this.tone(1560, .09, 'square', 0, .12, 1200); break;
      case 'armor': this.tone(e.big ? 520 : 900, .08, 'square', 0, .14, e.big ? 300 : 600); break;
      case 'boom': if (e.team === 'player') this.play('explosion_2') || this.noise(.6, 0, .5, 600); else this.play('explosion_1', e.huge ? 1 : .9, e.huge ? .7 : 1) || this.noise(.5, 0, .45, 700); if (e.huge) this.noise(1.2, .1, .5, 400); break;
      case 'eagle': this.play('explosion_2', 1, .8) || this.noise(1.2, 0, .6, 500); this.noise(1, .15, .4, 400); break;
      case 'powerup': this.play('powerup_appear') || this.arp([988, 1319, 988, 1319], .06, 'triangle', .16, .1); break;
      case 'pickup': case 'repair': case 'medal': this.play('powerup_pick') || this.arp([659, 784, 988, 1319], .06, 'square', .18, .12); break;
      case 'life': this.arp([784, 988, 1175, 1568, 1175, 1568], .07, 'triangle', .22, .14); break;
      case 'slide': this.play('snow_slide', .8); break;
      case 'deflect': this.tone(1800, .1, 'sine', 0, .1, 2600); break;
      case 'hurt': case 'plate': case 'boatHit': this.tone(220, .18, 'sawtooth', 0, .22, 90); this.noise(.12, 0, .2, 2000); break;
      case 'telegraph': this.tone(e.kind === 'sniper' ? 1400 : 300, .35, 'sawtooth', 0, .12, e.kind === 'sniper' ? 1900 : 520); break;
      case 'bossSpawn': this.arp([196, 185, 175, 165, 156], .12, 'sawtooth', .2, .2); break;
      case 'bossDown': this.arp([523, 659, 784, 1047, 784, 1047, 1319], .1, 'square', .22, .16); break;
      case 'enrage': this.arp([330, 311, 294, 277], .07, 'sawtooth', .2, .1); break;
      case 'summon': this.arp([392, 494, 587], .08, 'triangle', .16, .12); break;
      case 'mine': this.tone(880, .08, 'square', 0, .1); break;
      case 'mortarMark': this.tone(1200, .4, 'sine', 0, .1, 600); break;
      case 'blast': this.noise(.5, 0, .45, 600); break;
      case 'enemyLoot': this.arp([659, 523, 392], .07, 'square', .18, .1); break;
      case 'shovel': case 'shield': case 'freeze': case 'grenade': case 'levelup': case 'boat': break;   // 原版这些只有拾取音
    }
  }
  tally() { this.play('statistics_1') || this.tone(1200, .04, 'square', 0, .1); }
  startJingle() { this.stopMusic(); this.play('stage_start') || this.arp([392, 523, 659, 784, 659, 784, 1047], .11, 'square', .18, .16); }
  gameOverJingle() { this.play('game_over') || this.arp([523, 466, 392, 311, 262, 196], .18, 'triangle', .26, .3); }
  pauseSound() { this.play('pause') || this.arp([880, 660], .08, 'square', .14, .08); }
  // 每帧：玩家行驶时引擎声变大（原版 $0311 / $0312）
  tick(active, moving) {
    if (!this.ctx || !this.engGain) return;
    const goal = this.volume <= 0 || !active || this.paused ? 0 : moving ? .22 : .08;
    this.engineLevel += (goal - this.engineLevel) * .12;
    this.engGain.gain.setTargetAtTime(this.engineLevel, this.ctx.currentTime, .03);
    this.eng[0].frequency.setTargetAtTime(moving ? 64 : 48, this.ctx.currentTime, .12);
  }
}
