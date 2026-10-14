import { Knob, type KnobProps } from '../../../ui/Knob';
import type { StudioParams } from '@shared/params';
import { useStudio } from '../../runtime/react';

type KnobModule = 'hpf' | 'exp' | 'deess' | 'comp' | 'lim';

type NumericKeys<M extends KnobModule> = {
  [K in keyof StudioParams[M]]: StudioParams[M][K] extends number ? K : never;
}[keyof StudioParams[M]] &
  string;

interface ModuleKnobProps<M extends KnobModule> extends Omit<
  KnobProps,
  'value' | 'onChange' | 'defaultValue'
> {
  module: M;
  param: NumericKeys<M>;
  def: number;
}

/** A knob bound to one numeric parameter of a processing module in the store. */
export function ModuleKnob<M extends KnobModule>({
  module,
  param,
  def,
  ...rest
}: ModuleKnobProps<M>): React.ReactElement {
  const { value, patch } = useStudio((s) => ({
    value: (s.params[module] as unknown as Record<string, number>)[param] ?? def,
    patch: s.patchModule,
  }));
  return (
    <Knob
      {...rest}
      value={value}
      defaultValue={def}
      onChange={(v) => patch(module, { [param]: v } as unknown as Partial<StudioParams[M]>)}
    />
  );
}
