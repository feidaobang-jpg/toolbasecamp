export class GameAudio{
 constructor(){this.ctx=null;this.enabled=true;this.next=0;}
 async unlock(){if (!this.visibilityBound) { this.visibilityBound = true; document.addEventListener('visibilitychange', () => this.syncPause()); } if(!this.ctx){this.ctx=new (window.AudioContext||window.webkitAudioContext)();this.master=this.ctx.createGain();this.master.gain.value=.18;this.master.connect(this.ctx.destination);}this.syncPause();}
 syncPause() { if (!this.ctx || this.ctx.state === 'closed') return; const op = this.paused || document.hidden ? this.ctx.suspend() : this.ctx.resume(); if (op?.catch) op.catch(() => {}); }
 pause(on) { this.paused = !!on; this.syncPause(); }
 tone(f,d=.12,type='sine',vol=.3){if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;const t=this.ctx.currentTime,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(Math.max(30,f*.55),t+d);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+d);o.connect(g);g.connect(this.master);o.start(t);o.stop(t+d);}
 effect(e){const f={attack:620,hit:180,kill:310,hurt:95,dash:800,ward:720,burst:65,heal:1050,pickup:1300,upgrade:1550,wave:980,warning:130,slam:48,win:1200,death:80};if(f[e.type])this.tone(f[e.type],['burst','slam','win','wave'].includes(e.type)?.45:.09,e.type==='hurt'||e.type==='slam'?'triangle':'sine',e.type==='attack'?.12:.35);}
 tick(active){if(!active||!this.ctx||!this.enabled)return;const now=this.ctx.currentTime;if(now<this.next)return;this.next=now+.65;const notes=[196,246.94,293.66,392,329.63,293.66,246.94,220];this.tone(notes[Math.floor(now/.65)%notes.length],.7,'sine',.08);}
}
