// ---------- small helpers ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const gauss = (x, m, s) => Math.exp(-((x - m) * (x - m)) / (2 * s * s));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

function fmtTime(t) {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600) % 24, m = Math.floor(t / 60) % 60, s = Math.floor(t % 60);
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}
const hms = (h, m, s = 0) => h * 3600 + m * 60 + s;

// Seeded RNG so the scenery is identical every run
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A canvas that draws in a fixed logical coordinate space, letterboxed to fit its panel.
class View {
  constructor(el, W, H, bg = '#000', fit = 'contain') {
    this.fit = fit;
    this.el = el; this.canvas = el.querySelector('canvas'); this.ctx = this.canvas.getContext('2d');
    this.W = W; this.H = H; this.bg = bg; this.scale = 1; this.ox = 0; this.oy = 0;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(el);
  }
  resize() {
    const r = this.el.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.scale = (this.fit === 'cover' ? Math.max : Math.min)(r.width / this.W, r.height / this.H);
    this.ox = (r.width - this.W * this.scale) / 2;
    this.oy = (r.height - this.H * this.scale) / 2;
  }
  begin(shakeX = 0, shakeY = 0) {
    const c = this.ctx, d = this.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = this.bg; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(d * this.scale, 0, 0, d * this.scale, d * (this.ox + shakeX * this.scale), d * (this.oy + shakeY * this.scale));
    return c;
  }
  toLogical(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left - this.ox) / this.scale, y: (clientY - r.top - this.oy) / this.scale };
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
