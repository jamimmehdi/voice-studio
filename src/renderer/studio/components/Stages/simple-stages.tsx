import { STAGE_INFO } from '@shared/stages';
import { Knob } from '../../../ui/Knob';
import { SelectField } from '../../../ui/SelectField';
import { ToggleButton } from '../../../ui/ToggleButton';
import { selectedDeviceLabel } from '../../lib/stage-summary';
import { useController, useStudio } from '../../runtime/react';
import { ModuleKnob } from './ModuleKnob';
import { StageCard } from './StageCard';
import styles from './KnobGrid.module.css';

/* The simple "a few knobs" stages. Each is a small, separate component. */

export function MicStage(): React.ReactElement {
  const { inGain, setGain, ns, agc, devices, dev } = useStudio((s) => ({
    inGain: s.params.inGain,
    setGain: s.setGain,
    ns: s.ns,
    agc: s.agc,
    devices: s.devices,
    dev: s.dev,
  }));
  const controller = useController();
  const info = STAGE_INFO.mic;
  return (
    <StageCard title={info.title} description={info.description}>
      <div className={styles.grid}>
        <Knob
          label="INPUT GAIN"
          min={-24}
          max={24}
          step={0.1}
          unit=" dB"
          value={inGain}
          defaultValue={0}
          onChange={(v) => setGain('inGain', v)}
        />
      </div>
      <div className={styles.note}>
        Current microphone: <b>{selectedDeviceLabel(devices.inputs, dev.in)}</b>. Change it in the Devices
        panel.
      </div>
      <div className={styles.options}>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={ns}
            onChange={(e) => void controller.setNoiseSuppression(e.target.checked)}
          />
          Windows noise suppression
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={agc}
            onChange={(e) => void controller.setAutoGain(e.target.checked)}
          />
          Windows auto-gain
        </label>
      </div>
    </StageCard>
  );
}

export function HpfStage(): React.ReactElement {
  const slope = useStudio((s) => s.params.hpf.slope);
  const patchModule = useStudio((s) => s.patchModule);
  const info = STAGE_INFO.hpf;
  return (
    <StageCard title={info.title} description={info.description} module="hpf">
      <div className={styles.grid}>
        <ModuleKnob
          module="hpf"
          param="freq"
          label="CUT-OFF"
          min={20}
          max={500}
          def={80}
          log
          unit=" Hz"
          dec={0}
        />
        <SelectField
          label="SLOPE"
          value={slope}
          options={[
            { value: 12, label: '12 dB / oct' },
            { value: 24, label: '24 dB / oct' },
          ]}
          onChange={(v) => patchModule('hpf', { slope: v })}
        />
      </div>
    </StageCard>
  );
}

export function GateStage(): React.ReactElement {
  const info = STAGE_INFO.exp;
  return (
    <StageCard title={info.title} description={info.description} module="exp">
      <div className={styles.grid}>
        <ModuleKnob
          module="exp"
          param="thresh"
          label="THRESHOLD"
          min={-80}
          max={-10}
          step={0.5}
          def={-58}
          unit=" dB"
        />
        <ModuleKnob module="exp" param="ratio" label="RATIO" min={1} max={10} step={0.1} def={2} unit=" :1" />
        <ModuleKnob
          module="exp"
          param="range"
          label="RANGE"
          min={0}
          max={80}
          step={1}
          def={18}
          unit=" dB"
          dec={0}
        />
        <ModuleKnob module="exp" param="attack" label="ATTACK" min={0.1} max={50} def={3} log unit=" ms" />
        <ModuleKnob
          module="exp"
          param="hold"
          label="HOLD"
          min={0}
          max={300}
          step={1}
          def={80}
          unit=" ms"
          dec={0}
        />
        <ModuleKnob
          module="exp"
          param="release"
          label="RELEASE"
          min={10}
          max={1000}
          def={200}
          log
          unit=" ms"
          dec={0}
        />
      </div>
    </StageCard>
  );
}

