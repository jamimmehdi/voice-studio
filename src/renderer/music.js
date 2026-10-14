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

function buildMusic(chain) {
  const card = document.createElement('section');
  card.className = 'card music';
  card.dataset.mod = 'music';
  const head = document.createElement('header');
  head.innerHTML = '<h3>Music player</h3><small>plays through your mic – teammates hear it too</small>';
  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'musicbody';

  const left = document.createElement('div'); left.className = 'mleft';
  const bar = document.createElement('div'); bar.className = 'mbar';
  const add = document.createElement('button'); add.className = 'togglebtn'; add.textContent = '+ Add files…';
  const file = document.createElement('input'); file.type = 'file'; file.accept = 'audio/*'; file.multiple = true; file.hidden = true;
  add.addEventListener('click', () => file.click());
  file.addEventListener('change', () => { musicAddFiles(file.files); file.value = ''; });
  const clr = document.createElement('button'); clr.className = 'togglebtn'; clr.textContent = 'Clear';
  clr.addEventListener('click', () => {
    music.list.forEach((t) => URL.revokeObjectURL(t.url));
    music.list = []; music.index = -1;
    if (music.el) { music.el.pause(); music.el.removeAttribute('src'); }
    musicRenderList(); musicUpdateUi();
  });
  bar.append(add, clr, file);

  const urlRow = document.createElement('div'); urlRow.className = 'mbar';
  const url = document.createElement('input'); url.type = 'text'; url.placeholder = 'Paste YouTube / audio link…'; url.className = 'urlbox';
  const go = document.createElement('button'); go.className = 'togglebtn'; go.textContent = 'Add link';
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
  left.append(bar, urlRow, list);

  const right = document.createElement('div'); right.className = 'mright';
  const title = document.createElement('div'); title.className = 'mtitle';
  const transport = document.createElement('div'); transport.className = 'transport';
  const prev = document.createElement('button'); prev.className = 'tbtn'; prev.textContent = '⏮';
  const play = document.createElement('button'); play.className = 'tbtn big'; play.textContent = '▶';
  const next = document.createElement('button'); next.className = 'tbtn'; next.textContent = '⏭';
  prev.addEventListener('click', musicPrev);
  play.addEventListener('click', musicToggle);
  next.addEventListener('click', () => musicNext(false));
  transport.append(prev, play, next);

  const seekRow = document.createElement('div'); seekRow.className = 'seekrow';
  const seek = document.createElement('input'); seek.type = 'range'; seek.min = 0; seek.max = 1000; seek.value = 0;
  const time = document.createElement('span'); time.className = 'muted';
  seek.addEventListener('input', () => {
    music.seeking = true;
    if (music.el && isFinite(music.el.duration)) music.el.currentTime = (seek.value / 1000) * music.el.duration;
  });
  seek.addEventListener('change', () => { music.seeking = false; });
  seekRow.append(seek, time);

  const opts = document.createElement('div'); opts.className = 'mopts';
  const volKnob = makeKnob({ label: 'MUSIC VOL', min: 0, max: 100, def: 60, step: 1, unit: ' %', dec: 0 },
    () => state.music.vol, (v) => { state.music.vol = v; musicApplyVolume(); });
  const duck = document.createElement('button'); duck.className = 'togglebtn'; duck.textContent = 'Duck when I talk';
  const drawDuck = () => duck.classList.toggle('on', !!state.music.duck);
  duck.addEventListener('click', () => { state.music.duck = !state.music.duck; drawDuck(); saveState(); });
  const loop = document.createElement('button'); loop.className = 'togglebtn'; loop.textContent = 'Loop playlist';
  const drawLoop = () => loop.classList.toggle('on', !!state.music.loop);
  loop.addEventListener('click', () => { state.music.loop = !state.music.loop; drawLoop(); saveState(); });
  drawDuck(); drawLoop();
  switches.push({ el: duck, refresh: drawDuck }, { el: loop, refresh: drawLoop });
  const togs = document.createElement('div'); togs.className = 'minisel'; togs.append(duck, loop);
  opts.append(volKnob, togs);

  right.append(title, transport, seekRow, opts);
  body.append(left, right);
  card.appendChild(body);
  chain.appendChild(card);

  Object.assign(music.ui, { list, play, title, time, seek });
  musicRenderList();
  musicUpdateUi();
}
