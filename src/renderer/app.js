/* Voice Studio – renderer: UI + audio graph */
'use strict';

// when opened in a plain browser (UI preview) there is no Electron preload
if (!window.studio) window.studio = { dspSource: async () => '', saveFile: async () => null,
    ytFetch: async () => ({ ok: false, error: 'Only available in the desktop app' }),
    appInfo: async () => ({ version: 'preview', packaged: false }),
    installVbCable: async () => ({ ok: false, error: 'Only available in the desktop app' }),
    openExternal: async () => {},
    update: { check: async () => ({ ok: false }), download: async () => ({ ok: false }),
      onAvailable() {}, onNone() {}, onProgress() {}, onDownloaded() {}, onError() {} } };
const DSP = window.VoiceDSP;
const $ = (id) => document.getElementById(id);
const STORE_KEY = 'voicestudio.v1';
const PRESET_KEY = 'voicestudio.presets.v1';

/* ------------------------------------------------------------------ */
/* State                                                              */
/* ------------------------------------------------------------------ */
const clone = (o) => JSON.parse(JSON.stringify(o));
function merge(base, patch) {
  for (const k of Object.keys(patch)) {
    if (Array.isArray(patch[k])) base[k] = clone(patch[k]);
    else if (patch[k] && typeof patch[k] === 'object') merge(base[k] || (base[k] = {}), patch[k]);
    else base[k] = patch[k];
  }
  return base;
}

const state = {
  params: DSP.DEFAULT_PARAMS(),
  dev: { in: 'default', out: 'default', mon: 'default' },
  monitor: { on: false, vol: 0.8 },
  ns: false, agc: false,
  music: { vol: 60, duck: true, loop: false },
  v: 2,
  preset: 'Female – Natural',
};

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (s) {
      if (s.v === 2) merge(state.params, s.params || {});
      else state.migrated = true; // old defaults (gate too tight, 1024 quality) are replaced
      Object.assign(state.dev, s.dev || {});
      Object.assign(state.monitor, s.monitor || {});
      state.ns = !!s.ns; state.agc = !!s.agc;
      Object.assign(state.music, s.music || {});
      state.preset = s.preset || state.preset;
      return true;
    }
  } catch (_) { /* ignore */ }
  return false;
}
let saveTimer = 0;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* ignore */ }
  }, 300);
}

/* ------------------------------------------------------------------ */
/* Presets                                                            */
/* ------------------------------------------------------------------ */
const eqBand = (type, freq, gain, q = 1) => ({ type, freq, gain, q, on: true });
function eqSet(l, p1, p2, p3, p4, h) {
  return { eq: { bands: [eqBand('lowshelf', ...l), eqBand('peaking', ...p1), eqBand('peaking', ...p2),
                         eqBand('peaking', ...p3), eqBand('peaking', ...p4), eqBand('highshelf', ...h)] } };
}
const BUILTIN_PRESETS = {
  'Clean mic (no voice change)': { voice: { on: false, pitch: 0, formant: 0 },
    ...eqSet([120, 0, .7], [300, -1.5, 1], [1000, 0, 1], [3000, 1.5, 1], [6000, 0, 1], [10000, 1.5, .7]) },
  'Female – Natural': { voice: { on: true, pitch: 4.5, formant: 2.8, mix: 100, robot: false },
    ...eqSet([150, -3, .7], [320, -2, 1.1], [1100, 0, 1], [3200, 2, 1], [6000, 0, 1], [9500, 2.5, .7]) },
  'Female – Soft / Warm': { voice: { on: true, pitch: 4, formant: 2.2, mix: 100, robot: false },
    ...eqSet([160, -1.5, .7], [250, 1, 1], [1000, 0, 1], [3500, 0.5, 1], [6500, -1.5, 1], [9000, 1, .7]) },
  'Female – Bright / Young': { voice: { on: true, pitch: 6.5, formant: 4, mix: 100, robot: false },
    ...eqSet([180, -4, .7], [350, -2, 1.1], [1200, 1, 1], [3500, 2.5, 1], [6500, 1, 1], [10000, 3, .7]) },
  'Girl / Child': { voice: { on: true, pitch: 9, formant: 6, mix: 100, robot: false },
    ...eqSet([200, -5, .7], [400, -2, 1.1], [1400, 1.5, 1], [3800, 3, 1], [7000, 1, 1], [10000, 3, .7]) },
  'Male – Deep': { voice: { on: true, pitch: -4, formant: -2.5, mix: 100, robot: false },
    ...eqSet([110, 3, .7], [250, 1.5, 1], [1000, 0, 1], [3000, -1, 1], [6000, -1.5, 1], [10000, -2, .7]) },
  'Cartoon / Chipmunk': { voice: { on: true, pitch: 11, formant: 8, mix: 100, robot: false },
    ...eqSet([200, -6, .7], [500, 0, 1], [1500, 2, 1], [4000, 3, 1], [7000, 1, 1], [10000, 2, .7]) },
  'Male – Strong / Very Manly': { voice: { on: true, pitch: -5.5, formant: -3.5, mix: 100, robot: false },
    ...eqSet([95, 4.5, .7], [220, 2.5, 1], [900, -1, 1], [2800, 1, 1], [6000, -2, 1], [10000, -3, .7]),
    comp: { thresh: -26, ratio: 4, attack: 6, release: 140, knee: 6, makeup: 6, mix: 100 },
    deess: { thresh: -34, ratio: 5 } },
  'Giant / Monster': { voice: { on: true, pitch: -9, formant: -6, mix: 100, robot: false },
    ...eqSet([90, 5, .7], [200, 3, 1], [900, 0, 1], [3000, -3, 1], [6000, -4, 1], [10000, -6, .7]) },
  'Robot': { voice: { on: true, pitch: -2, formant: 0, mix: 100, robot: true, robotFreq: 55, robotMix: 100 },
    ...eqSet([120, 0, .7], [300, 0, 1], [1000, 2, 1], [3000, 3, 1], [6000, 0, 1], [10000, 0, .7]) },
  'Broadcast voice (male)': { voice: { on: false },
    ...eqSet([100, 2.5, .7], [250, -1.5, 1], [1000, 0, 1], [3500, 2.5, 1], [6500, -1, 1], [11000, 2, .7]),
    comp: { thresh: -24, ratio: 4, attack: 6, release: 140, knee: 6, makeup: 6, mix: 100 } },
};
function userPresets() {
  try { return JSON.parse(localStorage.getItem(PRESET_KEY) || '{}'); } catch (_) { return {}; }
}
function storeUserPresets(p) { localStorage.setItem(PRESET_KEY, JSON.stringify(p)); }