export function DeEsserStage(): React.ReactElement {
  const { mode, listen, patchModule } = useStudio((s) => ({
    mode: s.params.deess.mode,
    listen: s.params.deess.listen,
    patchModule: s.patchModule,
  }));
  const info = STAGE_INFO.deess;
  return (
    <StageCard title={info.title} description={info.description} module="deess">
      <div className={styles.grid}>
        <ModuleKnob
          module="deess"
          param="freq"
          label="FREQUENCY"
          min={2000}
          max={12000}
          def={6500}
          log
          unit=" Hz"
        />
        <ModuleKnob
          module="deess"
          param="q"
          label="WIDTH"
          min={0.4}
          max={4}
          step={0.05}
          def={1.2}
          unit=""
          dec={2}
        />
        <ModuleKnob
          module="deess"
          param="thresh"
          label="THRESHOLD"
          min={-60}
          max={-5}
          step={0.5}
          def={-32}
          unit=" dB"
        />
        <ModuleKnob
          module="deess"
          param="ratio"
          label="RATIO"
          min={1}
          max={10}
          step={0.1}
          def={4}
          unit=" :1"
        />
        <ModuleKnob
          module="deess"
          param="range"
          label="MAX CUT"
          min={0}
          max={30}
          step={0.5}
          def={12}
          unit=" dB"
        />
        <SelectField
          label="MODE"
          value={mode}
          options={[
            { value: 0, label: 'Split-band' },
            { value: 1, label: 'Wide-band' },
          ]}
          onChange={(v) => patchModule('deess', { mode: v === 1 ? 1 : 0 })}
        />
        <ToggleButton pressed={listen} onChange={(v) => patchModule('deess', { listen: v })}>
          Listen to the “S” band
        </ToggleButton>
      </div>
    </StageCard>
  );
}

export function CompressorStage(): React.ReactElement {
  const info = STAGE_INFO.comp;
  return (
    <StageCard title={info.title} description={info.description} module="comp">
      <div className={styles.grid}>
        <ModuleKnob
          module="comp"
          param="thresh"
          label="THRESHOLD"
          min={-60}
          max={0}
          step={0.5}
          def={-20}
          unit=" dB"
        />
        <ModuleKnob module="comp" param="ratio" label="RATIO" min={1} max={20} def={3} log unit=" :1" />
        <ModuleKnob module="comp" param="attack" label="ATTACK" min={0.1} max={100} def={8} log unit=" ms" />
        <ModuleKnob
          module="comp"
          param="release"
          label="RELEASE"
          min={10}
          max={1000}
          def={120}
          log
          unit=" ms"
          dec={0}
        />
        <ModuleKnob module="comp" param="knee" label="KNEE" min={0} max={24} step={0.5} def={6} unit=" dB" />
        <ModuleKnob
          module="comp"
          param="makeup"
          label="MAKE-UP"
          min={0}
          max={24}
          step={0.1}
          def={3}
          unit=" dB"
        />
        <ModuleKnob
          module="comp"
          param="mix"
          label="MIX"
          min={0}
          max={100}
          step={1}
          def={100}
          unit=" %"
          dec={0}
        />
      </div>
    </StageCard>
  );
}

export function LimiterStage(): React.ReactElement {
  const info = STAGE_INFO.lim;
  return (
    <StageCard title={info.title} description={info.description} module="lim">
      <div className={styles.grid}>
        <ModuleKnob
          module="lim"
          param="ceiling"
          label="CEILING"
          min={-12}
          max={0}
          step={0.1}
          def={-1}
          unit=" dB"
        />
        <ModuleKnob
          module="lim"
          param="release"
          label="RELEASE"
          min={5}
          max={500}
          def={80}
          log
          unit=" ms"
          dec={0}
        />
      </div>
    </StageCard>
  );
}

export function OutputStage(): React.ReactElement {
  const { outGain, setGain, devices, dev } = useStudio((s) => ({
    outGain: s.params.outGain,
    setGain: s.setGain,
    devices: s.devices,
    dev: s.dev,
  }));
  const info = STAGE_INFO.out;
  return (
    <StageCard title={info.title} description={info.description}>
      <div className={styles.grid}>
        <Knob
          label="OUTPUT GAIN"
          min={-24}
          max={24}
          step={0.1}
          unit=" dB"
          value={outGain}
          defaultValue={0}
          onChange={(v) => setGain('outGain', v)}
        />
      </div>
      <div className={styles.note}>
        Sending to <b>{selectedDeviceLabel(devices.outputs, dev.out)}</b>. In your game choose{' '}
        <b>CABLE Output</b> as the microphone.
      </div>
    </StageCard>
  );
}
