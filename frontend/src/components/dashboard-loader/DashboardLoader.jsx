import styles from "./DashboardLoader.module.css";

export default function DashboardLoader({
  title = "Pray Restaurant & Lounge",
  subtitle = "Preparing your dashboard...",
  label = "P.O.S",
  variant = "screen"
}) {
  const isPanel = variant === "panel";

  return (
    <div className={`${styles.loaderWrapper} ${isPanel ? styles.panelLoader : ""}`}>
      <div className={styles.loaderContent}>
        <div className={styles.orbit} aria-hidden="true">
          <span></span>
          <span></span>
          <div className={styles.spinner}></div>
        </div>

        <p className={styles.label}>{label}</p>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.subtitle}>{subtitle}</p>

      </div>
    </div>
  );
}
