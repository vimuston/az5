// ---------- reactor model (stylised, tuned to reproduce the documented trajectory) ----------
// Power follows an "equilibrium" set by rod withdrawal W versus the reactivity the core needs (xenon, flow, feedwater):
//   P_eq = 30 MW * exp(S_COEF * (W + ar - need))
// so ~9 rod-equivalents of withdrawal hold 200 MW. ORM (operational reactivity margin) = ORM0 - W - ar.
const S_COEF = Math.log(200 / 30) / 9;
const K200 = Math.log(200 / 30) / S_COEF; // = 9

const AZ = { // seconds after AZ-5 is pressed
  E1: 4.6,   // first (steam) explosion
  E2: 7.4,   // second explosion
  JAM: 3.5,  // rods stop ~2 m in
  // log10(P) keyframes after AZ-5: [time, MWt]
  curve: [[0, 230], [0.8, 245], [1.6, 380], [2.4, 530], [3.0, 1500], [3.6, 6000], [4.1, 30000], [4.6, 320000], [6, 200000], [7.4, 400000]],
};

const S = {};
function resetSim() {
  Object.assign(S, {
    t: 0, timeScale: 0,
    mode: 'LAR', P: 760, setpoint: 760, Peq: 760,
    W: 0, ar: 0, need: 0, needRate: 0, arCap: 2.4, arSat: false,
    ORM0: 21, ORM: 21,
    xenon: 0.62, pumps: 6, flow: 1, void: 0.12, rho: 0, pressure: 68,
    holdW: false, holdI: false, rodRate: 1.1,
    tripsBlocked: false, eccsOff: true, test: false, osc: false,
    testStart: 0, azT: -1, azDepth: 0, coverOpen: false, clutch: false,
    e1: false, e2: false, e1t: 0, e2t: 0, shake: 0, lights: 1,
    target: null, focus: null, printout: null, ended: false, realT: 0,
    hist: [],
  });
}
resetSim();

function azTau() { return S.azT < 0 ? -1 : S.t - S.azT; }

function azPower(tau) {
  const c = AZ.curve;
  if (tau <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (tau <= c[i][0]) {
      const k = (tau - c[i - 1][0]) / (c[i][0] - c[i - 1][0]);
      return Math.pow(10, lerp(Math.log10(c[i - 1][1]), Math.log10(c[i][1]), k));
    }
  }
  return c[c.length - 1][1] * (1 + 0.3 * Math.sin(tau * 13));
}

function simUpdate(dt) {
  S.realT += dt;
  const g = dt * S.timeScale;
  S.t += g;
  S.shake = Math.max(0, S.shake - dt * 6);

  // Xenon-135 keeps building after the long hold at half power and the drop to low power.
  if (S.mode !== 'AZ5') {
    const xeTarget = S.mode === 'LAR' ? 0.8 : 0.95;
    S.xenon += (xeTarget - S.xenon) * (1 - Math.exp(-g / 2400));
  }

  switch (S.mode) {
    case 'LAR':
      S.P += (S.setpoint - S.P) * (1 - Math.exp(-g / 70));
      S.rho = clamp((S.setpoint - S.P) / 2000, -0.2, 0.2);
      S.ORM = S.ORM0;
      break;
    case 'COLLAPSE':
      S.P += (28 - S.P) * (1 - Math.exp(-g / 45));
      S.rho = -0.35;
      break;
    case 'MANUAL':
    case 'AR': {
      if (S.holdW) S.W += dt * S.rodRate;
      if (S.holdI) S.W -= dt * S.rodRate;
      S.W = clamp(S.W, -2, 19);
      S.need += g * S.needRate;
      if (S.mode === 'AR') {
        const want = S.need + K200 - S.W;
        S.arSat = Math.abs(want) > S.arCap + 0.05;
        const tgt = clamp(want, -S.arCap, S.arCap);
        S.ar += (tgt - S.ar) * (1 - Math.exp(-g / 15));
      } else S.arSat = false;
      const x = S.W + S.ar - S.need;
      S.Peq = clamp(30 * Math.exp(S_COEF * x), 8, 2600);
      const tau = 24;
      S.P += (S.Peq - S.P) * (1 - Math.exp(-g / tau));
      S.rho = clamp(Math.log(S.Peq / Math.max(1, S.P)) * 0.12, -0.5, 0.5);
      S.ORM = S.ORM0 - S.W - S.ar;
      break;
    }
    case 'TEST': {
      // turbine rundown: 4 of the 8 pumps are fed by the coasting turbine; flow drops, boiling rises,
      // and the positive void coefficient pushes power slowly upwards.
      const k = S.t - S.testStart;
      S.flow = (4 + 4 * Math.exp(-k / 30)) / 6;
      S.P = 200 + 30 * Math.pow(clamp(k / 36, 0, 1.1), 1.6) + Math.sin(S.realT * 3) * 1.5;
      S.rho = 0.02 + 0.1 * clamp(k / 36, 0, 1);
      S.pressure = 65 - k * 0.04;
      break;
    }
    case 'AZ5': {
      const tau = azTau();
      S.P = azPower(tau);
      const tj = clamp(tau, 0, AZ.JAM); // rods drive in until the channels deform and grip them
      S.azDepth = Math.min(7, 0.45 * tj + 0.06 * tj * tj);
      // rho in dollars: the graphite displacers enter first and add reactivity, then void takes over
      S.rho = tau < 1 ? 0.05 + tau * 0.35 : tau < 2.5 ? 0.4 + (tau - 1) * 0.45 : Math.min(5, 1.07 + (tau - 2.5) * 1.6);
      S.flow = Math.max(0.05, ((4 + 4 * Math.exp(-(S.azT - S.testStart + tau) / 30)) / 6) * (tau > 3.2 ? Math.exp(-(tau - 3.2) * 2) : 1));
      S.pressure = 64 + Math.max(0, tau - 2.6) * 18;
      break;
    }
  }

  // void fraction: more power and less flow -> more steam
  if (S.mode !== 'AZ5') {
    const base = 0.04 + 0.32 * clamp(S.P / 3200, 0, 1) + 0.18 * clamp(1.15 - S.flow, 0, 1);
    S.void = clamp(base + (S.mode === 'TEST' ? 0.25 * clamp((S.t - S.testStart) / 36, 0, 1) : 0), 0.02, 0.9);
  } else {
    S.void = clamp(0.32 + Math.max(0, Math.log10(S.P / 230)) * 0.25, 0, 1);
  }

  // history for the strip chart, sampled in real time
  S._hs = (S._hs || 0) + dt;
  if (S._hs > 0.2) { S._hs = 0; S.hist.push(S.P); if (S.hist.length > 240) S.hist.shift(); }
}