function applyPreset(name) {
  const user = userPresets();
  let patch = null;
  if (user[name]) {
    const p = clone(user[name]);
    delete p.bypass;
    state.params = merge(DSP.DEFAULT_PARAMS(), p);
  } else if (BUILTIN_PRESETS[name]) {
    // keep the studio chain (HPF / expander / de-esser / comp / limiter) of the user
    const cur = state.params;
    const base = DSP.DEFAULT_PARAMS();
    const keep = { inGain: cur.inGain, outGain: cur.outGain, hpf: cur.hpf, exp: cur.exp, deess: cur.deess,
                   comp: cur.comp, lim: cur.lim };
    state.params = merge(merge(base, clone(keep)), clone(BUILTIN_PRESETS[name]));
    state.params.voice.quality = cur.voice.quality;
    patch = true;
  } else return;
  void patch;
  state.preset = name;
  refreshAll();
  pushParams();
}

function fillPresetSelect() {
  const sel = $('presetSelect');
  sel.innerHTML = '';
  const g1 = document.createElement('optgroup'); g1.label = 'Built-in';
  Object.keys(BUILTIN_PRESETS).forEach((n) => g1.appendChild(new Option(n, n)));
  sel.appendChild(g1);
  const u = userPresets();
  if (Object.keys(u).length) {
    const g2 = document.createElement('optgroup'); g2.label = 'My presets';
    Object.keys(u).forEach((n) => g2.appendChild(new Option(n, n)));
    sel.appendChild(g2);
  }
  if ([...sel.options].some((o) => o.value === state.preset)) sel.value = state.preset;
  $('btnPresetDelete').disabled = !userPresets()[sel.value];
}

/* ------------------------------------------------------------------ */
/* Knob + switch widgets                                              */
/* ------------------------------------------------------------------ */
const knobs = [];
const SVGNS = 'http://www.w3.org/2000/svg';
function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}
function arcPath(cx, cy, r, a0, a1) {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 >= a0 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/** spec: {label,min,max,def,step,unit,log,dec} */
function makeKnob(spec, get, set, onChange) {
  const el = document.createElement('div');
  el.className = 'knob';
  el.innerHTML = `<svg viewBox="0 0 64 64"><path class="track"/><path class="val"/><line class="ind"/></svg>
    <div class="kv"></div><div class="kl">${spec.label}</div>`;
  const track = el.querySelector('.track'), val = el.querySelector('.val'), ind = el.querySelector('.ind');
  const kv = el.querySelector('.kv');
  const A0 = -135, A1 = 135;
  const bipolar = !spec.log && spec.min < 0 && spec.max > 0;
  track.setAttribute('d', arcPath(32, 32, 24, A0, A1));
  const toN = (v) => spec.log ? Math.log(v / spec.min) / Math.log(spec.max / spec.min) : (v - spec.min) / (spec.max - spec.min);
  const fromN = (n) => spec.log ? spec.min * Math.pow(spec.max / spec.min, n) : spec.min + n * (spec.max - spec.min);
  const fmt = (v) => {
    if (spec.fmt) return spec.fmt(v);
    const d = spec.dec != null ? spec.dec : (Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 100 ? 0 : 1);
    if (spec.unit === ' Hz' && v >= 1000) return (v / 1000).toFixed(2) + ' kHz';
    return v.toFixed(d) + (spec.unit || '');
  };
  function draw() {
    const v = Math.min(spec.max, Math.max(spec.min, get()));
    const n = toN(v);
    const ang = A0 + n * (A1 - A0);
    const zero = bipolar ? A0 + toN(0) * (A1 - A0) : A0;
    if (Math.abs(ang - zero) < 0.5) val.setAttribute('d', '');
    else val.setAttribute('d', arcPath(32, 32, 24, zero, ang));
    const [x0, y0] = polar(32, 32, 9, ang);
    const [x1, y1] = polar(32, 32, 20, ang);
    ind.setAttribute('x1', x0); ind.setAttribute('y1', y0); ind.setAttribute('x2', x1); ind.setAttribute('y2', y1);
    kv.textContent = fmt(v);
  }
  function commit(v) {
    if (spec.step) v = Math.round(v / spec.step) * spec.step;
    v = Math.min(spec.max, Math.max(spec.min, v));
    set(v); draw();
    if (onChange) onChange();
    pushParams();
  }
  let startY = 0, startN = 0, dragging = false;
  el.addEventListener('pointerdown', (e) => {
    dragging = true; startY = e.clientY; startN = toN(get());
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const range = e.shiftKey ? 900 : 180;
    const n = Math.min(1, Math.max(0, startN + (startY - e.clientY) / range));
    commit(fromN(n));
  });
  const end = (e) => { dragging = false; try { el.releasePointerCapture(e.pointerId); } catch (_) { /* */ } };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('dblclick', () => commit(spec.def));
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    const n = toN(get()) + (e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.005 : 0.02);
    commit(fromN(Math.min(1, Math.max(0, n))));
  }, { passive: false });
  draw();
  const k = { el, refresh: draw };
  knobs.push(k);
  return el;
}

