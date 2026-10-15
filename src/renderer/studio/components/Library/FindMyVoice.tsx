import { useState } from 'react';
import { estimatePitch, suggestFemaleVoice, type VoiceSuggestion } from '@shared/calibration';
import { useStudio } from '../../runtime/react';
import features from '../Features/features.module.css';
import { useCapture } from './use-capture';
import styles from './FindMyVoice.module.css';

const SECONDS = 6;
const SENTENCE = 'The quick brown fox jumps over the lazy dog.';

type Outcome = { hz: number; suggestion: VoiceSuggestion } | { error: string } | null;

/** Measures your pitch from a spoken sentence and suggests pitch / formant for a natural female voice. */
export function FindMyVoice(): React.ReactElement {
  const { running, preset, patchVoice } = useStudio((s) => ({
    running: s.engine === 'running',
    preset: s.preset,
    patchVoice: s.patchVoice,
  }));
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [applied, setApplied] = useState(false);

  const capture = useCapture((result) => {
    const hz = estimatePitch(result.raw, result.sampleRate);
    if (hz === null) {
      setOutcome({ error: 'We could not hear a clear voice. Speak a little louder and try again.' });
    } else {
      setOutcome({ hz, suggestion: suggestFemaleVoice(hz) });
    }
  });

  const recording = capture.phase === 'recording';
  const found = outcome && 'hz' in outcome ? outcome : null;
  const target = preset ?? 'current voice';

  return (
    <section className={features.card} aria-label="Find my voice">
      <h3 className={features.eyebrow}>Find my voice</h3>
      <p className={features.lead}>
        Read one sentence aloud. We measure your pitch and suggest settings for a natural result.
      </p>
      <div className={styles.sentence}>&ldquo;{SENTENCE}&rdquo;</div>

      <div className={styles.boxes}>
        <div className={styles.box}>
          <div className={styles.key}>YOUR PITCH</div>
          <div className={`${styles.value} mono`}>{found ? `${Math.round(found.hz)} Hz` : '–'}</div>
        </div>
        <div className={`${styles.box} ${found ? styles.suggested : ''}`}>
          <div className={styles.key}>SUGGESTED</div>
          <div className={`${styles.value} mono`}>
            {found ? `${sign(found.suggestion.pitch)} / ${sign(found.suggestion.formant)} st` : '–'}
          </div>
        </div>
      </div>

      {outcome && 'error' in outcome && <div className={features.errorText}>{outcome.error}</div>}

      <div className={styles.actions}>
        <button
          type="button"
          className={features.btn}
          disabled={!running}
          onClick={() => {
            setApplied(false);
            setOutcome(null);
            if (recording) capture.cancel();
            else capture.start(SECONDS);
          }}
        >
          {recording ? `Listening… ${capture.remaining} s` : found ? 'Measure again' : 'Record my voice'}
        </button>
        <button
          type="button"
          className={`${features.btn} ${features.btnPrimary}`}
          disabled={!found}
          onClick={() => {
            if (!found) return;
            patchVoice({ on: true, ...found.suggestion }, { custom: true });
            setApplied(true);
          }}
        >
          {applied ? 'Applied' : `Apply to ${target}`}
        </button>
      </div>
      {!running && <div className={`${features.small} ${features.dim}`}>Start the engine first.</div>}
    </section>
  );
}

const sign = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
