// End-to-end check of the in-app updater against the installed app (dev tool).
// Usage: node tools/e2e-update.js   (installed app must be started with --remote-debugging-port=9333)
const http = require('http');

const get = (url) => new Promise((res, rej) => http.get(url, (r) => {
  let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
}).on('error', rej));

async function connect() {
  const list = await get('http://127.0.0.1:9333/json');
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const o = JSON.parse(m.data); if (o.id && pending.has(o.id)) { pending.get(o.id)(o); pending.delete(o.id); } };
  const ev = (expr) => new Promise((r) => {
    const i = ++id; pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
  }).then((o) => (o.result && o.result.result ? o.result.result.value : o));
  return { ws, ev };
}

(async () => {
  const mode = process.argv[2] || 'watch';
  const { ws, ev } = await connect();
  console.log('app version label:', await ev("document.getElementById('verLabel').textContent"));
  if (mode === 'watch') {
    for (let i = 0; i < 30; i++) {
      const bar = await ev("(() => { const b = document.getElementById('updateBar'); return b.classList.contains('hidden') ? '' : document.getElementById('updateText').textContent + ' | button: ' + document.getElementById('btnUpdate').textContent; })()");
      if (bar) { console.log('UPDATE BANNER:', bar); break; }
      await new Promise((r) => setTimeout(r, 2000));
      if (i === 29) console.log('no banner after 60 s');
    }
  } else if (mode === 'click') {
    console.log('clicking Update now…');
    await ev("document.getElementById('btnUpdate').click()");
    for (let i = 0; i < 20; i++) {
      console.log(' status:', await ev("document.getElementById('updateText').textContent"));
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  ws.close();
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
