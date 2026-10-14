import { useEffect, useState } from 'react';
import { useRuntime, useStudio } from '../../runtime/react';
import styles from './CreditBar.module.css';

/** Thin fixed bar: author credit and version on the left, the latest status message on the right. */
export function CreditBar(): React.ReactElement {
  const { api } = useRuntime();
  const status = useStudio((s) => s.status);
  const [version, setVersion] = useState('');

  useEffect(() => {
    void api.appInfo().then((info) => setVersion(`v${info.version}`));
  }, [api]);

  return (
    <div className={styles.bar}>
      <span>
        Made by <b>Jamim Mehdi</b> · <span data-testid="version">{version || 'v–'}</span>
      </span>
      <span role="status" data-testid="status">
        {status}
      </span>
    </div>
  );
}
