/* ============================================================================
 * audio.js — MotoRush 3D Web Audio API 实时四缸机声浪与街机音效合成器
 * ========================================================================== */

(function (global) {
  'use strict';

  class MotoAudio {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.running = false;
      this.master = null;
      this.osc1 = null;
      this.osc2 = null;
      this.subOsc = null;
      this.engFilter = null;
      this.engGain = null;
      this.windGain = null;
      this.windFilter = null;
      this.noiseBuf = null;
    }

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();

      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.36 : 0;
      this.master.connect(this.ctx.destination);

      // 失真波表（让直四高转声浪更带排气管金属共振）
      const shaper = this.ctx.createWaveShaper();
      const n = 1024;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i * 2) / n - 1;
        curve[i] = Math.tanh(x * 2.6);
      }
      shaper.curve = curve;

      this.engFilter = this.ctx.createBiquadFilter();
      this.engFilter.type = 'lowpass';
      this.engFilter.frequency.value = 600;
      this.engFilter.Q.value = 3.2;

      this.engGain = this.ctx.createGain();
      this.engGain.gain.value = 0.0001;

      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = 'sawtooth';
      this.osc1.frequency.value = 55;

      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = 'triangle';
      this.osc2.frequency.value = 110;

      this.subOsc = this.ctx.createOscillator();
      this.subOsc.type = 'sine';
      this.subOsc.frequency.value = 27.5;

      const subG = this.ctx.createGain();
      subG.gain.value = 0.45;

      this.osc1.connect(shaper);
      this.osc2.connect(shaper);
      this.subOsc.connect(subG);
      subG.connect(shaper);
      shaper.connect(this.engFilter);
      this.engFilter.connect(this.engGain);
      this.engGain.connect(this.master);

      this.osc1.start();
      this.osc2.start();
      this.subOsc.start();

      // 风噪 / 氮气喷射噪声缓冲
      const sr = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, sr * 2, sr);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

      const windSrc = this.ctx.createBufferSource();
      windSrc.buffer = this.noiseBuf;
      windSrc.loop = true;

      this.windFilter = this.ctx.createBiquadFilter();
      this.windFilter.type = 'bandpass';
      this.windFilter.frequency.value = 450;
      this.windFilter.Q.value = 0.8;

      this.windGain = this.ctx.createGain();
      this.windGain.gain.value = 0.0001;

      windSrc.connect(this.windFilter);
      this.windFilter.connect(this.windGain);
      this.windGain.connect(this.master);
      windSrc.start();
    }

    startRace() {
      this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.running = true;
    }

    stopRace() {
      this.running = false;
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.engGain.gain.setTargetAtTime(0.0001, now, 0.06);
      this.windGain.gain.setTargetAtTime(0.0001, now, 0.06);
    }

    setEnabled(on) {
      this.enabled = on;
      if (!this.ctx) return;
      if (on && this.ctx.state === 'suspended') this.ctx.resume();
      this.master.gain.setTargetAtTime(on ? 0.36 : 0, this.ctx.currentTime, 0.04);
    }

    updateEngine(rpm, speedKmh, throttle, nitroOn) {
      if (!this.ctx || !this.running) return;
      const now = this.ctx.currentTime;
      // 直列四缸基频 = (RPM / 60) * 2
      const baseHz = Math.max(32, (rpm / 60) * 2.0);
      this.osc1.frequency.setTargetAtTime(baseHz, now, 0.025);
      this.osc2.frequency.setTargetAtTime(baseHz * 2.01, now, 0.025);
      this.subOsc.frequency.setTargetAtTime(baseHz * 0.5, now, 0.025);

      const lp = Math.min(4800, 320 + (rpm / 16000) * 2600 + (throttle ? 750 : 0) + (nitroOn ? 1100 : 0));
      this.engFilter.frequency.setTargetAtTime(lp, now, 0.03);

      const amp = 0.16 + (throttle ? 0.14 : 0.0) + (rpm / 16000) * 0.12 + (nitroOn ? 0.08 : 0);
      this.engGain.gain.setTargetAtTime(amp, now, 0.03);

      const spdNorm = Math.min(1, speedKmh / 320);
      this.windFilter.frequency.setTargetAtTime(300 + spdNorm * 1400 + (nitroOn ? 900 : 0), now, 0.04);
      this.windGain.gain.setTargetAtTime(spdNorm * 0.16 + (nitroOn ? 0.22 : 0), now, 0.04);
    }

    playShiftPop() {
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 340;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.42, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
      src.connect(bp); bp.connect(g); g.connect(this.master);
      src.start(t, Math.random() * 0.5, 0.08);
    }

    playNearMiss(combo) {
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const base = 520 + Math.min(8, combo) * 65;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.48, t + 0.13);
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + 0.17);
    }

    playCheckpoint() {
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      [587.3, 880.0, 1174.6].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const st = t + idx * 0.07;
        g.gain.setValueAtTime(0.25, st);
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.24);
        osc.connect(g); g.connect(this.master);
        osc.start(st); osc.stop(st + 0.25);
      });
    }

    playCrash() {
      if (!this.ctx || !this.enabled) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(700, t);
      lp.frequency.exponentialRampToValueAtTime(90, t + 0.32);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.75, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      src.connect(lp); lp.connect(g); g.connect(this.master);
      src.start(t, 0, 0.36);
    }
  }

  global.MotoAudio = MotoAudio;
})(window);