const switches = [];
function makeSwitch(get, set, onChange) {
  const el = document.createElement('div');
  el.className = 'sw'; el.tabIndex = 0; el.setAttribute('role', 'switch');
  const draw = () => { el.classList.toggle('on', !!get()); el.setAttribute('aria-checked', !!get()); };
  const flip = () => { set(!get()); draw(); if (onChange) onChange(); pushParams(); };
  el.addEventListener('click', flip);
  el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
  draw();
  switches.push({ el, refresh: draw });
  return el;
}

function makeToggleButton(label, get, set) {
  const b = document.createElement('button');
  b.className = 'togglebtn'; b.textContent = label;
  const draw = () => b.classList.toggle('on', !!get());
  b.addEventListener('click', () => { set(!get()); draw(); pushParams(); });
  draw();
  switches.push({ el: b, refresh: draw });
  return b;
}

function makeSelect(label, options, get, set) {
  const w = document.createElement('label');
  w.className = 'minisel';
  w.append(label);
  const s = document.createElement('select');
  options.forEach(([v, t]) => s.appendChild(new Option(t, String(v))));
  const draw = () => { s.value = String(get()); };
  s.addEventListener('change', () => { set(typeof options[0][0] === 'number' ? Number(s.value) : s.value); pushParams(); });
  draw();
  switches.push({ el: s, refresh: draw });
  w.appendChild(s);
  return w;
}

/* ------------------------------------------------------------------ */
/* Module cards                                                       */
/* ------------------------------------------------------------------ */
const grBars = {}; // key -> {fill, txt}

function makeCard(key, title, sub, hasGR) {
  const card = document.createElement('section');
  card.className = 'card';
  const head = document.createElement('header');
  head.innerHTML = `<h3>${title}</h3><small>${sub}</small>`;
  const sw = makeSwitch(() => state.params[key].on, (v) => { state.params[key].on = v; }, sync);
  head.prepend(sw);
  if (hasGR) {
    const gm = document.createElement('div'); gm.className = 'grmeter'; gm.title = 'Gain reduction';
    const fill = document.createElement('i'); gm.appendChild(fill);
    const txt = document.createElement('span'); txt.className = 'grtxt'; txt.textContent = '0.0';
    head.append(gm, txt);
    grBars[hasGR] = { fill, txt };
  }
  const body = document.createElement('div'); body.className = 'body';
  card.append(head, body);
  function sync() { card.classList.toggle('off', !state.params[key].on); }
  sync();
  switches.push({ el: card, refresh: sync });
  return { card, body };
}

function K(module, k, spec) {
  return makeKnob(spec, () => state.params[module][k], (v) => { state.params[module][k] = v; }, () => { state.preset = null; });
}

