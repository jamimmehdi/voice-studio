import styles from './BrandMark.module.css';

export function BrandMark(): React.ReactElement {
  return (
    <div className={styles.brand}>
      <div className={styles.tile}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 11v2M8 8v8M12 4v16M16 8v8M20 11v2"
            stroke="#5eead4"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
      <div className={styles.name}>Voice Studio</div>
    </div>
  );
}
