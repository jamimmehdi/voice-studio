import type { AudioDevice } from '@engine/audio/devices';
import { shortDeviceLabel } from '@engine/audio/devices';
import { formatFreq, signed } from '@shared/format';
import type { StudioParams } from '@shared/params';
import type { StageId } from '@shared/stages';

/** Human name of the selected device ("System default" for the default entry). */
export function selectedDeviceLabel(devices: readonly AudioDevice[], id: string): string {
  if (id === 'default') return 'System default';
  return devices.find((d) => d.deviceId === id)?.label ?? 'System default';
}

export interface SummaryContext {
  params: StudioParams;
  inputLabel: string;
  outputLabel: string;
}

/** The small monospace line shown under a stage's name in the signal chain. */
export function stageSummary(stage: StageId, ctx: SummaryContext): string {
  const { params: p } = ctx;
  switch (stage) {
    case 'mic':
      return shortDeviceLabel(ctx.inputLabel);
    case 'hpf':
      return `${Math.round(p.hpf.freq)} Hz · ${p.hpf.slope} dB`;
    case 'exp':
      return `${p.exp.thresh.toFixed(0)} dB · ${p.exp.ratio.toFixed(1)}:1`;
    case 'voice':
      return p.voice.on ? `${signed(p.voice.pitch)} · ${signed(p.voice.formant)} st` : 'off';
    case 'deess':
      return `${formatFreq(p.deess.freq)} · ${p.deess.ratio.toFixed(1)}:1`;
    case 'eq':
      return `${p.eq.bands.filter((b) => b.on).length} bands`;
    case 'comp':
      return `${p.comp.thresh.toFixed(0)} dB · ${p.comp.ratio.toFixed(1)}:1`;
    case 'lim':
      return `ceiling ${p.lim.ceiling.toFixed(1)} dB`;
    case 'out':
      return shortDeviceLabel(ctx.outputLabel);
  }
}
