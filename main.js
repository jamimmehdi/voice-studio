/*
 * Voice Studio – main process
 * Author: Jamim Mehdi
 */
const { app, BrowserWindow, session, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { execFile } = require('child_process');
const overlay = require('./overlay');

const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const VBCABLE_PAGE = 'https://vb-audio.com/Cable/';
const VBCABLE_FALLBACK = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip';

app.setAppUserModelId('com.voicestudio.app');

/* ------------------------------------------------------------------ */
/* small helpers                                                      */
/* ------------------------------------------------------------------ */
function httpGet(url, redirects = 6) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'voice-studio' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(httpGet(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      resolve(res);
    }).on('error', reject);
  });
}

async function download(url, dest) {
  const res = await httpGet(url);
  const tmp = dest + '.part';
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    res.pipe(out);
    out.on('finish', () => out.close(resolve));
    out.on('error', reject);
    res.on('error', reject);
  });
  fs.renameSync(tmp, dest);
  return dest;
}

async function getText(url) {
  const res = await httpGet(url);
  const chunks = [];
  for await (const c of res) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

function ps(command, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { windowsHide: true, timeout: 120000, ...opts }, (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message).toString().trim().slice(0, 300)));
        resolve(stdout.toString());
      });
  });
}

/* ------------------------------------------------------------------ */
/* YouTube / link audio (yt-dlp, downloaded on first use)             */
/* ------------------------------------------------------------------ */
async function ensureYtdlp() {
  const dir = path.join(app.getPath('userData'), 'tools');
  fs.mkdirSync(dir, { recursive: true });
  const exe = path.join(dir, 'yt-dlp.exe');
  if (!fs.existsSync(exe)) await download(YTDLP_URL, exe);
  return exe;
}

function runYtdlp(exe, args) {
  return new Promise((resolve, reject) => {
    // the app's own Electron binary doubles as the Node runtime yt-dlp needs for YouTube
    const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
    execFile(exe, args, { env, maxBuffer: 16 * 1024 * 1024, windowsHide: true, timeout: 5 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err) {
        const text = (stderr || err.message).toString();
        const errLines = text.split(/\r?\n/).filter((l) => /ERROR/.test(l));
        let msg;
        if (/confirm your age|age-restricted/i.test(text)) msg = 'This video is age-restricted - YouTube needs a logged-in account for it. Download the mp3 elsewhere and use "Add files".';
        else if (/Private video|members-only/i.test(text)) msg = 'This video is private or members-only.';
        else if (/not a bot/i.test(text)) msg = 'YouTube asked for a bot check. Try again later or use another video.';
        else if (/unavailable|not available/i.test(text)) msg = 'This video is unavailable (removed or blocked in your region).';
        else msg = errLines[errLines.length - 1] || text.split(/\r?\n/).filter(Boolean).slice(-1)[0] || 'Unknown error';
        return reject(new Error(msg.slice(0, 220)));
      }
      resolve(stdout.toString());
    });
  });
}

