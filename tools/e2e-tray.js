// Dev tool: close the engine window like the X button does and verify it keeps running from the tray.
const http = require('http');
const get = (url) => new Promise((res, rej) => http.get(url, (r) => {
  let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
}).on('error', rej));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(match) {
  const list = await get('http://127.0.0.1:9333/json');
  const t = list.find((x) => x.type === 'page' && x.url.includes(match));
  if (!t) throw new Error('no window: ' + match);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const o = JSON.parse(m.data); if (o.id && pending.has(o.id)) { pending.get(o.id)(o); pending.delete(o.id); } };
  return {
    ev: (expr) => new Promise((r) => {
      const i = ++id; pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
    }).then((o) => (o.result && o.result.result ? o.result.result.value : JSON.stringify(o))),
    close: () => ws.close(),
  };
}

(async () => {
  const main = await open('renderer/index.html');
  console.log('hidden window: visibility =', await main.ev('document.visibilityState'), '| engine.running =', await main.ev('engine.running'));

  // while hidden: the compact panel must still drive the engine
  const q = await open('quick/quick.html');
  await q.ev("document.querySelectorAll('.chip')[5].click()");           // Male – Strong
  await sleep(500);
  console.log('hidden engine window preset after compact click =', await main.ev('state.preset'), '| pitch =', await main.ev('state.params.voice.pitch'));
  console.log('compact panel shows:', await q.ev("document.getElementById('presetName').textContent + ' | ' + document.getElementById('liveText').textContent"));
  // audio worklet parameters are still pushed while hidden (rAF is paused there)
  await sleep(300);
  console.log('engine context state while hidden =', await main.ev('engine.ctx ? engine.ctx.state : "no ctx"'));
  q.close(); main.close();
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
