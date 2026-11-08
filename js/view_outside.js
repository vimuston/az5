// ---------- View 3: Unit 4 from outside, at night ----------
const OUT = {
  W: 600, H: 760, HOR: 580,
  RX: 420, RY: 318, // top of the Unit 4 reactor hall
  init() {
    const rng = mulberry(77);
    this.stars = []; for (let i = 0; i < 170; i++) this.stars.push({ x: rng() * 600, y: rng() * 470, b: 0.2 + rng() * 0.8, p: rng() * 10, s: 0.5 + rng() * 2.5 });
    this.trees = []; for (let x = -10; x < 620; x += 6) this.trees.push({ x, h: 14 + rng() * 22 + Math.sin(x * 0.05) * 6 });
    this.grass = []; for (let i = 0; i < 260; i++) this.grass.push({ x: rng() * 600, h: 8 + rng() * 26, p: rng() * 6, y: 700 + rng() * 60 });
    this.win = [];
    for (let i = 0; i < 52; i++) this.win.push({ x: 8 + i * 11.4, y: 510, on: rng() < 0.55, w: rng() < 0.15 });
    for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) this.win.push({ x: 345 + i * 15, y: 380 + j * 26, on: rng() < 0.3, w: false, small: true });
    for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) this.win.push({ x: 75 + i * 15, y: 390 + j * 26, on: rng() < 0.3, w: false, small: true });
    this.clouds = []; for (let i = 0; i < 6; i++) this.clouds.push({ x: rng() * 700 - 50, y: 60 + rng() * 260, w: 120 + rng() * 200, a: 0.04 + rng() * 0.05 });
    this.birds = []; this.nextFlock = 3;
    this.steam = [];
    this.fx = []; this.embers = []; this.fires = []; this.smoke = [];
    this.wind = 0.5; this.windT = 0;
  },

  spawnFlock(scared) {
    const n = scared ? 26 : 3 + Math.floor(rand(5));
    const fromLeft = Math.random() < 0.5;
    const y = scared ? 540 : rand(140, 360);
    const v = rand(40, 70) * (scared ? 2.5 : 1);
    for (let i = 0; i < n; i++) {
      this.birds.push({
        x: scared ? rand(0, 600) : fromLeft ? -20 - i * 16 - rand(10) : 620 + i * 16 + rand(10),
        y: y + (scared ? rand(-20, 20) : Math.abs(i - n / 2) * 7 + rand(-4, 4)),
        vx: scared ? rand(-140, 140) : fromLeft ? v : -v, vy: scared ? rand(-160, -70) : rand(-3, 3),
        ph: rand(TAU), fs: rand(9, 13) * (scared ? 1.6 : 1), s: rand(0.8, 1.2),
      });
    }
  },
  scare() { for (const b of this.birds) { b.vx *= 2.5; b.vy = rand(-160, -60); b.fs *= 1.8; } this.spawnFlock(true); },

  update(dt) {
    const t = S.realT;
    // wind: slow swell plus gusts
    this.windT += dt;
    const gust = Math.max(0, Math.sin(this.windT * 0.37) * Math.sin(this.windT * 0.11 + 1)) * 0.6;
    this.wind = 0.35 + 0.2 * Math.sin(this.windT * 0.13) + gust;
    AU.setWind(this.wind);
    // birds
    this.nextFlock -= dt;
    if (this.nextFlock <= 0 && !S.e1) { this.spawnFlock(false); this.nextFlock = rand(14, 28); }
    for (const b of this.birds) { b.x += b.vx * dt; b.y += b.vy * dt + Math.sin(t * 1.3 + b.ph) * 4 * dt; b.ph += dt * b.fs; }
    this.birds = this.birds.filter((b) => b.x > -400 && b.x < 1000 && b.y > -40);
    for (const c of this.clouds) { c.x += (4 + this.wind * 10) * dt; if (c.x > 680) c.x = -c.w - 40; }
    // vent steam from Unit 3 roof
    if (Math.random() < dt * 4) this.steam.push({ x: 150 + rand(-2, 2), y: 336, r: 2, a: 0.13 });
    for (const s of this.steam) { s.x += (6 + this.wind * 22) * dt; s.y -= 9 * dt; s.r += 2.6 * dt; s.a -= dt * 0.035; }
    this.steam = this.steam.filter((s) => s.a > 0);

    // explosion effects
    for (const p of this.fx) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.r += (p.vr || 0) * dt; p.a -= (p.fade || 0) * dt; p.rot = (p.rot || 0) + (p.spin || 0) * dt; }
    this.fx = this.fx.filter((p) => p.a > 0 && p.y < this.H + 50);
    for (const e of this.embers) {
      if (e.landed) continue;
      e.x += e.vx * dt; e.y += e.vy * dt; e.vy += 220 * dt;
      const roof = e.x > 0 && e.x < 600 && e.x < 330 ? (e.x > 60 && e.x < 230 ? 340 : 476) : (e.x > 330 && e.x < 510 ? 340 : 476);
      if (e.vy > 0 && e.y > roof) { e.landed = true; e.y = roof; if (this.fires.length < 40 && Math.random() < 0.55) this.fires.push({ x: e.x, y: roof, s: rand(0.6, 1.6), p: rand(10) }); }
    }
    for (const s of this.smoke) { s.x += (6 + this.wind * 18) * dt * (s.y < 300 ? 1.5 : 1); s.y += s.vy * dt; s.vy *= 1 - dt * 0.3; s.r += s.gr * dt; s.a -= dt * 0.012; }
    this.smoke = this.smoke.filter((s) => s.a > 0);
    if (S.e2) {
      // continuous smoke + glow from the open core
      if (Math.random() < dt * 14) this.smoke.push({ x: this.RX + rand(-30, 30), y: this.RY + 5, vy: rand(-60, -30), r: rand(12, 22), gr: rand(6, 12), a: 0.5 });
      for (const f of this.fires) if (Math.random() < dt * 1.5) this.smoke.push({ x: f.x, y: f.y - 6, vy: -20, r: 4, gr: 5, a: 0.25 });
    }
  },

  explode1() {
    S.shake = Math.max(S.shake, 1.2);
    const { RX, RY } = this;
    for (let i = 0; i < 46; i++) this.fx.push({ k: 'chunk', x: RX + rand(-50, 50), y: RY + rand(0, 10), vx: rand(-160, 160), vy: rand(-420, -160), g: 320, r: 0, a: 1, fade: 0.08, s: rand(4, 12), spin: rand(-6, 6) });
    for (let i = 0; i < 90; i++) this.fx.push({ k: 'spark', x: RX + rand(-30, 30), y: RY, vx: rand(-200, 200), vy: rand(-380, -60), g: 260, a: 1, fade: rand(0.3, 0.8) });
    for (let i = 0; i < 26; i++) this.fx.push({ k: 'steam', x: RX + rand(-40, 40), y: RY - rand(0, 30), vx: rand(-30, 30), vy: rand(-90, -30), r: rand(16, 30), vr: rand(16, 30), a: 0.6, fade: 0.09 });
    this.scare();
  },
  explode2() {
    S.shake = Math.max(S.shake, 2);
    const { RX, RY } = this;
    for (let i = 0; i < 30; i++) this.fx.push({ k: 'fire', x: RX + rand(-20, 20), y: RY - rand(0, 30), vx: rand(-70, 70), vy: rand(-230, -60), r: rand(20, 40), vr: rand(30, 60), a: 1, fade: 0.32 });
    for (let i = 0; i < 60; i++) this.fx.push({ k: 'chunk', x: RX + rand(-50, 50), y: RY, vx: rand(-260, 260), vy: rand(-560, -200), g: 320, r: 0, a: 1, fade: 0.06, s: rand(5, 16), spin: rand(-8, 8) });
    for (let i = 0; i < 160; i++) this.embers.push({ x: RX + rand(-30, 30), y: RY - rand(0, 20), vx: rand(-240, 240), vy: rand(-480, -120) });
    for (let i = 0; i < 30; i++) this.smoke.push({ x: RX + rand(-40, 40), y: RY - rand(0, 80), vy: rand(-120, -40), r: rand(20, 40), gr: rand(14, 26), a: 0.7 });
    this.win.forEach((w) => (w.on = w.on && Math.random() < 0.15));
  },

  draw(view, dt) {
    this.update(dt);
    const sh = S.shake;
    const c = view.begin(rand(-sh, sh) * 5, rand(-sh, sh) * 5);
    const W = this.W, H = this.H, t = S.realT, HOR = this.HOR;
    const e2k = S.e2 ? S.realT - S.e2t : -1, e1k = S.e1 ? S.realT - S.e1t : -1;

    // sky
    let g = c.createLinearGradient(0, 0, 0, HOR);
    g.addColorStop(0, '#02040b'); g.addColorStop(0.6, '#0a1226'); g.addColorStop(1, '#1b2338');
    c.fillStyle = g; c.fillRect(0, 0, W, HOR);
    for (const s of this.stars) {
      c.globalAlpha = s.b * (0.6 + 0.4 * Math.sin(t * s.s + s.p));
      c.fillStyle = '#e8eeff'; c.fillRect(s.x, s.y, 1.3, 1.3);
    }
    c.globalAlpha = 1;
    // moon (waning crescent, low in the east)
    c.fillStyle = 'rgba(230,226,200,.9)'; c.beginPath(); c.arc(92, 112, 16, 0, TAU); c.fill();
    c.fillStyle = '#04070f'; c.beginPath(); c.arc(84, 108, 15, 0, TAU); c.fill();
    for (const cl of this.clouds) {
      c.fillStyle = `rgba(140,150,180,${cl.a})`;
      c.beginPath(); c.ellipse(cl.x + cl.w / 2, cl.y, cl.w / 2, 12, 0, 0, TAU); c.fill();
    }

    // glow from the burning core lights up the sky
    if (S.e1) {
      const k = S.e2 ? 1 : 0.4;
      const rg = c.createRadialGradient(this.RX, this.RY, 10, this.RX, this.RY, 420);
      rg.addColorStop(0, `rgba(255,120,40,${0.35 * k})`); rg.addColorStop(1, 'rgba(255,80,20,0)');
      c.fillStyle = rg; c.fillRect(0, 0, W, H);
    }

    // distant tree line
    c.fillStyle = '#05080a';
    c.beginPath(); c.moveTo(-10, HOR);
    for (const tr of this.trees) c.lineTo(tr.x, HOR - tr.h);
    c.lineTo(620, HOR); c.fill();

    // ---- ventilation stack (between Units 3 and 4) ----
    const sx = 268;
    c.strokeStyle = '#2b3240'; c.lineWidth = 1.2;
    for (let y = 130; y < 380; y += 22) { // lattice
      c.beginPath(); c.moveTo(sx - 26 + (y - 130) * 0.04, y); c.lineTo(sx + 26 - (y - 108) * 0.04, y + 22); c.moveTo(sx + 26 - (y - 130) * 0.04, y); c.lineTo(sx - 26 + (y - 108) * 0.04, y + 22); c.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const y0 = 110 + i * 27, w0 = 9 + i * 0.9;
      c.fillStyle = i % 2 ? '#3a3e4a' : '#4b1d22';
      c.fillRect(sx - w0, y0, w0 * 2, 27);
    }
    c.fillStyle = '#1a1f28'; c.fillRect(sx - 30, 180, 60, 3); c.fillRect(sx - 30, 260, 60, 3); c.fillRect(sx - 30, 330, 60, 3);
    if (Math.sin(t * 3) > 0 && !(S.e2 && e2k > 0.3)) {
      [[sx, 108], [sx - 30, 180], [sx + 30, 180], [sx - 30, 260], [sx + 30, 260]].forEach(([x, y]) => {
        const rg = c.createRadialGradient(x, y, 0, x, y, 10); rg.addColorStop(0, 'rgba(255,40,30,.95)'); rg.addColorStop(1, 'rgba(255,40,30,0)');
        c.fillStyle = rg; c.fillRect(x - 10, y - 10, 20, 20);
      });
    }

    // ---- buildings ----
    // Unit 3 reactor block
    this.block(c, 60, 340, 170, 160, '#121722');
    // auxiliary block under the stack
    this.block(c, 228, 382, 104, 120, '#10141d');
    // Unit 4 reactor block (roof replaced by a ragged hole after the blast)
    this.block(c, 330, 330, 180, 170, '#131823');
    if (!S.e1) { c.fillStyle = '#171d2a'; c.fillRect(350, this.RY, 140, 14); }
    else {
      c.fillStyle = '#05070b'; c.beginPath(); c.moveTo(340, 345);
      const rng = mulberry(3);
      for (let x = 340; x <= 500; x += 10) c.lineTo(x, 334 + rng() * (S.e2 ? 70 : 25));
      c.lineTo(500, 345); c.fill();
    }
    // deaerator stack + turbine hall
    c.fillStyle = '#0e121a'; c.fillRect(0, 476, W, 110);
    c.fillStyle = '#161c27'; c.fillRect(0, 472, W, 6);
    for (const w of this.win) {
      if (!w.on) continue;
      const fl = S.e1 && !S.e2 && Math.random() < 0.3;
      if (fl) continue;
      c.fillStyle = w.w ? 'rgba(200,220,255,.75)' : 'rgba(255,214,140,.75)';
      if (w.small) c.fillRect(w.x, w.y, 6, 9); else c.fillRect(w.x, w.y, 7, 16);
    }
    // floodlights on the roof
    if (!(S.e2 && e2k > 0.3)) [[30, 470], [200, 470], [560, 470]].forEach(([x, y]) => {
      const rg = c.createRadialGradient(x, y, 0, x, y, 26); rg.addColorStop(0, 'rgba(255,230,170,.55)'); rg.addColorStop(1, 'rgba(255,230,170,0)');
      c.fillStyle = rg; c.fillRect(x - 26, y - 26, 52, 52);
    });

    // power-line pylon
    c.strokeStyle = '#1b222c'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(540, HOR); c.lineTo(560, 400); c.lineTo(580, HOR); c.moveTo(545, 440); c.lineTo(575, 440); c.moveTo(535, 410); c.lineTo(585, 410); c.stroke();
    c.beginPath(); for (const yy of [410, 440]) { c.moveTo(535, yy); c.quadraticCurveTo(420, yy + 40 + this.wind * 3, 300, yy + 20); } c.stroke();

    // unit 3 vent steam
    for (const s of this.steam) { c.fillStyle = `rgba(200,205,215,${s.a})`; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill(); }

    // ground + grass in the wind
    g = c.createLinearGradient(0, HOR, 0, H); g.addColorStop(0, '#07090a'); g.addColorStop(1, '#030404');
    c.fillStyle = g; c.fillRect(0, HOR, W, H - HOR);
    c.strokeStyle = S.e2 ? '#2a160c' : '#0f1612'; c.lineWidth = 1.4;
    c.beginPath();
    for (const gr of this.grass) {
      const bend = (this.wind * 10 + Math.sin(t * 2.2 + gr.p + gr.x * 0.02) * 3) * (gr.h / 30);
      c.moveTo(gr.x, gr.y); c.quadraticCurveTo(gr.x + bend * 0.3, gr.y - gr.h * 0.6, gr.x + bend, gr.y - gr.h);
    }
    c.stroke();

    // birds
    c.strokeStyle = S.e1 ? '#000' : '#0b0f16'; c.lineWidth = 1.6;
    for (const b of this.birds) {
      const f = Math.sin(b.ph) * 4 * b.s, s = 6 * b.s;
      c.beginPath(); c.moveTo(b.x - s, b.y - f); c.lineTo(b.x, b.y); c.lineTo(b.x + s, b.y - f); c.stroke();
    }

    // ---- explosion layers ----
    for (const s of this.smoke) { c.fillStyle = `rgba(40,34,34,${Math.max(0, s.a)})`; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill(); }
    if (S.e2) {
      // blue ionised-air glow rising out of the destroyed reactor (drawn additively over the smoke)
      c.globalCompositeOperation = 'lighter';
      const k = clamp(e2k / 2.5, 0, 1);
      for (let i = 0; i < 3; i++) {
        const w = 26 + i * 18 + Math.sin(t * 2 + i) * 4;
        const bg = c.createLinearGradient(0, this.RY, 0, -50);
        bg.addColorStop(0, `rgba(110,160,255,${0.45 * k / (i + 1)})`); bg.addColorStop(1, 'rgba(120,170,255,0)');
        c.fillStyle = bg;
        c.beginPath(); c.moveTo(this.RX - w / 2, this.RY + 10); c.lineTo(this.RX - w * 0.9 + Math.sin(t * 0.7) * 10, -50); c.lineTo(this.RX + w * 0.9 + Math.sin(t * 0.7) * 10, -50); c.lineTo(this.RX + w / 2, this.RY + 10); c.fill();
      }
      // fire in the open core
      for (let i = 0; i < 6; i++) {
        const fx = this.RX + Math.sin(t * 7 + i * 2) * 50, fy = this.RY + 14;
        const rg = c.createRadialGradient(fx, fy, 1, fx, fy, 30 + Math.sin(t * 13 + i) * 8);
        rg.addColorStop(0, 'rgba(255,220,120,.7)'); rg.addColorStop(1, 'rgba(255,90,20,0)');
        c.fillStyle = rg; c.fillRect(fx - 40, fy - 40, 80, 80);
      }
      c.globalCompositeOperation = 'source-over';
    }
    for (const f of this.fires) {
      const h = (8 + Math.sin(t * 15 + f.p) * 3) * f.s;
      c.fillStyle = 'rgba(255,140,40,.9)';
      c.beginPath(); c.moveTo(f.x - 4 * f.s, f.y); c.quadraticCurveTo(f.x, f.y - h * 2, f.x + 4 * f.s, f.y); c.fill();
      const rg = c.createRadialGradient(f.x, f.y - 4, 0, f.x, f.y - 4, 18 * f.s); rg.addColorStop(0, 'rgba(255,120,40,.3)'); rg.addColorStop(1, 'rgba(255,120,40,0)');
      c.fillStyle = rg; c.fillRect(f.x - 20 * f.s, f.y - 24 * f.s, 40 * f.s, 40 * f.s);
    }
    for (const p of this.fx) {
      c.globalAlpha = clamp(p.a, 0, 1);
      if (p.k === 'chunk') { c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = '#1d1a18'; c.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); c.strokeStyle = '#ff8a30'; c.lineWidth = 1; c.strokeRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); c.restore(); }
      else if (p.k === 'spark') { c.fillStyle = '#ffd070'; c.fillRect(p.x, p.y, 2, 2); }
      else if (p.k === 'steam') { c.fillStyle = 'rgba(210,205,200,.5)'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
      else if (p.k === 'fire') {
        const rg = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        rg.addColorStop(0, 'rgba(255,240,180,1)'); rg.addColorStop(0.4, 'rgba(255,140,40,.8)'); rg.addColorStop(1, 'rgba(120,30,10,0)');
        c.fillStyle = rg; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill();
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = '#ffb048';
    for (const e of this.embers) { c.fillRect(e.x, e.y, 2.4, 2.4); }

    // flashes
    if (e1k >= 0 && e1k < 1.4) { c.fillStyle = `rgba(255,170,90,${0.7 * (1 - e1k / 1.4)})`; c.fillRect(0, 0, W, H); }
    if (e2k >= 0 && e2k < 2.2) {
      c.fillStyle = `rgba(255,240,220,${0.95 * (1 - e2k / 2.2)})`; c.fillRect(0, 0, W, H);
      // shock ring
      c.strokeStyle = `rgba(255,255,255,${0.5 * (1 - e2k / 2.2)})`; c.lineWidth = 3;
      c.beginPath(); c.arc(this.RX, this.RY, e2k * 520, 0, TAU); c.stroke();
    }
    if (S.focus) { c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(-600, -600, this.W + 1200, this.H + 1200); }
    // subtle film grain / vignette
    const vg = c.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 520);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);
  },

  block(c, x, y, w, h, col) {
    c.fillStyle = col; c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(255,255,255,.035)'; c.lineWidth = 1;
    for (let xx = x + 10; xx < x + w; xx += 12) { c.beginPath(); c.moveTo(xx, y + 4); c.lineTo(xx, y + h); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(x, y, w, 2);
  },
};
