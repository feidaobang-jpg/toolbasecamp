// Original oscillator phrases, not a transcription of Nintendo music.
export class GameAudio{
  constructor(){this.enabled=true;this.ctx=null;this.next=0;this.beat=0;}
  async unlock(){if(!this.ctx){this.ctx=new AudioContext();this.gain=this.ctx.createGain();this.gain.gain.value=.16;this.gain.connect(this.ctx.destination);this.capture=this.ctx.createMediaStreamDestination();this.gain.connect(this.capture);}await this.ctx.resume();}
  tone(freq,duration=.1,type='square',delay=0,volume=.25){if(!this.enabled||!this.ctx)return;const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g);g.connect(this.gain);o.start(t);o.stop(t+duration);}
  effect(name){const notes={jump:[350,600],coin:[1050,1500],bump:[160],break:[110,80],stomp:[200,100],grow:[262,330,392,523],hurt:[180,90],die:[440,392,330,220],win:[523,659,784,1047],checkpoint:[600,800],spawn:[300,400,500]};(notes[name]||[]).forEach((f,i)=>this.tone(f,.16,'square',i*.075,.4));}
  tick(playing){if(!this.ctx)return;if(!playing){this.next=this.ctx.currentTime;return;}if(this.ctx.currentTime>=this.next){const notes=[392,0,523,659,587,0,440,523,330,392,494,0,440,659,587,523];const f=notes[this.beat%notes.length];if(f)this.tone(f,.12,'triangle',0,.16);if(this.beat%4===0)this.tone([131,165,147,196][Math.floor(this.beat/4)%4],.22,'triangle',0,.25);this.beat++;this.next=this.ctx.currentTime+.23;}}
  mute(){this.enabled=!this.enabled;if(this.gain)this.gain.gain.value=this.enabled?.16:0;return this.enabled;}
}