function buildChain() {
  const chain = $('chain');
  chain.innerHTML = '';

  // Voice changer
  {
    const { card, body } = makeCard('voice', 'Voice changer', 'pitch · formant · character');
    body.append(
      K('voice', 'pitch', { label: 'PITCH', min: -12, max: 12, def: 0, step: 0.1, unit: ' st' }),
      K('voice', 'formant', { label: 'FORMANT', min: -12, max: 12, def: 0, step: 0.1, unit: ' st' }),
      K('voice', 'mix', { label: 'MIX', min: 0, max: 100, def: 100, step: 1, unit: ' %', dec: 0 }),
    );
    const side = document.createElement('div'); side.className = 'minisel';
    side.appendChild(makeSelect('QUALITY / DELAY', [[512, 'Fast ~11 ms (rough)'], [1024, 'Balanced ~21 ms'], [2048, 'Clean ~43 ms (best)']],
      () => state.params.voice.quality, (v) => { state.params.voice.quality = v; }));
    side.appendChild(makeToggleButton('Robot voice', () => state.params.voice.robot, (v) => { state.params.voice.robot = v; }));
    body.appendChild(side);
    body.append(
      K('voice', 'robotFreq', { label: 'ROBOT Hz', min: 20, max: 400, def: 60, log: true, unit: ' Hz', dec: 0 }),
      K('voice', 'robotMix', { label: 'ROBOT', min: 0, max: 100, def: 100, step: 1, unit: ' %', dec: 0 }),
    );
    chain.appendChild(card);
  }

  // High-pass
  {
    const { card, body } = makeCard('hpf', 'High-pass', 'removes rumble & plosives');
    body.append(K('hpf', 'freq', { label: 'FREQ', min: 20, max: 500, def: 80, log: true, unit: ' Hz', dec: 0 }));
    body.appendChild(makeSelect('SLOPE', [[12, '12 dB/oct'], [24, '24 dB/oct']],
      () => state.params.hpf.slope, (v) => { state.params.hpf.slope = v; }));
    chain.appendChild(card);
  }

  // Expander
  {
    const { card, body } = makeCard('exp', 'Downward expander', 'quiets noise between words', 'exp');
    body.append(
      K('exp', 'thresh', { label: 'THRESH', min: -80, max: -10, def: -52, step: 0.5, unit: ' dB' }),
      K('exp', 'ratio', { label: 'RATIO', min: 1, max: 10, def: 2.5, step: 0.1, unit: ' :1' }),
      K('exp', 'range', { label: 'RANGE', min: 0, max: 80, def: 30, step: 1, unit: ' dB', dec: 0 }),
      K('exp', 'attack', { label: 'ATTACK', min: 0.1, max: 50, def: 2, log: true, unit: ' ms' }),
      K('exp', 'hold', { label: 'HOLD', min: 0, max: 300, def: 30, step: 1, unit: ' ms', dec: 0 }),
      K('exp', 'release', { label: 'RELEASE', min: 10, max: 1000, def: 120, log: true, unit: ' ms', dec: 0 }),
    );
    chain.appendChild(card);
  }

  // De-esser
  {
    const { card, body } = makeCard('deess', 'De-esser', 'tames “S” and “T”', 'deess');
    body.append(
      K('deess', 'freq', { label: 'FREQ', min: 2000, max: 12000, def: 6500, log: true, unit: ' Hz' }),
      K('deess', 'q', { label: 'WIDTH Q', min: 0.4, max: 4, def: 1.2, step: 0.05, unit: '', dec: 2 }),
      K('deess', 'thresh', { label: 'THRESH', min: -60, max: -5, def: -32, step: 0.5, unit: ' dB' }),
      K('deess', 'ratio', { label: 'RATIO', min: 1, max: 10, def: 4, step: 0.1, unit: ' :1' }),
      K('deess', 'range', { label: 'MAX CUT', min: 0, max: 30, def: 12, step: 0.5, unit: ' dB' }),
    );
    const side = document.createElement('div'); side.className = 'minisel';
    side.appendChild(makeSelect('MODE', [[0, 'Split-band'], [1, 'Wide-band']],
      () => state.params.deess.mode, (v) => { state.params.deess.mode = v; }));
    side.appendChild(makeToggleButton('Listen', () => state.params.deess.listen, (v) => { state.params.deess.listen = v; }));
    body.appendChild(side);
    chain.appendChild(card);
  }

  // EQ
  {
    const { card, body } = makeCard('eq', 'Parametric EQ', '6 bands · drag in the graph');
    const grid = document.createElement('div'); grid.className = 'eqgrid';
    const names = ['LOW SHELF', 'BAND 2', 'BAND 3', 'BAND 4', 'BAND 5', 'HIGH SHELF'];
    for (let i = 0; i < 6; i++) {
      const b = document.createElement('div'); b.className = 'eqband';
      const bt = document.createElement('div'); bt.className = 'bt';
      bt.append(names[i]);
      bt.appendChild(makeSwitch(() => state.params.eq.bands[i].on, (v) => { state.params.eq.bands[i].on = v; }));
      const bandKnob = (k, spec) => makeKnob(spec, () => state.params.eq.bands[i][k],
        (v) => { state.params.eq.bands[i][k] = v; }, () => { state.preset = null; });
      b.append(bt,
        bandKnob('freq', { label: 'FREQ', min: 20, max: 20000, def: [120, 300, 1000, 3000, 6000, 10000][i], log: true, unit: ' Hz' }),
        bandKnob('gain', { label: 'GAIN', min: -18, max: 18, def: 0, step: 0.1, unit: ' dB' }),
        bandKnob('q', { label: 'Q', min: 0.3, max: 8, def: i === 0 || i === 5 ? 0.7 : 1, log: true, unit: '', dec: 2 }));
      grid.appendChild(b);
    }
    body.appendChild(grid); body.firstChild.classList.add('wide');
    card.style.gridColumn = 'span 2';
    chain.appendChild(card);
  }

  // Compressor
  {
    const { card, body } = makeCard('comp', 'Compressor', 'evens out loud & soft', 'comp');
    body.append(
      K('comp', 'thresh', { label: 'THRESH', min: -60, max: 0, def: -20, step: 0.5, unit: ' dB' }),
      K('comp', 'ratio', { label: 'RATIO', min: 1, max: 20, def: 3, log: true, unit: ' :1' }),
      K('comp', 'attack', { label: 'ATTACK', min: 0.1, max: 100, def: 8, log: true, unit: ' ms' }),
      K('comp', 'release', { label: 'RELEASE', min: 10, max: 1000, def: 120, log: true, unit: ' ms', dec: 0 }),
      K('comp', 'knee', { label: 'KNEE', min: 0, max: 24, def: 6, step: 0.5, unit: ' dB' }),
      K('comp', 'makeup', { label: 'MAKEUP', min: 0, max: 24, def: 3, step: 0.1, unit: ' dB' }),
      K('comp', 'mix', { label: 'MIX', min: 0, max: 100, def: 100, step: 1, unit: ' %', dec: 0 }),
    );
    chain.appendChild(card);
  }

  // Limiter
  {
    const { card, body } = makeCard('lim', 'Limiter', 'brick-wall · look-ahead', 'lim');
    body.append(
      K('lim', 'ceiling', { label: 'CEILING', min: -12, max: 0, def: -1, step: 0.1, unit: ' dB' }),
      K('lim', 'release', { label: 'RELEASE', min: 5, max: 500, def: 80, log: true, unit: ' ms', dec: 0 }),
    );
    chain.appendChild(card);
  }

  buildMusic(chain);
}

