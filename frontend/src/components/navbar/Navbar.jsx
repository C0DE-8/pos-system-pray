// src/components/navbar/Navbar.jsx
import { FiRefreshCw, FiLogOut } from "react-icons/fi";
import styles from "./Navbar.module.css";

export default function Navbar({
  user,
  title,
  onRefresh,
  onLogout,
  refreshing,
  actions = null
}) {
  const displayName = user?.name || user?.username || user?.email || "Account";

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <h1>{title}</h1>
      </div>

      <div className={styles.right}>
        {actions ? <div className={styles.alertActions}>{actions}</div> : null}

        <button className={styles.refreshBtn} onClick={onRefresh}>
          <FiRefreshCw className={refreshing ? styles.spin : ""} />
          <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
        </button>

        <div className={styles.userBadge}>
          <div className={styles.avatar}>{displayName.charAt(0).toUpperCase()}</div>
          <div>
            <strong>{displayName}</strong>
          </div>
        </div>

        <button className={styles.logoutBtn} onClick={onLogout}>
          <FiLogOut />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}
