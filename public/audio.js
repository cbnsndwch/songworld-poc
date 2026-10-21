export class Soundtrack {
  constructor() { this.context = null; this.audio = null; this.timer = null; this.started = 0; this.offset = 0; this.paused = true; this.beat = -1; this.bpm = 109; this.noise = null; }
  async unlock() {
    this.context ||= new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
    if (!this.noise) {
      this.noise = this.context.createBuffer(1, this.context.sampleRate * .3, this.context.sampleRate);
      const samples = this.noise.getChannelData(0); for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
  }
  async load(url, bpm) {
    await this.unlock(); this.stop(); this.bpm = bpm;
    if (url) {
      this.audio = new Audio(url); this.audio.preload = 'auto'; this.audio.volume = .65;
      await new Promise((resolve, reject) => { this.audio.addEventListener('canplay', resolve, { once: true }); this.audio.addEventListener('error', () => reject(new Error('The generated soundtrack could not be loaded.')), { once: true }); this.audio.load(); });
    }
  }
  async play(offset = 0) {
    await this.unlock(); this.offset = offset; this.started = this.context.currentTime; this.paused = false; this.beat = Math.floor(offset * this.bpm / 60) - 1;
    if (this.audio) { this.audio.currentTime = offset; await this.audio.play(); }
    clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 25);
  }
  get time() { return this.audio ? this.audio.currentTime : this.offset + (!this.paused && this.context ? this.context.currentTime - this.started : 0); }
  async pause() { this.offset = this.time; this.paused = true; this.audio?.pause(); clearInterval(this.timer); }
  async resume() { await this.play(this.offset); }
  async seek(time) { await this.play(time); }
  stop() { clearInterval(this.timer); this.audio?.pause(); this.audio = null; this.paused = true; this.offset = 0; }
  tick() {
    if (this.paused || this.audio) return;
    const subdivision = Math.floor(this.time * this.bpm / 60 * 2);
    if (subdivision === this.beat) return;
    this.beat = subdivision;
    const step = subdivision % 32, chord = [41.2, 49, 55, 36.7][Math.floor(step / 8)];
    this.hat(.035, step % 2 === 0 ? .035 : .016);
    if (step % 4 === 0 || step % 8 === 7) { this.tone(145, .12, 'sine', .18, 42); this.tone(chord, .19, 'sawtooth', .06); }
    if (step % 4 === 2) { this.hat(.13, .075); this.tone(185, .08, 'triangle', .08, 110); }
    if (step % 2 === 0) { this.tone(chord * 2, .17, 'sawtooth', .025); this.tone(chord * 3, .12, 'sawtooth', .018); }
    if (step >= 24 && step % 2 === 1) this.tone([329.6, 293.7, 246.9, 220][step % 4], .12, 'triangle', .04);
  }
  tone(freq, duration, type = 'sine', volume = .05, endFreq) {
    if (!this.context || this.context.state !== 'running') return;
    const t = this.context.currentTime, osc = this.context.createOscillator(), gain = this.context.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t); if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + duration);
    gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + .005); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain); gain.connect(this.context.destination); osc.start(t); osc.stop(t + duration + .01);
  }
  hat(duration, volume) {
    const t = this.context.currentTime, source = this.context.createBufferSource(), gain = this.context.createGain(), filter = this.context.createBiquadFilter();
    source.buffer = this.noise; filter.type = 'highpass'; filter.frequency.value = 4000;
    gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    source.connect(filter); filter.connect(gain); gain.connect(this.context.destination); source.start(t); source.stop(t + duration);
  }
  collect() { this.tone(880, .12, 'sine', .035, 1320); }
  jump() { this.tone(180, .13, 'sine', .025, 360); }
  fall() { this.tone(240, .25, 'triangle', .06, 55); }
}
