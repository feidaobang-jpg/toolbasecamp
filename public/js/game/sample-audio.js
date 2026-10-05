// Local recordings first; callers retain their synthesizer when fetch/decode fails.
// Buffer sources share the game's AudioContext, so pause freezes their playhead.
export class SampleAudio {
  constructor(ctx, musicBus, sfxBus, files, base = new URL('./sounds/', location.href)) {
    this.ctx = ctx; this.musicBus = musicBus; this.sfxBus = sfxBus;
    this.buffers = new Map(); this.failed = []; this.source = null; this.track = null;
    this.ready = Promise.all(Object.entries(files).map(async ([name, file]) => {
      try {
        const r = await fetch(new URL(file, base)); if (!r.ok) throw Error(r.status);
        this.buffers.set(name, await ctx.decodeAudioData(await r.arrayBuffer()));
        if (this.track?.name === name) this.startTrack();
      } catch (_) { this.failed.push(name); }
    }));
  }
  has(name) { return this.buffers.has(name); }
  stop() { if (this.source) { this.source.stop(); this.source.disconnect(); } this.source = null; this.track = null; }
  music(name, loop = true, restart = false) {
    if (!restart && this.track?.name === name) return this.has(name);
    this.stop(); if (!name) return false;
    this.track = { name, loop }; this.startTrack(); return this.has(name);
  }
  startTrack() {
    if (!this.track || !this.has(this.track.name)) return;
    if (this.source) { this.source.stop(); this.source.disconnect(); }
    const s = this.ctx.createBufferSource(); s.buffer = this.buffers.get(this.track.name);
    s.loop = this.track.loop; s.connect(this.musicBus); s.start(); this.source = s;
  }
  sfx(name, volume = 1) {
    if (!this.has(name)) return false;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain();
    s.buffer = this.buffers.get(name); g.gain.value = volume;
    s.connect(g); g.connect(this.sfxBus); s.onended = () => { s.disconnect(); g.disconnect(); }; s.start(); return true;
  }
  duration(name) { return this.buffers.get(name)?.duration || 0; }
}
