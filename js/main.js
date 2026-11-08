// ---------- game loop, input, dialogue and the scripted night of 25–26 April 1986 ----------
const $ = (id) => document.getElementById(id);
const VOICES = {
  akimov: { name: 'Aleksandr Akimov', role: 'shift foreman', col: '#7fd3ff', f0: 116, rate: 1.05, vol: 0.5 },
  dyatlov: { name: 'Anatoly Dyatlov', role: 'deputy chief engineer', col: '#ff7a5c', f0: 90, formant: 0.9, rate: 1.12, buzz: 0.5, vol: 0.55 },
  toptunov: { name: 'Leonid Toptunov', role: 'you · senior reactor control engineer', col: '#ffd34a', f0: 140, formant: 1.08, rate: 1.12, vol: 0.45 },
  stolyarchuk: { name: 'Boris Stolyarchuk', role: 'senior unit control engineer', col: '#9eff7a', f0: 126, formant: 1.03, vol: 0.45 },
  kirshenbaum: { name: 'Igor Kirshenbaum', role: 'senior turbine control engineer', col: '#c9a6ff', f0: 106, vol: 0.45 },
  metlenko: { name: 'Gennady Metlenko', role: 'Dontekhenergo test engineer', col: '#ffa6d6', f0: 100, radio: true, vol: 0.5 },
  thought: { name: 'Toptunov (thinking)', col: '#a8a08a' },
};

let vCR, vRX, vOUT, lastTs = 0, waiters = [], btnWaiters = [], started = false;

// ---------- promises the script awaits ----------
const waitUntil = (fn) => new Promise((r) => waiters.push({ fn, r }));
const sleep = (sec) => { const t = S.realT + sec; return waitUntil(() => S.realT >= t); };
const waitBtn = (id) => new Promise((r) => btnWaiters.push({ id, r }));
const untilTau = (x) => waitUntil(() => azTau() >= x);
function checkWaiters() {
  const keep = [];
  for (const w of waiters) { if (w.fn()) w.r(); else keep.push(w); }
  waiters = keep;
}
function fireBtn(id) {
  const hit = btnWaiters.filter((w) => w.id === id);
  btnWaiters = btnWaiters.filter((w) => w.id !== id);
  hit.forEach((w) => w.r());
}

// ---------- dialogue ----------
let speech = null, sayDone = null, typing = null, speaking = false;
function say(who, text, { hold = 0.8 } = {}) {
  return new Promise((resolve) => {
    if (sayDone) sayDone(true);
    const v = VOICES[who];
    $('who').innerHTML = `${v.name}<span style="color:#6b756c;text-transform:none;font-family:'IBM Plex Mono';font-size:11px;letter-spacing:0"> · ${v.role || ''}</span>`;
    $('who').style.color = v.col;
    $('text').style.fontStyle = who === 'thought' ? 'italic' : 'normal';
    if (speech) speech.stop();
    speech = who === 'thought' ? { dur: text.length * 0.04, stop() {} } : AU.speak(text, v);
    const dur = Math.max(0.6, speech.dur);
    const t0 = performance.now();
    speaking = true;
    clearInterval(typing);
    typing = setInterval(() => {
      const k = clamp((performance.now() - t0) / 1000 / dur, 0, 1);
      const n = Math.floor(text.length * k);
      $('text').innerHTML = escapeHtml(text.slice(0, n)) + (k < 1 ? '<span class="caret">&nbsp;</span>' : '');
      if (k >= 1) { clearInterval(typing); speaking = false; }
    }, 30);
    let finished = false;
    const done = (skipped) => {
      if (finished) return; finished = true;
      clearInterval(typing); speaking = false;
      $('text').textContent = text;
      if (skipped && speech) speech.stop();
      sayDone = null; resolve();
    };
    sayDone = done;
    setTimeout(() => done(false), (dur + hold) * 1000);
  });
}
const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function choice(opts) {
  return new Promise((resolve) => {
    const box = $('choices'); box.innerHTML = '';
    opts.forEach((o, i) => {
      const b = document.createElement('button'); b.textContent = `${i + 1}. ${o}`;
      b.onclick = (e) => { e.stopPropagation(); box.innerHTML = ''; AU.press(); resolve(i); };
      box.appendChild(b);
    });
    setObj('Choose a response.');
  });
}
function setObj(txt) { $('objText').textContent = txt || '—'; $('objective').classList.toggle('active', !!txt && txt !== '—'); }

