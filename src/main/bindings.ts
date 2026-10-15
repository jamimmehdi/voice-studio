import type { HotkeyBindings } from '@shared/features';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function stringMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw).slice(0, 100)) {
    if (typeof value === 'string' && value.length > 0 && value.length <= 60) out[key] = value;
  }
  return out;
}

/** Never trust the renderer's payload: keep only well-formed string pairs. */
export function sanitiseBindings(raw: unknown): HotkeyBindings {
  const r = isRecord(raw) ? raw : {};
  const quick = isRecord(r.quick) ? r.quick : null;
  return {
    voices: stringMap(r.voices),
    sounds: stringMap(r.sounds),
    quick:
      quick && typeof quick.preset === 'string' && typeof quick.accelerator === 'string'
        ? { preset: quick.preset.slice(0, 80), accelerator: quick.accelerator.slice(0, 60) }
        : null,
  };
}
