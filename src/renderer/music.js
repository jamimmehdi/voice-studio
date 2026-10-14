/* Voice Studio – music player that plays into the mic path.
 * Loaded before app.js; relies on app.js globals (state, engine, makeKnob, $) at call time. */
'use strict';

const music = { list: [], index: -1, el: null, vol: null, duck: null, seeking: false, ui: {} };

function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Called by startEngine: builds the music bus and plays into the game + monitor. */
function setupMusic(ctx, monitorDest) {
  const el = new Audio();
  el.preload = 'auto';
  el.addEventListener('ended', () => musicNext(true));
  el.addEventListener('timeupdate', musicUpdateUi);
  el.addEventListener('play', musicUpdateUi);
  el.addEventListener('pause', musicUpdateUi);
  el.addEventListener('loadedmetadata', musicUpdateUi);

  const src = ctx.createMediaElementSource(el);
  const vol = ctx.createGain();
  vol.gain.value = state.music.vol / 100;
  const duck = ctx.createGain();
  // gentle safety limiter so loud tracks can't clip the cable
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20;
  lim.attack.value = 0.003; lim.release.value = 0.15;
  const monVol = ctx.createGain();
  monVol.gain.value = 1; // you always hear your music in the monitor device

  src.connect(vol);
  vol.connect(duck); duck.connect(lim); lim.connect(ctx.destination); // -> game / virtual cable
  vol.connect(monVol); monVol.connect(monitorDest);                  // -> your headphones

  Object.assign(music, { el, vol, duck });
  if (music.index >= 0 && music.list[music.index]) el.src = music.list[music.index].url;
  musicUpdateUi();
}

function teardownMusic() {
  if (music.el) { try { music.el.pause(); } catch (_) { /* */ } }
  music.el = null; music.vol = null; music.duck = null;
  musicUpdateUi();
}

function musicApplyVolume() {
  if (music.vol) music.vol.gain.value = state.music.vol / 100;
}

/** Lower the music while the mic is picking up speech. */
function updateDucking() {
  if (!music.duck || !engine.ctx) return;
  const m = engine.meters;
  const speaking = state.music.duck && m && m.inPeak > 0.03 && !state.params.bypass;
  if (speaking) music.duckHold = performance.now() + 450;
  const target = state.music.duck && music.duckHold && performance.now() < music.duckHold ? 0.3 : 1;
  music.duck.gain.setTargetAtTime(target, engine.ctx.currentTime, target < 1 ? 0.04 : 0.25);
}

function musicAddFiles(files) {
  for (const f of files) {
    if (!/^audio\//.test(f.type) && !/\.(mp3|wav|ogg|flac|m4a|aac|opus|webm)$/i.test(f.name)) continue;
    music.list.push({ name: f.name.replace(/\.[^.]+$/, ''), url: URL.createObjectURL(f) });
  }
  if (music.index < 0 && music.list.length) musicSelect(0, false);
  musicRenderList();
}

function musicSelect(i, play) {
  if (i < 0 || i >= music.list.length) return;
  music.index = i;
  if (music.el) {
    music.el.src = music.list[i].url;
    if (play) music.el.play().catch(() => {});
  }
  musicRenderList();
  musicUpdateUi();
}

function musicToggle() {
  if (!music.el) { $('status').textContent = 'Start the engine first to play music'; return; }
  if (music.index < 0) return;
  if (!music.el.src) music.el.src = music.list[music.index].url;
  if (music.el.paused) music.el.play().catch(() => {}); else music.el.pause();
}

function musicNext(auto) {
  if (!music.list.length) return;
  let i = music.index + 1;
  if (i >= music.list.length) { if (auto && !state.music.loop) { musicUpdateUi(); return; } i = 0; }
  musicSelect(i, true);
}
function musicPrev() {
  if (!music.list.length) return;
  if (music.el && music.el.currentTime > 3) { music.el.currentTime = 0; return; }
  musicSelect((music.index - 1 + music.list.length) % music.list.length, true);
}

function musicRenderList() {
  const box = music.ui.list; if (!box) return;
  box.innerHTML = '';
  if (!music.list.length) {
    const e = document.createElement('div'); e.className = 'plist-empty';
    e.textContent = 'No tracks yet – add audio files (mp3, wav, flac, ogg, m4a).';
    box.appendChild(e); return;
  }
  music.list.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'track' + (i === music.index ? ' cur' : '');
    row.textContent = `${i + 1}. ${t.name}`;
    row.title = t.name;
    row.addEventListener('click', () => musicSelect(i, !!music.el));
    const rm = document.createElement('button'); rm.textContent = '×'; rm.className = 'rm';
    rm.addEventListener('click', (ev) => {
      ev.stopPropagation();
      URL.revokeObjectURL(t.url);
      music.list.splice(i, 1);
      if (music.index === i) { music.index = -1; if (music.el) { music.el.pause(); music.el.removeAttribute('src'); } }
      else if (music.index > i) music.index--;
      if (music.index < 0 && music.list.length) musicSelect(Math.min(i, music.list.length - 1), false);
      musicRenderList(); musicUpdateUi();
    });
    row.appendChild(rm);
    box.appendChild(row);
  });
}

