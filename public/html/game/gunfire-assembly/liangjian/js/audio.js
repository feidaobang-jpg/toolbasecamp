// 声音：音效与鼓点军乐用 WebAudio 合成（原创）；喊话多数截自电视剧《亮剑》原声，片源里没有的几句是本机合成。
// 语音清单在 assets/voice/index.json（按章节分组，每章只加载自己的），来源与时间点见 game-projects/liangjian-pingan/media-kit/assets/voice.json

export class GameAudio {
  constructor(chapter = '') {
    this.chapter = chapter;
    this.ctx = null;
    this.volume = 0.8;
    this.voices = {};
    this.speaking = new Set();
    this.level = 0;
    this.musicOn = false;
    this.nextStep = 0;
    this.step = 0;
    this.pausedByGame = false;
    this.log = [];        // 供验收脚本查看触发过的声音
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.pausedByGame) this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 5; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.34; this.music.connect(this.master);
    this.vox = ctx.createGain(); this.vox.gain.value = 1.25; this.vox.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.nextStep = ctx.currentTime + 0.1;
    this.loadVoices();
  }
  async loadVoices() {
    // 先读清单，只取实际存在的语音，没有就只显示字幕
    let list = [];
    try { const r = await fetch('assets/voice/index.json'); if (r.ok) list = await r.json(); } catch (e) { /* 忽略 */ }
    if (!Array.isArray(list)) list = (list && list[this.chapter]) || [];
    for (const id of list) {
      if (!/^[a-z0-9_]+$/.test(id)) continue;
      try {
        const r = await fetch('assets/voice/' + id + '.mp3');
        if (!r.ok) continue;
        const buf = await r.arrayBuffer();
        this.voices[id] = await this.ctx.decodeAudioData(buf);
      } catch (e) { /* 没有语音文件时只显示字幕 */ }
    }
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  suspend() { this.pausedByGame = true; if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { this.pausedByGame = false; if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // ---- 合成积木 ----
  _noise(t, dur, type, f0, f1, gain, q = 0.8, dest) {
    const c = this.ctx, s = c.createBufferSource();
    s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  _tone(t, dur, type, f0, f1, gain, dest, attack = 0.002) {
    const c = this.ctx, o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  play(name, vol = 1, pitch = 1) {
    this.log.push(name);
    if (this.log.length > 200) this.log.shift();
    const c = this.ctx;
    if (!c || c.state !== 'running' || vol <= 0.01) return;
    const t = c.currentTime;
    const p = pitch * (0.95 + Math.random() * 0.1);
    switch (name) {
      case 'shot':
        this._noise(t, 0.09, 'highpass', 1400 * p, 700, 0.5 * vol);
        this._tone(t, 0.08, 'triangle', 210 * p, 70, 0.55 * vol);
        this._noise(t, 0.2, 'lowpass', 900, 200, 0.16 * vol);
        break;
      case 'lmg':
        this._noise(t, 0.07, 'bandpass', 1900 * p, 900, 0.5 * vol, 0.7);
        this._tone(t, 0.07, 'square', 150 * p, 60, 0.3 * vol);
        this._noise(t, 0.16, 'lowpass', 700, 180, 0.15 * vol);
        break;
      case 'rifle':
        this._noise(t, 0.13, 'bandpass', 1500 * p, 500, 0.42 * vol, 0.6);
        this._tone(t, 0.1, 'triangle', 170 * p, 55, 0.3 * vol);
        break;
      case 'mg':
        this._noise(t, 0.06, 'bandpass', 1100 * p, 600, 0.36 * vol, 0.9);
        this._tone(t, 0.06, 'square', 110 * p, 55, 0.22 * vol);
        break;
      case 'hit': this._noise(t, 0.05, 'bandpass', 2600 * p, 1500, 0.22 * vol, 2); this._tone(t, 0.06, 'sine', 500 * p, 240, 0.14 * vol); break;
      case 'kill': this._tone(t, 0.09, 'square', 760, 1140, 0.13 * vol); this._tone(t + 0.07, 0.12, 'square', 1140, 1520, 0.11 * vol); break;
      case 'thud': this._tone(t, 0.16, 'sine', 120, 45, 0.5 * vol); this._noise(t, 0.12, 'lowpass', 500, 120, 0.25 * vol); break;
      case 'hurt':
        this._tone(t, 0.22, 'sawtooth', 260, 90, 0.3 * vol); this._noise(t, 0.14, 'lowpass', 1200, 200, 0.4 * vol); this._tone(t, 0.2, 'sine', 90, 40, 0.5 * vol);
        break;
      case 'explode':
        this._noise(t, 0.03, 'highpass', 2500, 1800, 0.6 * vol);
        this._noise(t, 0.75, 'lowpass', 1300, 90, 0.95 * vol);
        this._tone(t, 0.6, 'sine', 95 * p, 30, 0.9 * vol);
        this._noise(t + 0.12, 0.6, 'bandpass', 420, 140, 0.25 * vol, 0.5);
        break;
      case 'cannon':
        this._noise(t, 0.05, 'highpass', 3000, 1500, 0.9 * vol);
        this._tone(t, 1.1, 'sine', 78, 24, 1.3 * vol);
        this._tone(t, 0.35, 'triangle', 190, 50, 0.7 * vol);
        this._noise(t, 1.3, 'lowpass', 1700, 70, 1.1 * vol);
        this._noise(t + 0.32, 0.9, 'lowpass', 600, 80, 0.3 * vol);
        this._noise(t + 0.7, 1.1, 'bandpass', 300, 100, 0.16 * vol, 0.4);
        break;
      case 'mortar':
        this._noise(t, 0.05, 'highpass', 2400, 1200, 0.5 * vol);
        this._tone(t, 0.32, 'sine', 170 * p, 55, 0.9 * vol);
        this._noise(t, 0.4, 'lowpass', 1400, 200, 0.5 * vol);
        break;
      case 'whistle': this._tone(t, 1.5, 'sine', 1700, 520, 0.09 * vol, null, 0.3); break;
      case 'flare': this._noise(t, 1.2, 'bandpass', 600, 3200, 0.22 * vol, 2); this._tone(t + 1.25, 0.18, 'square', 900, 300, 0.12 * vol); this._noise(t + 1.25, 0.4, 'lowpass', 1600, 200, 0.3 * vol); break;
      case 'dig': this._noise(t, 0.1, 'lowpass', 520 * p, 160, 0.42 * vol); this._noise(t + 0.03, 0.14, 'bandpass', 1900 * p, 900, 0.16 * vol, 1.2); this._tone(t, 0.08, 'sine', 140, 70, 0.2 * vol); break;
      case 'throw': this._noise(t, 0.16, 'bandpass', 700, 1800, 0.18 * vol, 1.5); break;
      case 'jump': this._noise(t, 0.12, 'bandpass', 420, 1300, 0.14 * vol, 1.2); this._tone(t, 0.1, 'sine', 180, 300, 0.08 * vol); break;
      case 'swing': this._noise(t, 0.2, 'bandpass', 500 * p, 2600 * p, 0.24 * vol, 1.8); break;
      case 'slash': this._noise(t, 0.16, 'bandpass', 3400, 700, 0.5 * vol, 1.6); this._tone(t, 0.12, 'sawtooth', 900, 240, 0.1 * vol); break;
      case 'unsheathe': this._noise(t, 0.3, 'bandpass', 2200, 5200, 0.3 * vol, 4); this._tone(t + 0.05, 0.5, 'sine', 2900, 3100, 0.08 * vol, null, 0.02); break;
      case 'clang':
        for (const f of [1180, 1770, 2490, 3310, 4120]) this._tone(t, 0.7, 'sine', f * p, f * p * 0.995, 0.16 * vol);
        this._noise(t, 0.06, 'highpass', 4000, 3000, 0.6 * vol);
        this._tone(t, 0.2, 'triangle', 240, 90, 0.4 * vol);
        break;
      case 'drum': this._tone(t, 0.5, 'sine', 120, 48, 1.0 * vol); this._noise(t, 0.12, 'lowpass', 900, 200, 0.5 * vol); break;
      case 'pickup': this._tone(t, 0.12, 'triangle', 660, 660, 0.25 * vol); this._tone(t + 0.09, 0.2, 'triangle', 990, 990, 0.25 * vol); break;
      case 'loot': [523, 659, 784, 1047].forEach((f, i) => this._tone(t + i * 0.09, 0.3, 'triangle', f, f, 0.24 * vol)); break;
      case 'ui': this._tone(t, 0.05, 'square', 620, 620, 0.1 * vol); break;
      case 'uiok': this._tone(t, 0.07, 'square', 520, 780, 0.12 * vol); break;
      case 'reload': this._noise(t, 0.04, 'highpass', 2600, 2000, 0.25 * vol); this._noise(t + 0.22, 0.05, 'highpass', 1800, 1500, 0.3 * vol); break;
      case 'hoof': this._noise(t, 0.06, 'lowpass', 520 * p, 140, 0.5 * vol); this._tone(t, 0.06, 'sine', 95, 50, 0.35 * vol); break;
      case 'collapse':
        this._noise(t, 2.4, 'lowpass', 900, 60, 1.0 * vol);
        this._tone(t, 1.6, 'sine', 60, 22, 1.0 * vol);
        for (let i = 0; i < 9; i++) this._noise(t + 0.15 + i * 0.2 + Math.random() * 0.1, 0.25, 'bandpass', 300 + Math.random() * 500, 150, 0.4 * vol, 0.8);
        break;
      case 'bugle': this.bugle(t, vol); break;
      case 'win': [392, 523, 659, 784, 1047].forEach((f, i) => this._brass(t + i * 0.16, i === 4 ? 0.9 : 0.2, f, 0.2 * vol)); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => this._brass(t + i * 0.28, 0.4, f, 0.16 * vol)); break;
    }
  }
  _brass(t, dur, f, gain, dest) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator();
    o.type = 'sawtooth'; o2.type = 'square';
    o.frequency.setValueAtTime(f * 0.97, t); o.frequency.linearRampToValueAtTime(f, t + 0.04);
    o2.frequency.setValueAtTime(f * 1.003, t);
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 2;
    fl.frequency.setValueAtTime(700, t); fl.frequency.linearRampToValueAtTime(2600, t + 0.06); fl.frequency.linearRampToValueAtTime(1500, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + 0.02); g.gain.setValueAtTime(gain, t + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const g2 = c.createGain(); g2.gain.value = 0.35;
    o.connect(fl); o2.connect(g2); g2.connect(fl); fl.connect(g); g.connect(dest || this.sfx);
    o.start(t); o2.start(t); o.stop(t + dur + 0.03); o2.stop(t + dur + 0.03);
  }
  // 冲锋号：三连音上行，再吹长音（原创旋律）
  bugle(t, vol = 1) {
    const C5 = 523.25, E5 = 659.25, G5 = 783.99, C6 = 1046.5;
    let k = t;
    const seq = [[C5, 3], [E5, 3], [G5, 3], [C6, 1, 0.5], [G5, 3], [C6, 3], [G5, 3], [C6, 1, 0.9]];
    for (const [f, n, long] of seq) {
      for (let i = 0; i < n; i++) { const d = long || 0.1; this._brass(k, d, f, 0.3 * vol); k += long ? long + 0.04 : 0.115; }
    }
  }
  voice(id, vol = 1) {
    this.log.push('voice:' + id);
    const c = this.ctx, b = this.voices[id];
    if (!c || !b || c.state !== 'running') return false;
    const s = c.createBufferSource(); s.buffer = b;
    const g = c.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.vox); s.start();
    this.speaking.add(s); s.onended = () => this.speaking.delete(s);
    return true;
  }
  // 跳过剧情、重开时把还没说完的台词掐掉
  stopVoices() { for (const s of this.speaking) { try { s.stop(); } catch (e) { /* 已经播完 */ } } this.speaking.clear(); }

  // ---- 背景鼓点与军乐（原创程序化），用 AudioContext 时钟排程，暂停即冻结 ----
  setMusic(level) { this.level = level; this.musicOn = level >= 0; }
  tick() {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !this.musicOn) return;
    if (this.nextStep < c.currentTime - 0.3) this.nextStep = c.currentTime + 0.05;
    const bpm = this.level >= 2 ? 126 : this.level === 1 ? 112 : 92;
    const sp = 60 / bpm / 4;
    while (this.nextStep < c.currentTime + 0.18) {
      this._musicStep(this.step, this.nextStep, sp);
      this.step = (this.step + 1) % 64;
      this.nextStep += sp;
    }
  }
  _musicStep(s, t, sp) {
    const lv = this.level, bar = Math.floor(s / 16), i = s % 16, m = this.music;
    // 大鼓
    if (i === 0 || i === 8 || (lv >= 2 && (i === 6 || i === 14))) { this._tone(t, 0.3, 'sine', 105, 42, 0.9, m); this._noise(t, 0.07, 'lowpass', 500, 150, 0.3, 0.8, m); }
    // 军鼓
    const snare = lv === 0 ? i === 12 : (i === 4 || i === 12 || (bar % 2 === 1 && i >= 13) || (lv >= 2 && (i === 7 || i === 10)));
    if (snare) { this._noise(t, 0.1, 'bandpass', 2100, 1500, i >= 13 ? 0.2 : 0.34, 0.7, m); this._tone(t, 0.07, 'triangle', 210, 150, 0.14, m); }
    if (lv >= 1 && i % 2 === 0) this._noise(t, 0.03, 'highpass', 6500, 6000, lv >= 2 ? 0.1 : 0.06, 0.8, m);
    // 低音（A 小调）
    const roots = [110, 110, 87.31, 98];
    if (i % 4 === 0 || (lv >= 2 && i % 4 === 2)) this._tone(t, sp * 1.8, 'triangle', roots[bar] * (i === 8 ? 1.5 : 1), roots[bar] * (i === 8 ? 1.5 : 1), 0.42, m, 0.01);
    // 铜管动机
    if (lv >= 1) {
      const A = 220, mel = [
        [[0, A * 2, 3], [4, A * 2 * 1.2, 1], [6, A * 3, 4], [12, A * 2 * 1.335, 2]],
        [[0, A * 3, 2], [3, A * 2 * 1.335, 1], [4, A * 2 * 1.2, 4], [10, A * 2, 2], [12, A * 1.5, 3]],
        [[0, A * 2 * 0.794 * 2, 3], [4, A * 2, 2], [8, A * 2 * 1.2, 3], [12, A * 2, 2]],
        [[0, A * 2 * 0.891 * 2, 3], [4, A * 2 * 1.2, 2], [6, A * 2 * 1.335, 2], [8, A * 3, 6]],
      ][bar];
      for (const [st, f, len] of mel) if (st === i) this._brass(t, sp * len * 0.92, f / 2, lv >= 2 ? 0.2 : 0.14, m);
    }
  }
}
