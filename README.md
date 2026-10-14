# Voice Studio

Real-time voice changer and vocal-processing studio for Windows — turn your mic into a female, male, cartoon or
robot voice and run it through a full studio chain before it reaches your game or chat app.

**Designed and developed by [Jamim Mehdi](https://github.com/jamimmehdi).**

<p align="center"><img src="build/icon.png" width="120" alt="Voice Studio"></p>

## Features

- **Voice changer** – pitch and formant shifting (phase vocoder with cepstral formant control), three quality / latency modes, robot effect, a two-dimensional voice pad.
- **Studio chain** – high-pass filter, downward expander (gate), split-band de-esser, 6-band parametric EQ (draggable curve), compressor, look-ahead brick-wall limiter, input / output gain.
- **Presets** – Female (natural / soft / bright), Girl, Male deep / strong, Cartoon, Giant, Robot, Broadcast; save your own.
- **Music player** – plays local files and links *through your mic* so teammates hear it, with ducking while you talk.
- **Compact mode** – tray icon, global shortcut (default `Ctrl+Alt+V`), a small always-on-top panel that never steals focus from a game, and a draggable floating icon.
- **Automatic updates** from GitHub Releases, **WAV recorder**, live spectrum and level meters.

## Install

1. Download `Voice-Studio-Setup-x.y.z.exe` from the [latest release](https://github.com/jamimmehdi/voice-studio/releases/latest) and run it.
2. If no virtual microphone is found, click **Install virtual microphone (VB-CABLE)** in the Devices panel – it fetches the
   official package from vb-audio.com and starts VB-Audio's own installer. Restart your PC afterwards.
3. Set **Send to game / chat** to `CABLE Input`, click **Start engine**, pick a voice.
4. In your game / Discord / OBS choose **`CABLE Output (VB-Audio Virtual Cable)`** as the microphone.

> Windows SmartScreen may warn about an "unknown publisher" because the installer is not code-signed. Choose **More info → Run anyway**.

VB-CABLE is donationware by VB-Audio (<https://vb-audio.com/Cable/>). Its licence does not allow bundling it inside
another installer, so it is **not** included – the app only downloads it from the official site on request.

## Architecture

TypeScript (strict) + React 19 + Zustand, built with `electron-vite`. Layers depend only downwards:

```
src/
  shared/      pure domain code used by every process: parameters, presets, persisted-state migration,
               IPC contract, protocols, formatting, stage definitions
  engine/      the audio engine – no React, no Electron
    dsp/         biquad, FFT, pitch shifter, expander, de-esser, compressor, limiter, VoiceChain
    worklet/     AudioWorklet processor (ProcessorCore is framework-free and unit tested)
    audio/       AudioEngine (Web Audio graph), MusicBus, MusicPlayer, Playlist, ducking, devices, WAV, meters
  main/        Electron main process, one small injectable module per concern
               (settings, shortcut, tray, overlay controller, relay, updater, yt-dlp, VB-CABLE, windows, IPC)
  preload/     contextBridge APIs (typed by shared/ipc)
  renderer/
    ui/          design-system primitives (Knob, Switch, BarSlider, Modal, …) with CSS Modules
    lib/         pure UI maths (knob, voice pad, scope)
    studio/      the main window: store, controller (application service), remote bridge, components
    quick/       compact panel      icon/   floating icon
tests/         engine · main · shared · renderer (jsdom + Testing Library)
scripts/       worklet bundler, end-to-end test
```

Key decisions:

- **The DSP is plain TypeScript with no browser dependencies**, so it runs in the AudioWorklet and in Node unit tests alike.
- **One store per window, one controller per window.** Components never talk to Web Audio or IPC directly.
- **Meters bypass React**: a timer-driven `MeterHub` writes straight to the DOM, so 30 fps level updates cause no re-renders (and keep running while the window is hidden in the tray).
- **Main-process services take their dependencies as constructor arguments** (file I/O, Electron globals, downloaders), which is why they are unit tested without Electron.
- The compact panel and floating icon are separate windows that **relay commands to the engine window** through the main process.

## Develop

```bash
npm install
npm run dev          # build the worklet, then run electron-vite with HMR
npm run typecheck    # tsc for main/preload/shared and for renderer/engine
npm run lint
npm test             # 360+ unit and component tests
npm run test:coverage
npm run build        # typecheck + worklet + electron-vite build  -> out/
npm run test:e2e     # launches the built app (run `npm run build` first)
npm run dist         # Windows installer -> dist/
```

### Releasing

1. Bump `version` in `package.json`.
2. `npm run dist`
3. Create a GitHub release tagged `v<version>` and upload `dist/Voice-Studio-Setup-<version>.exe`, its `.blockmap`
   and `dist/latest.yml`. Installed apps check this release on launch and show **↑ Update**.

## Credits

- **Jamim Mehdi** – author
- **VB-Audio / Vincent Burel** – VB-CABLE virtual audio cable
- **yt-dlp** – link audio extraction (downloaded on first use)
- **Plus Jakarta Sans**, **JetBrains Mono** – typefaces (SIL Open Font License)
- **Electron**, **React**, **Zustand**, **electron-updater**

## Licence

MIT © 2026 Jamim Mehdi
