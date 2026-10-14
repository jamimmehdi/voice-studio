/** Small, pure formatting helpers shared by every window. */

const MINUS = '−'; // U+2212, matches the design

/** "+4.5" / "−2.0" */
export function signed(value: number, decimals = 1): string {
  return (value < 0 ? MINUS : '+') + Math.abs(value).toFixed(decimals);
}

/** Compact signed number for tiles: "+4.5", "−4", "0" */
export function shortSigned(value: number): string {
  if (value === 0) return '0';
  return (value < 0 ? MINUS : '+') + String(Math.abs(value));
}

/** 6500 -> "6.5 kHz", 80 -> "80 Hz" */
export function formatFreq(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
}

/** Decibels with a typographic minus: "−14.2". Returns "−∞" for silence. */
export function formatDb(db: number, decimals = 1): string {
  if (!Number.isFinite(db) || db <= -100) return `${MINUS}∞`;
  return db.toFixed(decimals).replace('-', MINUS);
}

/** Level in dB with unit: "0.0 dB" / "−3.5 dB" */
export function formatGain(db: number): string {
  return `${db < 0 ? MINUS : ''}${Math.abs(db).toFixed(1)} dB`;
}

/** 72.4 -> "1:12" */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Electron accelerator -> human label: "Control+Alt+V" -> "Ctrl + Alt + V" */
export function prettyAccelerator(accelerator: string): string {
  return accelerator.replace(/Control/g, 'Ctrl').replace(/\+/g, ' + ');
}

/** "43 ms · 0 dropouts" */
export function formatEngineStats(latencyMs: number, dropouts: number): string {
  return `${latencyMs} ms · ${dropouts} dropout${dropouts === 1 ? '' : 's'}`;
}
