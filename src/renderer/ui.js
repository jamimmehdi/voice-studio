/* Voice Studio – v2 interface: signal-chain strip, stage editors, voice pad, quick fixes, health.
 * Loaded before app.js; relies on app.js globals (state, K, makeKnob, makeSwitch, …) at call time.
 * Author: Jamim Mehdi */
'use strict';

const STAGES = [
  { id: 'mic',   name: 'Mic',        group: 'In' },
  { id: 'hpf',   name: 'High-pass',  group: 'Clean',    mod: 'hpf' },
  { id: 'exp',   name: 'Gate',       group: 'Clean',    mod: 'exp',   gr: 'exp' },
  { id: 'voice', name: 'Voice',      group: 'Voice',    mod: 'voice' },
  { id: 'deess', name: 'De-esser',   group: 'Tone',     mod: 'deess', gr: 'deess' },
  { id: 'eq',    name: 'EQ',         group: 'Tone',     mod: 'eq' },
  { id: 'comp',  name: 'Compressor', group: 'Dynamics', mod: 'comp',  gr: 'comp' },
  { id: 'lim',   name: 'Limiter',    group: 'Dynamics', mod: 'lim',   gr: 'lim' },
  { id: 'out',   name: 'Output',     group: 'Out' },
];

const SHORT_NAMES = {
  'Female – Natural': 'Female', 'Female – Soft / Warm': 'Soft', 'Female – Bright / Young': 'Bright',
  'Girl / Child': 'Girl', 'Male – Deep': 'Male deep', 'Male – Strong / Very Manly': 'Male strong',
  'Cartoon / Chipmunk': 'Cartoon', 'Giant / Monster': 'Giant', 'Robot': 'Robot',
};

const chainRefs = {};
let voiceUI = null;

const mk = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const signed = (v, d = 1) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(d);
const khz = (hz) => (hz >= 1000 ? (hz / 1000).toFixed(1) + ' kHz' : Math.round(hz) + ' Hz');

function deviceLabel(id) {
  const sel = $(id);
  const o = sel && sel.options[sel.selectedIndex];
  return o ? o.text.replace(/\s*\(.*\)\s*$/, '') : '–';
}

function stageValue(id) {
  const p = state.params;
  switch (id) {
    case 'mic': return deviceLabel('selIn');
    case 'hpf': return `${Math.round(p.hpf.freq)} Hz · ${p.hpf.slope} dB`;
    case 'exp': return `${p.exp.thresh.toFixed(0)} dB · ${p.exp.ratio.toFixed(1)}:1`;
    case 'voice': return p.voice.on ? `${signed(p.voice.pitch)} · ${signed(p.voice.formant)} st` : 'off';
    case 'deess': return `${khz(p.deess.freq)} · ${p.deess.ratio.toFixed(1)}:1`;
    case 'eq': return `${p.eq.bands.filter((b) => b.on).length} bands`;
    case 'comp': return `${p.comp.thresh.toFixed(0)} dB · ${p.comp.ratio.toFixed(1)}:1`;
    case 'lim': return `ceiling ${p.lim.ceiling.toFixed(1)} dB`;
    case 'out': return deviceLabel('selOut');
    default: return '';
  }
}

/* ------------------------------------------------------------------ */
/* Signal-chain strip                                                 */
/* ------------------------------------------------------------------ */
function buildChainStrip() {
  const strip = $('chainStrip');
  strip.innerHTML = '';
  STAGES.forEach((st, i) => {
    const wrap = mk('div', 'nodewrap');
    const node = mk('div', 'node',
      '<span class="ntop"><span class="ntag"></span><span class="nsw" role="switch" tabindex="0"></span></span>' +
      '<span class="nname"></span><span class="nval mono"></span><span class="ngr"><i></i></span>');
    node.setAttribute('role', 'button');
    node.tabIndex = 0;
    node.querySelector('.ntag').textContent = st.group;
    node.querySelector('.nname').textContent = st.name;
    const sw = node.querySelector('.nsw');
    if (st.mod) {
      const flip = (e) => {
        e.stopPropagation();
        state.params[st.mod].on = !state.params[st.mod].on;
        refreshAll();
        pushParams();
      };
      sw.addEventListener('click', flip);
      sw.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(e); } });
    } else sw.remove();
    const select = () => { state.stage = st.id; saveState(); renderStage(); updateChain(); };
    node.addEventListener('click', select);
    node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } });
    wrap.appendChild(node);
    if (i < STAGES.length - 1) wrap.appendChild(mk('span', 'narrow', '›'));
    strip.appendChild(wrap);
    chainRefs[st.id] = { node, sw: st.mod ? sw : null, val: node.querySelector('.nval') };
    if (st.gr) grBars[st.gr] = { fill: node.querySelector('.ngr i'), txt: { textContent: '' } };
  });
}

