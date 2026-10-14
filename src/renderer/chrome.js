/* Voice Studio – app chrome: updater banner, About, VB-CABLE helper. Author: Jamim Mehdi */
'use strict';
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.studio;

  /* version label */
  api.appInfo().then((i) => {
    $('verLabel').textContent = 'v' + i.version;
    $('aboutVer').textContent = 'v' + i.version;
  }).catch(() => {});

  /* external links */
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ext]');
    if (t) { e.preventDefault(); api.openExternal(t.dataset.ext); }
  });

  /* modals */
  const show = (id) => $(id).classList.remove('hidden');
  const hide = (id) => $(id).classList.add('hidden');
  $('btnAbout').addEventListener('click', () => show('aboutModal'));
  $('btnAboutClose').addEventListener('click', () => hide('aboutModal'));
  $('aboutModal').addEventListener('click', (e) => { if (e.target.id === 'aboutModal') hide('aboutModal'); });
  $('btnInstallCable').addEventListener('click', () => { $('cableMsg').textContent = ''; show('cableModal'); });
  $('btnCableClose').addEventListener('click', () => hide('cableModal'));
  $('btnCableCancel').addEventListener('click', () => hide('cableModal'));
  $('btnCableGo').addEventListener('click', async () => {
    const b = $('btnCableGo'); const msg = $('cableMsg');
    b.disabled = true; msg.className = 'small muted'; msg.style.color = '';
    msg.textContent = 'Downloading VB-CABLE from vb-audio.com…';
    const r = await api.installVbCable();
    b.disabled = false;
    if (r.ok) {
      msg.className = 'small'; msg.style.color = 'var(--ok)';
      msg.textContent = 'VB-CABLE installer started. Click “Install Driver”, then restart your PC.';
    } else {
      msg.className = 'small'; msg.style.color = 'var(--warn)';
      msg.textContent = 'Could not start the installer: ' + r.error;
    }
  });

  /* updater */
  const bar = $('updateBar'), text = $('updateText'), btn = $('btnUpdate'), later = $('btnUpdateDismiss');
  let state = 'idle';
  api.update.onAvailable((info) => {
    state = 'available';
    text.textContent = '';
    const strong = document.createElement('b');
    strong.textContent = 'Update available – version ' + info.version;
    text.append(strong);
    if (info.notes) {
      const n = document.createElement('span');
      n.className = 'muted';
      n.textContent = '  ·  ' + info.notes.split('\n')[0].slice(0, 120);
      text.append(n);
    }
    btn.textContent = 'Update now'; btn.disabled = false; later.hidden = false;
    bar.classList.remove('hidden');
    $('aboutUpdateMsg').textContent = 'Version ' + info.version + ' is available.';
  });
  api.update.onNone(() => { $('aboutUpdateMsg').textContent = 'You are on the latest version.'; });
  api.update.onProgress((p) => {
    text.textContent = 'Downloading update… ' + p.percent + '%';
    const pr = document.createElement('span'); pr.className = 'prog';
    const i = document.createElement('i'); i.style.width = p.percent + '%';
    pr.append(i); text.append(pr);
  });
  api.update.onDownloaded(() => { text.textContent = 'Update downloaded – restarting Voice Studio…'; });
  api.update.onError((m) => {
    if (state === 'downloading') {
      text.textContent = 'Update failed: ' + m;
      btn.disabled = false; btn.textContent = 'Retry'; later.hidden = false; state = 'available';
    }
    $('aboutUpdateMsg').textContent = 'Update check failed: ' + m;
  });
  btn.addEventListener('click', async () => {
    state = 'downloading'; btn.disabled = true; later.hidden = true;
    text.textContent = 'Starting download…';
    const r = await api.update.download();
    if (r && r.ok === false) {
      text.textContent = 'Update failed: ' + (r.error || 'unknown error');
      btn.disabled = false; btn.textContent = 'Retry'; later.hidden = false; state = 'available';
    }
  });
  later.addEventListener('click', () => bar.classList.add('hidden'));
  $('btnCheckUpdate').addEventListener('click', async () => {
    $('aboutUpdateMsg').textContent = 'Checking…';
    const r = await api.update.check();
    if (r && r.ok === false) $('aboutUpdateMsg').textContent = r.error || 'Could not check for updates.';
  });
})();
