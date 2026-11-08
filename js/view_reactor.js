// ---------- View 2: cut-away of the RBMK core with particle visualisation ----------
const RX = {
  W: 600, H: 760,
  TOP: 150, BOT: 640, L: 30, R: 570, COLW: 36,
  PXM: 70, // pixels per metre (core height 7 m)
  init() {
    this.cols = [];
    for (let i = 0; i < 15; i++) {
      const cx = this.L + this.COLW * (i + 0.5);
      this.cols.push({ i, cx, rod: i % 3 === 1, rodIdx: Math.floor(i / 3) });
    }
    this.fuel = this.cols.filter((c) => !c.rod);
    this.rods = this.cols.filter((c) => c.rod);
    this.n = []; this.xe = []; this.flash = []; this.bub = []; this.debris = [];
    this.tracer = [];
    for (const col of this.cols) for (let k = 0; k < 6; k++) this.tracer.push({ col, y: rand(this.TOP, this.BOT) });
    this.lid = 0; this.lidV = 0;
  },

  // depth (m) of each control rod's absorber below core top. 0 = fully withdrawn.
  rodDepth(col) {
    let d;
    if (col.rodIdx === 2) d = clamp(1.8 - S.ar * 0.7, 0, 6); // automatic regulator rod
    else {
      // metres of insertion shared proportionally, so every rod moves as soon as ORM changes
      const total = (S.ORM / 30) * 12;
      const share = [0.36, 0.16, 0, 0.28, 0.2][col.rodIdx];
      d = total * share;
    }
    if (S.azT >= 0) d += S.azDepth;
    return clamp(d, 0, 7);
  },

  flux(yn) { // axial neutron-flux shape, 0 = top, 1 = bottom. Double-humped: xenon has carved out the middle.
    const tau = azTau();
    let f = 0.15 + 0.7 * gauss(yn, 0.22, 0.13) + 1.0 * gauss(yn, 0.8, 0.12) + 0.25 * (1 - S.xenon) * gauss(yn, 0.5, 0.2);
    if (tau >= 0) f *= 1 + clamp(tau / 1.2, 0, 1) * 5 * gauss(yn, 0.9, 0.08) + clamp((tau - 1.5) / 2, 0, 1) * 2;
    return f;
  },

  pickY() { // rejection-sample the axial flux shape
    for (let k = 0; k < 12; k++) { const yn = Math.random(); if (Math.random() * 2.2 < this.flux(yn)) return yn; }
    return Math.random();
  },

  update(dt) {
    const P = S.P, tau = azTau();
    if (S.e2 && S.realT - S.e2t > 0.6) return;
    const H = this.BOT - this.TOP;
    // ---- neutrons ----
    const target = clamp(22 * Math.pow(Math.max(P, 5), 0.36), 15, 1700);
    const life = 0.7;
    let spawn = (target / life) * dt;
    if (this.n.length > target * 1.2) spawn = 0;
    while (spawn > 0) {
      if (spawn < 1 && Math.random() > spawn) break;
      spawn--;
      let col, yn;
      if (tau >= 0 && tau < 3 && Math.random() < clamp(tau / 1.2, 0, 0.6)) {
        // extra fissions next to the displacer tips at the bottom
        col = this.cols[Math.floor(rand(15))]; yn = rand(0.82, 0.99);
      } else { col = this.fuel[Math.floor(rand(this.fuel.length))]; yn = this.pickY(); }
      const x = col.cx + rand(-4, 4), y = this.TOP + yn * H;
      const a = rand(TAU), sp = rand(200, 320);
      this.n.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: rand(0.4, 1.0) });
      if (this.flash.length < 250) this.flash.push({ x, y, a: 1 });
    }
    // ---- xenon atoms (built up by iodine-135 decay; burned off by neutrons) ----
    const xeTarget = Math.round(S.xenon * 190);
    if (this.xe.length < xeTarget && Math.random() < dt * 25) {
      const col = this.fuel[Math.floor(rand(this.fuel.length))];
      const yn = clamp(0.5 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.35, 0.03, 0.97);
      this.xe.push({ x: col.cx + rand(-15, 15), y: this.TOP + yn * H, ph: rand(TAU) });
    }
    while (this.xe.length > xeTarget + 5) this.xe.shift();
    // bucket xenon by x for cheap collision checks
    const bk = {};
    this.xe.forEach((p, i) => { const k = Math.floor(p.x / 20); (bk[k] = bk[k] || []).push(i); });
    const deadXe = new Set();
    const rodInfo = this.rods.map((c) => ({ c, d: this.rodDepth(c) }));
    for (const p of this.n) {
      p.age += dt;
      if (p.age > 0.12 && !p.th) { p.th = true; const a = rand(TAU), sp = rand(55, 85); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; }
      if (p.th && Math.random() < dt * 6) { const a = rand(TAU), sp = rand(55, 85); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < this.L || p.x > this.R || p.y < this.TOP || p.y > this.BOT) p.dead = true;
      // absorbed by boron carbide
      for (const r of rodInfo) {
        if (Math.abs(p.x - r.c.cx) < 7) {
          const abBot = this.TOP + r.d * this.PXM;
          if (p.y < abBot) { p.dead = true; if (this.flash.length < 300) this.flash.push({ x: p.x, y: p.y, a: 0.8, k: 'b' }); }
        }
      }
      // absorbed by xenon
      if (p.th && !p.dead) {
        const k = Math.floor(p.x / 20), list = bk[k];
        if (list) for (const i of list) {
          const q = this.xe[i];
          if (!deadXe.has(i) && Math.abs(q.x - p.x) < 4 && Math.abs(q.y - p.y) < 4) {
            p.dead = true; deadXe.add(i); this.flash.push({ x: q.x, y: q.y, a: 1, k: 'x' }); break;
          }
        }
      }
      if (p.age > p.life) p.dead = true;
    }
    this.n = this.n.filter((p) => !p.dead);
    if (deadXe.size) this.xe = this.xe.filter((_, i) => !deadXe.has(i));
    this.flash.forEach((f) => (f.a -= dt * 4));
    this.flash = this.flash.filter((f) => f.a > 0);

    // ---- steam bubbles + coolant tracers ----
    const flowV = (S.e1 ? 0 : 25 + 110 * S.flow);
    const boilY = this.BOT - H * clamp(1 - S.void * 1.6, 0.0, 0.85); // boiling boundary moves down as void rises
    const bubRate = S.void * 60 * (S.e1 ? 3 : 1);
    if (!S.e1 || S.realT - S.e1t < 2) for (const col of this.fuel) {
      if (Math.random() < bubRate * dt) this.bub.push({ col, x: col.cx + rand(-3, 3), y: rand(boilY, this.BOT), r: rand(0.8, 1.5) });
    }
    for (const b of this.bub) { b.y -= (flowV + 20 + S.void * 60) * dt; b.r += dt * (1.5 + S.void * 3); }
    this.bub = this.bub.filter((b) => b.y > this.TOP && b.r < 7);
    for (const tr of this.tracer) { tr.y -= flowV * dt; if (tr.y < this.TOP) tr.y = this.BOT; }

    // ---- explosion debris ----
    if (S.e1 && this.lidV === 0) { this.lidV = -260; for (let i = 0; i < 80; i++) this.debris.push(this.mkDebris()); }
    if (this.lidV) { this.lid += this.lidV * dt; this.lidV += 120 * dt; }
    for (const d of this.debris) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 300 * dt; d.r += d.vr * dt; }
    this.debris = this.debris.filter((d) => d.y < this.H + 40);
  },
  mkDebris() {
    return { x: rand(this.L, this.R), y: rand(this.TOP, this.BOT), vx: rand(-260, 260), vy: rand(-520, -120), r: rand(TAU), vr: rand(-8, 8), s: rand(4, 14), hot: Math.random() < 0.6 };
  },

  draw(view, dt) {
    this.update(dt);
    const sh = S.shake;
    const c = view.begin(rand(-sh, sh) * 9, rand(-sh, sh) * 9);
    const W = this.W, H = this.H, t = S.realT, tau = azTau();
    const P = S.P, heat = clamp(Math.log10(Math.max(P, 1)) / 5.5, 0, 1);

    c.fillStyle = '#07090b'; c.fillRect(0, 0, W, H);

    if (S.e2 && t - S.e2t > 0.6) { this.noSignal(c, t - S.e2t); return; }

    // ---- HUD bars ----
    this.bar(c, 16, 14, 'РЕАКТИВНОСТЬ ρ', 'REACTIVITY ($)', (S.rho + 0.5) / 2.5, S.rho > 1 ? '#ff3b2f' : S.rho > 0.3 ? '#ffb43c' : '#9eff7a', (S.rho >= 0 ? '+' : '') + S.rho.toFixed(2) + ' β', 0.5 / 2.5);
    this.bar(c, 16, 52, 'КСЕНОН-135', 'XENON POISONING', S.xenon, '#b06cff', Math.round(S.xenon * 100) + '%');
    this.bar(c, 312, 14, 'ПАР', 'STEAM VOID', S.void, '#e8f4ff', Math.round(S.void * 100) + '%');
    this.bar(c, 312, 52, 'РАСХОД', 'COOLANT FLOW', S.flow / 1.4, '#3fb8ff', Math.round(S.flow * 100) + '%');
    if (tau >= 1.6 && tau < AZ.E2) {
      c.font = '600 15px "IBM Plex Mono", monospace'; c.textAlign = 'center';
      c.fillStyle = Math.floor(t * 6) % 2 ? '#ff3b2f' : '#fff';
      c.fillText(S.rho >= 1 ? 'PROMPT CRITICAL  ρ ≥ β' : 'POWER EXCURSION', W / 2, 106);
    }

    // ---- upper structures: upper plate ("Elena") and rod drives ----
    const lidY = this.TOP - 40 + this.lid;
    c.save(); if (this.lid) { c.translate(W / 2, lidY + 20); c.rotate(this.lid * -0.004); c.translate(-W / 2, -lidY - 20); }
    c.fillStyle = '#3a3f44'; c.fillRect(this.L - 14, lidY, this.R - this.L + 28, 36);
    c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1;
    for (let x = this.L - 14; x < this.R + 14; x += 10) { c.beginPath(); c.moveTo(x, lidY); c.lineTo(x + 10, lidY + 36); c.stroke(); }
    this.txt(c, 'ВЕРХНЯЯ ПЛИТА «Е» · UPPER SHIELD 1000 t', W / 2, lidY + 22, '#c8ccd0', 9, 'center');
    c.restore();
    c.fillStyle = '#2a2e32'; c.fillRect(this.L - 14, this.BOT, this.R - this.L + 28, 30);
    this.txt(c, 'НИЖНЯЯ ПЛИТА · LOWER SHIELD   ↑ COOLANT IN', W / 2, this.BOT + 19, '#8a9096', 9, 'center');

    // ---- graphite stack ----
    const cg = Math.floor(heat * heat * 120);
    c.fillStyle = `rgb(${40 + cg},${42 + cg * 0.25},${44})`;
    c.fillRect(this.L, this.TOP, this.R - this.L, this.BOT - this.TOP);
    c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1;
    for (let y = this.TOP; y <= this.BOT; y += 17.5) { c.beginPath(); c.moveTo(this.L, y); c.lineTo(this.R, y); c.stroke(); }
    for (const col of this.cols) { c.beginPath(); c.moveTo(col.cx - 18, this.TOP); c.lineTo(col.cx - 18, this.BOT); c.stroke(); }

    // flux glow
    const fg = c.createLinearGradient(0, this.TOP, 0, this.BOT);
    for (let i = 0; i <= 10; i++) {
      const yn = i / 10, f = this.flux(yn);
      fg.addColorStop(yn, `rgba(255,${Math.round(150 - heat * 100)},40,${clamp(f * 0.08 * (0.4 + heat * 2), 0, 0.85)})`);
    }
    c.fillStyle = fg; c.fillRect(this.L, this.TOP, this.R - this.L, this.BOT - this.TOP);

    // ---- channels ----
    for (const col of this.cols) {
      const x = col.cx - 7;
      // coolant water (blue) with steam content
      const wv = clamp(S.void, 0, 1);
      c.fillStyle = `rgb(${Math.round(20 + wv * 120)},${Math.round(70 + wv * 110)},${Math.round(150 + wv * 70)})`;
      c.fillRect(x, this.TOP, 14, this.BOT - this.TOP);
      if (!col.rod) {
        c.fillStyle = `rgb(${Math.round(150 + heat * 105)},${Math.round(70 + heat * 170)},${Math.round(30 + heat * heat * 225)})`;
        c.fillRect(col.cx - 2, this.TOP + 4, 4, this.BOT - this.TOP - 8);
      }
    }
    // coolant tracers
    c.fillStyle = 'rgba(200,235,255,.35)';
    for (const tr of this.tracer) c.fillRect(tr.col.cx - 5 + (tr.col.i % 2) * 8, tr.y, 1.5, 6);
    // steam bubbles
    c.strokeStyle = 'rgba(240,250,255,.75)'; c.lineWidth = 1;
    for (const b of this.bub) { c.beginPath(); c.arc(b.x, b.y, Math.min(b.r, 6), 0, TAU); c.stroke(); }

    // ---- control rods: B4C absorber, 1.25 m water gap / telescope, 4.5 m graphite displacer ----
    for (const col of this.rods) {
      const d = this.rodDepth(col);
      const x = col.cx - 6, m = this.PXM;
      const abBot = this.TOP + d * m;
      const dTop = abBot + 1.25 * m, dBot = dTop + 4.5 * m;
      // absorber (only the part inside the core is visible)
      if (abBot > this.TOP) {
        c.fillStyle = '#121212'; c.fillRect(x, this.TOP, 12, abBot - this.TOP);
        c.strokeStyle = 'rgba(255,210,60,.5)'; c.lineWidth = 1;
        for (let y = this.TOP + 4; y < abBot - 2; y += 8) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 12, y + 6); c.stroke(); }
      }
      // telescope rod
      c.fillStyle = '#777'; c.fillRect(col.cx - 1, Math.max(this.TOP, abBot), 2, Math.max(0, dTop - Math.max(this.TOP, abBot)));
      // graphite displacer
      const dt0 = Math.max(this.TOP, dTop), dt1 = Math.min(this.BOT, dBot);
      if (dt1 > dt0) {
        c.fillStyle = '#a9adb0'; c.fillRect(x, dt0, 12, dt1 - dt0);
        c.fillStyle = 'rgba(0,0,0,.15)'; c.fillRect(x + 8, dt0, 4, dt1 - dt0);
      }
      // the 1.25 m of water below the displacer — the lower part of the core
      if (dBot < this.BOT) { c.fillStyle = 'rgba(40,120,255,.4)'; c.fillRect(x, dBot, 12, this.BOT - dBot); }
      else if (tau >= 0) {
        // water pushed out by graphite: local positive reactivity
        const gl = c.createRadialGradient(col.cx, this.BOT - 30, 2, col.cx, this.BOT - 30, 60);
        gl.addColorStop(0, `rgba(255,255,180,${0.5 + 0.3 * Math.sin(t * 30)})`); gl.addColorStop(1, 'rgba(255,200,80,0)');
        c.fillStyle = gl; c.fillRect(col.cx - 60, this.BOT - 100, 120, 100);
      }
      if (col.rodIdx === 2) this.txt(c, 'АР', col.cx, this.TOP - 46 + this.lid, '#ff7060', 9, 'center');
    }

    // ---- particles ----
    for (const q of this.xe) {
      c.fillStyle = 'rgba(176,108,255,.25)'; c.beginPath(); c.arc(q.x, q.y, 4.5, 0, TAU); c.fill();
      c.fillStyle = '#c38bff'; c.beginPath(); c.arc(q.x, q.y, 2.1, 0, TAU); c.fill();
    }
    for (const f of this.flash) {
      c.fillStyle = f.k === 'x' ? `rgba(220,150,255,${f.a})` : f.k === 'b' ? `rgba(80,80,80,${f.a * 0.6})` : `rgba(255,240,150,${f.a * 0.7})`;
      c.beginPath(); c.arc(f.x, f.y, f.k === 'x' ? 6 * (1.4 - f.a) : 2.4, 0, TAU); c.fill();
    }
    c.globalCompositeOperation = 'lighter';
    for (const p of this.n) {
      c.fillStyle = p.th ? 'rgba(110,230,255,.9)' : 'rgba(255,190,90,.95)';
      c.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
    }
    c.globalCompositeOperation = 'source-over';

    // ---- excursion heat-up / channel rupture ----
    if (tau >= 2.6) {
      const k = clamp((tau - 2.6) / 2, 0, 1);
      c.fillStyle = `rgba(255,${Math.round(220 - k * 120)},${Math.round(160 - k * 140)},${k * 0.6})`;
      c.fillRect(this.L, this.TOP, this.R - this.L, this.BOT - this.TOP);
    }
    if (S.e1) {
      c.strokeStyle = 'rgba(30,10,0,.8)'; c.lineWidth = 2;
      const rng = mulberry(9);
      for (let i = 0; i < 18; i++) {
        let x = this.L + rng() * (this.R - this.L), y = this.TOP + rng() * (this.BOT - this.TOP);
        c.beginPath(); c.moveTo(x, y);
        for (let j = 0; j < 5; j++) { x += (rng() - 0.5) * 50; y += (rng() - 0.5) * 50; c.lineTo(x, y); }
        c.stroke();
      }
      for (const d of this.debris) {
        c.save(); c.translate(d.x, d.y); c.rotate(d.r);
        c.fillStyle = d.hot ? '#ffb040' : '#666'; c.fillRect(-d.s / 2, -d.s / 4, d.s, d.s / 2); c.restore();
      }
    }
    if (S.e2) { const k = t - S.e2t; c.fillStyle = `rgba(255,255,255,${clamp(1 - k * 1.2, 0, 1)})`; c.fillRect(0, 0, W, H); }

    if (S.focus) this.focusFx(c, t); else this.callouts(c, tau);
    this.slowBadge(c, t);
    this.legend(c);
    // scanlines
    c.fillStyle = 'rgba(0,0,0,.07)'; for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
  },

  // highlighted region + short caption for the current step of the AZ-5 walkthrough
  focusFx(c, t) {
    const H = this.BOT - this.TOP, m = this.PXM, L = this.L, Wd = this.R - this.L;
    const rects = [], p = 0.5 + 0.5 * Math.sin(t * 5);
    let cap = '', cx = 300, cy = 0;
    switch (S.focus) {
      case 'state':
        rects.push([L, this.TOP + H * 0.36, Wd, H * 0.28]);
        cap = ['Xe-135 hollows out the middle:', 'flux peaks top & bottom']; cy = this.TOP + H * 0.36 - 12; break;
      case 'rods':
        for (const col of this.rods) rects.push([col.cx - 10, this.TOP - 4, 20, H + 8]);
        cap = ['B₄C absorber · water gap ·', 'graphite displacer · water']; cy = this.TOP + 30; break;
      case 'bottom':
        rects.push([L, this.BOT - 1.25 * m, Wd, 1.25 * m]);
        cap = ['bottom 1.25 m: water out, graphite in', '→ reactivity UP'];  cy = this.BOT - 1.25 * m - 12; break;
      case 'void':
        rects.push([L, this.TOP + H * 0.45, Wd, H * 0.55]);
        cap = ['boiling → reactivity → power → boiling', '(positive feedback)']; cy = this.TOP + H * 0.45 - 12; break;
      case 'prompt':
        rects.push([10, 10, 286, 34]);
        cap = ['ρ > β: prompt critical', 'power doubles in milliseconds']; cy = 190; break;
      case 'jam':
        for (const col of this.rods) rects.push([col.cx - 10, this.TOP - 4, 20, this.rodDepth(col) * m + 8]);
        cap = ['channels deform:', `rods stop ≈${S.azDepth.toFixed(1)} m in`]; cy = this.TOP + 3.0 * m; break;
      case 'lid':
        rects.push([L - 18, this.TOP - 44, Wd + 36, 44]);
        cap = ['steam pressure under the', '1,000-tonne upper shield']; cy = this.TOP + 70; break;
    }
    // dim everything outside the highlight
    c.save();
    c.beginPath(); c.rect(0, 0, this.W, this.H);
    for (const r of rects) c.rect(r[0] + r[2], r[1], -r[2], r[3]);
    c.fillStyle = 'rgba(0,0,0,.45)'; c.fill('evenodd');
    c.restore();
    c.strokeStyle = `rgba(255,230,90,${0.55 + 0.45 * p})`; c.lineWidth = 2.5;
    c.setLineDash([9, 5]); c.lineDashOffset = -t * 25;
    for (const r of rects) c.strokeRect(r[0], r[1], r[2], r[3]);
    c.setLineDash([]);
    c.font = '600 13px "IBM Plex Mono", monospace';
    const w = Math.max(...cap.map((s) => c.measureText(s).width)) + 16;
    const bx = clamp(cx - w / 2, 6, this.W - w - 6), by = cy - 40;
    c.fillStyle = 'rgba(10,10,6,.92)'; c.fillRect(bx, by, w, 40);
    c.strokeStyle = '#ffe65a'; c.lineWidth = 1.5; c.strokeRect(bx, by, w, 40);
    cap.forEach((s, i) => this.txt(c, s, bx + 8, by + 16 + i * 16, '#fff3a0', 13, 'left', 600));
  },

  slowBadge(c, t) {
    if (azTau() < 0 || S.e1 || S.timeScale >= 1) return;
    const txt = S.timeScale === 0 ? '❚❚ TIME FROZEN' : `SLOW MOTION ×${S.timeScale}`;
    c.font = '600 12px "IBM Plex Mono", monospace';
    const w = c.measureText(txt).width + 14;
    c.fillStyle = S.timeScale === 0 ? 'rgba(255,230,90,.95)' : `rgba(255,230,90,${0.6 + 0.3 * Math.sin(t * 6)})`;
    c.fillRect(this.W - w - 14, 92, w, 20);
    this.txt(c, txt, this.W - 21, 106, '#1a1406', 12, 'right', 600);
  },

  callouts(c, tau) {
    const notes = [];
    const m = S.mode;
    if (m === 'COLLAPSE' || (m === 'MANUAL' && S.P < 120))
      notes.push({ x: 300, y: 395, tx: 380, ty: 120 + 10, t: ['Xe-135 soaks up neutrons:', 'the chain reaction starves'], c: '#c38bff' });
    if (m === 'MANUAL' && S.P >= 120 || (m === 'AR' && S.ORM < 13))
      notes.push({ x: this.rods[0].cx, y: this.TOP + 10, tx: 120, ty: 128, t: ['Rods pulled out to fight the xenon:', 'less margin left to shut down'], c: '#ffd34a' });
    if (m === 'TEST')
      notes.push({ x: this.fuel[5].cx, y: 300, tx: 380, ty: 128, t: ['Flow ↓ → more boiling → reactivity ↑', '(positive void coefficient)'], c: '#e8f4ff' });
    if (tau >= 0.2 && tau < AZ.E1)
      notes.push({ x: this.rods[1].cx, y: this.BOT - 25, tx: 140, ty: 690 - 6, t: ['Graphite tips push water out of the', 'core bottom: AZ-5 first ADDS reactivity'], c: '#fff7a0' });
    for (const n of notes) {
      c.strokeStyle = n.c; c.lineWidth = 1; c.globalAlpha = 0.85;
      c.beginPath(); c.moveTo(n.x, n.y); c.lineTo(n.tx, n.ty); c.stroke();
      c.beginPath(); c.arc(n.x, n.y, 3, 0, TAU); c.fillStyle = n.c; c.fill();
      c.font = '600 11px "IBM Plex Mono", monospace';
      const w = Math.max(...n.t.map((s) => c.measureText(s).width)) + 12;
      const bx = clamp(n.tx - w / 2, 4, this.W - w - 4), by = n.ty - (n.ty > 400 ? 0 : 34);
      c.fillStyle = 'rgba(5,8,10,.85)'; c.fillRect(bx, by, w, 34);
      c.strokeRect(bx, by, w, 34);
      n.t.forEach((s, i) => this.txt(c, s, bx + 6, by + 14 + i * 14, n.c, 11, 'left', 600));
      c.globalAlpha = 1;
    }
  },

  legend(c) {
    const y = 690, items = [
      ['dot', 'rgba(255,190,90,1)', 'fast neutron'], ['dot', 'rgba(110,230,255,1)', 'thermal neutron'], ['xe', '#c38bff', 'Xe-135'],
      ['ring', '#e8f4ff', 'steam void'], ['rect', '#121212', 'B₄C absorber'], ['rect', '#a9adb0', 'graphite displacer'],
    ];
    if (azTau() >= 0.2 && azTau() < AZ.E1) return; // callout uses this space
    items.forEach(([k, col, label], i) => {
      const x = 22 + (i % 3) * 190, yy = y + Math.floor(i / 3) * 22;
      c.fillStyle = col; c.strokeStyle = col;
      if (k === 'dot') c.fillRect(x - 2, yy - 6, 4, 4);
      else if (k === 'xe') { c.beginPath(); c.arc(x, yy - 4, 3, 0, TAU); c.fill(); }
      else if (k === 'ring') { c.beginPath(); c.arc(x, yy - 4, 4, 0, TAU); c.stroke(); }
      else { c.fillRect(x - 5, yy - 10, 10, 12); c.strokeStyle = '#555'; c.strokeRect(x - 5, yy - 10, 10, 12); }
      this.txt(c, label, x + 12, yy, '#9aa3a8', 11);
    });
  },

  bar(c, x, y, ru, en, v, col, valTxt, zero) {
    this.txt(c, ru, x, y + 8, '#dfe5e8', 10, 'left', 600);
    this.txt(c, en, x + 150, y + 8, '#6f787d', 8);
    c.fillStyle = '#14191c'; c.fillRect(x, y + 13, 230, 12);
    c.fillStyle = col; c.fillRect(x, y + 13, 230 * clamp(v, 0, 1), 12);
    if (zero !== undefined) { c.fillStyle = '#fff'; c.fillRect(x + 230 * zero, y + 10, 1.5, 18); }
    this.txt(c, valTxt, x + 270, y + 23, col, 11, 'right', 600);
  },

  txt(c, s, x, y, col, size, align = 'left', w = 400) {
    c.font = `${w} ${size}px "IBM Plex Mono", monospace`; c.fillStyle = col; c.textAlign = align; c.fillText(s, x, y);
  },

  noSignal(c, k) {
    for (let i = 0; i < 1400; i++) {
      const v = Math.floor(rand(30, 140));
      c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(rand(this.W), rand(this.H), rand(2, 6), 2);
    }
    c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(110, 340, 380, 80);
    this.txt(c, 'НЕТ СИГНАЛА', 300, 374, '#ff3b2f', 22, 'center', 600);
    this.txt(c, 'NO SIGNAL · 01:23:4' + (5 + Math.min(4, Math.floor(k))), 300, 400, '#ccc', 12, 'center');
  },
};