function buildIOKnobs() {
  const row = $('ioKnobs');
  row.innerHTML = '';
  const mk = (k, label) => makeKnob({ label, min: -24, max: 24, def: 0, step: 0.1, unit: ' dB' },
    () => state.params[k], (v) => { state.params[k] = v; });
  row.append(mk('inGain', 'INPUT GAIN'), mk('outGain', 'OUTPUT GAIN'));
}

function refreshAll() {
  knobs.forEach((k) => k.refresh());
  switches.forEach((s) => s.refresh());
  $('btnBypass').classList.toggle('on', state.params.bypass);
  fillPresetSelect();
  drawScope();
  saveState();
}

/* ------------------------------------------------------------------ */
/* Audio engine                                                       */
/* ------------------------------------------------------------------ */
const engine = { ctx: null, node: null, stream: null, analyser: null, monEl: null, monGain: null,
                 msd: null, running: false, meters: null, latency: 0, recChunks: null, recStart: 0 };

let pushQueued = false;
function pushParams() {
  state.preset = state.preset; // keep
  saveState();
  if (!pushQueued) {
    pushQueued = true;
    requestAnimationFrame(() => {
      pushQueued = false;
      if (engine.node) engine.node.port.postMessage({ type: 'params', params: state.params });
      drawScope();
    });
  }
}

async function enumerate() {
  let devs = [];
  try { devs = await navigator.mediaDevices.enumerateDevices(); } catch (_) { /* */ }
  const fill = (sel, kind, cur) => {
    sel.innerHTML = '';
    sel.appendChild(new Option('System default', 'default'));
    devs.filter((d) => d.kind === kind && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .forEach((d) => sel.appendChild(new Option(d.label || (kind + ' ' + d.deviceId.slice(0, 6)), d.deviceId)));
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : 'default';
    return sel.value;
  };
  state.dev.in = fill($('selIn'), 'audioinput', state.dev.in);
  state.dev.out = fill($('selOut'), 'audiooutput', state.dev.out);
  state.dev.mon = fill($('selMon'), 'audiooutput', state.dev.mon);

  // auto-pick a virtual cable the first time
  const hasLabels = devs.some((d) => d.label);
  const cable = devs.find((d) => d.kind === 'audiooutput' && /cable input|vb-audio|voicemeeter|virtual/i.test(d.label));
  if (cable && !localStorage.getItem('voicestudio.cableChosen')) {
    state.dev.out = cable.deviceId; $('selOut').value = cable.deviceId;
    localStorage.setItem('voicestudio.cableChosen', '1');
  }
  updateCableStatus(!!cable, hasLabels);
}

function updateCableStatus(found, hasLabels = true) {
  const el = $('cableStatus');
  const btn = $('btnInstallCable');
  const sel = $('selOut');
  const label = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
  btn.hidden = true;
  if (!hasLabels) { el.textContent = 'Detecting audio devices…'; el.className = 'hint'; }
  else if (/cable|virtual|voicemeeter/i.test(label)) { el.textContent = '✓ Virtual cable selected – pick its “Output” side in your game.'; el.className = 'hint ok'; }
  else if (found) { el.textContent = 'Virtual cable found – select “CABLE Input” above to feed your game.'; el.className = 'hint bad'; }
  else { el.textContent = 'No virtual microphone found – it is required to use this in games.'; el.className = 'hint bad'; btn.hidden = false; }
}

async function startEngine() {
  if (engine.running) return;
  $('status').textContent = 'Starting…';
  try {
    const src = await window.studio.dspSource();
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    if (state.dev.out !== 'default' && ctx.setSinkId) await ctx.setSinkId(state.dev.out);
    await ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const constraints = { audio: {
      deviceId: state.dev.in !== 'default' ? { exact: state.dev.in } : undefined,
      echoCancellation: false, noiseSuppression: state.ns, autoGainControl: state.agc,
      channelCount: 1,
    } };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    await enumerate(); // labels are available now

    const srcNode = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'voice-studio', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096; analyser.smoothingTimeConstant = 0.75;
    srcNode.connect(node);
    node.connect(analyser);
    node.connect(ctx.destination);

    // monitor path (separate output device)
    const msd = ctx.createMediaStreamDestination();
    const monGain = ctx.createGain();
    monGain.gain.value = state.monitor.on ? state.monitor.vol : 0;
    node.connect(monGain); monGain.connect(msd);
    const monEl = new Audio();
    monEl.srcObject = msd.stream;
    if (state.dev.mon !== 'default' && monEl.setSinkId) { try { await monEl.setSinkId(state.dev.mon); } catch (_) { /* */ } }
    await monEl.play();

    setupMusic(ctx, msd);

    node.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'meters') { engine.meters = m; engine.latency = m.latency; engine.dropouts = m.dropouts || 0; }
      else if (m.type === 'rec' && engine.recChunks) engine.recChunks.push(m.data);
    };
    Object.assign(engine, { ctx, node, stream, analyser, monEl, monGain, msd, running: true });
    node.port.postMessage({ type: 'params', params: state.params });

    $('btnPower').classList.add('on');
    $('powerLabel').textContent = 'Engine running';
    $('btnRec').disabled = false;
    $('status').textContent = `Running · ${Math.round(ctx.sampleRate / 1000 * 10) / 10} kHz`;
    drawScope();
  } catch (err) {
    console.error(err);
    $('status').textContent = 'Error: ' + (err && err.message ? err.message : err);
    await stopEngine();
  }
}

