// ---------- View 1: the Unit 4 control room ----------
const CR = {
  W: 600, H: 760,
  buttons: [
    { id: 'spdown', x: 34, y: 572, w: 116, h: 56, ru: 'УСТ. N ▼', en: 'POWER SETPOINT −' },
    { id: 'lar_ar', x: 162, y: 572, w: 116, h: 56, ru: 'ЛАР → АР', en: 'LOCAL → GLOBAL AUTO' },
    { id: 'ar_on', x: 290, y: 572, w: 116, h: 56, ru: 'АР ВКЛ', en: 'AUTO REGULATOR ON' },
    { id: 'skala', x: 34, y: 648, w: 116, h: 56, ru: 'СКАЛА ПЕЧАТЬ', en: 'SKALA PRINTOUT' },
    { id: 'withdraw', x: 162, y: 648, w: 116, h: 56, ru: '▲ ИЗВЛЕЧЬ', en: 'WITHDRAW RODS', hold: true },
    { id: 'insert', x: 290, y: 648, w: 116, h: 56, ru: '▼ ВВЕСТИ', en: 'INSERT RODS', hold: true },
    { id: 'clutch', x: 34, y: 718, w: 372, h: 32, ru: 'ОБЕСТОЧИТЬ МУФТЫ СЕРВОПРИВОДОВ', en: 'DE-ENERGISE SERVO CLUTCHES' },
    { id: 'az5', x: 430, y: 588, w: 150, h: 150, ru: 'АЗ-5', en: 'EMERGENCY PROTECTION', round: true },
  ],
  pressedAt: {},

  init() {
    // the circular rod-position ("selsyn") display: dials laid on a grid clipped to a circle
    const rng = mulberry(4);
    this.dials = [];
    const cx = 300, cy = 162, R = 124, step = 15.5;
    for (let y = -R; y <= R; y += step) for (let x = -R; x <= R; x += step) {
      if (x * x + y * y < (R - 6) * (R - 6)) this.dials.push({ x: cx + x, y: cy + y, r: rng(), ar: rng() < 0.05, usp: rng() < 0.12 });
    }
    this.lamps = [];
    for (let i = 0; i < 70; i++) this.lamps.push({ x: rng() < 0.5 ? 14 + rng() * 120 : 466 + rng() * 120, y: 30 + rng() * 240, c: ['#5f5', '#fd4', '#f53', '#fff'][Math.floor(rng() * 4)], p: rng() * 10, s: 0.2 + rng() * 2 });
    this.dust = [];
  },

  hit(x, y) {
    for (const b of this.buttons) {
      if (b.round) { const cx = b.x + b.w / 2, cy = b.y + b.h / 2; if ((x - cx) ** 2 + (y - cy) ** 2 < (b.w / 2) ** 2) return b; }
      else if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  },

  rodInsertion(d) { // 0 = fully withdrawn, 1 = fully inserted
    if (S.azT >= 0) return clamp(Math.max(this.baseIns(d), S.azDepth / 7), 0, 1);
    return this.baseIns(d);
  },
  baseIns(d) {
    if (d.usp) return 0; // shortened absorbers from below, shown withdrawn
    if (d.ar) return clamp(0.35 - S.ar * 0.12, 0, 1);
    const frac = clamp(S.ORM / 60, 0, 1);
    return d.r < frac ? clamp(0.25 + (frac - d.r) * 2.2, 0, 0.85) : 0;
  },

  annunciators() {
    const tau = azTau(); const blink = Math.floor(S.realT * 3) % 2 === 0;
    return [
      { ru: 'САОР ОТКЛ', en: 'ECCS OFF', on: S.eccsOff, c: 'a' },
      { ru: 'ЛАР', en: 'LOCAL AUTO', on: S.mode === 'LAR', c: 'g' },
      { ru: 'АР', en: 'GLOBAL AUTO', on: S.mode === 'AR' || S.mode === 'TEST', c: 'g' },
      { ru: 'АР ПРЕДЕЛ', en: 'AR AT LIMIT', on: S.arSat && blink, c: 'a' },
      { ru: 'N МАЛА', en: 'POWER LOW', on: S.P < 120 && S.mode !== 'LAR' && S.mode !== 'AZ5' && blink, c: 'r' },
      { ru: 'ОЗР < 15', en: 'ORM < 15', on: S.ORM < 15 && blink, c: 'r' },
      { ru: 'ГЦН ×' + S.pumps, en: 'MAIN PUMPS', on: S.pumps > 6, c: 'a' },
      { ru: 'АЗ БЛОК', en: 'TRIPS BLOCKED', on: S.tripsBlocked, c: 'a' },
      { ru: 'ТГ-8 СРК', en: 'TG-8 VALVES SHUT', on: S.test, c: 'a' },
      { ru: 'АЗ-5', en: 'SCRAM', on: tau >= 0 && blink, c: 'r' },
      { ru: 'АЗМ', en: 'POWER EMERG.', on: tau >= 0 && S.P > 530 && blink, c: 'r' },
      { ru: 'АЗС', en: 'PERIOD EMERG.', on: tau >= 1.8 && !blink, c: 'r' },
    ];
  },

  draw(view, dt) {
    const sh = S.shake;
    const c = view.begin(rand(-sh, sh) * 6, rand(-sh, sh) * 6);
    const W = this.W, H = this.H, t = S.realT;
    const dark = S.e2;

    // ---- back wall ----
    let g = c.createLinearGradient(0, 0, 0, 520);
    g.addColorStop(0, '#2c3832'); g.addColorStop(1, '#1e2723');
    c.fillStyle = g; c.fillRect(0, 0, W, 530);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 2;
    for (let x = 0; x <= W; x += 75) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 530); c.stroke(); }
    // cabinet lamps (ambient life)
    for (const l of this.lamps) {
      const on = Math.sin(t * l.s + l.p) > -0.3 || l.c === '#5f5';
      c.fillStyle = on && !dark ? l.c : '#222'; c.globalAlpha = on && !dark ? 0.85 : 0.6;
      c.fillRect(l.x, l.y, 5, 4);
    }
    c.globalAlpha = 1;

    // ---- selsyn rod-position display ----
    c.fillStyle = '#121714'; c.beginPath(); c.arc(300, 162, 132, 0, TAU); c.fill();
    c.strokeStyle = '#59645c'; c.lineWidth = 5; c.stroke();
    c.strokeStyle = '#0a0d0b'; c.lineWidth = 2; c.beginPath(); c.arc(300, 162, 127, 0, TAU); c.stroke();
    for (const d of this.dials) {
      const ins = this.rodInsertion(d);
      c.fillStyle = '#d8d6c8'; c.globalAlpha = dark ? 0.15 : 0.9;
      c.beginPath(); c.arc(d.x, d.y, 6.2, 0, TAU); c.fill();
      c.globalAlpha = dark ? 0.2 : 1;
      c.strokeStyle = d.ar ? '#c22' : d.usp ? '#1a6' : '#111'; c.lineWidth = 1.6;
      const a = -Math.PI / 2 + ins * TAU * 0.9;
      c.beginPath(); c.moveTo(d.x, d.y); c.lineTo(d.x + Math.cos(a) * 5.4, d.y + Math.sin(a) * 5.4); c.stroke();
      if (ins > 0.02) {
        c.strokeStyle = d.ar ? 'rgba(220,40,40,.6)' : 'rgba(255,170,40,.55)';
        c.beginPath(); c.arc(d.x, d.y, 4, -Math.PI / 2, a); c.stroke();
      }
    }
    c.globalAlpha = 1;
    this.label(c, 'СУЗ · ПОЛОЖЕНИЕ СТЕРЖНЕЙ', 300, 12, '#c9d0c2', 10, 'center');
    this.label(c, 'CONTROL ROD POSITIONS', 300, 21, '#7f8a80', 8, 'center');

    // ---- strip chart recorder (log power) ----
    this.stripChart(c, 470, 50, 112, 220);
    this.label(c, 'N  lg МВт', 526, 44, '#c9d0c2', 9, 'center');
    // side meters
    this.meter(c, 22, 50, 'ДАВЛ. БС', 'DRUM kgf/cm²', S.pressure, 50, 90);
    this.meter(c, 22, 160, 'ПАР %', 'STEAM VOID', S.void * 100, 0, 100);

    // ---- digital readouts ----
    const pTxt = S.P > 99999 ? (Math.floor(t * 20) % 2 ? '█████' : '-----') : Math.round(S.P).toString();
    this.readout(c, 18, 300, 180, 'МОЩНОСТЬ  N', 'THERMAL POWER, MW', pTxt, S.azT >= 0 ? '#ff4030' : '#ff6a3a');
    const ormLow = S.ORM < 15;
    this.readout(c, 210, 300, 120, 'ОЗР', 'REACTIVITY MARGIN, RODS', S.ORM.toFixed(1), ormLow ? (Math.floor(t * 3) % 2 ? '#ff3b2f' : '#802018') : '#ffb43c');
    this.readout(c, 342, 300, 120, 'РАСХОД ГЦН', 'COOLANT, m³/h', Math.round(S.flow * 42000).toString(), '#8fe6ff');
    this.readout(c, 474, 300, 108, 'ρ, β', 'REACTIVITY, $', (S.rho >= 0 ? '+' : '') + S.rho.toFixed(2), S.rho > 0.8 ? '#ff3b2f' : '#b6ff8a');

    // ---- annunciator panel ----
    const ann = this.annunciators();
    ann.forEach((a, i) => {
      const x = 18 + (i % 6) * 95, y = 384 + Math.floor(i / 6) * 46;
      const col = a.c === 'r' ? '#ff4636' : a.c === 'a' ? '#ffb43c' : '#7dffa6';
      c.fillStyle = '#0d100e'; c.fillRect(x, y, 88, 40);
      if (a.on && !dark) {
        c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 14; c.fillRect(x + 2, y + 2, 84, 36); c.shadowBlur = 0;
        this.label(c, a.ru, x + 44, y + 18, '#1a0a05', 11, 'center', 600);
        this.label(c, a.en, x + 44, y + 31, '#2a1408', 8, 'center');
      } else {
        c.fillStyle = '#1b201c'; c.fillRect(x + 2, y + 2, 84, 36);
        this.label(c, a.ru, x + 44, y + 18, '#4c564e', 11, 'center', 600);
        this.label(c, a.en, x + 44, y + 31, '#3c453e', 8, 'center');
      }
    });

    // ---- desk ----
    g = c.createLinearGradient(0, 486, 0, H);
    g.addColorStop(0, '#46524a'); g.addColorStop(0.12, '#37423b'); g.addColorStop(1, '#232b26');
    c.fillStyle = g; c.beginPath(); c.moveTo(-10, 548); c.lineTo(W + 10, 548); c.lineTo(W + 10, H); c.lineTo(-10, H); c.fill();
    c.fillStyle = '#5c6a60'; c.fillRect(0, 540, W, 10);
    c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(0, 550, W, 4);

    for (const b of this.buttons) this.button(c, b);

    // printout from the SKALA computer
    if (S.printout) this.paper(c, S.printout);

    // plaster dust after the first blast
    if (S.e1) {
      if (this.dust.length < 260 && Math.random() < 0.8) for (let i = 0; i < 4; i++) this.dust.push({ x: rand(W), y: -5, v: rand(30, 90), s: rand(1, 3) });
      c.fillStyle = 'rgba(220,215,200,.55)';
      for (const p of this.dust) { p.y += p.v * dt; p.x += Math.sin(p.y * 0.05) * 0.4; c.fillRect(p.x, p.y, p.s, p.s); }
      this.dust = this.dust.filter((p) => p.y < H);
    }

    // lighting: flicker after the first explosion, emergency lighting after the second
    let dim = 0;
    if (S.e1 && !S.e2) dim = Math.random() < 0.3 ? 0.65 : 0.1;
    if (S.e2) { const k = (S.realT - S.e2t); dim = k < 0.25 ? 0 : 0.78 + (Math.random() < 0.05 ? 0.15 : 0); }
    if (dim > 0) {
      c.fillStyle = `rgba(0,0,0,${dim})`; c.fillRect(-600, -600, W + 1200, H + 1200);
      if (S.e2) { c.fillStyle = 'rgba(160,20,10,.16)'; c.fillRect(-600, -600, W + 1200, H + 1200); }
    }
    if (S.e2) {
      // emergency lamp glow + still-lit annunciators
      const k = S.realT - S.e2t;
      if (k < 0.25) { c.fillStyle = `rgba(255,255,255,${1 - k * 4})`; c.fillRect(-600, -600, W + 1200, H + 1200); }
      const rg = c.createRadialGradient(560, 20, 2, 560, 20, 200); rg.addColorStop(0, 'rgba(255,60,30,.35)'); rg.addColorStop(1, 'rgba(255,60,30,0)');
      c.fillStyle = rg; c.fillRect(0, 0, W, H);
    }
    if (S.focus) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(-600, -600, this.W + 1200, this.H + 1200); }
    // CRT-ish scanlines
    c.fillStyle = 'rgba(0,0,0,.08)';
    for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
  },

  label(c, txt, x, y, col, size, align = 'left', weight = 400) {
    c.font = `${weight} ${size}px "IBM Plex Mono", monospace`; c.fillStyle = col; c.textAlign = align; c.textBaseline = 'alphabetic';
    c.fillText(txt, x, y);
  },

  readout(c, x, y, w, ru, en, val, col) {
    c.fillStyle = '#4a564e'; c.fillRect(x - 3, y - 3, w + 6, 76);
    c.fillStyle = '#060807'; c.fillRect(x, y + 20, w, 42);
    this.label(c, ru, x + 2, y + 9, '#dfe5d8', 10, 'left', 600);
    this.label(c, en, x + 2, y + 18, '#99a397', 7);
    c.font = '600 30px "IBM Plex Mono", monospace'; c.textAlign = 'right';
    c.fillStyle = 'rgba(255,255,255,.05)'; c.fillText('88888'.slice(0, Math.max(4, val.length)), x + w - 6, y + 52);
    if (!S.e2 || Math.random() < 0.6) {
      c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 10; c.fillText(val, x + w - 6, y + 52); c.shadowBlur = 0;
    }
  },

  meter(c, x, y, ru, en, v, lo, hi) {
    c.fillStyle = '#e6e2d2'; c.fillRect(x, y, 110, 90);
    c.strokeStyle = '#111'; c.lineWidth = 1;
    const cx = x + 55, cy = y + 80;
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * 52, cy + Math.sin(a) * 52); c.lineTo(cx + Math.cos(a) * (i % 5 ? 46 : 42), cy + Math.sin(a) * (i % 5 ? 46 : 42)); c.stroke();
    }
    const k = clamp((v - lo) / (hi - lo), 0, 1.05) + (S.azT >= 0 ? rand(-0.02, 0.02) : 0);
    const a = Math.PI + k * Math.PI;
    c.strokeStyle = '#b11'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * 48, cy + Math.sin(a) * 48); c.stroke();
    this.label(c, ru, cx, y + 40, '#222', 9, 'center', 600);
    this.label(c, en, cx, y + 52, '#555', 7, 'center');
  },

  stripChart(c, x, y, w, h) {
    c.fillStyle = '#e9e5d4'; c.fillRect(x, y, w, h);
    const off = (S.realT * 18) % 12;
    c.strokeStyle = 'rgba(80,120,90,.35)'; c.lineWidth = 0.7;
    for (let yy = y - off + 12; yy < y + h; yy += 12) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); }
    for (let d = 1; d <= 5; d++) { const xx = x + (d / 6) * w; c.beginPath(); c.moveTo(xx, y); c.lineTo(xx, y + h); c.stroke(); }
    const hs = S.hist; if (!hs.length) return;
    c.strokeStyle = '#7a0c4a'; c.lineWidth = 1.4; c.beginPath();
    for (let i = 0; i < hs.length; i++) {
      const px = x + clamp(Math.log10(Math.max(1, hs[i])) / 6, 0, 1) * w;
      const py = y + h - (hs.length - i) * (h / 240);
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.stroke();
    ['1', '10', '10²', '10³', '10⁴', '10⁵'].forEach((s, i) => this.label(c, s, x + (i / 6) * w + 2, y + h + 10, '#9aa596', 7));
  },

  button(c, b) {
    const t = S.realT;
    const isT = S.target === b.id;
    const held = (b.id === 'withdraw' && S.holdW) || (b.id === 'insert' && S.holdI) || (this.pressedAt[b.id] && t - this.pressedAt[b.id] < 0.15);
    if (b.round) {
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      // yellow/black hazard ring
      c.save(); c.beginPath(); c.arc(cx, cy, 74, 0, TAU); c.clip();
      c.fillStyle = '#e8c21a'; c.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      c.fillStyle = '#111';
      for (let i = -10; i < 10; i++) { c.save(); c.translate(cx, cy); c.rotate(Math.PI / 4); c.fillRect(i * 22, -100, 11, 200); c.restore(); }
      c.restore();
      c.fillStyle = '#2b302c'; c.beginPath(); c.arc(cx, cy, 58, 0, TAU); c.fill();
      const pr = held || S.azT >= 0;
      const rg = c.createRadialGradient(cx - 12, cy - 14, 4, cx, cy, 48);
      rg.addColorStop(0, pr ? '#ff6a50' : '#ff5545'); rg.addColorStop(0.6, pr ? '#a3120a' : '#d01a10'); rg.addColorStop(1, '#5a0805');
      c.fillStyle = rg; c.beginPath(); c.arc(cx, cy + (pr ? 3 : 0), 46, 0, TAU); c.fill();
      if (S.azT >= 0 && !S.e2) { c.shadowColor = '#f33'; c.shadowBlur = 30; c.fill(); c.shadowBlur = 0; }
      this.label(c, 'АЗ-5', cx, cy + 9 + (pr ? 3 : 0), '#fff2ea', 26, 'center', 600);
      // protective flip cover
      if (!S.coverOpen) {
        c.fillStyle = 'rgba(255,60,40,.28)'; c.strokeStyle = 'rgba(255,190,170,.7)'; c.lineWidth = 2;
        c.beginPath(); c.arc(cx, cy, 56, 0, TAU); c.fill(); c.stroke();
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(cx - 6, cy - 6, 40, Math.PI * 1.1, Math.PI * 1.5); c.stroke();
      } else {
        c.fillStyle = 'rgba(255,60,40,.25)'; c.strokeStyle = 'rgba(255,190,170,.6)'; c.lineWidth = 2;
        c.beginPath(); c.ellipse(cx, b.y - 8, 56, 12, 0, 0, TAU); c.fill(); c.stroke();
      }
      this.label(c, 'EMERGENCY PROTECTION', cx, b.y + b.h + 16, '#c7cdc0', 8, 'center');
      if (isT) this.targetMarker(c, cx - 75, b.y - 24, 150, b.h + 44, S.coverOpen ? 'PRESS' : 'LIFT COVER', true);
      return;
    }
    c.fillStyle = '#151a17'; c.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 6);
    const lit = isT;
    const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
    if (b.id === 'clutch') { g.addColorStop(0, held ? '#4a1612' : '#6a2118'); g.addColorStop(1, '#3a0e0a'); }
    else { g.addColorStop(0, held ? '#9a9a8c' : '#d8d6c6'); g.addColorStop(1, held ? '#77776a' : '#a9a797'); }
    c.fillStyle = g; c.fillRect(b.x, b.y + (held ? 3 : 0), b.w, b.h);
    if (lit) { c.fillStyle = `rgba(255,190,60,${0.25 + 0.2 * Math.sin(t * 8)})`; c.fillRect(b.x, b.y + (held ? 3 : 0), b.w, b.h); }
    const ink = b.id === 'clutch' ? '#ffd8cc' : '#141614';
    this.label(c, b.ru, b.x + b.w / 2, b.y + (b.h > 40 ? 25 : 15) + (held ? 3 : 0), ink, b.h > 40 ? 13 : 11, 'center', 600);
    this.label(c, b.en, b.x + b.w / 2, b.y + (b.h > 40 ? 41 : 27) + (held ? 3 : 0), b.id === 'clutch' ? '#d9a99a' : '#434840', 8, 'center');
    if (isT) this.targetMarker(c, b.x - 5, b.y - 5, b.w + 10, b.h + 12, b.hold ? 'HOLD' : 'PRESS');
  },

  targetMarker(c, x, y, w, h, txt, big) {
    const t = S.realT, p = 0.5 + 0.5 * Math.sin(t * 7);
    c.strokeStyle = `rgba(255,200,60,${0.5 + p * 0.5})`; c.lineWidth = 3; c.setLineDash([8, 5]); c.lineDashOffset = -t * 30;
    c.strokeRect(x, y, w, h); c.setLineDash([]);
    const bx = x + w / 2, by = y - 8 - p * 5;
    c.fillStyle = '#ffc23c'; c.beginPath(); c.moveTo(bx - 8, by - 6); c.lineTo(bx + 8, by - 6); c.lineTo(bx, by + 4); c.fill();
    c.font = `600 ${big ? 13 : 11}px "IBM Plex Mono", monospace`;
    const tw = c.measureText(txt).width + 12;
    c.fillRect(bx - tw / 2, by - 24, tw, 17);
    this.label(c, txt, bx, by - 11, '#1a1206', big ? 13 : 11, 'center', 600);
  },

  paper(c, p) {
    const k = clamp((S.realT - p.t0) / 2.6, 0, 1); // printing progress
    c.save(); c.translate(150, 236); c.rotate(-0.035);
    const h = 40 + 230 * k;
    c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(6, 6, 300, h);
    c.fillStyle = '#f1edd8'; c.fillRect(0, 0, 300, h);
    c.fillStyle = 'rgba(120,140,200,.25)';
    for (let y = 8; y < h; y += 16) c.fillRect(0, y, 300, 8);
    c.fillStyle = '#d7d2bd'; for (let y = 6; y < h; y += 12) { c.beginPath(); c.arc(8, y, 2.5, 0, TAU); c.arc(292, y, 2.5, 0, TAU); c.fill(); }
    const lines = p.lines; const n = Math.floor(lines.length * k + 0.999);
    for (let i = 0; i < n; i++) {
      const L = lines[i];
      this.label(c, L.t, 20, 26 + i * 16, L.hl ? '#b0150c' : '#2a2a30', 11, 'left', L.hl ? 600 : 400);
    }
    c.restore();
  },
};
