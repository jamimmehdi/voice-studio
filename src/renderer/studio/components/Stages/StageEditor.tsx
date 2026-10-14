import type { StageId } from '@shared/stages';
import { useStudio } from '../../runtime/react';
import { EqStage } from './EqStage';
import { VoiceStage } from '../Voice/VoiceStage';
import { VoicesCard } from '../Voice/VoicesCard';
import {
  CompressorStage,
  DeEsserStage,
  GateStage,
  HpfStage,
  LimiterStage,
  MicStage,
  OutputStage,
} from './simple-stages';
import styles from './StageEditor.module.css';

const STAGE_COMPONENTS: Record<StageId, () => React.ReactElement> = {
  mic: MicStage,
  hpf: HpfStage,
  exp: GateStage,
  voice: VoiceStage,
  deess: DeEsserStage,
  eq: EqStage,
  comp: CompressorStage,
  lim: LimiterStage,
  out: OutputStage,
};

/** Shows the editor of the selected stage (the voice stage also shows the voice tiles). */
export function StageEditor(): React.ReactElement {
  const stage = useStudio((s) => s.stage);
  const Component = STAGE_COMPONENTS[stage];
  return (
    <div className={styles.editor}>
      <Component />
      {stage === 'voice' && <VoicesCard />}
    </div>
  );
}
