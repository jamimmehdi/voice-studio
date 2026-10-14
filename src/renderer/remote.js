/* Voice Studio – bridge between the engine window and the compact panel / floating icon.
 * The compact windows are separate processes' windows; they send commands here and receive a state snapshot.
 * Everything uses timers (not requestAnimationFrame) so it keeps working while this window is hidden in the tray.
 * Author: Jamim Mehdi */
'use strict';
(function () {
  const api = window.studio;
  if (!api || !api.quick) return;

  const CHIPS = [
    ['Female – Natural', 'Female – Natural'],
    ['Female – Soft / Warm', 'Female – Soft'],
    ['Female – Bright / Young', 'Female – Bright'],
    ['Girl / Child', 'Girl'],
    ['Male – Deep', 'Male – Deep'],
    ['Male – Strong / Very Manly', 'Male – Strong'],
    ['Cartoon / Chipmunk', 'Cartoon'],
    ['Giant / Monster', 'Giant'],
    ['Robot', 'Robot'],
  ].map(([key, label]) => ({ key, label }));

  const fmtSt = (v) => v; // numbers go over the wire; the panel formats them

  function snapshot() {
    const p = state.params;
    const el = music.el;
    const track = music.index >= 0 && music.list[music.index] ? music.list[music.index].name : '';
    const dur = el && isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
    const lvl = engine.running ? Math.max(0, Math.min(1, (DSP.linToDb(disp.in) + 60) / 60)) : 0;
    return {
      running: !!engine.running,
      preset: state.preset || null,
      chips: CHIPS,
      pitch: fmtSt(p.voice.pitch),
      formant: fmtSt(p.voice.formant),
      monitor: !!state.monitor.on,
      bypass: !!p.bypass,
      gate: !!p.exp.on,
      level: Math.round(lvl * 50) / 50,
      stats: $('latency') ? $('latency').textContent : '',
      music: {
        has: !!track,
        title: track,
        playing: !!(el && !el.paused),
        progress: dur ? Math.round((el.currentTime / dur) * 100) / 100 : 0,
      },
    };
  }

  let last = '';
  function push() {
    const s = snapshot();
    const j = JSON.stringify(s);
    if (j !== last) { last = j; api.quick.pushState(s); }
  }
  setInterval(push, 100);

  // the meters / ducking normally ride on requestAnimationFrame, which pauses while the window is hidden
  setInterval(() => {
    if (!document.hidden) return;
    if (typeof updateDucking === 'function') updateDucking();
  }, 50);

  api.quick.onCommand((c) => {
    if (!c || !c.type) return;
    switch (c.type) {
      case 'toggleEngine':
        if (engine.running) stopEngine(); else startEngine();
        break;
      case 'preset':
        if (typeof c.name === 'string') applyPreset(c.name);
        break;
      case 'voice': {
        const v = state.params.voice;
        if (typeof c.pitch === 'number') v.pitch = Math.max(-12, Math.min(12, Math.round(c.pitch * 10) / 10));
        if (typeof c.formant === 'number') v.formant = Math.max(-12, Math.min(12, Math.round(c.formant * 10) / 10));
        v.on = true;
        state.preset = null;
        knobs.forEach((k) => k.refresh());
        switches.forEach((s) => s.refresh());
        if (typeof voiceUI !== 'undefined' && voiceUI) voiceUI.update();
        pushParams();
        break;
      }
      case 'monitor': {
        const chk = $('chkMonitor');
        chk.checked = !chk.checked;
        chk.dispatchEvent(new Event('change'));
        break;
      }
      case 'bypass':
        $('btnBypass').click();
        break;
      case 'gate':
        state.params.exp.on = !state.params.exp.on;
        refreshAll();
        pushParams();
        break;
      case 'music':
        musicToggle();
        break;
      default:
        break;
    }
    push();
  });
})();
