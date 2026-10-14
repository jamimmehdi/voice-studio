import type { ReactNode } from 'react';
import type { ModuleKey } from '@shared/params';
import { Switch } from '../../../ui/Switch';
import { useStudio } from '../../runtime/react';
import styles from './StageCard.module.css';

interface StageCardProps {
  title: string;
  description: string;
  /** which module the header switch controls (omit for stages that cannot be disabled) */
  module?: ModuleKey;
  /** extra controls placed at the right of the header */
  headerAside?: ReactNode;
  children: ReactNode;
}

/** Frame shared by every stage editor: title, description, on/off switch and a body that dims when off. */
export function StageCard({
  title,
  description,
  module,
  headerAside,
  children,
}: StageCardProps): React.ReactElement {
  const { on, toggle } = useStudio((s) => ({
    on: module ? s.params[module].on : true,
    toggle: s.toggleModule,
  }));
  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.head}>
        <h3 className={styles.title}>{title}</h3>
        <span className={styles.description}>{description}</span>
        <div className={styles.spacer} />
        {headerAside}
        {module && <Switch label={`${title} on/off`} checked={on} onChange={() => toggle(module)} />}
      </div>
      <div className={`${styles.body} ${on ? '' : styles.off}`}>{children}</div>
    </section>
  );
}