function card(html, btn = 'CONTINUE') {
  return new Promise((resolve) => {
    const ov = $('overlay');
    ov.innerHTML = `<div class="card">${html}<button id="cardBtn">${btn}</button></div>`;
    ov.classList.add('show'); ov.classList.remove('fade'); void ov.offsetWidth; ov.classList.add('fade');
    $('cardBtn').onclick = () => { AU.press(); ov.classList.remove('show'); resolve(); };
  });
}

// ---------- controls ----------
let lastNotNow = 0;
function notNow() {
  AU.denied();
  if (speaking || S.realT - lastNotNow < 6 || S.azT >= 0) return;
  lastNotNow = S.realT;
  const lines = ['Not that one, Lenya.', 'Wait for my order.', 'Hands off. Not yet.'];
  say('akimov', lines[Math.floor(rand(lines.length))], { hold: 0.3 });
}
function pressDown(id) {
  CR.pressedAt[id] = S.realT;
  if (id === 'withdraw' || id === 'insert') {
    if (S.mode === 'MANUAL' || S.mode === 'AR') {
      AU.press(); if (id === 'withdraw') S.holdW = true; else S.holdI = true; AU.rodMotor(true);
    } else notNow();
    return;
  }
  if (id === 'az5') {
    if (S.azT >= 0) { AU.press(); return; }
    if (S.target !== 'az5') { notNow(); return; }
    if (!S.coverOpen) { S.coverOpen = true; AU.clunk(); return; }
    AU.press(); AU.clunk(); fireBtn('az5'); return;
  }
  if (id === S.target) { AU.press(); fireBtn(id); }
  else notNow();
}
function releaseHold() {
  if (S.holdW || S.holdI) AU.rodMotor(false);
  S.holdW = false; S.holdI = false;
}
function setupInput() {
  const cv = vCR.canvas;
  cv.addEventListener('pointerdown', (e) => {
    if (!started) return;
    const p = vCR.toLogical(e.clientX, e.clientY);
    const b = CR.hit(p.x, p.y);
    if (b) { cv.setPointerCapture(e.pointerId); pressDown(b.id); }
  });
  window.addEventListener('pointerup', releaseHold);
  window.addEventListener('pointercancel', releaseHold);
  window.addEventListener('blur', releaseHold);
  window.addEventListener('keydown', (e) => {
    if (e.repeat || !started) return;
    if (e.key === 'ArrowUp' || e.key === 'w') pressDown('withdraw');
    else if (e.key === 'ArrowDown' || e.key === 's') pressDown('insert');
    else if ((e.key === ' ' || e.key === 'Enter') && $('choices').querySelectorAll('button').length === 1) { e.preventDefault(); $('choices').querySelector('button').click(); }
    else if ((e.key === ' ' || e.key === 'Enter') && S.target && !['withdraw', 'insert'].includes(S.target)) { e.preventDefault(); pressDown(S.target); }
    else if (e.key === 'm' || e.key === 'M') toggleMute();
    else if (/^[1-3]$/.test(e.key)) { const b = $('choices').querySelectorAll('button')[+e.key - 1]; if (b) b.click(); }
  });
  window.addEventListener('keyup', (e) => { if (['ArrowUp', 'ArrowDown', 'w', 's'].includes(e.key)) releaseHold(); });
  $('dlgMain').addEventListener('click', () => { if (sayDone && S.azT < 0) sayDone(true); });
  $('muteBtn').addEventListener('click', toggleMute);
}
function toggleMute() { AU.setMuted(!AU.muted); $('muteBtn').textContent = AU.muted ? 'SOUND OFF' : 'SOUND ON'; }

// ---------- main loop ----------
function frame(ts) {
  const dt = clamp((ts - lastTs) / 1000 || 0.016, 0, 0.05);
  lastTs = ts;
  simUpdate(dt);
  azEvents();
  checkWaiters();
  CR.draw(vCR, dt); RX.draw(vRX, dt); OUT.draw(vOUT, dt);
  audioUpdate(dt);
  $('time').textContent = fmtTime(S.t);
  $('ts').textContent = S.timeScale > 1.5 ? `▶▶ ×${Math.round(S.timeScale)}` : S.azT >= 0 && !S.e1 && S.timeScale === 0 ? '❚❚ TIME FROZEN' : S.azT >= 0 && S.timeScale < 1 ? `SLOW ×${S.timeScale}` : '';
  requestAnimationFrame(frame);
}

