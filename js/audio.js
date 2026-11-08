// ---------- Web Audio: geiger, alarms, machinery, explosions, fake synthetic speech ----------
const AU = {
  ctx: null, ok: false, muted: false,
  geigerRate: 0, _nextClick: 0,
  loops: {},

  init() {
    if (this.ctx) return;
    const C = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = C.createGain(); this.master.gain.value = 0.85;
    const comp = C.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
    this.master.connect(comp).connect(C.destination);

    // buses: control room (left), core / geiger (centre), outside (right)
    this.L = this._bus(-0.55); this.Cn = this._bus(0); this.R = this._bus(0.6);

    // shared buffers
    const sr = C.sampleRate;
    this.noise = C.createBuffer(1, sr * 2, sr);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.brown = C.createBuffer(1, sr * 4, sr);
    const bd = this.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < bd.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    this.click = C.createBuffer(1, Math.floor(sr * 0.006), sr);
    const cd = this.click.getChannelData(0);
    for (let i = 0; i < cd.length; i++) {
      const t = i / sr;
      cd[i] = (i < 3 ? (i % 2 ? -1 : 1) : 0) + Math.exp(-t * 1400) * Math.sin(TAU * 3100 * t) * 0.8 + (Math.random() * 2 - 1) * Math.exp(-t * 2500) * 0.5;
    }
    this.dist = C.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 3); }
    this.dist.curve = curve;
    this.dist.connect(this.Cn);

    this._hum(); this._wind(); this._crickets();
    this._nextClick = C.currentTime;
    setInterval(() => this._geigerTick(), 25);
    this.ok = true;
  },

  _bus(pan) {
    const C = this.ctx, g = C.createGain();
    if (C.createStereoPanner) { const p = C.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(this.master); }
    else g.connect(this.master);
    return g;
  },
  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  },
  now() { return this.ctx ? this.ctx.currentTime : 0; },

  _src(buf, loop = false) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; },
  _osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; },
  _gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; },
  _filt(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; },

  // ---------- ambience ----------
  _hum() {
    const g = this._gain(0.0); g.connect(this.L);
    [[50, 0.5, 'sine'], [100, 0.35, 'sine'], [150, 0.12, 'sawtooth']].forEach(([f, v, t]) => {
      const o = this._osc(t, f); const og = this._gain(v); const lp = this._filt('lowpass', 400);
      o.connect(lp).connect(og).connect(g); o.start();
    });
    // fluorescent / ventilation hiss
    const n = this._src(this.brown, true); const nf = this._filt('bandpass', 700, 0.4); const ng = this._gain(0.25);
    n.connect(nf).connect(ng).connect(g); n.start();
    this.humGain = g;
    g.gain.setTargetAtTime(0.03, this.ctx.currentTime, 2);
  },
  _wind() {
    const n = this._src(this.noise, true); const f = this._filt('bandpass', 380, 0.6); const g = this._gain(0);
    n.connect(f).connect(g).connect(this.R); n.start();
    this.windGain = g; this.windFilt = f;
  },
  setWind(w) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.012 + w * 0.03, t, 0.4);
    this.windFilt.frequency.setTargetAtTime(260 + w * 380, t, 0.4);
  },
  _crickets() {
    this.cricketsOn = true;
    const chirp = () => {
      if (!this.cricketsOn) return;
      const C = this.ctx, t0 = C.currentTime + 0.05;
      const o = this._osc('sine', rand(4300, 4700)); const g = this._gain(0); o.connect(g).connect(this.R);
      const n = 3 + Math.floor(rand(3));
      for (let i = 0; i < n; i++) {
        const t = t0 + i * 0.045;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.012, t + 0.008); g.gain.linearRampToValueAtTime(0, t + 0.03);
      }
      o.start(t0); o.stop(t0 + n * 0.05 + 0.05);
      setTimeout(chirp, rand(350, 1400));
    };
    setTimeout(chirp, 800);
  },

  // ---------- geiger ----------
  setGeiger(rate) { this.geigerRate = clamp(rate, 0, 1400); },
  _geigerTick() {
    if (!this.ok) return;
    const C = this.ctx, now = C.currentTime;
    if (this._nextClick < now) this._nextClick = now;
    if (this.geigerRate <= 0.01) { this._nextClick = now + 0.1; return; }
    let n = 0;
    while (this._nextClick < now + 0.12 && n < 200) {
      const s = this._src(this.click); s.playbackRate.value = rand(0.85, 1.2);
      const g = this._gain(rand(0.12, 0.3) * (this.geigerRate > 400 ? 0.6 : 1));
      s.connect(g).connect(this.Cn); s.start(this._nextClick);
      this._nextClick += -Math.log(1 - Math.random()) / this.geigerRate;
      n++;
    }
  },

  // ---------- UI / machinery ----------
  beep(f, dur = 0.12, vol = 0.08, type = 'square', bus, when = 0) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + when;
    const o = this._osc(type, f), g = this._gain(0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.setValueAtTime(vol, t + dur - 0.02); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(bus || this.L); o.start(t); o.stop(t + dur + 0.02);
  },
  press() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const s = this._src(this.noise); const f = this._filt('highpass', 2500); const g = this._gain(0.25);
    g.gain.setTargetAtTime(0, t + 0.004, 0.006); s.connect(f).connect(g).connect(this.L); s.start(t); s.stop(t + 0.05);
    const o = this._osc('sine', 140); const og = this._gain(0.25);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.06); og.gain.setTargetAtTime(0, t + 0.01, 0.02);
    o.connect(og).connect(this.L); o.start(t); o.stop(t + 0.15);
  },
  denied() { this.beep(160, 0.16, 0.06, 'square'); this.beep(120, 0.16, 0.06, 'square', null, 0.17); },
  clunk() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this._osc('triangle', 90); const g = this._gain(0.5);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.2); g.gain.setTargetAtTime(0, t + 0.02, 0.06);
    o.connect(g).connect(this.L); o.start(t); o.stop(t + 0.5);
    const s = this._src(this.noise); const f = this._filt('bandpass', 900, 2); const sg = this._gain(0.3);
    sg.gain.setTargetAtTime(0, t + 0.01, 0.03); s.connect(f).connect(sg).connect(this.L); s.start(t); s.stop(t + 0.2);
  },
  printer() {
    if (!this.ok) return;
    const C = this.ctx, t0 = C.currentTime;
    for (let i = 0; i < 46; i++) {
      const t = t0 + i * 0.055 + (i % 9 === 8 ? 0.12 : 0);
      const s = this._src(this.noise); const f = this._filt('bandpass', rand(1800, 2600), 4); const g = this._gain(0.35);
      g.gain.setTargetAtTime(0, t + 0.004, 0.006); s.connect(f).connect(g).connect(this.L); s.start(t); s.stop(t + 0.04);
    }
  },
  rodMotor(on) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    if (!this.motor) {
      const o = this._osc('sawtooth', 58), o2 = this._osc('square', 117), lp = this._filt('lowpass', 500, 2), g = this._gain(0);
      const lfo = this._osc('sine', 9), lg = this._gain(0.02); lfo.connect(lg).connect(g.gain);
      o.connect(lp); o2.connect(lp); lp.connect(g).connect(this.L); o.start(); o2.start(); lfo.start();
      this.motor = g;
    }
    this.motor.gain.setTargetAtTime(on ? 0.07 : 0, t, on ? 0.03 : 0.08);
  },

  // repeating alarms: 'warn' (two-tone chime) and 'klaxon' (urgent)
  alarm(kind, on) {
    if (!this.ok) return;
    if (on && !this.loops[kind]) {
      let i = 0;
      const step = () => {
        if (kind === 'warn') { this.beep(i % 2 ? 660 : 880, 0.22, 0.045, 'triangle'); }
        else { this.beep(i % 2 ? 520 : 780, 0.18, 0.07, 'square'); this.beep(i % 2 ? 1040 : 1560, 0.18, 0.02, 'square'); }
        i++;
      };
      step();
      this.loops[kind] = setInterval(step, kind === 'warn' ? 700 : 220);
    } else if (!on && this.loops[kind]) { clearInterval(this.loops[kind]); delete this.loops[kind]; }
  },
  allAlarmsOff() { Object.keys(this.loops).forEach((k) => this.alarm(k, false)); },

  turbineStart() {
    if (!this.ok) return;
    const C = this.ctx, t = C.currentTime;
    const g = this._gain(0); g.connect(this.L);
    const lp = this._filt('lowpass', 1400, 1); lp.connect(g);
    const oscs = [[300, 'sawtooth', 0.5], [600, 'sine', 0.3], [903, 'sine', 0.15]].map(([f, ty, v]) => {
      const o = this._osc(ty, f); const og = this._gain(v); o.connect(og).connect(lp);
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.35, t + 45);
      o.start(t); return o;
    });
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 1.5);
    g.gain.linearRampToValueAtTime(0.035, t + 36);
    // steam roar as the stop valves slam
    const s = this._src(this.noise, true); const sf = this._filt('bandpass', 1500, 0.7); const sg = this._gain(0.18);
    sg.gain.setTargetAtTime(0.015, t + 0.3, 1.2); s.connect(sf).connect(sg).connect(this.L); s.start(t);
    this.turbine = { g, oscs, s, sg };
  },
  turbineStop() {
    if (!this.turbine) return;
    const t = this.ctx.currentTime;
    this.turbine.g.gain.setTargetAtTime(0, t, 0.05); this.turbine.sg.gain.setTargetAtTime(0, t, 0.05);
    const tb = this.turbine; setTimeout(() => { tb.oscs.forEach((o) => o.stop()); tb.s.stop(); }, 600);
    this.turbine = null;
  },
  // deep structural groan/rumble that ramps with the excursion
  rumble(level) {
    if (!this.ok) return;
    if (!this.rum) {
      const s = this._src(this.brown, true); const f = this._filt('lowpass', 120, 1); const g = this._gain(0);
      s.connect(f).connect(g).connect(this.Cn); s.start(); this.rum = g; this.rumF = f;
    }
    const t = this.ctx.currentTime;
    this.rum.gain.setTargetAtTime(level * 1.6, t, 0.15);
    this.rumF.frequency.setTargetAtTime(90 + level * 260, t, 0.2);
  },

  boom(big) {
    if (!this.ok) return;
    const C = this.ctx, t = C.currentTime;
    const dur = big ? 7 : 4.5;
    // noise blast
    const s = this._src(this.brown, true); const f = this._filt('lowpass', big ? 4000 : 2600, 0.7); const g = this._gain(0);
    f.frequency.setValueAtTime(big ? 4000 : 2600, t); f.frequency.exponentialRampToValueAtTime(70, t + dur * 0.7);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(big ? 3.2 : 2.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.dist); s.start(t); s.stop(t + dur);
    const w = this._src(this.noise, true); const wf = this._filt('highpass', 800); const wg = this._gain(0);
    wg.gain.setValueAtTime(big ? 1 : 0.6, t); wg.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    w.connect(wf).connect(wg).connect(this.master); w.start(t); w.stop(t + 1.3);
    // sub drop
    const o = this._osc('sine', big ? 70 : 90); const og = this._gain(big ? 1.4 : 1);
    o.frequency.exponentialRampToValueAtTime(18, t + dur * 0.6); og.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + dur);
    // metallic clang (the upper shield / steel structures)
    [173, 241, 389, 517, 733].forEach((fr, i) => {
      const m = this._osc('sine', fr * (big ? 0.8 : 1)); const mg = this._gain(0.1 / (i + 1));
      mg.gain.exponentialRampToValueAtTime(0.0001, t + 2.5 + i * 0.2); m.connect(mg).connect(this.Cn); m.start(t + 0.05); m.stop(t + 3.5);
    });
    // debris crackle
    for (let i = 0; i < (big ? 90 : 40); i++) {
      const tt = t + 0.3 + Math.pow(Math.random(), 1.5) * (big ? 6 : 3.5);
      const c = this._src(this.noise); const cf = this._filt('bandpass', rand(300, 3000), 3); const cg = this._gain(rand(0.05, 0.4));
      cg.gain.setTargetAtTime(0, tt + 0.01, 0.02); c.connect(cf).connect(cg).connect(i % 2 ? this.R : this.Cn); c.start(tt); c.stop(tt + 0.1);
    }
  },
  lightsOut() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.humGain.gain.setTargetAtTime(0.004, t, 0.05);
    this.cricketsOn = false;
  },

  // ---------- fake synthetic speech: a tiny formant babbler ----------
  // Every syllable of the subtitle is turned into a robotic voiced vowel with a consonant burst.
  VOWELS: { a: [730, 1090], e: [530, 1840], i: [300, 2290], o: [570, 840], u: [320, 870], y: [440, 1600], '@': [500, 1500] },
  speak(text, voice) {
    if (!this.ok || !voice) return { dur: text.length * 0.045, stop() {} };
    const C = this.ctx, start = C.currentTime + 0.04;
    const out = this._gain(voice.vol || 0.5);
    const hp = this._filt('highpass', 160), lp = this._filt('lowpass', voice.radio ? 2600 : 3600);
    out.connect(hp).connect(lp).connect(voice.bus === 'R' ? this.R : this.L);
    const src = this._osc('sawtooth', voice.f0);
    const sq = this._osc('square', voice.f0); const sqg = this._gain(voice.buzz || 0.25);
    const vg = this._gain(0);
    src.connect(vg); sq.connect(sqg).connect(vg);
    const f1 = this._filt('bandpass', 600, 7), f2 = this._filt('bandpass', 1400, 9), f3 = this._filt('bandpass', 2600, 12);
    const g1 = this._gain(1.6), g2 = this._gain(1.0), g3 = this._gain(0.5);
    vg.connect(f1).connect(g1).connect(out); vg.connect(f2).connect(g2).connect(out); vg.connect(f3).connect(g3).connect(out);
    const ns = this._src(this.noise, true), nf = this._filt('bandpass', 4000, 1.2), ng = this._gain(0);
    ns.connect(nf).connect(ng).connect(out);

    let t = start; const f0 = voice.f0; const rate = voice.rate || 1;
    const sentences = text.split(/(?<=[.!?…])\s+/);
    for (const sent of sentences) {
      const words = sent.split(/\s+/).filter(Boolean);
      const excl = /!/.test(sent), q = /\?/.test(sent);
      words.forEach((word, wi) => {
        const prog = wi / Math.max(1, words.length - 1);
        const lw = word.toLowerCase().replace(/[^a-z0-9]/g, '');
        const syl = lw.match(/[^aeiouy]*[aeiouy]+|[^aeiouy]+$/g) || ['@'];
        syl.forEach((s) => {
          const cons = s.replace(/[aeiouy]+$/, ''); const vow = (s.match(/[aeiouy]/) || ['@'])[0];
          if (cons.length) {
            const fric = /[szcfx]|sh|ch/.test(cons), plos = /[ptkbdg]/.test(cons);
            const cd = (fric ? 0.07 : plos ? 0.025 : 0.04) / rate;
            nf.frequency.setValueAtTime(fric ? 5200 : plos ? 2200 : 1200, t);
            ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(fric ? 0.5 : plos ? 0.8 : 0.15, t + 0.008);
            ng.gain.linearRampToValueAtTime(0, t + cd);
            if (/[mnlrvw]/.test(cons)) { vg.gain.setValueAtTime(0.25, t); }
            t += cd * 0.8;
          }
          const [F1, F2] = this.VOWELS[vow] || this.VOWELS['@'];
          let pitch = f0 * (1 + (excl ? 0.22 : 0) + (q && prog > 0.7 ? 0.25 * prog : -0.12 * prog)) * (1 + rand(-0.06, 0.06));
          pitch = Math.round(pitch / 8) * 8; // quantised = robotic
          const vd = rand(0.075, 0.13) / rate;
          src.frequency.setValueAtTime(pitch, t); sq.frequency.setValueAtTime(pitch, t);
          f1.frequency.setTargetAtTime(F1 * (voice.formant || 1), t, 0.012);
          f2.frequency.setTargetAtTime(F2 * (voice.formant || 1), t, 0.012);
          vg.gain.setValueAtTime(vg.gain.value > 0 ? 0.3 : 0, t);
          vg.gain.linearRampToValueAtTime(1, t + 0.015);
          vg.gain.setValueAtTime(1, t + vd - 0.025);
          vg.gain.linearRampToValueAtTime(0, t + vd);
          t += vd;
        });
        t += (/[,;:—-]$/.test(word) ? 0.16 : 0.035) / rate;
      });
      t += 0.22 / rate;
    }
    src.start(start); sq.start(start); ns.start(start);
    const end = t + 0.05; src.stop(end); sq.stop(end); ns.stop(end);
    // radio blips framing the line
    this.beep(1400, 0.04, 0.025, 'sine', voice.bus === 'R' ? this.R : this.L);
    return {
      dur: end - C.currentTime,
      stop: () => { try { const n = C.currentTime; out.gain.setTargetAtTime(0, n, 0.01); src.stop(n + 0.05); sq.stop(n + 0.05); ns.stop(n + 0.05); } catch (e) {} },
    };
  },
};