function updateChain() {
  STAGES.forEach((st) => {
    const r = chainRefs[st.id];
    if (!r) return;
    const on = st.mod ? !!state.params[st.mod].on : true;
    r.node.classList.toggle('sel', state.stage === st.id);
    r.node.classList.toggle('off', !on);
    if (r.sw) { r.sw.classList.toggle('on', on); r.sw.setAttribute('aria-checked', on); }
    const v = stageValue(st.id);
    if (r.val.textContent !== v) r.val.textContent = v;
  });
}

/* ------------------------------------------------------------------ */
/* Stage editors                                                      */
/* ------------------------------------------------------------------ */
const STAGE_INFO = {
  mic:   ['Microphone', 'Where your voice comes in. Speak normally: the IN meter should peak around −12 dB.'],
  hpf:   ['High-pass filter', 'Removes rumble, desk bumps and breath plosives below the cut-off.'],
  exp:   ['Gate (downward expander)', 'Quietens the mic between words so room noise and keyboard clicks disappear.'],
  voice: ['Voice changer', 'Drag the dot to move between male, female and cartoon voices.'],
  deess: ['De-esser', 'Softens harsh “S” and “T” sounds, which pitch-shifting tends to exaggerate.'],
  eq:    ['Parametric EQ', 'Six bands. Drag the numbered dots in the Live output graph, or use the knobs.'],
  comp:  ['Compressor', 'Evens out loud and soft parts so teammates hear you at a steady level.'],
  lim:   ['Limiter', 'A brick wall that stops shouting from clipping or blasting your teammates.'],
  out:   ['Output', 'What leaves Voice Studio. Pick CABLE Output as the microphone in your game.'],
};

function pruneWidgets() {
  for (let i = knobs.length - 1; i >= 0; i--) if (!knobs[i].el.isConnected) knobs.splice(i, 1);
  for (let i = switches.length - 1; i >= 0; i--) if (!switches[i].el.isConnected) switches.splice(i, 1);
}

function kgrid(...els) {
  const g = mk('div', 'kgrid');
  els.forEach((e) => e && g.appendChild(e));
  return g;
}