function azEvents() {
  const tau = azTau();
  if (tau < 0) return;
  if (!S.e1 && tau >= AZ.E1) {
    S.e1 = true; S.e1t = S.realT; S.shake = 1.4;
    OUT.explode1(); AU.boom(false); AU.cricketsOn = false;
  }
  if (!S.e2 && tau >= AZ.E2) {
    S.e2 = true; S.e2t = S.realT; S.shake = 2.2; S.target = null;
    OUT.explode2(); AU.boom(true); AU.lightsOut(); AU.allAlarmsOff(); AU.turbineStop(); AU.rodMotor(false);
    if (speech) speech.stop();
    setObj('—');
  }
}

function audioUpdate() {
  if (!AU.ok) return;
  const tau = azTau();
  let rate = 1.2 + 3.6 * Math.pow(Math.max(S.P, 1) / 30, 0.78);
  if (S.e2) { const k = S.realT - S.e2t; rate = k < 6 ? 1400 : Math.max(4, 1400 * Math.exp(-(k - 6) * 0.9)); }
  if (!started) rate = 0;
  if (S.ended) rate = 3;
  AU.setGeiger(rate);
  if (tau >= 0) AU.rumble(S.e2 ? Math.max(0, 0.8 - (S.realT - S.e2t) * 0.1) : clamp((tau - 1.5) / 3, 0, 1) * 0.8);
}

// ---------- the AZ-5 walkthrough ----------
const SLOWMO = 0.2;
const AZ_STEPS = [
  { tau: 0, focus: 'state', title: 'The core at the moment of AZ-5',
    text: 'The reactivity margin is down to about <b>8 rods</b>, against a minimum of 15. Xenon has hollowed out the middle of the core, so the neutron flux sits in two humps, at the top and the bottom. Coolant flow is falling as the turbine coasts down, and the water is close to boiling. In an RBMK, steam absorbs fewer neutrons than water, so <b>more boiling means more reactivity</b>. That is the positive void coefficient.' },
  { tau: 0.5, focus: 'rods', line: ['toptunov', 'Rods are going in…'], title: 'The rods start to move',
    text: 'All 211 rods drive down from the top at about <b>0.4 m/s</b>, so full insertion takes 18 to 20 seconds. Each rod is built in sections. The <b>boron carbide absorber</b> is on top. Below it is a <b>4.5 m graphite displacer</b>, and under that, 1.25 m of water at the bottom of the channel.' },
  { tau: 1.2, focus: 'bottom', title: 'The positive scram',
    text: 'The absorbers are still near the top, but the <b>graphite tips</b> are already moving down into the bottom of the core and pushing out the water there. Water absorbs neutrons; graphite only slows them down. So for the first few seconds, AZ-5 <b>adds</b> reactivity at the bottom of the core, exactly where the flux was already peaking.' },
  { tau: 2.0, focus: 'void', title: 'Runaway feedback',
    text: 'Power at the bottom jumps, and the water there flashes to steam. More steam means more reactivity, which means more power, which means more steam. The loop has no brake. The absorbers that could stop it are still metres away, travelling at walking pace.' },
  { tau: 2.8, focus: 'prompt', line: ['toptunov', 'Power surge! Five hundred! A thousand!'], title: 'Prompt critical',
    text: 'Reactivity passes <b>β</b>, about 0.5%. Until now the chain reaction depended on <b>delayed neutrons</b>, emitted seconds after fission, and that kept it slow enough to control. Past β, prompt neutrons alone sustain it. Power doubles in milliseconds, not seconds, and no operator or mechanism can react in time.' },
  { tau: 3.6, focus: 'jam', line: ['akimov', 'The rods have stopped! Cut the servo clutches!'], title: 'Fuel shatters, rods jam',
    text: 'Fuel overheats and breaks apart, and pressure tubes rupture. The deformed channels grip the rods about <b>2 to 2.5 m</b> in, and the indicators on the panel stop. De-energising the servo clutches so the rods fall freely changes nothing now. Steam pours into the reactor cavity, which was never designed to contain it.' },
  { tau: 4.0, focus: 'lid', title: 'What comes next',
    text: 'The steam has nowhere to go. It lifts the <b>1,000-tonne upper shield</b>, tearing every channel and rod drive with it. Seconds later a second explosion, whose exact nature is still debated, destroys the reactor and throws burning graphite and fuel across the site.', last: true },
];
function explain(st, i, n) {
  return new Promise((resolve) => {
    if (sayDone) sayDone(true);
    AU.beep(660, 0.12, 0.04, 'sine'); AU.beep(990, 0.18, 0.03, 'sine', null, 0.1);
    $('who').innerHTML = `${i + 1}/${n} · t + ${st.tau.toFixed(1)} s <span style="color:#d9e0d2;text-transform:none;font-family:'IBM Plex Mono';font-size:13px;letter-spacing:0"> · ${st.title}</span>`;
    $('who').style.color = '#fff7a0';
    $('text').style.fontStyle = 'normal';
    $('text').innerHTML = st.text;
    const box = $('choices'); box.innerHTML = '';
    const b = document.createElement('button');
    b.textContent = st.last ? '▶ RESUME TIME' : 'CONTINUE ▶';
    b.onclick = (e) => { e.stopPropagation(); box.innerHTML = ''; AU.press(); resolve(); };
    box.appendChild(b);
    setObj(st.focus === 'jam' && !S.clutch ? 'De-energise the servo clutches, or continue.' : 'Time is frozen. Read, then continue (Space).');
  });
}

