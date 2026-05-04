import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiRefreshCw,
  FiPackage,
  FiArrowDownCircle,
  FiArrowUpCircle,
  FiClock,
  FiSearch,
  FiChevronDown
} from "react-icons/fi";
import { getProducts } from "../../api/productsApi";
import {
  getWarehouseProducts,
  addWarehouseStock,
  removeWarehouseStock,
  transferWarehouseToStore,
  transferStoreToWarehouse,
  getWarehouseHistory
} from "../../api/inventoryApi";
import styles from "./WarehouseManagement.module.css";

const initialForm = {
  qty: "",
  reason: ""
};

export default function WarehouseManagement({ activeSection = "actions" }) {
  const [products, setProducts] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [activeAction, setActiveAction] = useState("add");
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", text: "" });
  const [productSearch, setProductSearch] = useState("");
  const [actionProductSearch, setActionProductSearch] = useState("");
  const [actionProductOpen, setActionProductOpen] = useState(false);
  const actionProductRef = useRef(null);

  const normalizeBaseProducts = (rows) => {
    return (Array.isArray(rows) ? rows : []).map((item) => ({
      ...item,
      product_id: String(item.product_id ?? item.id),
      name: item.name || "Unnamed product",
      icon: item.icon || "📦",
      category_name: item.category_name ?? item.category ?? "—",
      shop_stock: Number(item.shop_stock ?? item.stock ?? 0),
      warehouse_qty: 0
    }));
  };

  const normalizeWarehouseRows = (rows) => {
    return (Array.isArray(rows) ? rows : []).map((item) => ({
      ...item,
      product_id: String(item.product_id ?? item.id),
      name: item.name || "Unnamed product",
      icon: item.icon || "📦",
      category_name: item.category_name ?? item.category ?? "—",
      warehouse_qty: Number(item.warehouse_qty ?? 0),
      shop_stock: Number(item.shop_stock ?? item.stock ?? 0)
    }));
  };

  const mergeProductsWithWarehouse = (baseProducts, warehouseRows) => {
    const warehouseMap = new Map(
      warehouseRows.map((item) => [String(item.product_id), item])
    );

    return baseProducts.map((product) => {
      const warehouseItem = warehouseMap.get(String(product.product_id));

      if (!warehouseItem) {
        return {
          ...product,
          warehouse_qty: 0,
          shop_stock: Number(product.shop_stock ?? product.stock ?? 0)
        };
      }

      return {
        ...product,
        warehouse_qty: Number(warehouseItem.warehouse_qty ?? 0),
        shop_stock: Number(
          warehouseItem.shop_stock ?? product.shop_stock ?? product.stock ?? 0
        )
      };
    });
  };

  const loadWarehouseData = async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true);
      if (!showRefresh) setLoading(true);

      const [productsRes, warehouseRes] = await Promise.all([
        getProducts(),
        getWarehouseProducts()
      ]);

      const baseProducts = normalizeBaseProducts(productsRes?.data || []);
      const warehouseRows = normalizeWarehouseRows(warehouseRes?.data || []);
      const mergedProducts = mergeProductsWithWarehouse(baseProducts, warehouseRows);

      setProducts(mergedProducts);

      setSelectedProductId((prev) => {
        if (
          prev &&
          mergedProducts.some((item) => String(item.product_id) === String(prev))
        ) {
          return prev;
        }
        return mergedProducts.length ? String(mergedProducts[0].product_id) : "";
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error?.response?.data?.message || "Failed to load warehouse data"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const historyRes = await getWarehouseHistory();
      setHistory(Array.isArray(historyRes?.data) ? historyRes.data : []);
    } catch (error) {
      setFeedback({
        type: "error",
        text: error?.response?.data?.message || "Failed to load warehouse history"
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadWarehouseData();
    loadHistory();
  }, []);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!actionProductRef.current?.contains(event.target)) {
        setActionProductOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const filteredProducts = useMemo(() => {
    const term = productSearch.trim().toLowerCase();

    if (!term) return products;

    return products.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const category = String(item.category_name || "").toLowerCase();
      const id = String(item.product_id || "");
      return name.includes(term) || category.includes(term) || id.includes(term);
    });
  }, [products, productSearch]);

  const filteredActionProducts = useMemo(() => {
    const term = actionProductSearch.trim().toLowerCase();

    if (!term) return products;

    return products.filter((item) => {
      const name = String(item.name || "").toLowerCase();
      const category = String(item.category_name || "").toLowerCase();
      const id = String(item.product_id || "");
      return name.includes(term) || category.includes(term) || id.includes(term);
    });
  }, [products, actionProductSearch]);

  const selectedProduct = useMemo(() => {
    return (
      products.find(
        (item) => String(item.product_id) === String(selectedProductId)
      ) || null
    );
  }, [products, selectedProductId]);

  const getActionProductLabel = (item) => {
    if (!item) return "";
    return `${item.name} • WH ${item.warehouse_qty} • Shop ${item.shop_stock}`;
  };

  const totals = useMemo(() => {
    return products.reduce(
      (acc, item) => {
        acc.totalProducts += 1;
        acc.totalWarehouse += Number(item.warehouse_qty || 0);
        acc.totalShop += Number(item.shop_stock || 0);
        return acc;
      },
      { totalProducts: 0, totalWarehouse: 0, totalShop: 0 }
    );
  }, [products]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm(initialForm);
  };

  const getActionTitle = () => {
    switch (activeAction) {
      case "add":
        return "Add stock to warehouse";
      case "remove":
        return "Remove stock from warehouse";
      case "toStore":
        return "Transfer warehouse to shop";
      case "fromStore":
        return "Transfer shop to warehouse";
      default:
        return "Warehouse action";
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback({ type: "", text: "" });

    if (!selectedProductId) {
      setFeedback({ type: "error", text: "Please select a product" });
      return;
    }

    const qty = Number(form.qty);

    if (!qty || qty <= 0) {
      setFeedback({ type: "error", text: "Quantity must be greater than 0" });
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        qty,
        reason: form.reason?.trim() || undefined
      };

      let response;

      if (activeAction === "add") {
        response = await addWarehouseStock(selectedProductId, payload);
      } else if (activeAction === "remove") {
        response = await removeWarehouseStock(selectedProductId, payload);
      } else if (activeAction === "toStore") {
        response = await transferWarehouseToStore(selectedProductId, payload);
      } else if (activeAction === "fromStore") {
        response = await transferStoreToWarehouse(selectedProductId, payload);
      }

      setFeedback({
        type: "success",
        text: response?.message || "Warehouse updated successfully"
      });

      resetForm();
      await Promise.all([loadWarehouseData(true), loadHistory()]);
    } catch (error) {
      setFeedback({
        type: "error",
        text: error?.response?.data?.message || "Action failed"
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getMovementLabel = (type) => {
    if (type === "add") return "Added";
    if (type === "remove") return "Removed";
    if (type === "transfer_to_store") return "To Shop";
    if (type === "transfer_from_store") return "From Shop";
    if (type === "adjust") return "Adjusted";
    return type || "Movement";
  };

  const getMovementClass = (type) => {
    if (type === "add") return styles.badgeAdd;
    if (type === "remove") return styles.badgeRemove;
    if (type === "transfer_to_store") return styles.badgeTransfer;
    if (type === "transfer_from_store") return styles.badgeReturn;
    return styles.badgeNeutral;
  };

  const getHistoryProductName = (item) => {
    return (
      item.product_name ||
      item.name ||
      item.item_name ||
      `Product #${item.product_id || "Unknown"}`
    );
  };

  const showActionsSection = activeSection === "actions";
  const showProductsSection = activeSection === "products";
  const showHistorySection = activeSection === "history";

  return (
    <div className={styles.wrapper}>
      <div className={styles.hero}>
        <div>
          <h1 className={styles.title}>Warehouse Management</h1>
          <p className={styles.subtitle}>
            Manage warehouse stock, move items between warehouse and shop, and review movement history.
          </p>
        </div>

        <button
          type="button"
          className={styles.refreshBtn}
          onClick={() => {
            loadWarehouseData(true);
            loadHistory();
          }}
          disabled={refreshing}
        >
          <FiRefreshCw className={refreshing ? styles.spin : ""} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <section className={styles.summaryGrid}>
        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <FiPackage />
          </div>
          <div>
            <p className={styles.summaryLabel}>Products</p>
            <h3 className={styles.summaryValue}>{totals.totalProducts}</h3>
          </div>
        </article>

        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <FiArrowDownCircle />
          </div>
          <div>
            <p className={styles.summaryLabel}>Warehouse Qty</p>
            <h3 className={styles.summaryValue}>{totals.totalWarehouse}</h3>
          </div>
        </article>

        <article className={styles.summaryCard}>
          <div className={styles.summaryIcon}>
            <FiArrowUpCircle />
          </div>
          <div>
            <p className={styles.summaryLabel}>Shop Qty</p>
            <h3 className={styles.summaryValue}>{totals.totalShop}</h3>
          </div>
        </article>
      </section>

      {feedback.text ? (
        <div
          className={`${styles.alert} ${
            feedback.type === "success" ? styles.alertSuccess : styles.alertError
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      {showActionsSection ? (
        <section className={styles.singleSection}>
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Warehouse Actions</h2>
                <p className={styles.panelText}>
                  Pick a product, choose an action, then update its quantity.
                </p>
              </div>
            </div>

            <div className={styles.actionTabs}>
              <button
                type="button"
                className={`${styles.actionTab} ${
                  activeAction === "add" ? styles.actionTabActive : ""
                }`}
                onClick={() => setActiveAction("add")}
              >
                Add
              </button>

              <button
                type="button"
                className={`${styles.actionTab} ${
                  activeAction === "remove" ? styles.actionTabActive : ""
                }`}
                onClick={() => setActiveAction("remove")}
              >
                Remove
              </button>

              <button
                type="button"
                className={`${styles.actionTab} ${
                  activeAction === "toStore" ? styles.actionTabActive : ""
                }`}
                onClick={() => setActiveAction("toStore")}
              >
                To Shop
              </button>

              <button
                type="button"
                className={`${styles.actionTab} ${
                  activeAction === "fromStore" ? styles.actionTabActive : ""
                }`}
                onClick={() => setActiveAction("fromStore")}
              >
                From Shop
              </button>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.field}>
                <label className={styles.label}>Action</label>
                <input className={styles.input} value={getActionTitle()} disabled />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Product</label>
                <div
                  ref={actionProductRef}
                  className={`${styles.productPicker} ${
                    actionProductOpen ? styles.productPickerOpen : ""
                  }`}
                >
                  <div className={styles.searchBox}>
                    <FiSearch className={styles.searchIcon} />
                    <input
                      type="text"
                      className={styles.searchInput}
                      placeholder="Search and select product..."
                      value={actionProductSearch}
                      onFocus={() => setActionProductOpen(true)}
                      onChange={(e) => {
                        setActionProductSearch(e.target.value);
                        setActionProductOpen(true);
                      }}
                    />
                    <button
                      type="button"
                      className={styles.pickerToggle}
                      onClick={() => setActionProductOpen((prev) => !prev)}
                      aria-label="Toggle product list"
                    >
                      <FiChevronDown
                        className={`${styles.pickerChevron} ${
                          actionProductOpen ? styles.pickerChevronOpen : ""
                        }`}
                      />
                    </button>
                  </div>

                  {selectedProduct ? (
                    <div className={styles.selectedProductPill}>
                      <span className={styles.selectedProductName}>{selectedProduct.name}</span>
                      <span className={styles.selectedProductMeta}>
                        WH {selectedProduct.warehouse_qty} • Shop {selectedProduct.shop_stock}
                      </span>
                    </div>
                  ) : null}

                  {actionProductOpen ? (
                    <div className={styles.pickerMenu}>
                      {loading ? (
                        <div className={styles.pickerEmpty}>Loading products...</div>
                      ) : filteredActionProducts.length ? (
                        filteredActionProducts.map((item) => (
                          <button
                            key={item.product_id}
                            type="button"
                            className={`${styles.pickerOption} ${
                              String(selectedProductId) === String(item.product_id)
                                ? styles.pickerOptionActive
                                : ""
                            }`}
                            onClick={() => {
                              setSelectedProductId(String(item.product_id));
                              setActionProductSearch(getActionProductLabel(item));
                              setActionProductOpen(false);
                            }}
                          >
                            <span className={styles.pickerOptionTop}>
                              <span className={styles.pickerOptionName}>{item.name}</span>
                              <span className={styles.pickerOptionId}>ID: {item.product_id}</span>
                            </span>
                            <span className={styles.pickerOptionMeta}>
                              {item.category_name || "—"} • WH {item.warehouse_qty} • Shop{" "}
                              {item.shop_stock}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className={styles.pickerEmpty}>No products match that search.</div>
                      )}
                    </div>
                  ) : null}
                </div>
                <span className={styles.fieldNote}>
                  Search by product name, category, or product ID.
                </span>
              </div>

              {selectedProduct ? (
                <div className={styles.productMeta}>
                  <div className={styles.productMetaItem}>
                    <span>In Warehouse</span>
                    <strong>{selectedProduct.warehouse_qty}</strong>
                  </div>
                  <div className={styles.productMetaItem}>
                    <span>In Shop</span>
                    <strong>{selectedProduct.shop_stock}</strong>
                  </div>
                  <div className={styles.productMetaItem}>
                    <span>Category</span>
                    <strong>{selectedProduct.category_name || "—"}</strong>
                  </div>
                </div>
              ) : null}

              <div className={styles.field}>
                <label className={styles.label}>Quantity</label>
                <input
                  type="number"
                  name="qty"
                  min="1"
                  className={styles.input}
                  value={form.qty}
                  onChange={handleChange}
                  placeholder="Enter quantity"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>Reason</label>
                <textarea
                  name="reason"
                  className={styles.textarea}
                  value={form.reason}
                  onChange={handleChange}
                  placeholder="Enter reason for this movement"
                  rows="4"
                />
              </div>

              <div className={styles.formActions}>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={resetForm}
                  disabled={submitting}
                >
                  Clear
                </button>

                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={submitting}
                >
                  {submitting ? "Saving..." : "Submit Action"}
                </button>
              </div>
            </form>
          </div>
        </section>
      ) : null}

      {showProductsSection ? (
        <section className={styles.singleSection}>
          <div
            className={`${styles.panel} ${styles.fixedPanel} ${styles.productsPanel}`}
          >
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Warehouse Products</h2>
                <p className={styles.panelText}>
                  Active products merged with real warehouse stock.
                </p>
              </div>
            </div>

            <div className={styles.searchRow}>
              <div className={styles.searchBox}>
                <FiSearch className={styles.searchIcon} />
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search by name, category or product id..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>In Warehouse</th>
                    <th>In Shop</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="4" className={styles.emptyCell}>
                        Loading products...
                      </td>
                    </tr>
                  ) : filteredProducts.length ? (
                    filteredProducts.map((item) => (
                      <tr
                        key={item.product_id}
                        className={
                          String(selectedProductId) === String(item.product_id)
                            ? styles.selectedRow
                            : ""
                        }
                        onClick={() => setSelectedProductId(String(item.product_id))}
                      >
                        <td>
                          <div className={styles.productCell}>
                            <span className={styles.productIcon}>{item.icon || "📦"}</span>
                            <div>
                              <strong>{item.name}</strong>
                              <small>ID: {item.product_id}</small>
                            </div>
                          </div>
                        </td>
                        <td>{item.category_name || "—"}</td>
                        <td>{item.warehouse_qty}</td>
                        <td>{item.shop_stock}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className={styles.emptyCell}>
                        No products found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.mobileCards}>
              {loading ? (
                <div className={styles.historyEmpty}>Loading products...</div>
              ) : filteredProducts.length ? (
                filteredProducts.map((item) => (
                  <div
                    key={item.product_id}
                    className={`${styles.mobileCard} ${
                      String(selectedProductId) === String(item.product_id)
                        ? styles.mobileCardActive
                        : ""
                    }`}
                    onClick={() => setSelectedProductId(String(item.product_id))}
                  >
                    <div className={styles.mobileCardTop}>
                      <div className={styles.productCell}>
                        <span className={styles.productIcon}>{item.icon || "📦"}</span>
                        <div>
                          <strong>{item.name}</strong>
                          <small>ID: {item.product_id}</small>
                        </div>
                      </div>
                    </div>

                    <div className={styles.mobileMeta}>
                      <div>
                        <span>Category</span>
                        <strong>{item.category_name || "—"}</strong>
                      </div>
                      <div>
                        <span>In Warehouse</span>
                        <strong>{item.warehouse_qty}</strong>
                      </div>
                      <div>
                        <span>In Shop</span>
                        <strong>{item.shop_stock}</strong>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.historyEmpty}>No products found</div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {showHistorySection ? (
        <section className={styles.singleSection}>
          <div
            className={`${styles.panel} ${styles.fixedPanel} ${styles.historyPanel}`}
          >
            <div className={styles.panelHead}>
              <div>
                <h2 className={styles.panelTitle}>Warehouse History</h2>
                <p className={styles.panelText}>
                  Recent warehouse movements and transfers.
                </p>
              </div>
              <FiClock className={styles.historyIcon} />
            </div>

            <div className={styles.historyList}>
              {historyLoading ? (
                <div className={styles.historyEmpty}>Loading history...</div>
              ) : history.length ? (
                history.map((item) => (
                  <div key={item.id} className={styles.historyItem}>
                    <div className={styles.historyTop}>
                      <strong className={styles.historyProductName}>
                        {getHistoryProductName(item)}
                      </strong>
                      <span className={`${styles.badge} ${getMovementClass(item.movement_type)}`}>
                        {getMovementLabel(item.movement_type)}
                      </span>
                    </div>

                    <div className={styles.historyMetrics}>
                      <span>Before: {item.before_qty}</span>
                      <span>Change: {item.change_qty}</span>
                      <span>After: {item.after_qty}</span>
                    </div>

                    <div className={styles.historyMeta}>
                      <span>{item.reason || "No reason provided"}</span>
                      <span>{item.updated_by || "Unknown user"}</span>
                    </div>

                    <div className={styles.historyDate}>
                      {item.created_at
                        ? new Date(item.created_at).toLocaleString()
                        : "No date"}
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.historyEmpty}>No warehouse history yet</div>
              )}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
