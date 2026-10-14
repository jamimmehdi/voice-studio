/*
 * Voice Studio – tray, compact mode window, floating icon, global shortcut.
 * Author: Jamim Mehdi
 *
 * The audio engine lives in the main window's renderer. The compact window and the floating icon
 * are separate always-on-top windows that talk to it through this module:
 *   compact/icon  --quick:cmd-->  main process  --quick:cmd-->  main window (engine)
 *   main window   --quick:state-> main process  --quick:state-> compact/icon
 */
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULTS = { shortcut: 'Control+Alt+V', quickPos: null, iconPos: null, trayHintShown: false };
const QUICK_SIZE = { w: 440, h: 720 };
const ICON_SIZE = 64;

let settings = { ...DEFAULTS };
let tray = null;
let mainWin = null;
let quickWin = null;
let iconWin = null;
let isQuitting = false;
let lastState = null;
let registeredShortcut = null;

/* ------------------------------ settings ------------------------------ */
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch (_) { settings = { ...DEFAULTS }; }
}
function saveSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (_) { /* ignore */ }
}

/* ------------------------------ helpers ------------------------------- */
const alive = (w) => w && !w.isDestroyed();
const iconImage = () => {
  const p = path.join(__dirname, 'build', 'icon.png');
  return fs.existsSync(p) ? nativeImage.createFromPath(p) : nativeImage.createEmpty();
};

function clampToDisplay(x, y, w, h) {
  const d = screen.getDisplayNearestPoint({ x, y }).workArea;
  return {
    x: Math.min(Math.max(x, d.x), d.x + d.width - w),
    y: Math.min(Math.max(y, d.y), d.y + d.height - h),
  };
}

function overlayWindow(width, height, extra = {}) {
  const win = new BrowserWindow({
    width, height,
    show: false,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,        // clicks never steal focus from a game
    backgroundColor: '#0a0d12',
    webPreferences: {
      preload: path.join(__dirname, 'preload-quick.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    ...extra,
  });
  // highest always-on-top level so it stays above borderless / windowed-fullscreen games
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  return win;
}

/* ------------------------------ main window --------------------------- */
function attachMain(win) {
  mainWin = win;
  win.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    hideMainToTray();
  });
  win.on('minimize', () => { if (!isQuitting) hideMainToTray(); });
}

function hideMainToTray() {
  if (!alive(mainWin)) return;
  mainWin.hide();
  if (!settings.trayHintShown && tray && tray.displayBalloon) {
    settings.trayHintShown = true; saveSettings();
    tray.displayBalloon({
      iconType: 'info', title: 'Voice Studio is still running',
      content: `Your voice keeps being processed. Press ${prettyShortcut(settings.shortcut)} for the compact panel, or use the tray icon.`,
    });
  }
}

function showMain() {
  if (!alive(mainWin)) return;
  hideQuick(); hideIcon();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

/* ------------------------------ compact window ------------------------ */
function ensureQuick() {
  if (alive(quickWin)) return quickWin;
  quickWin = overlayWindow(QUICK_SIZE.w, QUICK_SIZE.h);
  quickWin.loadFile(path.join(__dirname, 'src', 'quick', 'quick.html'));
  quickWin.on('moved', () => {
    const [x, y] = quickWin.getPosition();
    settings.quickPos = { x, y }; saveSettings();
  });
  quickWin.on('closed', () => { quickWin = null; });
  quickWin.webContents.on('did-finish-load', () => { if (lastState) quickWin.webContents.send('quick:state', lastState); });
  return quickWin;
}

function showQuick() {
  hideIcon();
  const w = ensureQuick();
  const wa = screen.getPrimaryDisplay().workArea;
  const pos = settings.quickPos
    ? clampToDisplay(settings.quickPos.x, settings.quickPos.y, QUICK_SIZE.w, QUICK_SIZE.h)
    : { x: wa.x + wa.width - QUICK_SIZE.w - 24, y: wa.y + 24 };
  w.setPosition(pos.x, pos.y);
  w.setAlwaysOnTop(true, 'screen-saver');
  w.showInactive();
  if (lastState) w.webContents.send('quick:state', lastState);
}

function hideQuick() { if (alive(quickWin) && quickWin.isVisible()) quickWin.hide(); }
const quickVisible = () => alive(quickWin) && quickWin.isVisible();

/* ------------------------------ floating icon ------------------------- */
function ensureIcon() {
  if (alive(iconWin)) return iconWin;
  iconWin = overlayWindow(ICON_SIZE, ICON_SIZE, { transparent: true, backgroundColor: '#00000000', hasShadow: false });
  iconWin.loadFile(path.join(__dirname, 'src', 'quick', 'icon.html'));
  iconWin.on('closed', () => { iconWin = null; });
  iconWin.webContents.on('did-finish-load', () => { if (lastState) iconWin.webContents.send('quick:state', lastState); });
  return iconWin;
}

function showIcon() {
  hideQuick();
  const w = ensureIcon();
  const wa = screen.getPrimaryDisplay().workArea;
  const pos = settings.iconPos
    ? clampToDisplay(settings.iconPos.x, settings.iconPos.y, ICON_SIZE, ICON_SIZE)
    : { x: wa.x + wa.width - ICON_SIZE - 24, y: wa.y + Math.round(wa.height / 2) };
  w.setPosition(pos.x, pos.y);
  w.setAlwaysOnTop(true, 'screen-saver');
  w.showInactive();
  if (lastState) w.webContents.send('quick:state', lastState);
}
function hideIcon() { if (alive(iconWin) && iconWin.isVisible()) iconWin.hide(); }

/* ------------------------------ shortcut ------------------------------ */
function prettyShortcut(s) { return String(s || '').replace(/Control/g, 'Ctrl').replace(/\+/g, ' + '); }

function toggleCompact() {
  if (quickVisible()) showIcon();       // visible compact -> shrink to the floating icon
  else showQuick();                      // hidden / icon -> bring the compact panel up
}

function registerShortcut(accel) {
  if (registeredShortcut) { try { globalShortcut.unregister(registeredShortcut); } catch (_) { /* */ } registeredShortcut = null; }
  if (!accel) return { ok: true };
  try {
    const ok = globalShortcut.register(accel, toggleCompact);
    if (!ok) return { ok: false, error: 'That shortcut is already used by another program.' };
    registeredShortcut = accel;
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'That is not a valid shortcut.' };
  }
}

