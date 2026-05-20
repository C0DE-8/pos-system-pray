import { useState } from "react";
import {
  FiX,
  FiShield,
  FiUser,
  FiLogOut,
  FiAlertTriangle,
  FiBell
} from "react-icons/fi";
import styles from "./MobileSidebarHead.module.css";

export default function MobileSidebarHead({
  title = "Pray Restaurant & Lounge",
  subtitle = "Dashboard Menu",
  user = null,
  role = "viewer",
  onClose,
  onLogout,
  loggingOut = false,
  expiryAlertCount = 0,
  lowStockAlertCount = 0
}) {
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const displayName = user?.name || user?.username || user?.email || "Staff";

  const displayRole = role
    ? role.charAt(0).toUpperCase() + role.slice(1)
    : "Viewer";

  const handleOpenLogoutModal = () => {
    if (loggingOut) return;
    setShowLogoutModal(true);
  };

  const handleCloseLogoutModal = () => {
    if (loggingOut) return;
    setShowLogoutModal(false);
  };

  const handleConfirmLogout = async () => {
    if (loggingOut) return;

    try {
      if (onLogout) {
        await onLogout();
      }
    } finally {
      setShowLogoutModal(false);
    }
  };

  return (
    <>
      <div className={styles.mobileSidebarHead}>
        <div className={styles.topRow}>
          <div className={styles.left}>
            <div className={styles.brandIcon}>A</div>

            <div className={styles.textBlock}>
              <h3 className={styles.title}>{title}</h3>
              <p className={styles.subtitle}>{subtitle}</p>

              <div className={styles.metaRow}>
                <span className={styles.metaChip}>
                  <FiUser />
                  {displayName}
                </span>

                <span className={styles.metaChip}>
                  <FiShield />
                  {displayRole}
                </span>

                {expiryAlertCount > 0 && (
                  <span className={`${styles.metaChip} ${styles.alertChip}`}>
                    <FiBell />
                    {expiryAlertCount} expiring
                  </span>
                )}

                {lowStockAlertCount > 0 && (
                  <span className={`${styles.metaChip} ${styles.alertChip}`}>
                    <FiAlertTriangle />
                    {lowStockAlertCount} low stock
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <FiX />
          </button>
        </div>

        <div className={styles.actionSection}>
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={handleOpenLogoutModal}
            disabled={loggingOut}
          >
            <FiLogOut />
            {loggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
      </div>

      {showLogoutModal && (
        <div className={styles.modalOverlay} onClick={handleCloseLogoutModal}>
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalIcon}>
              <FiAlertTriangle />
            </div>

            <h3 className={styles.modalTitle}>Confirm Logout</h3>
            <p className={styles.modalText}>
              Are you sure you want to logout?
            </p>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={handleCloseLogoutModal}
                disabled={loggingOut}
              >
                Cancel
              </button>

              <button
                type="button"
                className={styles.confirmBtn}
                onClick={handleConfirmLogout}
                disabled={loggingOut}
              >
                <FiLogOut />
                {loggingOut ? "Logging out..." : "Yes, Logout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