async function stopEngine() {
  if (engine.recChunks) await toggleRecord();
  try { engine.stream && engine.stream.getTracks().forEach((t) => t.stop()); } catch (_) { /* */ }
  teardownMusic();
  try { engine.monEl && engine.monEl.pause(); } catch (_) { /* */ }
  try { engine.node && engine.node.disconnect(); } catch (_) { /* */ }
  try { engine.ctx && await engine.ctx.close(); } catch (_) { /* */ }
  Object.assign(engine, { ctx: null, node: null, stream: null, analyser: null, monEl: null, monGain: null,
                          msd: null, running: false, meters: null });
  $('btnPower').classList.remove('on');
  $('powerLabel').textContent = 'Start engine';
  $('btnRec').disabled = true;
  if (!$('status').textContent.startsWith('Error')) $('status').textContent = 'Engine stopped';
  $('latency').textContent = 'latency –';
}

async function restartEngine() {
  if (!engine.running) return;
  await stopEngine();
  await startEngine();
}

/* WAV recording of the processed output */
async function toggleRecord() {
  const btn = $('btnRec');
  if (!engine.recChunks) {
    engine.recChunks = []; engine.recStart = performance.now();
    engine.node.port.postMessage({ type: 'record', on: true });
    btn.classList.add('on'); btn.textContent = '■ Stop';
  } else {
    engine.node && engine.node.port.postMessage({ type: 'record', on: false });
    await new Promise((r) => setTimeout(r, 60));
    const chunks = engine.recChunks; engine.recChunks = null;
    btn.classList.remove('on'); btn.textContent = '● Record'; $('recTime').textContent = '';
    const total = chunks.reduce((a, c) => a + c.length, 0);
    if (!total) return;
    const sr = engine.ctx ? engine.ctx.sampleRate : 48000;
    const buf = new ArrayBuffer(44 + total * 2);
    const dv = new DataView(buf);
    const wr = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    wr(0, 'RIFF'); dv.setUint32(4, 36 + total * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    wr(36, 'data'); dv.setUint32(40, total * 2, true);
    let o = 44;
    for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) {
      dv.setInt16(o, Math.max(-1, Math.min(1, c[i])) * 32767, true);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    await window.studio.saveFile(`voice-studio-${stamp}.wav`, buf, [{ name: 'WAV audio', extensions: ['wav'] }]);
  }
}

/* ------------------------------------------------------------------ */
/* Meters + scope                                                     */
/* ------------------------------------------------------------------ */
const dbPct = (db) => Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
const hold = { in: 0, out: 0, inT: 0, outT: 0 };
const disp = { in: 0, out: 0, exp: 0, deess: 0, comp: 0, lim: 0 };

function updateMeters() {
  const m = engine.meters;
  const fall = 0.9;
  if (m) {
    disp.in = Math.max(m.inPeak, disp.in * fall);
    disp.out = Math.max(m.outPeak, disp.out * fall);
    for (const k of ['exp', 'deess', 'comp', 'lim']) {
      const g = -m[k] > -disp[k] ? m[k] : disp[k] * 0.85 + m[k] * 0.15;
      disp[k] = Math.min(m[k], disp[k] * 0.9);
      if (g > disp[k]) { /* keep */ }
    }
    $('latency').textContent = 'latency ≈ ' + Math.round(
      (engine.latency / engine.ctx.sampleRate + engine.ctx.baseLatency + (engine.ctx.outputLatency || 0)) * 1000) + ' ms'
      + (engine.dropouts ? ` · ${engine.dropouts} dropouts` : ' · no dropouts');
  } else { disp.in *= fall; disp.out *= fall; }
  const inDb = DSP.linToDb(disp.in), outDb = DSP.linToDb(disp.out);
  $('mIn').style.width = dbPct(inDb) + '%';
  $('mOut').style.width = dbPct(outDb) + '%';
  $('mInTxt').textContent = disp.in > 0.0005 ? inDb.toFixed(1) : '-∞';
  $('mOutTxt').textContent = disp.out > 0.0005 ? outDb.toFixed(1) : '-∞';
  const now = performance.now();
  if (inDb > hold.in || now - hold.inT > 1200) { hold.in = inDb; hold.inT = now; }
  if (outDb > hold.out || now - hold.outT > 1200) { hold.out = outDb; hold.outT = now; }
  $('mInHold').style.left = `calc(${dbPct(hold.in)}% - 2px)`;
  $('mOutHold').style.left = `calc(${dbPct(hold.out)}% - 2px)`;
  for (const k of Object.keys(grBars)) {
    const db = disp[k] || 0;
    grBars[k].fill.style.width = Math.min(100, (-db / 24) * 100) + '%';
    grBars[k].txt.textContent = db.toFixed(1);
  }
}

const scope = { cv: null, cx: null, data: null, handles: [] };
const F_MIN = 20, F_MAX = 20000, DB_RANGE = 24;

function eqCurveDb(f, fs) {
  const p = state.params;
  let db = 0;
  if (p.hpf.on) {
    if (p.hpf.slope === 24) {
      db += DSP.biquadMagnitudeDb(DSP.biquadCoeffs('highpass', fs, p.hpf.freq, 0.5412, 0), fs, f);
      db += DSP.biquadMagnitudeDb(DSP.biquadCoeffs('highpass', fs, p.hpf.freq, 1.3066, 0), fs, f);
    } else db += DSP.biquadMagnitudeDb(DSP.biquadCoeffs('highpass', fs, p.hpf.freq, 0.7071, 0), fs, f);
  }
  if (p.eq.on) {
    for (const b of p.eq.bands) {
      if (!b.on) continue;
      db += DSP.biquadMagnitudeDb(DSP.biquadCoeffs(b.type, fs, b.freq, b.q, b.gain), fs, f);
    }
  }
  return db;
}

function drawScope() {
  const cv = scope.cv; if (!cv) return;
  const cx = scope.cx;
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  }
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.clearRect(0, 0, w, h);
  const fs = engine.ctx ? engine.ctx.sampleRate : 48000;
  const xOf = (f) => (Math.log(f / F_MIN) / Math.log(F_MAX / F_MIN)) * w;
  const yEq = (db) => h / 2 - (db / DB_RANGE) * (h / 2) * 0.92;

  // grid
  cx.lineWidth = 1; cx.font = '10px Segoe UI'; cx.fillStyle = '#6c7585'; cx.strokeStyle = '#1d222b';
  for (const f of [30, 50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const x = xOf(f); cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, h); cx.stroke();
    cx.fillText(f >= 1000 ? f / 1000 + 'k' : String(f), x + 3, h - 4);
  }
  for (const db of [-18, -12, -6, 0, 6, 12, 18]) {
    const y = yEq(db);
    cx.strokeStyle = db === 0 ? '#2e3643' : '#1d222b';
    cx.beginPath(); cx.moveTo(0, y); cx.lineTo(w, y); cx.stroke();
    cx.fillStyle = '#6c7585'; cx.fillText((db > 0 ? '+' : '') + db, w - 24, y - 3);
  }

  // live spectrum
  if (engine.analyser) {
    const an = engine.analyser;
    if (!scope.data || scope.data.length !== an.frequencyBinCount) scope.data = new Float32Array(an.frequencyBinCount);
    an.getFloatFrequencyData(scope.data);
    cx.beginPath();
    const binHz = fs / an.fftSize;
    let first = true;
    for (let px = 0; px <= w; px += 2) {
      const f = F_MIN * Math.pow(F_MAX / F_MIN, px / w);
      const bin = Math.min(scope.data.length - 1, Math.round(f / binHz));
      const db = Math.max(-100, scope.data[bin]);
      const y = h - ((db + 100) / 100) * h * 0.95;
      if (first) { cx.moveTo(px, y); first = false; } else cx.lineTo(px, y);
    }
    cx.lineTo(w, h); cx.lineTo(0, h); cx.closePath();
    const g = cx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(124,140,255,.55)'); g.addColorStop(1, 'rgba(124,140,255,.02)');
    cx.fillStyle = g; cx.fill();
    cx.strokeStyle = '#7c8cff'; cx.lineWidth = 1.2; cx.stroke();
  }

  // EQ curve
  cx.beginPath();
  for (let px = 0; px <= w; px += 2) {
    const f = F_MIN * Math.pow(F_MAX / F_MIN, px / w);
    const y = yEq(Math.max(-DB_RANGE, Math.min(DB_RANGE, eqCurveDb(f, fs))));
    if (px === 0) cx.moveTo(px, y); else cx.lineTo(px, y);
  }
  cx.strokeStyle = '#3dd6c6'; cx.lineWidth = 2.2; cx.stroke();

  // band handles
  scope.handles = [];
  state.params.eq.bands.forEach((b, i) => {
    const x = xOf(b.freq), y = yEq(b.gain);
    scope.handles.push({ i, x, y });
    cx.beginPath(); cx.arc(x, y, 7, 0, Math.PI * 2);
    cx.fillStyle = b.on && state.params.eq.on ? '#3dd6c6' : '#454d5b';
    cx.fill(); cx.strokeStyle = '#0b0d11'; cx.lineWidth = 2; cx.stroke();
    cx.fillStyle = '#0b0d11'; cx.font = 'bold 9px Segoe UI'; cx.textAlign = 'center';
    cx.fillText(String(i + 1), x, y + 3); cx.textAlign = 'start';
  });
}

