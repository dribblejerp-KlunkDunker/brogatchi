/**
 * Final Bro-tasy: Procedural Web Audio Synthwave Engine
 * Generates dynamic 125BPM synthwave basslines, arpeggios, and combat SFX
 * using the HTML5 AudioContext with zero external file dependencies.
 */

class SynthwaveAudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private timerId: number | null = null;
  private currentStep = 0;
  private tempo = 125;
  private isEnraged = false;

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Bass scale notes (in Hz): D minor synthwave scale [D2, F2, G2, A2, C3]
  private bassNotes = [73.42, 87.31, 98.0, 110.0, 130.81, 146.83];
  // Lead scale notes [D4, F4, G4, A4, C5, D5]
  private leadNotes = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33];

  public startBGM(enraged = false) {
    this.initContext();
    if (!this.ctx) return;
    this.isEnraged = enraged;
    if (this.isPlaying) return;

    this.isPlaying = true;
    this.currentStep = 0;
    const stepDuration = (60 / this.tempo) / 4; // 16th notes

    const scheduleLoop = () => {
      if (!this.isPlaying) return;
      this.playStep(this.currentStep);
      this.currentStep = (this.currentStep + 1) % 16;
      this.timerId = window.setTimeout(scheduleLoop, stepDuration * 1000);
    };

    scheduleLoop();
  }

  public stopBGM() {
    this.isPlaying = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  public setEnraged(enraged: boolean) {
    this.isEnraged = enraged;
    this.tempo = enraged ? 138 : 125;
  }

  private playStep(step: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const time = this.ctx.currentTime;

    // 1. Kick Drum (Steps 0, 4, 8, 12)
    if (step % 4 === 0) {
      this.playKick(time);
    }

    // 2. Snare / Clap (Steps 4, 12)
    if (step === 4 || step === 12) {
      this.playSnare(time);
    }

    // 3. Hi-Hat (Every 2nd 16th note)
    if (step % 2 === 0) {
      this.playHiHat(time, step % 4 === 2);
    }

    // 4. Synth Bassline (Driving 8th notes)
    if (step % 2 === 0) {
      const noteIndex = Math.floor(step / 4) % this.bassNotes.length;
      const freq = this.bassNotes[noteIndex];
      this.playSynthBass(time, freq, 0.12);
    }

    // 5. Arpeggiated Neon Lead (Plays on 16ths when enraged or random)
    if (this.isEnraged || step % 4 === 3) {
      const leadIndex = (step * 3) % this.leadNotes.length;
      const freq = this.leadNotes[leadIndex];
      this.playLead(time, freq, 0.09);
    }
  }

  private playKick(time: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(32, time + 0.08);

    gain.gain.setValueAtTime(0.35, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.15);
  }

  private playSnare(time: number) {
    if (!this.ctx) return;
    // White noise snare burst
    const bufferSize = this.ctx.sampleRate * 0.1;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(time);
    noise.stop(time + 0.12);
  }

  private playHiHat(time: number, open: boolean) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(7500, time);

    const duration = open ? 0.08 : 0.03;
    gain.gain.setValueAtTime(0.05, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + duration);
  }

  private playSynthBass(time: number, freq: number, duration: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, time);
    filter.frequency.exponentialRampToValueAtTime(150, time + duration);

    gain.gain.setValueAtTime(0.18, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + duration);
  }

  private playLead(time: number, freq: number, duration: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, time);

    gain.gain.setValueAtTime(0.08, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + duration);
  }

  // Cinematic Fanfares
  public playDualTechFanfare() {
    this.initContext();
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    const chords = [293.66, 369.99, 440.0, 587.33]; // D Major celebratory
    chords.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time + idx * 0.08);
      gain.gain.setValueAtTime(0.2, time + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, time + idx * 0.08 + 0.6);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(time + idx * 0.08);
      osc.stop(time + idx * 0.08 + 0.6);
    });
  }
}

export const synthwaveBGM = new SynthwaveAudioEngine();