function renderStage() {
  pruneWidgets();
  const ed = $('editor');
  ed.innerHTML = '';
  voiceUI = null;
  const id = state.stage || 'voice';
  const st = STAGES.find((s) => s.id === id) || STAGES[3];
  const [title, sub] = STAGE_INFO[st.id];

  const card = mk('section', 'card stage');
  const head = mk('div', 'sthead');
  const titles = mk('div', 'sttitles');
  titles.append(mk('h3', null, title), mk('p', 'muted', sub));
  head.appendChild(titles);
  const body = mk('div', 'stbody');
  if (st.mod) {
    const sw = makeSwitch(() => state.params[st.mod].on, (v) => { state.params[st.mod].on = v; },
      () => { body.classList.toggle('off', !state.params[st.mod].on); updateChain(); });
    head.appendChild(sw);
    body.classList.toggle('off', !state.params[st.mod].on);
  }
  card.append(head, body);
  ed.appendChild(card);

  const p = () => state.params;
  switch (st.id) {
    case 'mic':
      body.append(kgrid(
        makeKnob({ label: 'INPUT GAIN', min: -24, max: 24, def: 0, step: 0.1, unit: ' dB' }, () => p().inGain, (v) => { p().inGain = v; }),
      ));
      body.appendChild(mk('div', 'note', `Current microphone: <b>${deviceLabel('selIn')}</b>. Change it in the Devices panel.`));
      break;

    case 'hpf':
      body.append(kgrid(
        K('hpf', 'freq', { label: 'CUT-OFF', min: 20, max: 500, def: 80, log: true, unit: ' Hz', dec: 0 }),
        makeSelect('SLOPE', [[12, '12 dB / oct'], [24, '24 dB / oct']], () => p().hpf.slope, (v) => { p().hpf.slope = v; }),
      ));
      break;

    case 'exp':
      body.append(kgrid(
        K('exp', 'thresh', { label: 'THRESHOLD', min: -80, max: -10, def: -58, step: 0.5, unit: ' dB' }),
        K('exp', 'ratio', { label: 'RATIO', min: 1, max: 10, def: 2, step: 0.1, unit: ' :1' }),
        K('exp', 'range', { label: 'RANGE', min: 0, max: 80, def: 18, step: 1, unit: ' dB', dec: 0 }),
        K('exp', 'attack', { label: 'ATTACK', min: 0.1, max: 50, def: 3, log: true, unit: ' ms' }),
        K('exp', 'hold', { label: 'HOLD', min: 0, max: 300, def: 80, step: 1, unit: ' ms', dec: 0 }),
        K('exp', 'release', { label: 'RELEASE', min: 10, max: 1000, def: 200, log: true, unit: ' ms', dec: 0 }),
      ));
      break;

    case 'voice':
      buildVoiceStage(body);
      break;

    case 'deess':
      body.append(kgrid(
        K('deess', 'freq', { label: 'FREQUENCY', min: 2000, max: 12000, def: 6500, log: true, unit: ' Hz' }),
        K('deess', 'q', { label: 'WIDTH', min: 0.4, max: 4, def: 1.2, step: 0.05, unit: '', dec: 2 }),
        K('deess', 'thresh', { label: 'THRESHOLD', min: -60, max: -5, def: -32, step: 0.5, unit: ' dB' }),
        K('deess', 'ratio', { label: 'RATIO', min: 1, max: 10, def: 4, step: 0.1, unit: ' :1' }),
        K('deess', 'range', { label: 'MAX CUT', min: 0, max: 30, def: 12, step: 0.5, unit: ' dB' }),
        makeSelect('MODE', [[0, 'Split-band'], [1, 'Wide-band']], () => p().deess.mode, (v) => { p().deess.mode = v; }),
        makeToggleButton('Listen to the “S” band', () => p().deess.listen, (v) => { p().deess.listen = v; }),
      ));
      break;

    case 'eq': {
      const grid = mk('div', 'eqgrid');
      const names = ['LOW SHELF', 'BAND 2', 'BAND 3', 'BAND 4', 'BAND 5', 'HIGH SHELF'];
      for (let i = 0; i < 6; i++) {
        const b = mk('div', 'eqband');
        const bt = mk('div', 'bt');
        bt.append(names[i]);
        bt.appendChild(makeSwitch(() => p().eq.bands[i].on, (v) => { p().eq.bands[i].on = v; }));
        const bandKnob = (k, spec) => makeKnob(spec, () => p().eq.bands[i][k],
          (v) => { p().eq.bands[i][k] = v; }, () => { state.preset = null; });
        b.append(bt,
          bandKnob('freq', { label: 'FREQ', min: 20, max: 20000, def: [120, 300, 1000, 3000, 6000, 10000][i], log: true, unit: ' Hz' }),
          bandKnob('gain', { label: 'GAIN', min: -18, max: 18, def: 0, step: 0.1, unit: ' dB' }),
          bandKnob('q', { label: 'Q', min: 0.3, max: 8, def: i === 0 || i === 5 ? 0.7 : 1, log: true, unit: '', dec: 2 }));
        grid.appendChild(b);
      }
      body.appendChild(grid);
      break;
    }

    case 'comp':
      body.append(kgrid(
        K('comp', 'thresh', { label: 'THRESHOLD', min: -60, max: 0, def: -20, step: 0.5, unit: ' dB' }),
        K('comp', 'ratio', { label: 'RATIO', min: 1, max: 20, def: 3, log: true, unit: ' :1' }),
        K('comp', 'attack', { label: 'ATTACK', min: 0.1, max: 100, def: 8, log: true, unit: ' ms' }),
        K('comp', 'release', { label: 'RELEASE', min: 10, max: 1000, def: 120, log: true, unit: ' ms', dec: 0 }),
        K('comp', 'knee', { label: 'KNEE', min: 0, max: 24, def: 6, step: 0.5, unit: ' dB' }),
        K('comp', 'makeup', { label: 'MAKE-UP', min: 0, max: 24, def: 3, step: 0.1, unit: ' dB' }),
        K('comp', 'mix', { label: 'MIX', min: 0, max: 100, def: 100, step: 1, unit: ' %', dec: 0 }),
      ));
      break;

    case 'lim':
      body.append(kgrid(
        K('lim', 'ceiling', { label: 'CEILING', min: -12, max: 0, def: -1, step: 0.1, unit: ' dB' }),
        K('lim', 'release', { label: 'RELEASE', min: 5, max: 500, def: 80, log: true, unit: ' ms', dec: 0 }),
      ));
      break;

    case 'out':
      body.append(kgrid(
        makeKnob({ label: 'OUTPUT GAIN', min: -24, max: 24, def: 0, step: 0.1, unit: ' dB' }, () => p().outGain, (v) => { p().outGain = v; }),
      ));
      body.appendChild(mk('div', 'note', `Sending to <b>${deviceLabel('selOut')}</b>. In your game choose <b>CABLE Output</b> as the microphone.`));
      break;

    default:
      break;
  }
}