function setupScopeInteraction() {
  const cv = scope.cv;
  let active = -1;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r.width, r.height]; };
  const hit = (x, y) => {
    let best = -1, bd = 14 * 14;
    for (const hd of scope.handles) { const d = (hd.x - x) ** 2 + (hd.y - y) ** 2; if (d < bd) { bd = d; best = hd.i; } }
    return best;
  };
  cv.addEventListener('pointerdown', (e) => {
    const [x, y] = pos(e); active = hit(x, y);
    if (active >= 0) cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    const [x, y, w, h] = pos(e);
    if (active < 0) { cv.style.cursor = hit(x, y) >= 0 ? 'grab' : 'default'; return; }
    const b = state.params.eq.bands[active];
    b.freq = Math.min(F_MAX, Math.max(F_MIN, F_MIN * Math.pow(F_MAX / F_MIN, x / w)));
    b.gain = Math.min(18, Math.max(-18, ((h / 2 - y) / ((h / 2) * 0.92)) * DB_RANGE));
    b.gain = Math.round(b.gain * 10) / 10;
    state.preset = null;
    knobs.forEach((k) => k.refresh());
    pushParams();
  });
  const end = (e) => { active = -1; try { cv.releasePointerCapture(e.pointerId); } catch (_) { /* */ } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', (e) => {
    const [x, y] = pos(e); const i = hit(x, y);
    if (i < 0) return;
    e.preventDefault();
    const b = state.params.eq.bands[i];
    b.q = Math.min(8, Math.max(0.3, b.q * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    knobs.forEach((k) => k.refresh());
    pushParams();
  }, { passive: false });
  cv.addEventListener('dblclick', (e) => {
    const [x, y] = pos(e); const i = hit(x, y);
    if (i >= 0) { state.params.eq.bands[i].gain = 0; knobs.forEach((k) => k.refresh()); pushParams(); }
  });
}