/* ------------------------------ tray ---------------------------------- */
function buildTray() {
  const img = iconImage().resize({ width: 32, height: 32 });
  tray = new Tray(img);
  tray.setToolTip('Voice Studio');
  const menu = () => Menu.buildFromTemplate([
    { label: 'Open Voice Studio', click: showMain },
    { label: `Compact panel (${prettyShortcut(settings.shortcut)})`, click: showQuick },
    { label: 'Floating icon', click: showIcon },
    { type: 'separator' },
    { label: 'Quit Voice Studio', click: quit },
  ]);
  tray.setContextMenu(menu());
  tray.on('click', toggleCompact);
  tray.on('double-click', showMain);
  tray.refreshMenu = () => tray.setContextMenu(menu());
}

function quit() {
  isQuitting = true;
  app.quit();
}

/* ------------------------------ IPC ----------------------------------- */
function wireIpc() {
  // commands from compact / icon -> engine window
  ipcMain.on('quick:cmd', (_e, cmd) => {
    if (!cmd || typeof cmd !== 'object') return;
    switch (cmd.type) {
      case 'openStudio': showMain(); return;
      case 'minimizeToIcon': showIcon(); return;
      case 'hideCompact': hideQuick(); return;
      case 'openCompact': showQuick(); return;
      default:
        if (alive(mainWin)) mainWin.webContents.send('quick:cmd', cmd);
    }
  });

  // state from the engine window -> compact / icon
  ipcMain.on('quick:state', (_e, state) => {
    lastState = state;
    if (alive(quickWin) && quickWin.isVisible()) quickWin.webContents.send('quick:state', state);
    if (alive(iconWin) && iconWin.isVisible()) iconWin.webContents.send('quick:state', state);
  });

  // floating icon: manual drag (so a click and a drag can be told apart)
  ipcMain.on('icon:drag', (_e, d) => {
    if (!alive(iconWin) || !d) return;
    const [x, y] = iconWin.getPosition();
    iconWin.setPosition(Math.round(x + d.dx), Math.round(y + d.dy));
  });
  ipcMain.on('icon:dragEnd', () => {
    if (!alive(iconWin)) return;
    const [x, y] = iconWin.getPosition();
    settings.iconPos = { x, y }; saveSettings();
  });

  // settings used by the About panel
  ipcMain.handle('settings:get', () => ({ shortcut: settings.shortcut, shortcutLabel: prettyShortcut(settings.shortcut) }));
  ipcMain.handle('settings:setShortcut', (_e, accel) => {
    const res = registerShortcut(accel);
    if (!res.ok) { registerShortcut(settings.shortcut); return res; }
    settings.shortcut = accel; saveSettings();
    if (tray && tray.refreshMenu) tray.refreshMenu();
    return { ok: true, shortcutLabel: prettyShortcut(accel) };
  });
  ipcMain.handle('app:quit', () => { quit(); });
  ipcMain.handle('app:compact', () => { showQuick(); return true; });
}

/* ------------------------------ lifecycle ----------------------------- */
function init() {
  loadSettings();
  buildTray();
  wireIpc();
  const res = registerShortcut(settings.shortcut);
  if (!res.ok) { settings.shortcut = DEFAULTS.shortcut; registerShortcut(settings.shortcut); }
  app.on('before-quit', () => { isQuitting = true; });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); });
}

module.exports = { init, attachMain, showMain, quit };
