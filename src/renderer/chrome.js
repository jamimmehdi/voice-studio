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

  /* compact mode shortcut + quit */
  const scBtn = $('btnShortcut'), scMsg = $('shortcutMsg');
  api.settings.get().then((s) => { if (s && s.shortcutLabel) scBtn.textContent = s.shortcutLabel; }).catch(() => {});
  const keyName = (e) => {
    const c = e.code;
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit[0-9]$/.test(c)) return c.slice(5);
    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(c)) return c;
    const map = { Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=', Comma: ',', Period: '.',
      Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Insert: 'Insert',
      Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down',
      ArrowLeft: 'Left', ArrowRight: 'Right' };
    return map[c] || null;
  };
  let capturing = false;
  const stopCapture = () => { capturing = false; scBtn.classList.remove('capturing'); };
  scBtn.addEventListener('click', () => {
    capturing = true; scBtn.classList.add('capturing'); scBtn.textContent = 'Press the new shortcut…';
    scMsg.textContent = 'Use at least one of Ctrl / Alt / Shift. Press Esc to cancel.';
  });
  window.addEventListener('keydown', async (e) => {
    if (!capturing) return;
    e.preventDefault();
    if (e.key === 'Escape') { stopCapture(); const s = await api.settings.get(); scBtn.textContent = s.shortcutLabel; scMsg.textContent = ''; return; }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    const k = keyName(e);
    const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
    if (!k || !mods.length) { scMsg.textContent = 'Please include Ctrl, Alt or Shift together with a key.'; return; }
    stopCapture();
    const r = await api.settings.setShortcut([...mods, k].join('+'));
    const s = await api.settings.get();
    scBtn.textContent = s.shortcutLabel;
    scMsg.style.color = r.ok ? 'var(--ok)' : 'var(--warn)';
    scMsg.textContent = r.ok ? 'Shortcut saved.' : r.error;
  }, true);
  $('btnOpenCompact').addEventListener('click', () => api.openCompact());
  $('btnQuit').addEventListener('click', () => api.quitApp());

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
