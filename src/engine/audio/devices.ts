export interface AudioDevice {
  deviceId: string;
  label: string;
}

export interface DeviceLists {
  inputs: AudioDevice[];
  outputs: AudioDevice[];
  /** false until a microphone permission has been granted (labels are empty before that) */
  hasLabels: boolean;
}

const VIRTUAL_CABLE = /cable input|vb-audio|voicemeeter|virtual/i;
const CABLE_LABEL = /cable|virtual|voicemeeter/i;

/** True for the "input" side of a virtual cable (where the app should send its audio). */
export function isVirtualCableOutput(label: string): boolean {
  return VIRTUAL_CABLE.test(label);
}

/** True when a selected output looks like a virtual cable of any kind. */
export function looksLikeCable(label: string): boolean {
  return CABLE_LABEL.test(label);
}

export function findVirtualCable(outputs: readonly AudioDevice[]): AudioDevice | undefined {
  // prefer the plain 2-channel "CABLE Input" over "CABLE In 16ch"
  const candidates = outputs.filter((d) => isVirtualCableOutput(d.label));
  return candidates.find((d) => /cable input/i.test(d.label)) ?? candidates[0];
}

/** Splits enumerateDevices() output, hiding the synthetic "default" / "communications" entries. */
export function splitDevices(devices: readonly MediaDeviceInfo[]): DeviceLists {
  const real = (kind: MediaDeviceKind): AudioDevice[] =>
    devices
      .filter((d) => d.kind === kind && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d) => ({ deviceId: d.deviceId, label: d.label || `${kind} ${d.deviceId.slice(0, 6)}` }));
  return {
    inputs: real('audioinput'),
    outputs: real('audiooutput'),
    hasLabels: devices.some((d) => d.label.length > 0),
  };
}

export async function listDevices(): Promise<DeviceLists> {
  try {
    return splitDevices(await navigator.mediaDevices.enumerateDevices());
  } catch {
    return { inputs: [], outputs: [], hasLabels: false };
  }
}

export type DeviceRole = 'microphone' | 'output' | 'headphones';

export interface MissingDevice {
  role: DeviceRole;
  deviceId: string;
}

/**
 * The selected devices that are no longer plugged in. "default" always counts as present, and when
 * the browser has not revealed device names yet (no permission) nothing can be judged.
 */
export function missingDevices(
  selection: { in: string; out: string; mon: string },
  lists: DeviceLists,
): MissingDevice[] {
  if (!lists.hasLabels) return [];
  const has = (list: readonly AudioDevice[], id: string): boolean =>
    id === 'default' || list.some((d) => d.deviceId === id);
  const missing: MissingDevice[] = [];
  if (!has(lists.inputs, selection.in)) missing.push({ role: 'microphone', deviceId: selection.in });
  if (!has(lists.outputs, selection.out)) missing.push({ role: 'output', deviceId: selection.out });
  if (!has(lists.outputs, selection.mon)) missing.push({ role: 'headphones', deviceId: selection.mon });
  return missing;
}

/** Short device name without the trailing "(Vendor)" part, for compact display. */
export function shortDeviceLabel(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, '') || label;
}
