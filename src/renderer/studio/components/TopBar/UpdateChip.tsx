import { Button } from '../../../ui/Button';
import { startUpdateDownload } from '../../runtime/updates';
import { useRuntime, useStudio } from '../../runtime/react';

/** Appears in the top bar when a new version exists and shows the download progress. */
export function UpdateChip(): React.ReactElement | null {
  const update = useStudio((s) => s.update);
  const { api, store } = useRuntime();

  switch (update.phase) {
    case 'idle':
      return null;
    case 'available':
      return (
        <Button variant="update" title={update.info.notes.split('\n')[0] || 'A new version is available'} onClick={() => void startUpdateDownload(api, store)}>
          ↑ Update {update.info.version}
        </Button>
      );
    case 'downloading':
      return (
        <Button variant="update" disabled>
          Downloading {update.percent}%
        </Button>
      );
    case 'restarting':
      return (
        <Button variant="update" disabled>
          Restarting…
        </Button>
      );
    case 'failed':
      return (
        <Button variant="update" title={update.message} onClick={() => void startUpdateDownload(api, store)}>
          ↑ Retry update
        </Button>
      );
  }
}
