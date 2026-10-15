/** Types for the user-facing features added in 2.1: profiles, hotkeys, sounds and the voice library. */

export interface ProfileApp {
  /** executable file name, lower case ("valorant-win64-shipping.exe") */
  exe: string;
  /** name shown in the list */
  name: string;
  /** preset to load while this app is in front; null keeps the current voice */
  preset: string | null;
  /** start the engine when the app comes to the front */
  start: boolean;
}

export interface ProfilesState {
  enabled: boolean;
  /** preset to return to when no listed app is in front; null = leave the voice as it is */
  fallback: string | null;
  apps: ProfileApp[];
}

export interface SoundEntry {
  id: string;
  name: string;
}

export interface HotkeysState {
  /** preset name -> accelerator */
  voices: Record<string, string>;
  /** press once for `preset`, press again to go back */
  quick: { preset: string | null; accelerator: string | null };
  /** sound id -> accelerator */
  sounds: Record<string, string>;
  /** show a toast when the voice changes */
  toast: boolean;
}

export interface SoundOptions {
  /** lower the voice while a sound plays */
  duckVoice: boolean;
  /** 0..100 */
  volume: number;
}

/** Everything the main process needs to register global shortcuts. */
export interface HotkeyBindings {
  voices: Record<string, string>;
  quick: { preset: string; accelerator: string } | null;
  sounds: Record<string, string>;
}

export type HotkeyResult = { ok: true } | { ok: false; failed: string[] };

export interface RunningApp {
  exe: string;
  name: string;
}

export function createDefaultProfiles(): ProfilesState {
  return { enabled: false, fallback: null, apps: [] };
}

export function createDefaultHotkeys(): HotkeysState {
  return { voices: {}, quick: { preset: null, accelerator: null }, sounds: {}, toast: true };
}

export function createDefaultSoundOptions(): SoundOptions {
  return { duckVoice: true, volume: 70 };
}

/** The profile (if any) that applies to the app in front. */
export function findProfile(apps: readonly ProfileApp[], exe: string | null): ProfileApp | null {
  if (!exe) return null;
  const wanted = exe.toLowerCase();
  return apps.find((a) => a.exe === wanted) ?? null;
}

/** Friendly name for an executable ("VALORANT-Win64-Shipping.exe" -> "VALORANT-Win64-Shipping"). */
export function appNameFromExe(exe: string): string {
  return exe.replace(/\.exe$/i, '');
}
