import { applyUserPreset } from './presets';
import { cloneParams, sanitiseParams, type StudioParams } from './params';

/** The .vsp ("Voice Studio preset") file format: JSON with one or many named voices. */
export const VSP_APP = 'voice-studio';
export const VSP_VERSION = 1;

export interface VspVoice {
  name: string;
  params: StudioParams;
}

export interface VspFile {
  app: typeof VSP_APP;
  v: number;
  voices: VspVoice[];
}

export function exportVsp(voices: Record<string, StudioParams>): string {
  const file: VspFile = {
    app: VSP_APP,
    v: VSP_VERSION,
    voices: Object.entries(voices).map(([name, params]) => ({ name, params: cloneParams(params) })),
  };
  return JSON.stringify(file, null, 2);
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const MAX_VOICES = 200;
const MAX_NAME = 60;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f]/g;

function cleanParams(raw: Record<string, unknown>): StudioParams {
  return applyUserPreset(sanitiseParams(raw));
}

export type VspParseResult = { ok: true; voices: VspVoice[] } | { ok: false; error: string };

/**
 * Parses and sanitises a .vsp file. Unknown keys are dropped (mergeDeep over the defaults) and
 * every voice gets a clean name, so a hand-edited or hostile file can only ever produce valid presets.
 */
export function parseVsp(text: string): VspParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a Voice Studio voice.' };
  }
  if (!isRecord(raw) || raw.app !== VSP_APP || !Array.isArray(raw.voices)) {
    return { ok: false, error: 'This file is not a Voice Studio voice.' };
  }
  const voices: VspVoice[] = [];
  for (const item of raw.voices.slice(0, MAX_VOICES)) {
    if (!isRecord(item) || typeof item.name !== 'string' || !isRecord(item.params)) continue;
    const name = item.name.replace(CONTROL_CHARS, '').trim().slice(0, MAX_NAME);
    if (!name) continue;
    voices.push({ name, params: cleanParams(item.params) });
  }
  if (voices.length === 0) return { ok: false, error: 'This file does not contain any voices.' };
  return { ok: true, voices };
}

/** A community voice as listed in docs/community.json. */
export interface CommunityVoice {
  name: string;
  author: string;
  description: string;
  params: StudioParams;
}

export function parseCommunity(text: string): CommunityVoice[] {
  try {
    const raw: unknown = JSON.parse(text);
    if (!isRecord(raw) || !Array.isArray(raw.voices)) return [];
    const out: CommunityVoice[] = [];
    for (const item of raw.voices.slice(0, MAX_VOICES)) {
      if (!isRecord(item) || typeof item.name !== 'string' || !isRecord(item.params)) continue;
      out.push({
        name: item.name.replace(CONTROL_CHARS, '').slice(0, MAX_NAME),
        author: typeof item.author === 'string' ? item.author.slice(0, 40) : 'community',
        description: typeof item.description === 'string' ? item.description.slice(0, 120) : '',
        params: cleanParams(item.params),
      });
    }
    return out;
  } catch {
    return [];
  }
}
