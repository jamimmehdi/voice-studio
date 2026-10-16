// Same flow as repro-compact.mjs but with real OS mouse clicks on the compact panel and icon.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const userData = mkdtempSync(join(tmpdir(), 'voice-studio-real-'));
const clicker = join(userData, 'click.ps1');
writeFileSync(
  clicker,
  `param([int]$x,[int]$y)
Add-Type @"
using System; using System.Runtime.InteropServices;
public class M { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f,uint dx,uint dy,uint d,UIntPtr e); }
"@
[M]::SetCursorPos($x,$y) | Out-Null
Start-Sleep -Milliseconds 120
[M]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
Start-Sleep -Milliseconds 60
[M]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
`,
);

const app = await electron.launch({
  args: ['.', `--user-data-dir=${userData}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  cwd: process.cwd(),
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const win = async (part) => {
  for (let i = 0; i < 100; i++) {
    const f = app.windows().find((w) => w.url().includes(part));
    if (f) return f;
    await sleep(100);
  }
  throw new Error('no ' + part);
};
const winState = () =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => `${w.webContents.getURL().split('/').pop()}:${w.isVisible() ? 'V' : '-'}${w.isMinimized() ? 'm' : ''}`).join(' '),
  );

async function clickNativeMinimise() {
  const pt = await app.evaluate(({ BrowserWindow, screen }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('studio.html'));
    const b = w.getBounds();
    return screen.dipToScreenPoint({ x: b.x + b.width - 115, y: b.y + 16 });
  });
  execFileSync('powershell', ['-NoProfile', '-File', clicker, String(pt.x), String(pt.y)]);
  await sleep(900);
}

/** Real mouse click on an element of one of the windows. */
async function realClick(part, selector) {
  const page = await win(part);
  const r = await page.evaluate((sel) => {
    const b = document.querySelector(sel).getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, selector);
  const pt = await app.evaluate(({ BrowserWindow, screen }, { part, r }) => {
    const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes(part));
    const b = w.getContentBounds();
    return screen.dipToScreenPoint({ x: Math.round(b.x + r.x), y: Math.round(b.y + r.y) });
  }, { part, r });
  execFileSync('powershell', ['-NoProfile', '-File', clicker, String(pt.x), String(pt.y)]);
  await sleep(900);
}

const pressed = (studio) =>
  studio.evaluate(() => document.querySelector('button[title="Start / stop the audio engine"]')?.getAttribute('aria-pressed'));

try {
  const studio = await win('studio.html');
  await studio.waitForSelector('[aria-label="Signal chain"]', { timeout: 20000 });
  await sleep(3000);
  await studio.evaluate(() => document.querySelector('button[title="Start / stop the audio engine"]').click());
  await sleep(2500);
  const log = async (label) => console.log(label.padEnd(34), 'engine=' + (await Promise.race([pressed(studio), sleep(2500).then(() => 'FROZEN')])), await winState());

  for (let round = 1; round <= 2; round++) {
    await studio.evaluate(() => window.studio.openCompact());
    await sleep(900);
    await log(`r${round} compact`);
    await realClick('quick.html', 'button[title="Open the full studio"]');
    await log(`r${round} after Full studio click`);
  }
  await studio.evaluate(() => window.studio.openCompact());
  await sleep(900);
  await clickNativeMinimise();
  await log('studio minimised');
  await realClick('quick.html', 'button[aria-label="Shrink to a floating icon"]');
  await log('after shrink click');
  await realClick('icon.html', '[role="button"]');
  await log('after icon click');
  await realClick('quick.html', 'button[title="Open the full studio"]');
  await log('after Full studio click');
  await studio.evaluate(() => window.studio.openCompact());
  await sleep(900);
  await realClick('quick.html', 'button[aria-label="Shrink to a floating icon"]');
  await realClick('icon.html', '[role="button"]');
  const live = await win('quick.html');
  const btn = await live.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).slice(0, 8));
  console.log('panel buttons', btn.join(' | '));
  await realClick('quick.html', 'button[title="Open the full studio"]');
  await log('final Full studio click');
} finally {
  await app.close().catch(() => {});
  rmSync(userData, { recursive: true, force: true });
}
