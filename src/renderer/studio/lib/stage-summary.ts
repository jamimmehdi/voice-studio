import type { AudioDevice } from '@engine/audio/devices';
import { shortDeviceLabel } from '@engine/audio/devices';
import { formatFreq, signed } from '@shared/format';
import type { StudioParams } from '@shared/params';
import { noiseLevelFor } from '@shared/calibration';
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

const whole = (v: number): string => v.toFixed(0).replace('-', '−');

const CHARACTER_LABEL = {
  none: 'clean',
  radio: 'radio',
  megaphone: 'megaphone',
  walkie: 'walkie',
  cave: 'cave',
} as const;

function fxSummary(p: StudioParams): string {
  const parts: string[] = [];
  if (p.fx.character !== 'none') parts.push(CHARACTER_LABEL[p.fx.character]);
  if (p.fx.reverb > 0 && p.fx.character !== 'cave') parts.push(`rev ${Math.round(p.fx.reverb)}%`);
  if (p.fx.echo > 0) parts.push(`echo ${Math.round(p.fx.echo)}%`);
  if (p.fx.chorus > 0) parts.push(`chorus ${Math.round(p.fx.chorus)}%`);
  return parts.length > 0 ? parts.join(' · ') : 'clean';
}

/** The small monospace line shown under a stage's name in the signal chain. */
export function stageSummary(stage: StageId, ctx: SummaryContext): string {
  const { params: p } = ctx;
  switch (stage) {
    case 'mic':
      return shortDeviceLabel(ctx.inputLabel);
    case 'hpf':
      return `${Math.round(p.hpf.freq)} Hz · ${p.hpf.slope} dB`;
    case 'noise':
      return `${noiseLevelFor(p.noise.amount) ?? 'Custom'} · ${Math.round(p.noise.amount)}%`;
    case 'fx':
      return fxSummary(p);
    case 'breath':
      return `clicks ${Math.round(p.breath.clicks)}% · breath ${Math.round(p.breath.breath)}%`;
    case 'exp':
      return `${whole(p.exp.thresh)} dB · ${p.exp.ratio.toFixed(1)}:1`;
    case 'voice':
      return p.voice.on ? `${signed(p.voice.pitch)} · ${signed(p.voice.formant)} st` : 'off';
    case 'deess':
      return `${formatFreq(p.deess.freq)} · ${p.deess.ratio.toFixed(1)}:1`;
    case 'eq':
      return `${p.eq.bands.filter((b) => b.on).length} bands`;
    case 'comp':
      return `${whole(p.comp.thresh)} dB · ${p.comp.ratio.toFixed(1)}:1`;
    case 'lim':
      return `ceiling ${signed(p.lim.ceiling)} dB`;
    case 'out':
      return shortDeviceLabel(ctx.outputLabel);
  }
}
