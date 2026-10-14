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

  /* updater: a chip in the header (same look as the design board) */
  const chip = $('btnUpdate');
  let state = 'idle';
  let version = '';
  api.update.onAvailable((info) => {
    state = 'available'; version = info.version;
    chip.textContent = '↑ Update ' + info.version;
    chip.title = info.notes ? info.notes.split('\n')[0] : 'A new version is available';
    chip.disabled = false;
    chip.classList.remove('hidden');
    $('aboutUpdateMsg').textContent = 'Version ' + info.version + ' is available.';
  });
  api.update.onNone(() => { $('aboutUpdateMsg').textContent = 'You are on the latest version.'; });
  api.update.onProgress((p) => { chip.textContent = 'Downloading ' + p.percent + '%'; });
  api.update.onDownloaded(() => { chip.textContent = 'Restarting…'; });
  api.update.onError((m) => {
    if (state === 'downloading') {
      chip.textContent = '↑ Retry update'; chip.disabled = false; state = 'available';
      $('status').textContent = 'Update failed: ' + m;
    }
    $('aboutUpdateMsg').textContent = 'Update check failed: ' + m;
  });
  chip.addEventListener('click', async () => {
    if (state !== 'available') return;
    state = 'downloading'; chip.disabled = true; chip.textContent = 'Starting…';
    const r = await api.update.download();
    if (r && r.ok === false) {
      chip.textContent = '↑ Retry update'; chip.disabled = false; state = 'available';
      $('status').textContent = 'Update failed: ' + (r.error || 'unknown error');
    }
  });
  $('btnCheckUpdate').addEventListener('click', async () => {
    $('aboutUpdateMsg').textContent = 'Checking…';
    const r = await api.update.check();
    if (r && r.ok === false) $('aboutUpdateMsg').textContent = r.error || 'Could not check for updates.';
  });
})();
