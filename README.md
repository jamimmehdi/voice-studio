# Voice Studio

Real-time voice changer and vocal-processing studio for Windows — turn your mic into a female, male, cartoon or
robot voice and run it through a full studio chain before it reaches your game or chat app.

**Designed and developed by [Jamim Mehdi](https://github.com/jamimmehdi).**

<p align="center"><img src="build/icon.png" width="120" alt="Voice Studio"></p>

## Features

- **Voice changer** – pitch and formant shifting (phase vocoder with cepstral formant control), three quality / latency modes, optional robot effect.
- **Studio chain** – high-pass filter, downward expander, split-band de-esser, 6-band parametric EQ (draggable curve), compressor, look-ahead brick-wall limiter, input/output gain.
- **Presets** – Female (natural / soft / bright), Girl, Male deep, Male strong, Cartoon, Giant, Robot, Broadcast; save your own.
- **Music player** – plays local files (and links) *through your mic* so teammates hear it, with ducking while you talk.
- **Live spectrum**, level + gain-reduction meters, headphone monitor, WAV recorder.
- **Automatic updates** – checks GitHub Releases on every launch and offers a one-click update.

## Install

1. Download `Voice-Studio-Setup-x.y.z.exe` from the [latest release](https://github.com/jamimmehdi/voice-studio/releases/latest) and run it.
2. Start Voice Studio. If no virtual microphone is found, click **Install virtual microphone (VB-CABLE)** – it fetches the
   official package from vb-audio.com and starts VB-Audio's own installer. Restart your PC afterwards.
3. In Voice Studio set **Output** to `CABLE Input`, click **Start engine**, pick a preset.
4. In your game / Discord / OBS choose **`CABLE Output (VB-Audio Virtual Cable)`** as the microphone.

> Windows SmartScreen may warn about an "unknown publisher" because the installer is not code-signed. Choose **More info → Run anyway**.

## About VB-CABLE

Voice Studio needs a virtual audio driver to appear as a microphone. VB-CABLE is donationware by Vincent Burel / VB-Audio
(<https://vb-audio.com/Cable/>). Its licence does not allow bundling it inside another installer without the author's
agreement, so it is **not** included here – the app only downloads it from the official site on your request.
Please consider [supporting VB-Audio](https://vb-audio.com/Services/support.htm).

## Develop

```bash
npm install
npm start        # run the app
npm test         # DSP unit tests
npm run icon     # regenerate build/icon.* from build/icon.svg
npm run dist     # build the Windows installer into dist/
```

### Releasing

1. Bump `version` in `package.json`.
2. `npm run dist`
3. Create a GitHub release tagged `v<version>` and upload `dist/Voice-Studio-Setup-<version>.exe`, its `.blockmap` and `dist/latest.yml`.
   Installed apps check this release on launch and show *Update available*.

## Credits

- **Jamim Mehdi** – author
- **VB-Audio / Vincent Burel** – VB-CABLE virtual audio cable
- **yt-dlp** – link audio extraction (downloaded on first use)
- **Electron**, **electron-updater**

## Licence

MIT © 2026 Jamim Mehdi
