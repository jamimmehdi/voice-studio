import { useStudio } from '../../runtime/react';
import { AboutModal } from './AboutModal';
import { CableModal } from './CableModal';
import { DiagnoseModal } from './DiagnoseModal';
import { GuideModal } from './GuideModal';
import { LibraryModal } from './LibraryModal';
import { ProfilesModal } from './ProfilesModal';
import { RemoteModal } from './RemoteModal';
import { SavePresetModal } from './SavePresetModal';
import { SetupModal } from './SetupModal';
import { SoundboardModal } from './SoundboardModal';

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
    case 'setup':
      return <SetupModal />;
    case 'diagnose':
      return <DiagnoseModal />;
    case 'soundboard':
      return <SoundboardModal />;
    case 'profiles':
      return <ProfilesModal />;
    case 'library':
      return <LibraryModal />;
    case 'remote':
      return <RemoteModal />;
    default:
      return null;
  }
}
