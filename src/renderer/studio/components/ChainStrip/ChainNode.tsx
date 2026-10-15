import { useCallback, useRef } from 'react';
import type { DisplayMeters } from '@engine/audio/meter-smoother';
import type { StageDef } from '@shared/stages';
import { Switch } from '../../../ui/Switch';
import { selectedDeviceLabel, stageSummary } from '../../lib/stage-summary';
import { useMeterSubscription, useStudio } from '../../runtime/react';
import styles from './ChainNode.module.css';

interface ChainNodeProps {
  stage: StageDef;
}

/** One stage of the chain: tag, switch, name, a live summary of its settings and a gain-reduction bar. */
export function ChainNode({ stage }: ChainNodeProps): React.ReactElement {
  const { params, selected, devices, dev, setStage, toggleModule } = useStudio((s) => ({
    params: s.params,
    selected: s.stage === stage.id,
    devices: s.devices,
    dev: s.dev,
    setStage: s.setStage,
    toggleModule: s.toggleModule,
  }));

  const on = stage.module ? params[stage.module].on : true;
  const summary = stageSummary(stage.id, {
    params,
    inputLabel: selectedDeviceLabel(devices.inputs, dev.in),
    outputLabel: selectedDeviceLabel(devices.outputs, dev.out),
  });

  // gain reduction is written straight to the DOM (no re-render at meter rate)
  const bar = useRef<HTMLSpanElement>(null);
  const meterKey = stage.meter;
  const onMeters = useCallback(
    (m: DisplayMeters) => {
      if (!bar.current || !meterKey) return;
      bar.current.style.width = `${Math.min(100, (-m[meterKey] / 24) * 100)}%`;
    },
    [meterKey],
  );
  useMeterSubscription(onMeters);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${stage.name} stage`}
      data-stage={stage.id}
      className={`${styles.node} ${selected ? styles.selected : ''} ${on ? '' : styles.off}`}
      onClick={() => setStage(stage.id)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setStage(stage.id);
        }
      }}
    >
      <span className={styles.top}>
        <span className={styles.tag}>{stage.group}</span>
        {stage.module && (
          <Switch
            size="xs"
            label={`${stage.name} on/off`}
            checked={on}
            onChange={() => toggleModule(stage.module!)}
          />
        )}
      </span>
      <span className={styles.name}>{stage.short ?? stage.name}</span>
      <span className={`${styles.value} mono`}>{summary}</span>
      <span className={styles.gr}>
        <span ref={bar} className={styles.grFill} />
      </span>
    </div>
  );
}
