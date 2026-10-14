import { useStudio } from '../../runtime/react';
import { AboutModal } from './AboutModal';
import { CableModal } from './CableModal';
import { GuideModal } from './GuideModal';
import { SavePresetModal } from './SavePresetModal';

/** Renders whichever modal the store says is open. */
export function Modals(): React.ReactElement | null {
  const modal = useStudio((s) => s.modal);
  switch (modal) {
    case 'about':
      return <AboutModal />;
    case 'guide':
      return <GuideModal />;
    case 'cable':
      return <CableModal />;
    case 'save-preset':
      return <SavePresetModal />;
    default:
      return null;
  }
}
