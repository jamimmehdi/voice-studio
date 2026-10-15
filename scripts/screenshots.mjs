// Captures the README / landing-page screenshots from the BUILT app (run `npm run build` first).
// A fake capture device feeds the engine a test tone so the meters are alive.
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { _electron as electron } from 'playwright-core';

const outDir = join(process.cwd(), 'docs', 'assets', 'shots');
mkdirSync(outDir, { recursive: true });
const userData = mkdtempSync(join(tmpdir(), 'voice-studio-shots-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = await electron.launch({
  args: [
    '.',
    `--user-data-dir=${userData}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
  cwd: process.cwd(),
});

const windowMatching = async (part, timeout = 20_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const found = app.windows().find((w) => w.url().includes(part));
    if (found) return found;
    await sleep(50);
  }
  throw new Error('no window matching ' + part);
};
const shot = async (page, name) => {
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log('saved', name);
};

/** A short sine "clip" as a WAV file in memory, for the soundboard pads. */
function wavClip(freq, seconds = 0.4) {
  const rate = 22050;
  const n = Math.round(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 400, (n - i) / 400);
    buf.writeInt16LE(Math.round(8000 * env * Math.sin((2 * Math.PI * freq * i) / rate)), 44 + i * 2);
  }
  return buf;
}

try {
  const splash = await windowMatching('splash.html', 5_000).catch(() => null);
  if (splash) {
    await sleep(1500);
    await shot(splash, 'splash');
  }
  const studio = await windowMatching('studio.html');
  await studio.waitForSelector('[aria-label="Signal chain"]', { timeout: 20_000 });

  // first run: the setup wizard
  const wizard = studio.getByRole('dialog', { name: 'Welcome to Voice Studio' });
  await wizard.waitFor({ timeout: 10_000 });
  await sleep(2500);
  await wizard.getByRole('button', { name: 'Next' }).click();
  await sleep(3000);
  await shot(studio, 'setup');
  await wizard.getByRole('button', { name: 'Skip setup' }).click();
  await wizard.waitFor({ state: 'detached' });

  await studio.getByRole('button', { name: /Start engine/ }).click();
  await sleep(2500);
  await studio
    .getByRole('button', { name: /Female – Natural/ })
    .first()
    .click()
    .catch(() => undefined);
  await sleep(800);
  await shot(studio, 'studio-voice');

  for (const [stage, name] of [
    ['eq', 'studio-eq'],
    ['comp', 'studio-compressor'],
    ['exp', 'studio-gate'],
  ]) {
    await studio.locator(`[data-stage="${stage}"]`).click();
    await sleep(900);
    await shot(studio, name);
  }

  // noise removal (on, Medium) and effects (walkie-talkie)
  await studio.locator('[data-stage="noise"]').click();
  const noise = studio.getByRole('region', { name: 'Noise removal' });
  await noise.getByRole('button', { name: 'Medium' }).click();
  await noise.getByRole('switch', { name: 'Noise removal on/off' }).click();
  await sleep(2500);
  await shot(studio, 'studio-noise');

  await studio.locator('[data-stage="fx"]').click();
  const fx = studio.getByRole('region', { name: 'Effects' });
  await fx.getByRole('button', { name: /Walkie-talkie/ }).click();
  await fx.getByRole('slider', { name: 'Reverb' }).fill('12');
  await sleep(600);
  await shot(studio, 'studio-effects');
  await studio.locator('[data-stage="voice"]').click();

  await studio.getByRole('switch', { name: 'Show music player' }).click();
  await sleep(800);
  await shot(studio, 'studio-music');
  await studio.getByRole('switch', { name: 'Show music player' }).click();

  const openTool = async (item, title) => {
    await studio.getByRole('button', { name: /Tools/ }).click();
    await studio.getByRole('menuitem', { name: new RegExp(item.replace(/[?&']/g, '.')) }).click();
    const dialog = studio.getByRole('dialog', { name: title });
    await dialog.waitFor({ timeout: 5_000 });
    return dialog;
  };
  const closeTool = async () => {
    await studio.keyboard.press('Escape');
    await studio.getByRole('dialog').waitFor({ state: 'detached' });
  };

  // soundboard with a few pads and hotkeys
  let dialog = await openTool('Soundboard & hotkeys', 'Soundboard and hotkeys');
  const clips = [
    ['Air horn.wav', 440],
    ['Sad trombone.wav', 220],
    ['Clap.wav', 880],
    ['Ace.wav', 660],
    ['Doorbell.wav', 523],
    ['Rimshot.wav', 330],
  ];
  await dialog
    .getByLabel('Add sound files')
    .setInputFiles(clips.map(([name, freq]) => ({ name, mimeType: 'audio/wav', buffer: wavClip(freq) })));
  await sleep(1200);
  const keys = ['1', '2', '3', '4'];
  for (let i = 0; i < keys.length; i++) {
    await dialog
      .getByRole('button', { name: `Hotkey for ${clips[i][0].replace('.wav', '').toLowerCase()}` })
      .click();
    await studio.keyboard.press(`Control+Alt+${keys[i]}`);
  }
  const voiceKeys = [
    ['Female – Natural', '5'],
    ['Male – Deep', '6'],
    ['Cartoon', '7'],
  ];
  for (const [name, key] of voiceKeys) {
    await dialog.getByRole('button', { name: `Hotkey for ${name}` }).click();
    await studio.keyboard.press(`Control+Alt+${key}`);
  }
  await sleep(500);
  await shot(studio, 'soundboard');
  await closeTool();

  // app profiles
  dialog = await openTool('App profiles', 'App profiles');
  await dialog.getByRole('switch', { name: 'Auto-switch' }).click();
  for (const exe of ['valorant-win64-shipping.exe', 'discord.exe', 'obs64.exe']) {
    await dialog.getByLabel('Choose a program').setInputFiles({
      name: exe,
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ'),
    });
  }
  await sleep(400);
  const voices = [
    ['valorant-win64-shipping', 'Female – Natural', 'yes'],
    ['discord', '', 'no'],
    ['obs64', 'Broadcast voice (male)', 'no'],
  ];
  for (const [app, voice, start] of voices) {
    if (voice) await dialog.getByLabel(`Voice for ${app}`).selectOption(voice);
    await dialog.getByLabel(`Start engine for ${app}`).selectOption(start);
  }
  await dialog.getByLabel('Default voice').selectOption('Male – Strong / Very Manly');
  await sleep(300);
  await shot(studio, 'profiles');
  await closeTool();

  // voice library with a couple of imported voices
  dialog = await openTool('Voice library', 'Voice library');
  const vsp = JSON.stringify({
    app: 'voice-studio',
    v: 1,
    voices: [
      { name: 'Anime girl', params: { voice: { on: true, pitch: 8, formant: 5.5 } } },
      { name: 'Radio host', params: { voice: { on: true, pitch: -3, formant: -1.5 } } },
      { name: 'Squeaky hero', params: { voice: { on: true, pitch: 10, formant: 7 } } },
    ],
  });
  await dialog.getByLabel('Import voice files').setInputFiles({
    name: 'voices.vsp',
    mimeType: 'application/json',
    buffer: Buffer.from(vsp),
  });
  await sleep(600);
  await shot(studio, 'library');
  await closeTool();

  // phone remote: show a sample address (the real one is on the user's network)
  dialog = await openTool('Phone remote', 'Phone remote');
  await dialog.getByRole('switch', { name: 'Phone remote' }).click();
  await dialog.locator('img[alt^="QR code"]').waitFor({ timeout: 10_000 });
  const sample = 'http://192.168.1.20:7777/?t=Xk9fQ2mPaZ7w';
  const qr = await QRCode.toDataURL(sample, {
    margin: 1,
    width: 300,
    color: { dark: '#0a0d12', light: '#e8ecf3' },
  });
  await studio.evaluate(
    ({ qrUrl, text }) => {
      document.querySelector('img[alt^="QR code"]').src = qrUrl;
      const code = [...document.querySelectorAll('code')].find((c) => c.textContent.startsWith('http'));
      if (code) code.textContent = text;
    },
    { qrUrl: qr, text: sample },
  );
  await sleep(300);
  await shot(studio, 'remote');

  // the phone page itself, in a phone-sized window
  const realUrl = await studio.evaluate(async () => (await window.studio.remote.get()).url);
  await app.evaluate(({ BrowserWindow }, url) => {
    const win = new BrowserWindow({ width: 390, height: 880, show: false });
    void win.loadURL(url);
  }, realUrl);
  const phone = await windowMatching('remote.html=', 1).catch(() => null);
  const phonePage = phone ?? (await windowMatching(':7777', 10_000).catch(() => app.windows().at(-1)));
  await sleep(2000);
  await shot(phonePage, 'phone');
  await closeTool();

  dialog = await openTool("Why can't they hear me?", "Why can't they hear me?");
  await sleep(2500);
  await shot(studio, 'diagnose');
  await closeTool();

  await studio.getByRole('button', { name: 'About Voice Studio' }).click();
  await sleep(500);
  await shot(studio, 'about');
  await studio.keyboard.press('Escape');

  await studio.evaluate(() => window.studio.openCompact());
  const quick = await windowMatching('quick.html');
  await sleep(1200);
  await shot(quick, 'compact');
  await quick.getByRole('button', { name: 'Shrink to a floating icon' }).click();
  const icon = await windowMatching('icon.html');
  await sleep(800);
  await shot(icon, 'icon');
} finally {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
}
