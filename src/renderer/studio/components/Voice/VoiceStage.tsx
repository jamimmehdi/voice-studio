import { QUALITY_OPTIONS, type Quality } from '@shared/params';
import { signed } from '@shared/format';
import { BarSlider } from '../../../ui/BarSlider';
import { Switch } from '../../../ui/Switch';
import { useStudio } from '../../runtime/react';
import { StageCard } from '../Stages/StageCard';
import { VoicePad } from './VoicePad';
import styles from './VoiceStage.module.css';

const QUALITY_LABEL: Record<Quality, string> = {
  4096: 'Studio · 85 ms',
  2048: 'Clean · 43 ms',
  1024: 'Balanced · 21 ms',
  512: 'Fast · 11 ms',
};

function Readout({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className={styles.readout} data-readout={label.toLowerCase()}>
      <div className={styles.readoutKey}>{label}</div>
      <div className={`${styles.readoutValue} mono`}>
        {signed(value)} <span className={styles.unit}>st</span>
      </div>
    </div>
  );
}

/** The voice changer editor: pad, readouts, effect mix, robot switch and the quality selector. */
export function VoiceStage(): React.ReactElement {
  const { voice, patchVoice } = useStudio((s) => ({ voice: s.params.voice, patchVoice: s.patchVoice }));

  const quality = (
    <label className={styles.quality}>
      Quality
      <select
        value={voice.quality}
        onChange={(e) => patchVoice({ quality: Number(e.target.value) as Quality }, { custom: false })}
      >
        {QUALITY_OPTIONS.slice()
          .reverse()
          .map((q) => (
            <option key={q} value={q}>
              {QUALITY_LABEL[q]}
            </option>
          ))}
      </select>
    </label>
  );

  return (
    <StageCard
      title="Voice"
      description="Drag the dot to move between male, female and cartoon voices."
      headerAside={quality}
    >
      <div className={styles.row}>
        <VoicePad
          pitch={voice.pitch}
          formant={voice.formant}
          onChange={(pitch, formant) => patchVoice({ pitch, formant, on: true })}
          onReset={() => patchVoice({ pitch: 0, formant: 0 })}
        />
        <div className={styles.side}>
          <Readout label="Pitch" value={voice.pitch} />
          <Readout label="Formant" value={voice.formant} />
          <div>
            <div className={styles.mixHead}>
              <span>Effect mix</span>
              <span className="mono">{Math.round(voice.mix)}%</span>
            </div>
            <BarSlider
              label="Effect mix"
              value={voice.mix}
              min={0}
              max={100}
              step={1}
              defaultValue={100}
              onChange={(mix) => patchVoice({ mix })}
            />
          </div>
          <div className={styles.robot}>
            <span>Robot voice</span>
            <Switch label="Robot voice" checked={voice.robot} onChange={(robot) => patchVoice({ robot })} />
          </div>
        </div>
      </div>
    </StageCard>
  );
}
