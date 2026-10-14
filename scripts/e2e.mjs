// End-to-end smoke test: launches the BUILT app (run `npm run build` first) and drives the real UI.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const userData = mkdtempSync(join(tmpdir(), 'voice-studio-e2e-'));
const results = [];
let failed = 0;

async function step(name, fn) {
  try {
    await fn();
    results.push(`  ok    ${name}`);
  } catch (error) {
    failed++;
    results.push(`  FAIL  ${name}\n        ${error instanceof Error ? error.message : error}`);
  }
}

// VS_EXE=<path to Voice Studio.exe> tests an installed build instead of the local one
const exe = process.env.VS_EXE;
const app = exe
  ? await electron.launch({ executablePath: exe, args: [`--user-data-dir=${userData}`] })
  : await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: process.cwd() });

try {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const windowMatching = async (part, timeout = 20_000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const found = app.windows().find((w) => w.url().includes(part));
      if (found) return found;
      await sleep(50);
    }
    throw new Error('no window matching ' + part);
  };

  // the launch screen is the first thing on screen
  const splash = await windowMatching('splash.html', 5_000).catch(() => null);
  const studio = await windowMatching('studio.html');
  await studio.waitForSelector('[aria-label="Signal chain"]', { timeout: 20_000 });
  const errors = [];
  studio.on('pageerror', (e) => errors.push(e.message));

  await step('an animated splash screen is shown first and closes by itself', async () => {
    assert.ok(splash, 'splash window never appeared');
    const started = Date.now();
    while (!splash.isClosed() && Date.now() - started < 8_000) await sleep(100);
    assert.equal(splash.isClosed(), true);
    const visible = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('studio.html'))?.isVisible(),
    );
    assert.equal(visible, true);
  });

  await step('window title and brand', async () => {
    assert.equal(await studio.title(), 'Voice Studio');
    assert.ok(await studio.getByText('Voice Studio').first().isVisible());
  });

  await step('nine chain stages, Voice selected by default', async () => {
    const nodes = studio.locator('[data-stage]');
    assert.equal(await nodes.count(), 9);
    assert.equal(await studio.locator('[data-stage="voice"]').getAttribute('aria-pressed'), 'true');
  });

  await step('native window controls overlay is active and the top bar is fixed', async () => {
    const info = await studio.evaluate(() => ({
      overlay: !!navigator.windowControlsOverlay?.visible,
      position: getComputedStyle(document.querySelector('header')).position,
      height: document.querySelector('header').offsetHeight,
    }));
    assert.equal(info.overlay, true);
    assert.equal(info.position, 'sticky');
    assert.equal(info.height, 65);
  });

  await step('selecting a stage swaps the editor', async () => {
    await studio.locator('[data-stage="comp"]').click();
    assert.ok(await studio.getByRole('region', { name: 'Compressor' }).isVisible());
    await studio.locator('[data-stage="voice"]').click();
    assert.ok(await studio.getByTestId('voice-pad').isVisible());
  });

  await step('dragging the voice pad changes pitch and formant', async () => {
    const pad = studio.getByTestId('voice-pad');
    const box = await pad.boundingBox();
    assert.ok(box);
    await studio.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.25);
    const summary = await studio.locator('[data-stage="voice"]').innerText();
    assert.match(summary, /\+6\.0 · \+6\.0 st/);
  });

  await step('a voice tile applies a preset and the picker follows', async () => {
    await studio.getByRole('button', { name: /Giant/ }).click();
    assert.equal(await studio.getByRole('combobox').first().inputValue(), 'Giant / Monster');
    assert.match(await studio.locator('[data-stage="voice"]').innerText(), /−9\.0 · −6\.0 st/);
  });

  await step('editing shows "Custom (unsaved)"', async () => {
    await studio.locator('[data-stage="hpf"]').click();
    await studio.getByRole('slider', { name: 'CUT-OFF' }).press('ArrowUp');
    assert.equal(await studio.getByRole('combobox').first().inputValue(), '');
  });

  await step('music switch shows and hides the floating dock', async () => {
    assert.equal(await studio.locator('footer[aria-label="Music player"]').count(), 0);
    await studio.getByRole('switch', { name: 'Show music player' }).click();
    assert.ok(await studio.locator('footer[aria-label="Music player"]').isVisible());
    await studio.getByRole('switch', { name: 'Show music player' }).click();
    assert.equal(await studio.locator('footer[aria-label="Music player"]').count(), 0);
  });

  await step('saving a preset through the in-app dialog', async () => {
    await studio.getByRole('button', { name: 'Save', exact: true }).click();
    await studio.getByLabel('Preset name').fill('E2E voice');
    await studio.getByRole('button', { name: 'Save', exact: true }).last().click();
    const options = await studio.getByRole('combobox').first().locator('option').allInnerTexts();
    assert.ok(options.includes('E2E voice'));
  });

  await step('About credits the developer and shows the version', async () => {
    await studio.getByRole('button', { name: 'About Voice Studio' }).click();
    const dialog = studio.getByRole('dialog', { name: 'About Voice Studio' });
    assert.ok(await dialog.getByText('Jamim Mehdi').first().isVisible());
    assert.match(await dialog.innerText(), /v\d+\.\d+\.\d+/);
    await studio.keyboard.press('Escape');
  });

  await step('engine start without a microphone reports an error instead of crashing', async () => {
    await studio.getByRole('button', { name: /Start engine/ }).click();
    await studio.waitForFunction(() => /Error|Running/.test(document.querySelector('[data-testid="status"]')?.textContent ?? ''), null, { timeout: 15_000 });
    assert.ok(await studio.getByRole('button', { name: /Start engine|LIVE/ }).isVisible());
  });

  await step('the bundled worklet runs the full chain on a real tone (voice shift + dynamics)', async () => {
    const result = await studio.evaluate(async () => {
      const source = await window.studio.dspSource();
      const ctx = new AudioContext({ latencyHint: 'interactive' });
      await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
      const node = new AudioWorkletNode(ctx, 'voice-studio', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      const messages = [];
      node.port.onmessage = (e) => messages.push(e.data);
      const osc = ctx.createOscillator();
      osc.frequency.value = 220;
      const gain = ctx.createGain();
      gain.gain.value = 0.3;
      osc.connect(gain).connect(node);
      const analyser = ctx.createAnalyser();
      node.connect(analyser);
      osc.start();
      await ctx.resume();
      await new Promise((r) => setTimeout(r, 1200));
      const meters = messages.filter((m) => m.type === 'meters');
      const last = meters[meters.length - 1];
      const out = { sampleRate: ctx.sampleRate, ready: messages.some((m) => m.type === 'ready'), meters: meters.length, inPeak: last?.inPeak ?? 0, outPeak: last?.outPeak ?? 0, latency: last?.latency ?? 0, dropouts: last?.dropouts ?? -1 };
      osc.stop();
      await ctx.close();
      return out;
    });
    assert.equal(result.ready, true);
    assert.ok(result.meters > 5, 'meters: ' + result.meters);
    assert.ok(result.inPeak > 0.25 && result.inPeak < 0.35, 'inPeak ' + result.inPeak);
    assert.ok(result.outPeak > 0.02, 'outPeak ' + result.outPeak);
    // default chain: 2048-sample voice shifter + limiter look-ahead
    assert.ok(result.latency >= 2048, 'latency ' + result.latency);
  });

  await step('closing the window hides it to the tray and the app keeps running', async () => {
    const hidden = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.close();
      await new Promise((r) => setTimeout(r, 300));
      return { visible: win.isVisible(), destroyed: win.isDestroyed() };
    });
    assert.equal(hidden.visible, false);
    assert.equal(hidden.destroyed, false);
  });

  await step('the compact panel opens (without taking focus) and controls the engine window', async () => {
    await studio.evaluate(() => window.studio.openCompact());
    const quick = await app.waitForEvent('window', { timeout: 10_000 }).catch(() => null);
    const page = quick ?? app.windows().find((w) => w.url().includes('quick.html'));
    assert.ok(page, 'compact window did not open');
    await page.waitForSelector('text=Voice Studio');
    const focusable = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().includes('quick.html'));
      return { visible: w?.isVisible(), alwaysOnTop: w?.isAlwaysOnTop(), focusable: w?.isFocusable() };
    });
    assert.deepEqual(focusable, { visible: true, alwaysOnTop: true, focusable: false });

    await page.getByRole('button', { name: 'Robot' }).click();
    await studio.waitForFunction(() => /−2\.0 · \+0\.0 st/.test(document.querySelector('[data-stage="voice"]')?.textContent ?? ''), null, { timeout: 5_000 });
  });

  await step('the compact panel shrinks to a floating icon and back', async () => {
    const quick = app.windows().find((w) => w.url().includes('quick.html'));
    await quick.getByRole('button', { name: 'Shrink to a floating icon' }).click();
    await new Promise((r) => setTimeout(r, 400));
    const state = await app.evaluate(({ BrowserWindow }) => {
      const find = (part) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes(part));
      return { panel: find('quick.html')?.isVisible(), icon: find('icon.html')?.isVisible() };
    });
    assert.deepEqual(state, { panel: false, icon: true });

    const icon = app.windows().find((w) => w.url().includes('icon.html'));
    await icon.getByRole('button', { name: 'Open the compact panel' }).click();
    await new Promise((r) => setTimeout(r, 400));
    const back = await app.evaluate(({ BrowserWindow }) => {
      const find = (part) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes(part));
      return { panel: find('quick.html')?.isVisible(), icon: find('icon.html')?.isVisible() };
    });
    assert.deepEqual(back, { panel: true, icon: false });
  });

  await step('"Full studio" brings the main window back', async () => {
    const quick = app.windows().find((w) => w.url().includes('quick.html'));
    await quick.getByRole('button', { name: /Full studio/ }).click();
    await new Promise((r) => setTimeout(r, 400));
    const visible = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('studio.html'))?.isVisible(),
    );
    assert.equal(visible, true);
  });

  await step('no uncaught page errors', async () => {
    assert.deepEqual(errors, []);
  });
} finally {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
}

console.log('\nEnd-to-end results');
console.log(results.join('\n'));
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
