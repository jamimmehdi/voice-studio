// Dev tool: verifies the fixed top bar and the window-controls overlay in the running installed app.
const http = require('http');
const get = (u) => new Promise((res, rej) => http.get(u, (r) => {
  let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
}).on('error', rej));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const list = await get('http://127.0.0.1:9333/json');
  const t = list.find((x) => x.url.includes('renderer/index.html'));
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pend = new Map();
  ws.onmessage = (m) => { const o = JSON.parse(m.data); if (pend.has(o.id)) { pend.get(o.id)(o); pend.delete(o.id); } };
  const ev = (expr) => new Promise((r) => {
    const i = ++id; pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
  }).then((o) => (o.result && o.result.result ? o.result.result.value : JSON.stringify(o)));

  console.log('window controls overlay present :', await ev('!!(navigator.windowControlsOverlay && navigator.windowControlsOverlay.visible)'));
  console.log('title bar area  x / width / h   :', await ev(`(() => { const r = navigator.windowControlsOverlay.getTitlebarAreaRect(); return [r.x, r.width, r.height].map(Math.round).join(' / '); })()`));
  console.log('viewport width                  :', await ev('innerWidth'));
  console.log('top bar position / height       :', await ev(`getComputedStyle(document.querySelector('.topbar')).position + ' / ' + document.querySelector('.topbar').offsetHeight + 'px'`));
  console.log('right padding (reserved)        :', await ev(`getComputedStyle(document.querySelector('.topbar')).paddingRight`));
  await ev(`document.querySelector('.app').scrollTop = 400`);
  await sleep(250);
  console.log('after scrolling: topbar top     :', await ev(`Math.round(document.querySelector('.topbar').getBoundingClientRect().top)`), 'px  (scrollTop', await ev(`document.querySelector('.app').scrollTop`), ')');
  console.log('top bar drag region / buttons   :', await ev(`getComputedStyle(document.querySelector('.topbar')).webkitAppRegion + ' / ' + getComputedStyle(document.querySelector('#btnBypass')).webkitAppRegion`));
  console.log('rightmost control right edge    :', await ev(`Math.round(document.querySelector('#btnAbout').getBoundingClientRect().right)`), 'px  (must be <= title bar width)');
  await ev(`document.querySelector('.app').scrollTop = 0`);
  ws.close();
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
