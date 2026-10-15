import { useEffect } from 'react';
import { useStudio } from '../../runtime/react';
import styles from './NoticeBar.module.css';

/** How long an informational notice stays up. Warnings stay until dismissed. */
const INFO_MS = 6000;

/** A message under the top bar: device unplugged, feedback switched off, and so on. */
export function NoticeBar(): React.ReactElement | null {
  const { notice, dismiss } = useStudio((s) => ({ notice: s.notice, dismiss: s.dismissNotice }));
  const id = notice?.id;
  const kind = notice?.kind;

  useEffect(() => {
    if (id === undefined || kind !== 'info') return undefined;
    const timer = setTimeout(dismiss, INFO_MS);
    return () => clearTimeout(timer);
  }, [id, kind, dismiss]);

  if (!notice) return null;
  return (
    <div
      className={`${styles.bar} ${notice.kind === 'warn' ? styles.warn : styles.info}`}
      role={notice.kind === 'warn' ? 'alert' : 'status'}
    >
      <span className={styles.text}>{notice.text}</span>
      <button type="button" className={styles.dismiss} onClick={dismiss}>
        Got it
      </button>
    </div>
  );
}