/* ---- Voice stage: XY pad + readouts + voice tiles ---- */
function buildVoiceStage(body) {
  const v = () => state.params.voice;
  const wrap = mk('div', 'voicewrap');

  const pad = mk('div', 'pad');
  pad.innerHTML =
    '<svg class="padgrid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
    '<line x1="50" y1="0" x2="50" y2="100"/><line x1="0" y1="50" x2="100" y2="50"/>' +
    '<line x1="25" y1="0" x2="25" y2="100" class="f"/><line x1="75" y1="0" x2="75" y2="100" class="f"/>' +
    '<line x1="0" y1="25" x2="100" y2="25" class="f"/><line x1="0" y1="75" x2="100" y2="75" class="f"/>' +
    '<polygon class="zone" points="0,100 0,88 88,0 100,0 100,12 12,100"/></svg>' +
    '<span class="pl bl">← Deeper pitch</span><span class="pl br">Higher pitch →</span>' +
    '<span class="pl tl">↑ Smaller throat</span><span class="pl bc">natural-sounding zone follows the diagonal</span>';
  const pos = (pitch, formant) => ({ x: (pitch + 12) / 24 * 100, y: (12 - formant) / 24 * 100 });
  Object.keys(BUILTIN_PRESETS).forEach((name) => {
    const vp = BUILTIN_PRESETS[name].voice;
    if (!vp || !vp.on || vp.pitch == null) return;
    const q = pos(vp.pitch, vp.formant);
    const m = mk('div', 'mark', '<i></i><span></span>');
    m.querySelector('span').textContent = SHORT_NAMES[name] || name;
    m.style.left = q.x + '%'; m.style.top = q.y + '%';
    pad.appendChild(m);
  });
  const puck = mk('div', 'puck', '<i></i>');
  pad.appendChild(puck);

  const side = mk('div', 'vside');
  const rd = (label) => {
    const box = mk('div', 'readout', `<span>${label}</span><b class="mono"></b>`);
    side.appendChild(box);
    return box.querySelector('b');
  };
  const rPitch = rd('Pitch'), rForm = rd('Formant');

  side.append(
    kgrid(
      K('voice', 'mix', { label: 'EFFECT MIX', min: 0, max: 100, def: 100, step: 1, unit: ' %', dec: 0 }),
    ),
    makeSelect('QUALITY / DELAY', [[512, 'Fast · 11 ms (rough)'], [1024, 'Balanced · 21 ms'], [2048, 'Clean · 43 ms (best)']],
      () => v().quality, (q) => { v().quality = q; }),
    makeToggleButton('Robot voice', () => v().robot, (r) => { v().robot = r; }),
  );

  const tiles = mk('div', 'voices');
  const tileEls = {};
  const names = ['Female – Natural', 'Female – Soft / Warm', 'Female – Bright / Young', 'Girl / Child',
    'Male – Deep', 'Male – Strong / Very Manly', 'Cartoon / Chipmunk', 'Giant / Monster', 'Robot', 'Clean mic (no voice change)'];
  names.forEach((name) => {
    const vp = BUILTIN_PRESETS[name] && BUILTIN_PRESETS[name].voice;
    const t = mk('button', 'vtile');
    t.type = 'button';
    const vals = vp && vp.on ? `${signed(vp.pitch)} / ${signed(vp.formant)}` : 'no change';
    t.innerHTML = '<span class="vn"></span><span class="vv mono"></span>';
    t.querySelector('.vn').textContent = name.replace(' (no voice change)', '');
    t.querySelector('.vv').textContent = vals;
    t.addEventListener('click', () => applyPreset(name));
    tiles.appendChild(t);
    tileEls[name] = t;
  });

  // pad interaction
  let drag = false;
  const move = (e) => {
    const r = pad.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    let pitch = Math.round((nx * 24 - 12) * 10) / 10;
    let formant = Math.round((12 - ny * 24) * 10) / 10;
    if (e.shiftKey) formant = Math.round(pitch * 0.62 * 10) / 10; // snap to the natural diagonal
    state.params.voice.pitch = pitch;
    state.params.voice.formant = formant;
    state.params.voice.on = true;
    state.preset = null;
    knobs.forEach((k) => k.refresh());
    switches.forEach((s) => s.refresh());
    if (voiceUI) voiceUI.update();
    pushParams();
  };
  pad.addEventListener('pointerdown', (e) => {
    drag = true;
    move(e);
    try { pad.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone */ }
  });
  pad.addEventListener('pointermove', (e) => { if (drag) move(e); });
  const end = (e) => { drag = false; try { pad.releasePointerCapture(e.pointerId); } catch (_) { /* */ } };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
  pad.addEventListener('dblclick', () => {
    state.params.voice.pitch = 0; state.params.voice.formant = 0; state.preset = null;
    knobs.forEach((k) => k.refresh()); pushParams();
  });

  const update = () => {
    const q = pos(v().pitch, v().formant);
    puck.style.left = q.x + '%'; puck.style.top = q.y + '%';
    rPitch.textContent = signed(v().pitch) + ' st';
    rForm.textContent = signed(v().formant) + ' st';
    Object.keys(tileEls).forEach((n) => tileEls[n].classList.toggle('active', state.preset === n));
  };
  voiceUI = { update };

  wrap.append(pad, side);
  body.append(wrap, mk('h4', 'minihead', 'Voices'), tiles);
  update();
}