/* ------------------------------------------------------------------ */
/* VB-CABLE helper                                                    */
/* VB-Audio's licence forbids bundling the package inside another     */
/* installer without their agreement, so we only fetch the official   */
/* package from vb-audio.com when the user clicks, verify its         */
/* signature and start VB-Audio's own, unmodified setup program.      */
/* ------------------------------------------------------------------ */
async function installVbCable() {
  let url = VBCABLE_FALLBACK;
  try {
    const html = await getText(VBCABLE_PAGE);
    const found = [...html.matchAll(/https:\/\/download\.vb-audio\.com\/Download_CABLE\/VBCABLE_Driver_Pack(\d+)\.zip/g)]
      .map((m) => ({ url: m[0], n: Number(m[1]) })).sort((a, b) => b.n - a.n);
    if (found.length) url = found[0].url;
  } catch (_) { /* use the fallback link */ }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vbcable-'));
  const zip = path.join(dir, 'vbcable.zip');
  await download(url, zip);
  const outDir = path.join(dir, 'pkg');
  await ps(`Expand-Archive -LiteralPath '${zip}' -DestinationPath '${outDir}' -Force`);
  const setup = path.join(outDir, 'VBCABLE_Setup_x64.exe');
  if (!fs.existsSync(setup)) throw new Error('Setup file missing in the VB-CABLE package');

  // refuse to run anything that is not validly signed by VB-Audio's author
  const sig = (await ps(`$s = Get-AuthenticodeSignature -LiteralPath '${setup}'; "$($s.Status)|$($s.SignerCertificate.Subject)"`)).trim();
  if (!/^Valid\|.*(BUREL VINCENT|VB-Audio)/i.test(sig)) throw new Error('The downloaded installer signature could not be verified.');

  // starts VB-Audio's own installer (Windows will show its administrator prompt)
  await ps(`Start-Process -FilePath '${setup}' -Verb RunAs`);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Auto-update (GitHub Releases through electron-updater)             */
/* ------------------------------------------------------------------ */
let autoUpdater = null;
function setupUpdater(win) {
  if (!app.isPackaged) return;
  try { ({ autoUpdater } = require('electron-updater')); } catch (_) { return; }
  const send = (ch, payload) => { if (!win.isDestroyed()) win.webContents.send(ch, payload); };
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.on('update-available', (info) => {
    let notes = '';
    if (typeof info.releaseNotes === 'string') notes = info.releaseNotes.replace(/<[^>]+>/g, '').trim();
    else if (Array.isArray(info.releaseNotes)) notes = info.releaseNotes.map((n) => n.note || '').join('\n').replace(/<[^>]+>/g, '').trim();
    send('update:available', { version: info.version, notes: notes.slice(0, 600) });
  });
  autoUpdater.on('update-not-available', () => send('update:none'));
  autoUpdater.on('download-progress', (p) => send('update:progress', { percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', () => {
    send('update:downloaded');
    setTimeout(() => autoUpdater.quitAndInstall(true, true), 1500);
  });
  autoUpdater.on('error', (e) => send('update:error', String(e && e.message ? e.message : e).slice(0, 200)));
  win.webContents.once('did-finish-load', () => {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 2500);
  });
}

/* ------------------------------------------------------------------ */
/* Window                                                             */
/* ------------------------------------------------------------------ */
function createWindow() {
  const iconPath = path.join(__dirname, 'build', 'icon.png');
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1200,
    minHeight: 720,
    backgroundColor: '#0e1014',
    title: 'Voice Studio',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false, // keep audio alive when minimised
    },
  });
  Menu.setApplicationMenu(null);
  // external links open in the default browser, never inside the app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));
  overlay.attachMain(win);
  setupUpdater(win);
  return win;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { overlay.showMain(); });

  app.whenReady().then(() => {
    // only the microphone / audio output selection is needed
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(permission === 'media' || permission === 'speaker-selection');
    });
    session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
      permission === 'media' || permission === 'speaker-selection');

    ipcMain.handle('app:info', () => ({
      version: app.getVersion(), packaged: app.isPackaged, author: 'Jamim Mehdi',
    }));

    ipcMain.handle('dsp:source', () => {
      const dir = path.join(__dirname, 'src', 'dsp');
      return fs.readFileSync(path.join(dir, 'dsp-core.js'), 'utf8') + '\n' +
             fs.readFileSync(path.join(dir, 'processor.js'), 'utf8');
    });

    ipcMain.handle('yt:fetch', async (_e, url) => {
      try {
        if (!/^https:\/\/\S+$/i.test(url)) throw new Error('Please paste a full https:// link');
        const exe = await ensureYtdlp();
        const outDir = path.join(app.getPath('userData'), 'music-cache');
        fs.mkdirSync(outDir, { recursive: true });
        const out = await runYtdlp(exe, ['--js-runtimes', 'node:' + process.execPath, '--no-playlist', '--no-simulate',
          '-f', 'bestaudio[ext=m4a]/bestaudio', '-o', path.join(outDir, '%(id)s.%(ext)s'),
          '--print', 'after_move:%(title)s|||%(filepath)s', url]);
        const line = out.trim().split(/\r?\n/).pop();
        const [title, file] = line.split('|||');
        const data = fs.readFileSync(file);
        return { ok: true, title, ext: path.extname(file).slice(1), data: data.buffer.slice(data.byteOffset, data.byteOffset + data.length) };
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    });

    ipcMain.handle('vbcable:install', async () => {
      try { return await installVbCable(); }
      catch (err) { return { ok: false, error: String(err.message || err) }; }
    });

    ipcMain.handle('update:check', async () => {
      if (!autoUpdater) return { ok: false, error: 'Updates are only available in the installed app.' };
      try { await autoUpdater.checkForUpdates(); return { ok: true }; }
      catch (err) { return { ok: false, error: String(err.message || err).slice(0, 200) }; }
    });
    ipcMain.handle('update:download', async () => {
      if (!autoUpdater) return { ok: false };
      try { await autoUpdater.downloadUpdate(); return { ok: true }; }
      catch (err) { return { ok: false, error: String(err.message || err).slice(0, 200) }; }
    });

    ipcMain.handle('open:external', (_e, url) => {
      if (/^https:\/\/(github\.com|vb-audio\.com|www\.vb-audio\.com|vb-cable\.com)\//i.test(url)) shell.openExternal(url);
    });

    ipcMain.handle('file:save', async (_e, { name, data, filters }) => {
      const res = await dialog.showSaveDialog({ defaultPath: name, filters });
      if (res.canceled || !res.filePath) return null;
      fs.writeFileSync(res.filePath, Buffer.from(data));
      return res.filePath;
    });

    createWindow();
    overlay.init();
    app.on('activate', () => overlay.showMain());
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
