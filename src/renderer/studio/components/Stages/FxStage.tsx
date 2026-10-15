import type { FxCharacter } from '@shared/params';
import { STAGE_INFO } from '@shared/stages';
import { BarSlider } from '../../../ui/BarSlider';
import { useStudio } from '../../runtime/react';
import { StageCard } from './StageCard';
import styles from './FxStage.module.css';

const CHARACTERS: ReadonlyArray<{ id: Exclude<FxCharacter, 'none'>; title: string; sub: string }> = [
  { id: 'radio', title: 'Radio', sub: 'Narrow band, grit' },
  { id: 'megaphone', title: 'Megaphone', sub: 'Loud and honky' },
  { id: 'walkie', title: 'Walkie-talkie', sub: 'Squelch and static' },
  { id: 'cave', title: 'Cave', sub: 'Big reverb' },
];

const AMOUNTS = [
  { key: 'reverb', label: 'Reverb' },
  { key: 'echo', label: 'Echo' },
  { key: 'chorus', label: 'Chorus' },
] as const;

/** Effects: a character card (radio, megaphone, walkie-talkie, cave) plus reverb, echo and chorus. */
export function FxStage(): React.ReactElement {
  const { fx, patchModule } = useStudio((s) => ({ fx: s.params.fx, patchModule: s.patchModule }));
  const info = STAGE_INFO.fx;

  return (
    <StageCard title={info.title} description={info.description} module="fx">
      <div className={styles.body}>
        <div className={styles.characters} role="group" aria-label="Character">
          {CHARACTERS.map((c) => {
            const selected = fx.character === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={selected}
                className={`${styles.character} ${selected ? styles.characterOn : ''}`}
                onClick={() => patchModule('fx', { character: selected ? 'none' : c.id, on: true })}
              >
                <b>{c.title}</b>
                <span>{c.sub}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.amounts}>
          {AMOUNTS.map(({ key, label }) => (
            <div key={key}>
              <div className={styles.sliderHead}>
                <span>{label}</span>
                <span className="mono">{Math.round(fx[key])}%</span>
              </div>
              <BarSlider
                label={label}
                min={0}
                max={100}
                step={1}
                value={fx[key]}
                defaultValue={0}
                onChange={(v) => patchModule('fx', { [key]: v })}
              />
            </div>
          ))}
        </div>
      </div>
    </StageCard>
  );
}
