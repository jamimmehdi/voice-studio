// Dev tool: drives the installed app's windows through the debug port (--remote-debugging-port=9333).
// Usage: node tools/e2e-compact.js <step>
const http = require('http');
const get = (url) => new Promise((res, rej) => http.get(url, (r) => {
  let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
}).on('error', rej));

async function target(match) {
  const list = await get('http://127.0.0.1:9333/json');
  const t = list.find((x) => x.type === 'page' && x.url.includes(match));
  return t || null;
}
async function open(t) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const o = JSON.parse(m.data); if (o.id && pending.has(o.id)) { pending.get(o.id)(o); pending.delete(o.id); } };
  const ev = (expr) => new Promise((r) => {
    const i = ++id; pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
  }).then((o) => (o.result && o.result.result ? o.result.result.value : JSON.stringify(o)));
  return { ev, close: () => ws.close() };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const step = process.argv[2];
  const list = await get('http://127.0.0.1:9333/json');
  if (step === 'targets') {
    console.log(list.filter((x) => x.type === 'page').map((x) => x.url.split('/').slice(-2).join('/')).join('\n'));
    return;
  }
  if (step === 'compact') {
    const t = await target('quick.html');
    if (!t) { console.log('compact window not open'); return; }
    const w = await open(t);
    console.log('state shown in compact panel:');
    console.log(' live text  :', await w.ev("document.getElementById('liveText').textContent"));
    console.log(' preset     :', await w.ev("document.getElementById('presetName').textContent"));
    console.log(' chips      :', await w.ev("document.querySelectorAll('.chip').length"));
    console.log(' pitch      :', await w.ev("document.getElementById('pitchVal').textContent"));
    console.log(' window size:', await w.ev("innerWidth + 'x' + innerHeight"));
    w.close();
    return;
  }
  if (step === 'chip') { // click the 5th voice chip in the compact panel and read the engine window's state
    const t = await target('quick.html'); const m = await target('renderer/index.html');
    const q = await open(t), main = await open(m);
    const before = await main.ev('state.preset');
    await q.ev("document.querySelectorAll('.chip')[4].click()");
    await sleep(500);
    console.log('preset before:', before, ' -> after click in compact panel:', await main.ev('state.preset'));
    console.log('pitch in engine window:', await main.ev('state.params.voice.pitch'));
    console.log('compact panel now shows:', await q.ev("document.getElementById('presetName').textContent + ' | pitch ' + document.getElementById('pitchVal').textContent"));
    q.close(); main.close();
    return;
  }
  if (step === 'slider') {
    const t = await target('quick.html'); const m = await target('renderer/index.html');
    const q = await open(t), main = await open(m);
    await q.ev("(() => { const s = document.getElementById('pitch'); s.value = 7.5; s.dispatchEvent(new Event('input', {bubbles:true})); })()");
    await sleep(400);
    console.log('engine pitch after compact slider = 7.5 ->', await main.ev('state.params.voice.pitch'), '| preset:', await main.ev('state.preset'));
    q.close(); main.close();
    return;
  }
  if (step === 'toicon') {
    const t = await target('quick.html'); const q = await open(t);
    await q.ev("document.getElementById('btnIcon').click()");
    q.close();
    return;
  }
  if (step === 'iconclick') {
    const t = await target('icon.html');
    if (!t) { console.log('icon window not open'); return; }
    const w = await open(t);
    await w.ev("(() => { const o = document.getElementById('orb'); const mk = (type) => new PointerEvent(type, { bubbles: true, pointerId: 7, screenX: 100, screenY: 100 }); o.dispatchEvent(mk('pointerdown')); o.dispatchEvent(mk('pointerup')); })()");
    w.close();
    return;
  }
  if (step === 'engine') {
    const t = await target('quick.html'); const m = await target('renderer/index.html');
    const q = await open(t), main = await open(m);
    await q.ev("document.getElementById('liveBtn').click()");
    await sleep(2500);
    console.log('engine running (engine window):', await main.ev('engine.running'), '| hidden:', await main.ev('document.hidden'));
    console.log('compact panel shows:', await q.ev("document.getElementById('liveText').textContent + ' | ' + document.getElementById('stats').textContent"));
    q.close(); main.close();
    return;
  }
  console.log('unknown step');
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
