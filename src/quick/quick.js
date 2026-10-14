/* Compact mode controller. All audio lives in the main window; this only sends commands and shows state. */
'use strict';
const $ = (id) => document.getElementById(id);
const send = (cmd) => window.quick.send(cmd);
const fmt = (v) => (v < 0 ? '−' : '+') + Math.abs(v).toFixed(1) + ' st';

const dragging = { pitch: false, formant: false };
let chipKey = '';

function renderChips(chips, active) {
  const key = chips.map((c) => c.key).join('|');
  const box = $('chips');
  if (key !== chipKey) {
    chipKey = key;
    box.innerHTML = '';
    chips.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = c.label;
      b.dataset.key = c.key;
      b.addEventListener('click', () => send({ type: 'preset', name: c.key }));
      box.appendChild(b);
    });
  }
  box.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.key === active));
}

function setToggle(btn, on) {
  btn.classList.toggle('on', !!on);
  btn.querySelector('span').textContent = on ? 'On' : 'Off';
}

function render(s) {
  if (!s) return;
  $('liveBtn').classList.toggle('on', !!s.running);
  $('liveText').textContent = s.running ? 'LIVE' : 'OFFLINE';
  $('presetName').textContent = s.preset || 'Custom voice';
  $('stats').textContent = s.running ? (s.stats || '') : 'Click the button to start';
  $('meterFill').style.height = Math.round(Math.max(0, Math.min(1, s.level || 0)) * 100) + '%';
  renderChips(s.chips || [], s.preset);

  if (!dragging.pitch) $('pitch').value = s.pitch;
  if (!dragging.formant) $('formant').value = s.formant;
  $('pitchVal').textContent = fmt(Number($('pitch').value));
  $('formantVal').textContent = fmt(Number($('formant').value));

  setToggle($('tMonitor'), s.monitor);
  setToggle($('tBypass'), s.bypass);
  setToggle($('tGate'), s.gate);

  const m = s.music || {};
  $('trackTitle').textContent = m.title || 'No music loaded';
  $('playBtn').disabled = !m.has || !s.running;
  $('playBtn').textContent = m.playing ? '❚❚' : '▶';
  $('progress').style.width = Math.round((m.progress || 0) * 100) + '%';
}

window.quick.onState(render);

$('liveBtn').addEventListener('click', () => send({ type: 'toggleEngine' }));
$('btnStudio').addEventListener('click', () => send({ type: 'openStudio' }));
$('btnIcon').addEventListener('click', () => send({ type: 'minimizeToIcon' }));
$('btnHide').addEventListener('click', () => send({ type: 'hideCompact' }));
$('tMonitor').addEventListener('click', () => send({ type: 'monitor' }));
$('tBypass').addEventListener('click', () => send({ type: 'bypass' }));
$('tGate').addEventListener('click', () => send({ type: 'gate' }));
$('playBtn').addEventListener('click', () => send({ type: 'music' }));

const slider = (id, key) => {
  const el = $(id);
  el.addEventListener('pointerdown', () => { dragging[key] = true; });
  const stop = () => { dragging[key] = false; };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('input', () => {
    $(id + 'Val').textContent = fmt(Number(el.value));
    send({ type: 'voice', [key]: Number(el.value) });
  });
  el.addEventListener('dblclick', () => { el.value = 0; send({ type: 'voice', [key]: 0 }); });
};
slider('pitch', 'pitch');
slider('formant', 'formant');