// ---------- the night ----------
async function story() {
  await card(`<div class="stamp">25 APRIL 1986 · 01:06</div><h3>A routine test</h3>
    <p>Unit 4 begins lowering power ahead of a scheduled maintenance shutdown. Before it stops, the plant will run a safety test. If the grid fails, can the coasting turbine generate enough electricity to keep the cooling pumps running for the minute or so until the diesel generators take over?</p>`);
  await card(`<div class="stamp">25 APRIL · 13:05 – 23:10</div><h3>The delay</h3>
    <p>At 1,600 MW thermal, turbine 7 is disconnected. At 14:00 the emergency core cooling system is switched off, as the test program requires. Then the grid controller in Kyiv asks the plant to keep supplying power until the evening peak is over.</p>
    <p>The test is postponed. For nine hours the reactor runs at half power, and <b style="color:#c38bff">xenon-135</b>, a fission product that absorbs neutrons, builds up in the core.</p>`);
  await card(`<div class="stamp">26 APRIL 1986 · 00:00 · SHIFT CHANGE</div><h3>Your shift</h3>
    <p>You are <b>Leonid Toptunov</b>, 25, Senior Reactor Control Engineer. You have held the job for a few months. Your shift foreman is <b>Aleksandr Akimov</b>. Deputy chief engineer <b>Anatoly Dyatlov</b> is overseeing the test.</p>
    <p class="small">Left: the control room. Click highlighted controls when you are ordered to. Hold the rod buttons (or ↑ ↓) to move rods; Space presses the highlighted button. Middle: a simulated cut-away of the core. Right: the plant from outside. Click the dialogue box to skip a line.</p>`, 'TAKE THE CONSOLE');

  started = true;
  S.t = hms(0, 0, 0); S.timeScale = 1;

  // ---- 00:00 power reduction under the local automatic regulators ----
  await say('akimov', 'Lenya, the reactor is yours. We keep bringing the power down for the turbine test.');
  await say('akimov', 'The program says seven hundred to a thousand megawatts thermal. Bring the setpoint down to seven hundred.');
  setObj('Lower the power setpoint to 700 MW.');
  S.timeScale = 20;
  S.target = 'spdown'; await waitBtn('spdown');
  S.setpoint -= 60; AU.beep(1200, 0.05, 0.03, 'sine');
  S.target = null; setObj('Let power settle at 700 MW…');
  S.timeScale = 30;
  await waitUntil(() => S.P < 712);
  S.timeScale = 1;
  // Historically power kept falling below the program's 700 MW floor, to about 500 MW by 00:28.
  // Why is disputed in the operators' accounts, so the dialogue doesn't attribute a reason.
  await say('toptunov', "Seven hundred. That's the bottom of the program's range.");
  await say('akimov', 'Keep going down. Take it to about five hundred, then we switch regulators.');
  const c0 = await choice(['Keep lowering.', '"That\'s below the program."']);
  if (c0 === 1) await say('akimov', 'I know what the program says. Keep going, Lenya.');
  setObj('Lower the power setpoint ×3 (target ≈ 520 MW).');
  S.timeScale = 20;
  for (let i = 0; i < 3; i++) {
    S.target = 'spdown'; await waitBtn('spdown');
    S.setpoint -= 60; AU.beep(1200, 0.05, 0.03, 'sine');
    setObj(i < 2 ? `Lower the power setpoint ×${2 - i} (setpoint ${S.setpoint} MW).` : `Setpoint ${S.setpoint} MW.`);
  }
  S.target = null; setObj('Let power settle…');
  S.timeScale = 30;
  await waitUntil(() => S.P < 545);
  setObj('— time accelerated —'); S.timeScale = 70;
  await waitUntil(() => S.t >= hms(0, 28));
  S.timeScale = 1;

  // ---- 00:28 LAR -> AR transfer and the power collapse ----
  await say('akimov', 'At this level the local regulators lose their detectors. Switch over to the global regulator, LAR to AR.');
  S.target = 'lar_ar'; setObj('Switch control from LAR to AR.');
  await waitBtn('lar_ar');
  S.target = null; S.mode = 'COLLAPSE'; S.timeScale = 10; setObj('…');
  AU.alarm('warn', true);
  say('toptunov', "Power's falling! The regulator isn't holding it!");
  await waitUntil(() => S.P < 40);
  S.timeScale = 1;
  await say('toptunov', "Thirty megawatts. I can't catch it.");
  await say('dyatlov', 'Thirty? What is going on in here? Get the power back up!');
  await say('akimov', 'Lenya, raise it by hand. Withdraw the rods. We need two hundred.');
  const c1 = await choice(['Withdraw the rods.', '"The core is poisoned. We should shut down."']);
  if (c1 === 1) {
    await say('toptunov', 'Aleksandr Fyodorovich, with this much xenon we would have to pull almost every rod.');
    await say('dyatlov', 'The test is tonight. Raise the power.');
    await say('akimov', 'Do it, Lenya. Slowly.');
  }
  AU.alarm('warn', false);

  // ---- 00:30 – 01:00 manual recovery against the xenon ----
  Object.assign(S, { mode: 'MANUAL', ORM0: S.ORM, W: 0, ar: 0, need: 0, needRate: 1 / 1800, timeScale: 12 });
  S.target = 'withdraw';
  setObj('HOLD “WITHDRAW RODS” (or ↑) to raise power to ≈200 MW. Watch the ORM fall.');
  let stable = 0, last = S.realT, warned = 0, nudged = S.realT;
  await waitUntil(() => {
    const d = S.realT - last; last = S.realT;
    stable = Math.abs(S.P - 200) < 30 ? stable + d : 0;
    S.target = S.P > 260 ? 'insert' : 'withdraw';
    if (S.P > 320 && S.realT - warned > 8) { warned = S.realT; say('akimov', 'Too fast! Put some back, use INSERT!', { hold: 0.2 }); }
    if (S.P < 150 && !S.holdW && S.realT - nudged > 14) { nudged = S.realT; say('dyatlov', "What are you waiting for? Pull the rods!", { hold: 0.2 }); }
    return stable > 2.5;
  });
  S.target = null; releaseHold();
  S.timeScale = 1;
  await say('akimov', 'Two hundred. Hold it there. Put the AR back in.');
  S.target = 'ar_on'; setObj('Engage the automatic regulator (AR).');
  await waitBtn('ar_on');
  S.target = null; S.mode = 'AR'; S.needRate = 0;
  await say('akimov', "Two hundred, not seven hundred. Dyatlov says it's enough. The test goes ahead.");
  setObj('— time accelerated —'); S.timeScale = 60;
  await waitUntil(() => S.t >= hms(1, 3));

  // ---- 01:03 / 01:07 the extra main circulation pumps ----
  S.timeScale = 1;
  await say('stolyarchuk', 'Starting the additional main circulation pump, left side.');
  S.pumps = 7; S.flow = 7 / 6; S.need += 1.0;
  S.timeScale = 45; await waitUntil(() => S.t >= hms(1, 7)); S.timeScale = 1;
  await say('stolyarchuk', 'Second one, right side. All eight pumps are running.');
  S.pumps = 8; S.flow = 8 / 6; S.need += 1.0;
  await say('akimov', "That's a lot of flow. The water's barely below boiling, and the drum levels are jumping all over.");
  await say('stolyarchuk', 'Blocking the drum level and pressure trips so they do not scram us.');
  S.tripsBlocked = true;
  setObj('— time accelerated —'); S.timeScale = 45;
  await waitUntil(() => S.t >= hms(1, 19));

  // ---- 01:19 feedwater, AR saturates, more rods out ----
  S.timeScale = 1;
  await say('stolyarchuk', 'Drum levels are low. Raising feedwater.');
  S.need += 1.6; S.timeScale = 8;
  await waitUntil(() => S.arSat && S.P < 185);
  S.timeScale = 2;
  await say('toptunov', "AR rods are at the top. Power's sagging.");
  await say('akimov', 'Pull the manual rods, Lenya. Balance it.');
  S.target = 'withdraw'; S.timeScale = 6;
  setObj('HOLD “WITHDRAW RODS” until AR is back in range and power is ≈200 MW.');
  stable = 0; last = S.realT;
  await waitUntil(() => {
    const d = S.realT - last; last = S.realT;
    stable = !S.arSat && Math.abs(S.P - 200) < 25 ? stable + d : 0;
    return stable > 1.5;
  });
  S.target = null; releaseHold();
  setObj('— time accelerated —'); S.timeScale = 25;
  await waitUntil(() => S.t >= hms(1, 22, 30));

  // ---- 01:22:30 the SKALA printout ----
  S.timeScale = 1;
  await say('akimov', 'Lenya, get me a SKALA printout before we start.');
  S.target = 'skala'; setObj('Request a SKALA printout.');
  await waitBtn('skala');
  S.target = null; setObj('Read the printout.');
  const orm = Math.max(6, S.ORM).toFixed(1);
  AU.printer();
  S.printout = { t0: S.realT, lines: [
    { t: 'СКАЛА  ПРОГРАММА ПРИЗМА   01:22:30' }, { t: '------------------------------------' },
    { t: `N тепл. .......... ${Math.round(S.P)} МВт` }, { t: `ГЦН в работе ..... ${S.pumps}` },
    { t: `ОЗР .............. ${orm} ст.`, hl: true }, { t: 'ОЗР МИН ДОПУСТИМ.. 15.0 ст.' },
    { t: '------------------------------------' }, { t: `ORM (reactivity margin): ${orm} rods`, hl: true },
    { t: 'Regulation minimum:     15 rods' }, { t: 'Below 15: shut the reactor down' },
  ] };
  await sleep(2.8);
  await say('toptunov', `Operational reactivity margin, ${orm} rods. The minimum is fifteen.`);
  const c2 = await choice(['Report it to Akimov.', 'Fold the printout. Say nothing.']);
  if (c2 === 0) {
    await say('toptunov', `Aleksandr Fyodorovich, ORM is ${Math.round(+orm)} rods. By the regulations we have to shut down.`);
    await say('akimov', '… I see it.');
    await say('dyatlov', "We're starting. A few minutes and it's over.");
  } else {
    await say('thought', 'The printouts lag behind the reactor anyway. Dyatlov will not stop now.');
  }
  S.printout = null;
  setObj('Stand by for the test.');
  S.timeScale = 2; await waitUntil(() => S.t >= hms(1, 23, 1)); S.timeScale = 1;

  // ---- 01:23:04 the test ----
  await say('metlenko', 'Oscilloscope on!', { hold: 0 });
  S.t = Math.max(S.t, hms(1, 23, 4));
  say('kirshenbaum', 'Closing the stop valves on turbine eight.');
  S.mode = 'TEST'; S.test = true; S.osc = true; S.testStart = S.t; S.flow = 8 / 6;
  AU.turbineStart();
  setObj('Watch the reactor. Turbine 8 is coasting down.');
  await waitUntil(() => S.t >= S.testStart + 9);
  say('metlenko', 'Rundown under way. Voltage is holding.');
  await waitUntil(() => S.t >= S.testStart + 20);
  say('toptunov', "Power's creeping up. Two hundred ten. Fifteen.");
  await waitUntil(() => S.t >= hms(1, 23, 39));

  // ---- 01:23:40 AZ-5 ----
  say('akimov', "That's it, the rundown's done. Lenya, AZ-5! Shut it down!", { hold: 3 });
  S.target = 'az5'; setObj('Lift the cover and press AZ-5.');
  const pressed = await Promise.race([waitBtn('az5').then(() => true), waitUntil(() => S.t >= hms(1, 23, 50)).then(() => false)]);
  if (!pressed) { S.coverOpen = true; say('akimov', 'Lenya! I have it.', { hold: 0.2 }); AU.press(); }
  S.azT = S.t; S.mode = 'AZ5'; S.target = null;

  // Slow-motion walkthrough of the four seconds between AZ-5 and the first explosion.
  // Time crawls between steps and freezes on each one until the player continues.
  for (let i = 0; i < AZ_STEPS.length; i++) {
    const st = AZ_STEPS[i];
    S.timeScale = SLOWMO; await untilTau(st.tau);
    S.timeScale = 0; S.focus = st.focus;
    if (st.line) await say(st.line[0], st.line[1], { hold: 0.2 });
    if (st.focus === 'jam') {
      S.target = 'clutch';
      waitBtn('clutch').then(() => { AU.clunk(); S.clutch = true; });
    }
    await explain(st, i, AZ_STEPS.length);
  }
  S.focus = null; S.timeScale = 1;
  AU.alarm('klaxon', true);
  setObj(S.clutch ? 'The rods do not move.' : 'De-energise the servo clutches!');
  await untilTau(AZ.E2 + 7);

  // ---- epilogue ----
  S.ended = true; S.timeScale = 0;
  await card(`<div class="stamp">26 APRIL 1986 · 01:23:45</div><h3>Reactor No. 4</h3>
    <p>Within seconds of AZ-5, power surged to roughly a hundred times its rated output. Two explosions followed. The second destroyed the reactor. The 1,000-tonne upper shield was thrown aside, burning graphite and fuel were scattered across the site, and the fire carried radioactive material across Europe for days.</p>`);
  await card(`<h3>Why</h3>
    <p>The RBMK had a <b>positive void coefficient</b>. As cooling water boiled into steam, reactivity rose. At low power, heavily poisoned by xenon, with eight pumps running near boiling and almost every control rod withdrawn (ORM ≈ ${S.ORM.toFixed(0)}), the reactor was unstable.</p>
    <p>When AZ-5 was pressed, the <b>graphite displacers</b> on the ends of the control rods entered the bottom of the core first. They pushed out water and briefly <i>added</i> reactivity, the "positive scram" effect. The flaw had been seen before at other plants, but the operators were never told.</p>`);
  await card(`<h3>In memory</h3>
    <p>Akimov and Toptunov stayed in the unit for hours. They opened valves by hand to send water to a reactor that no longer existed.</p>
    <p><b>Aleksandr Akimov</b> died of acute radiation syndrome on 11 May 1986, aged 32.<br><b>Leonid Toptunov</b> died on 14 May 1986, aged 25.</p>
    <p class="small">Both were posthumously awarded Ukraine's Order for Courage in 2008. Among the others who died were Valery Khodemchuk, whose body was never recovered, and Vladimir Shashenok, both on the night of the accident, as well as many firefighters and plant workers in the weeks that followed.</p>`, 'PLAY AGAIN');
  location.reload();
}

// ---------- boot ----------
window.addEventListener('load', () => {
  vCR = new View($('vCR'), CR.W, CR.H, '#222b26');
  vRX = new View($('vRX'), RX.W, RX.H, '#07090b');
  vOUT = new View($('vOUT'), OUT.W, OUT.H, '#02040b', 'cover');
  CR.init(); RX.init(); OUT.init();
  setupInput();
  requestAnimationFrame(frame);
  $('startBtn').onclick = () => {
    AU.init(); AU.press();
    $('overlay').classList.remove('show');
    story();
  };
});