/* ------------------------------------------------------------------ */
/* Quick fixes                                                        */
/* ------------------------------------------------------------------ */
function buildQuickFixes() {
  const box = $('quickFixes');
  box.innerHTML = '';
  const row = (title, sub, get, set, after) => {
    const r = mk('div', 'fixrow');
    const t = mk('div', 'fixtext', '<b></b><span></span>');
    t.querySelector('b').textContent = title;
    t.querySelector('span').textContent = sub;
    r.append(t, makeSwitch(get, set, after));
    box.appendChild(r);
  };
  row('Cut background noise', 'Gate between words', () => state.params.exp.on, (v) => { state.params.exp.on = v; });
  row('Tame harsh S sounds', 'De-esser', () => state.params.deess.on, (v) => { state.params.deess.on = v; });
  row('Even out my volume', 'Compressor', () => state.params.comp.on, (v) => { state.params.comp.on = v; });
  row('Protect from clipping', 'Limiter', () => state.params.lim.on, (v) => { state.params.lim.on = v; });
  row('Warmer tone', 'Bass shelf +3 dB', () => !!state.warm, (v) => {
    const b = state.params.eq.bands[0];
    b.gain = Math.max(-18, Math.min(18, b.gain + (v ? 3 : -3)));
    state.warm = v; state.preset = null;
    knobs.forEach((k) => k.refresh());
  });
}

/* ------------------------------------------------------------------ */
/* Refresh hooks used by app.js                                       */
/* ------------------------------------------------------------------ */
function uiRefresh() {
  updateChain();
  if (voiceUI) voiceUI.update();
  // keep the preset dropdown honest: "Custom" as soon as a control was touched
  const sel = $('presetSelect');
  if (sel && ((!state.preset && sel.value !== '') || (state.preset && sel.value === ''))) fillPresetSelect();
}

const healthCache = {};
function setText(id, text) {
  if (healthCache[id] === text) return;
  healthCache[id] = text;
  const e = $(id);
  if (e) e.textContent = text;
}

let uiTick = 0;
function uiMeters() {
  if (++uiTick % 20 === 0) updateChain(); // picks up device-name changes
  const q = state.params.voice.quality;
  setText('hQual', { 512: 'Fast', 1024: 'Balanced', 2048: 'Clean' }[q] + ' · ' + q);
  if (engine.running && engine.ctx) {
    const ms = Math.round((engine.latency / engine.ctx.sampleRate + engine.ctx.baseLatency + (engine.ctx.outputLatency || 0)) * 1000);
    setText('hLat', ms + ' ms');
    setText('hDrop', String(engine.dropouts || 0));
    setText('hRate', (engine.ctx.sampleRate / 1000).toFixed(1) + ' kHz');
    const d = $('hDrop');
    if (d) d.classList.toggle('bad', (engine.dropouts || 0) > 0);
  } else {
    setText('hLat', '–'); setText('hDrop', '–'); setText('hRate', '–');
  }
}

function buildStudio() {
  if (!state.stage) state.stage = 'voice';
  buildChainStrip();
  buildQuickFixes();
  renderStage();
  buildMusic($('musicDock'));
  updateChain();
}
