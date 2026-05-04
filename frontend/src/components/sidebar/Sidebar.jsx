// src/components/sidebar/Sidebar.jsx
import { useEffect, useState } from "react";
import {
  FiGrid,
  FiBox,
  FiUsers,
  FiShoppingCart,
  FiTrendingUp,
  FiLayers,
  FiMap,
  FiUserCheck,
  FiSettings,
  FiBarChart2,
  FiEye,
  FiArchive,
  FiGitBranch,
  FiChevronLeft,
  FiChevronRight,
  FiChevronDown
} from "react-icons/fi";
import styles from "./Sidebar.module.css";

const INVENTORY_SUBMENU_LABELS = [
  "Add Product",
  "Stock Tools",
  "Categories",
  "Product Units",
  "Inventory List",
  "Low Stock Products",
  "Stock History",
  "Disabled Products"
];

const WAREHOUSE_SUBMENU_LABELS = [
  "Warehouse Actions",
  "Warehouse Products",
  "Warehouse History"
];

const ICONS = {
  Overview: <FiGrid />,
  Products: <FiBox />,
  Members: <FiUsers />,
  POS: <FiShoppingCart />,
  Sales: <FiTrendingUp />,
  Inventory: <FiLayers />,
  "Unit Hierarchy": <FiGitBranch />,
  Courts: <FiMap />,
  Users: <FiUserCheck />,
  Settings: <FiSettings />,
  Reports: <FiBarChart2 />,
  Viewer: <FiEye />,
  Warehouse: <FiArchive />,
  "Add Product": <FiBox />,
  "Stock Tools": <FiBox />,
  Categories: <FiBox />,
  "Product Units": <FiBox />,
  "Inventory List": <FiBox />,
  "Low Stock Products": <FiBox />,
  "Stock History": <FiBox />,
  "Disabled Products": <FiBox />,
  "Warehouse Actions": <FiArchive />,
  "Warehouse Products": <FiArchive />,
  "Warehouse History": <FiArchive />
};

export default function Sidebar({
  role,
  menu,
  activeMenu,
  setActiveMenu,
  collapsed = false,
  onToggleCollapse
}) {
  const inventoryChildren = menu.filter((item) =>
    INVENTORY_SUBMENU_LABELS.includes(item.label)
  );
  const warehouseChildren = menu.filter((item) =>
    WAREHOUSE_SUBMENU_LABELS.includes(item.label)
  );
  const topLevelItems = menu.filter(
    (item) =>
      !INVENTORY_SUBMENU_LABELS.includes(item.label) &&
      !WAREHOUSE_SUBMENU_LABELS.includes(item.label)
  );
  const isInventoryActive = INVENTORY_SUBMENU_LABELS.includes(activeMenu);
  const isWarehouseActive = WAREHOUSE_SUBMENU_LABELS.includes(activeMenu);
  const [inventoryOpen, setInventoryOpen] = useState(isInventoryActive);
  const [warehouseOpen, setWarehouseOpen] = useState(isWarehouseActive);

  useEffect(() => {
    if (isInventoryActive) {
      setInventoryOpen(true);
    }
  }, [isInventoryActive]);

  useEffect(() => {
    if (isWarehouseActive) {
      setWarehouseOpen(true);
    }
  }, [isWarehouseActive]);

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}>
      <div className={styles.topArea}>
        <div className={styles.logoBox}>
          <h2>{collapsed ? "AP" : "Arena pro"}</h2>
          {!collapsed && <p>{role}</p>}
        </div>

        <button
          type="button"
          className={styles.collapseBtn}
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <FiChevronRight /> : <FiChevronLeft />}
        </button>
      </div>

      <nav className={styles.navMenu}>
        {topLevelItems.map((item) => {
          if (item.label === "Inventory" && inventoryChildren.length) {
            return (
              <div key={item.label} className={styles.navGroup}>
                <button
                  className={`${styles.navItem} ${
                    isInventoryActive ? styles.activeNavItem : ""
                  }`}
                  onClick={() => {
                    if (collapsed) {
                      setActiveMenu(inventoryChildren[0].label);
                      return;
                    }

                    setInventoryOpen((prev) => !prev);
                  }}
                  title={collapsed ? item.label : ""}
                >
                  <span className={styles.icon}>{ICONS[item.label] || <FiGrid />}</span>
                  {!collapsed ? (
                    <>
                      <span className={styles.label}>{item.label}</span>
                      <span
                        className={`${styles.groupChevron} ${
                          inventoryOpen ? styles.groupChevronOpen : ""
                        }`}
                      >
                        <FiChevronDown />
                      </span>
                    </>
                  ) : null}
                </button>

                {!collapsed && inventoryOpen ? (
                  <div className={styles.submenu}>
                    {inventoryChildren.map((child) => (
                      <button
                        key={child.label}
                        className={`${styles.submenuItem} ${
                          activeMenu === child.label ? styles.activeSubmenuItem : ""
                        }`}
                        onClick={() => setActiveMenu(child.label)}
                      >
                        <span className={styles.submenuDot} />
                        <span className={styles.submenuLabel}>{child.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }

          if (item.label === "Warehouse" && warehouseChildren.length) {
            return (
              <div key={item.label} className={styles.navGroup}>
                <button
                  className={`${styles.navItem} ${
                    isWarehouseActive ? styles.activeNavItem : ""
                  }`}
                  onClick={() => {
                    if (collapsed) {
                      setActiveMenu(warehouseChildren[0].label);
                      return;
                    }

                    setWarehouseOpen((prev) => !prev);
                  }}
                  title={collapsed ? item.label : ""}
                >
                  <span className={styles.icon}>{ICONS[item.label] || <FiGrid />}</span>
                  {!collapsed ? (
                    <>
                      <span className={styles.label}>{item.label}</span>
                      <span
                        className={`${styles.groupChevron} ${
                          warehouseOpen ? styles.groupChevronOpen : ""
                        }`}
                      >
                        <FiChevronDown />
                      </span>
                    </>
                  ) : null}
                </button>

                {!collapsed && warehouseOpen ? (
                  <div className={styles.submenu}>
                    {warehouseChildren.map((child) => (
                      <button
                        key={child.label}
                        className={`${styles.submenuItem} ${
                          activeMenu === child.label ? styles.activeSubmenuItem : ""
                        }`}
                        onClick={() => setActiveMenu(child.label)}
                      >
                        <span className={styles.submenuDot} />
                        <span className={styles.submenuLabel}>{child.label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }

          return (
            <button
              key={item.label}
              className={`${styles.navItem} ${
                activeMenu === item.label ? styles.activeNavItem : ""
              }`}
              onClick={() => setActiveMenu(item.label)}
              title={collapsed ? item.label : ""}
            >
              <span className={styles.icon}>{ICONS[item.label] || <FiGrid />}</span>
              {!collapsed && <span className={styles.label}>{item.label}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
