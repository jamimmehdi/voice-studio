// Dev tool: inspects the running installed app through its debug port (--remote-debugging-port=9333).
const http = require('http');
const get = (url) => new Promise((res, rej) => http.get(url, (r) => {
  let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(JSON.parse(d)));
}).on('error', rej));

(async () => {
  const list = await get('http://127.0.0.1:9333/json');
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (m) => {
    const o = JSON.parse(m.data);
    if (o.id && pending.has(o.id)) { pending.get(o.id)(o); pending.delete(o.id); }
    if (o.method === 'Runtime.exceptionThrown') errors.push(o.params.exceptionDetails.text + ' ' + (o.params.exceptionDetails.exception || {}).description);
  };
  const send = (method, params) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable', {});
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.result.value;

  console.log('title        :', await ev('document.title'));
  console.log('version label:', await ev("document.getElementById('verLabel').textContent"));
  console.log('chain nodes  :', await ev("document.querySelectorAll('.node').length"));
  console.log('stage editor :', await ev("document.querySelector('#editor h3') && document.querySelector('#editor h3').textContent"));
  console.log('preload api  :', await ev("typeof window.studio + ' / update=' + typeof window.studio.update"));
  console.log('presets      :', await ev("document.getElementById('presetSelect').options.length"));
  console.log('devices      :', await ev("[...document.getElementById('selOut').options].map(o => o.text).join(' | ')"));
  console.log('cable status :', await ev("document.getElementById('cableStatus').textContent"));
  console.log('selected     :', await ev("document.getElementById('presetSelect').value"));
  console.log('uncaught errs:', errors.length ? errors : 'none');
  ws.close();
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
