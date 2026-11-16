// Procedural sound: every effect is synthesized with WebAudio, no audio files.
// The bank is a no-op until the first user gesture creates the context, so
// screenshot runs and headless renders never throw.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _burst({ dur, freq, type = 'lowpass', gain = 0.5, sweepTo = null }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  _tone({ freq, dur, type = 'sine', gain = 0.3, slideTo = null, delay = 0 }) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur);
  }

  shot(kind) {
    if (kind === 'longbow') this._burst({ dur: 0.22, freq: 900, sweepTo: 120, gain: 0.7 });
    else if (kind === 'raptor9') this._burst({ dur: 0.08, freq: 2400, sweepTo: 500, gain: 0.4 });
    else this._burst({ dur: 0.12, freq: 1800, sweepTo: 300, gain: 0.55 });
    this._tone({ freq: 160, dur: 0.08, type: 'square', gain: 0.18, slideTo: 60 });
  }

  enemyShot(dist) {
    const g = Math.max(0.12, 0.5 - dist * 0.012);
    this._burst({ dur: 0.1, freq: 1400, sweepTo: 300, gain: g });
  }

  hit() { this._tone({ freq: 1250, dur: 0.05, type: 'square', gain: 0.22 }); }

  kill() {
    this._tone({ freq: 880, dur: 0.07, type: 'square', gain: 0.22 });
    this._tone({ freq: 1320, dur: 0.1, type: 'square', gain: 0.22, delay: 0.07 });
  }

  hurt() { this._tone({ freq: 220, dur: 0.12, type: 'sawtooth', gain: 0.25, slideTo: 110 }); }

  reload() {
    this._tone({ freq: 500, dur: 0.04, type: 'square', gain: 0.15 });
    this._tone({ freq: 700, dur: 0.04, type: 'square', gain: 0.15, delay: 0.18 });
  }

  dryFire() { this._tone({ freq: 900, dur: 0.03, type: 'square', gain: 0.15 }); }

  plantBeep() { this._tone({ freq: 1560, dur: 0.09, type: 'sine', gain: 0.3 }); }

  plantDone() {
    this._tone({ freq: 1046, dur: 0.12, gain: 0.3 });
    this._tone({ freq: 1568, dur: 0.18, gain: 0.3, delay: 0.12 });
  }

  explosion() {
    this._burst({ dur: 0.9, freq: 400, sweepTo: 60, gain: 0.9 });
    this._tone({ freq: 55, dur: 0.7, type: 'sine', gain: 0.6, slideTo: 30 });
  }

  roundWin() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.28, delay: i * 0.11 }));
  }

  roundLose() {
    [392, 330, 262].forEach((f, i) =>
      this._tone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.26, delay: i * 0.14 }));
  }

  buy() { this._tone({ freq: 990, dur: 0.06, type: 'square', gain: 0.18 }); }

  denied() { this._tone({ freq: 180, dur: 0.12, type: 'square', gain: 0.2 }); }

  flash() { this._burst({ dur: 0.3, freq: 5000, type: 'highpass', gain: 0.3 }); }
}