function musicUpdateUi() {
  const u = music.ui; if (!u.play) return;
  const el = music.el;
  const playing = !!(el && !el.paused);
  u.play.textContent = playing ? '❚❚' : '▶';
  u.title.textContent = music.index >= 0 && music.list[music.index]
    ? music.list[music.index].name : (el ? 'Nothing loaded' : 'Start the engine to play');
  u.time.textContent = el ? `${fmtTime(el.currentTime)} / ${fmtTime(el.duration)}` : '0:00 / 0:00';
  if (!music.seeking && el && isFinite(el.duration) && el.duration > 0) u.seek.value = (el.currentTime / el.duration) * 1000;
  if (!el) u.seek.value = 0;
  u.play.disabled = !el || music.index < 0;
}

function buildMusic(container) {
  container.innerHTML = '';

  /* cover + title */
  const cover = document.createElement('div');
  cover.className = 'mcover';
  cover.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="18" r="2.4" stroke="#fff" stroke-width="2" fill="none"/><circle cx="17" cy="16" r="2.4" stroke="#fff" stroke-width="2" fill="none"/></svg>';
  const info = document.createElement('div');
  info.className = 'minfo';
  const title = document.createElement('div'); title.className = 'mtitle';
  const sub = document.createElement('div'); sub.className = 'msub';
  sub.textContent = 'Plays through your mic · teammates hear it';
  info.append(title, sub);

  /* transport */
  const transport = document.createElement('div');
  transport.className = 'mtransport';
  const prev = document.createElement('button'); prev.className = 'tbtn'; prev.textContent = '⏮'; prev.setAttribute('aria-label', 'Previous track');
  const play = document.createElement('button'); play.className = 'tbtn big'; play.textContent = '▶'; play.setAttribute('aria-label', 'Play or pause');
  const next = document.createElement('button'); next.className = 'tbtn'; next.textContent = '⏭'; next.setAttribute('aria-label', 'Next track');
  prev.addEventListener('click', musicPrev);
  play.addEventListener('click', musicToggle);
  next.addEventListener('click', () => musicNext(false));
  const seek = document.createElement('input'); seek.type = 'range'; seek.min = 0; seek.max = 1000; seek.value = 0; seek.className = 'seek';
  const time = document.createElement('span'); time.className = 'mtime mono';
  seek.addEventListener('input', () => {
    music.seeking = true;
    if (music.el && isFinite(music.el.duration)) music.el.currentTime = (seek.value / 1000) * music.el.duration;
  });
  seek.addEventListener('change', () => { music.seeking = false; });
  transport.append(prev, play, next, seek, time);

  /* right: volume, duck, loop, playlist */
  const right = document.createElement('div');
  right.className = 'mright';
  const volWrap = document.createElement('label');
  volWrap.className = 'mvol';
  volWrap.append('Vol ');
  const vol = document.createElement('input'); vol.type = 'range'; vol.min = 0; vol.max = 100; vol.value = state.music.vol;
  const volTxt = document.createElement('span'); volTxt.className = 'mono'; volTxt.textContent = state.music.vol + '%';
  vol.addEventListener('input', () => {
    state.music.vol = Number(vol.value); volTxt.textContent = vol.value + '%';
    musicApplyVolume(); saveState();
  });
  volWrap.append(vol, volTxt);

  const mkToggle = (label, key) => {
    const b = document.createElement('button'); b.className = 'togglebtn'; b.textContent = label;
    const draw = () => b.classList.toggle('on', !!state.music[key]);
    b.addEventListener('click', () => { state.music[key] = !state.music[key]; draw(); saveState(); });
    draw();
    return b;
  };
  const duck = mkToggle('Duck when I talk', 'duck');
  const loop = mkToggle('Loop', 'loop');
  const listBtn = document.createElement('button'); listBtn.className = 'btn'; listBtn.textContent = '+ Add files / link';
  right.append(volWrap, duck, loop, listBtn);

  /* playlist popover */
  const pop = document.createElement('div');
  pop.className = 'mpop hidden';
  const bar = document.createElement('div'); bar.className = 'mbar';
  const add = document.createElement('button'); add.className = 'btn'; add.textContent = '+ Add files…';
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'audio/*'; file.multiple = true; file.hidden = true;
  add.addEventListener('click', () => file.click());
  file.addEventListener('change', () => { musicAddFiles(file.files); file.value = ''; });
  const clr = document.createElement('button'); clr.className = 'btn'; clr.textContent = 'Clear';
  clr.addEventListener('click', () => {
    music.list.forEach((t) => URL.revokeObjectURL(t.url));
    music.list = []; music.index = -1;
    if (music.el) { music.el.pause(); music.el.removeAttribute('src'); }
    musicRenderList(); musicUpdateUi();
  });
  const close = document.createElement('button'); close.className = 'btn'; close.textContent = 'Close';
  close.addEventListener('click', () => pop.classList.add('hidden'));
  bar.append(add, clr, file, close);

  const urlRow = document.createElement('div'); urlRow.className = 'mbar';
  const url = document.createElement('input'); url.type = 'text'; url.placeholder = 'Paste YouTube / audio link…'; url.className = 'urlbox';
  const go = document.createElement('button'); go.className = 'btn'; go.textContent = 'Add link';
  const addUrl = async () => {
    const v = url.value.trim(); if (!v) return;
    go.disabled = true; const old = go.textContent; go.textContent = 'Loading…';
    $('status').textContent = 'Fetching audio… (first time also downloads yt-dlp, ~20 MB)';
    const r = await window.studio.ytFetch(v);
    go.disabled = false; go.textContent = old;
    if (!r.ok) { $('status').textContent = 'Link error: ' + r.error; return; }
    const type = r.ext === 'webm' ? 'audio/webm' : r.ext === 'm4a' ? 'audio/mp4' : 'audio/' + r.ext;
    const blob = new Blob([r.data], { type });
    music.list.push({ name: r.title || v, url: URL.createObjectURL(blob) });
    if (music.index < 0) musicSelect(0, false);
    musicRenderList(); url.value = '';
    $('status').textContent = 'Added: ' + (r.title || v);
  };
  go.addEventListener('click', addUrl);
  url.addEventListener('keydown', (e) => { if (e.key === 'Enter') addUrl(); });
  urlRow.append(url, go);

  const list = document.createElement('div'); list.className = 'plist';
  pop.append(bar, urlRow, list);
  listBtn.addEventListener('click', () => pop.classList.toggle('hidden'));

  container.append(cover, info, transport, right, pop);

  Object.assign(music.ui, { list, play, title, time, seek });
  musicRenderList();
  musicUpdateUi();
}