function frame() {
  updateMeters();
  updateDucking();
  if (engine.running) drawScope();
  if (engine.recChunks) {
    const s = (performance.now() - engine.recStart) / 1000;
    $('recTime').textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* Wire-up                                                            */
/* ------------------------------------------------------------------ */
async function init() {
  const hadState = loadState();
  scope.cv = $('scope'); scope.cx = scope.cv.getContext('2d');
  buildIOKnobs();
  buildChain();
  setupScopeInteraction();
  if (!hadState || state.migrated) { applyPreset(state.preset && !state.migrated ? state.preset : (state.preset || 'Female – Natural')); }
  fillPresetSelect();
  $('presetSelect').value = state.preset || $('presetSelect').value;

  $('chkMonitor').checked = state.monitor.on;
  $('rngMon').value = state.monitor.vol;
  $('chkNs').checked = state.ns; $('chkAgc').checked = state.agc;

  await enumerate();
  if (!(await navigator.mediaDevices.enumerateDevices()).some((d) => d.label)) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      await enumerate();
    } catch (_) { /* no permission yet – list stays generic */ }
  }

  $('btnPower').addEventListener('click', () => (engine.running ? stopEngine() : startEngine()));
  $('btnBypass').addEventListener('click', () => {
    state.params.bypass = !state.params.bypass;
    $('btnBypass').classList.toggle('on', state.params.bypass);
    pushParams();
  });
  $('presetSelect').addEventListener('change', (e) => { applyPreset(e.target.value); });
  $('btnPresetSave').addEventListener('click', () => {
    const name = (window.prompt('Preset name:', state.preset || 'My voice') || '').trim();
    if (!name) return;
    const u = userPresets(); u[name] = clone(state.params); storeUserPresets(u);
    state.preset = name; fillPresetSelect(); $('presetSelect').value = name;
    $('btnPresetDelete').disabled = false;
  });
  $('btnPresetDelete').addEventListener('click', () => {
    const name = $('presetSelect').value; const u = userPresets();
    if (u[name]) { delete u[name]; storeUserPresets(u); state.preset = null; fillPresetSelect(); }
  });
  $('selIn').addEventListener('change', (e) => { state.dev.in = e.target.value; saveState(); restartEngine(); });
  $('selOut').addEventListener('change', (e) => {
    state.dev.out = e.target.value; saveState(); updateCableStatus(false);
    localStorage.setItem('voicestudio.cableChosen', '1');
    if (engine.ctx && engine.ctx.setSinkId) engine.ctx.setSinkId(state.dev.out === 'default' ? '' : state.dev.out).catch(() => restartEngine());
  });
  $('selMon').addEventListener('change', async (e) => {
    state.dev.mon = e.target.value; saveState();
    if (engine.monEl && engine.monEl.setSinkId) { try { await engine.monEl.setSinkId(state.dev.mon === 'default' ? '' : state.dev.mon); } catch (_) { /* */ } }
  });
  const applyMon = () => {
    state.monitor.on = $('chkMonitor').checked; state.monitor.vol = Number($('rngMon').value);
    if (engine.monGain) engine.monGain.gain.value = state.monitor.on ? state.monitor.vol : 0;
    saveState();
  };
  $('chkMonitor').addEventListener('change', applyMon);
  $('rngMon').addEventListener('input', applyMon);
  $('chkNs').addEventListener('change', (e) => { state.ns = e.target.checked; saveState(); restartEngine(); });
  $('chkAgc').addEventListener('change', (e) => { state.agc = e.target.checked; saveState(); restartEngine(); });
  $('btnRec').addEventListener('click', toggleRecord);
  $('btnHelp').addEventListener('click', () => $('modal').classList.remove('hidden'));
  $('btnModalClose').addEventListener('click', () => $('modal').classList.add('hidden'));
  $('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') $('modal').classList.add('hidden'); });
  navigator.mediaDevices.addEventListener('devicechange', enumerate);
  window.addEventListener('resize', drawScope);

  refreshAll();
  requestAnimationFrame(frame);
}

init();
