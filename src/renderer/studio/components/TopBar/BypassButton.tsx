import { Button } from '../../../ui/Button';
import { useStudio } from '../../runtime/react';

/** Passes the raw microphone straight through. Highlighted while active. */
export function BypassButton(): React.ReactElement {
  const { bypass, setBypass } = useStudio((s) => ({ bypass: s.params.bypass, setBypass: s.setBypass }));
  return (
    <Button
      variant={bypass ? 'update' : 'default'}
      aria-pressed={bypass}
      title="Pass the raw microphone straight through"
      onClick={() => setBypass(!bypass)}
    >
      Bypass
    </Button>
  );
}
