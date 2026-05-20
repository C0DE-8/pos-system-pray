import { useEffect, useMemo, useState } from "react";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  disableProduct,
  enableProduct,
  deleteProduct,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getProductUnits,
  createProductUnit,
  updateProductUnit,
  deleteProductUnit,
  getDisabledProducts,
  getProductSpecialLists
} from "../../api/productsApi";
import {
  getLowStockProducts,
  restockProduct,
  adjustProductStock,
  getStockHistory
} from "../../api/inventoryApi";
import styles from "./InventoryManagement.module.css";
import modalStyles from "./InventoryListModal.module.css";

const initialForm = {
  name: "",
  icon: "📦",
  category_id: "",
  product_unit_id: "",
  type: "fixed",
  hourly_rate: "",
  price: "",
  cost: "",
  stock: "",
  low_stock: "5",
  modifier_group_id: "",
  is_unlimited: false,
  consumable_type: "",
  has_expiry: false,
  expiry_date: "",
  shelf_life_days: "",
  reason: ""
};

const initialCategoryForm = {
  name: "",
  type: "other"
};

const initialUnitForm = {
  name: "",
  short_name: ""
};

const initialRestockForm = {
  productId: "",
  qty: "",
  action: "add",
  reason: ""
};

const initialAdjustForm = {
  productId: "",
  newQty: "",
  reason: ""
};

const categoryTypeOptions = [
  { value: "sporty", label: "🏅 Sporty" },
  { value: "consumable", label: "🥤 Consumable" },
  { value: "service", label: "🛎 Service" },
  { value: "other", label: "📦 Other" }
];

const productTypeOptions = [
  { value: "timed", label: "⏱ Timed" },
  { value: "fixed", label: "✅ Fixed" },
  { value: "gear", label: "🔧 Gear" },
  { value: "food", label: "🍔 Food" },
  { value: "drink", label: "🥤 Drink" },
  { value: "service", label: "🛎 Service" }
];

const consumableTypeOptions = [
  { value: "food", label: "🍔 Food" },
  { value: "drink", label: "🥤 Drink" },
  { value: "other", label: "📦 Other" }
];

const getTypeLabel = (type) => {
  switch (type) {
    case "timed":
      return "⏱ Timed";
    case "gear":
      return "🔧 Gear";
    case "food":
      return "🍔 Food";
    case "drink":
      return "🥤 Drink";
    case "service":
      return "🛎 Service";
    default:
      return "✅ Fixed";
  }
};

const getTypeClassName = (type, stylesRef) => {
  switch (type) {
    case "timed":
      return stylesRef.typeTimed;
    case "gear":
      return stylesRef.typeGear;
    case "food":
      return stylesRef.typeFood;
    case "drink":
      return stylesRef.typeDrink;
    case "service":
      return stylesRef.typeService;
    default:
      return stylesRef.typeFixed;
  }
};

const getCategoryTypeLabel = (type) => {
  switch (type) {
    case "sporty":
      return "🏅 Sporty";
    case "consumable":
      return "🥤 Consumable";
    case "service":
      return "🛎 Service";
    default:
      return "📦 Other";
  }
};

const getCategoryTypeClassName = (type, stylesRef) => {
  switch (type) {
    case "sporty":
      return stylesRef.categorySporty;
    case "consumable":
      return stylesRef.categoryConsumable;
    case "service":
      return stylesRef.categoryService;
    default:
      return stylesRef.categoryOther;
  }
};

const getProductAmountText = (product) => {
  if (product.type === "timed") {
    return `₦${Number(product.hourly_rate || 0).toLocaleString()}/hr`;
  }
  return `₦${Number(product.price || 0).toLocaleString()}`;
};

const formatStockHistoryDateTime = (value) => {
  if (!value) return "No date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

const getProductUnitLabel = (unit) => {
  if (!unit) return "No unit";
  if (unit.short_name) return `${unit.name} (${unit.short_name})`;
  return unit.name || "No unit";
};

const toInputNumber = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  return String(value);
};

const formatDateForInput = (value) => {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatReadableDate = (value) => {
  const normalized = formatDateForInput(value);
  if (!normalized) return "Not set";

  const date = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(date.getTime())) return normalized;

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  });
};

const getProductImageLabel = (product) => {
  const name = String(product?.name || "Product").trim();
  return name ? name.charAt(0).toUpperCase() : "P";
};

const getSearchableProductText = (product) => {
  return [
    product?.name,
    product?.category_name,
    product?.category_type,
    product?.type,
    product?.consumable_type,
    product?.product_unit_name,
    product?.product_unit_short_name
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

const INVENTORY_SECTION_KEYS = [
  "productForm",
  "stockTools",
  "categories",
  "units",
  "inventoryList",
  "lowStock",
  "stockHistory",
  "disabledProducts"
];

function SectionToggle({
  title,
  subtitle,
  sectionKey,
  isOpen,
  onToggle,
  rightNode = null
}) {
  return (
    <div className={styles.sectionToggleHeader}>
      <button
        type="button"
        className={styles.sectionToggleBtn}
        onClick={() => onToggle(sectionKey)}
      >
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>

        <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}>
          ▾
        </span>
      </button>

      {rightNode ? <div className={styles.sectionToggleExtra}>{rightNode}</div> : null}
    </div>
  );
}

function ToastStack({ toasts, onRemove }) {
  return (
    <div className={styles.toastStack}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`${styles.toast} ${
            toast.type === "success"
              ? styles.toastSuccess
              : toast.type === "error"
              ? styles.toastError
              : styles.toastInfo
          }`}
        >
          <div className={styles.toastBody}>
            <strong>{toast.title}</strong>
            {toast.message ? <p>{toast.message}</p> : null}
          </div>

          <button
            type="button"
            className={styles.toastClose}
            onClick={() => onRemove(toast.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

function PageAlert({ alert, onClose }) {
  if (!alert) return null;

  return (
    <div
      className={`${styles.pageAlert} ${
        alert.type === "success"
          ? styles.pageAlertSuccess
          : alert.type === "error"
          ? styles.pageAlertError
          : styles.pageAlertInfo
      }`}
    >
      <div className={styles.pageAlertContent}>
        <strong>{alert.title}</strong>
        {alert.message ? <p>{alert.message}</p> : null}
      </div>

      <button type="button" className={styles.pageAlertClose} onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel
}) {
  if (!open) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalCard}>
        <div className={styles.modalHeader}>
          <h3>{title}</h3>
          <p>{message}</p>
        </div>

        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={onCancel}
            disabled={loading}
          >
            {cancelText}
          </button>

          <button
            type="button"
            className={variant === "danger" ? styles.deleteBtn : styles.primaryBtn}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Please wait..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductListModal({
  open,
  title,
  subtitle,
  products = [],
  onClose,
  onEdit,
  onEnable,
  isDisabledList = false
}) {
  if (!open) return null;

  return (
    <div className={modalStyles.overlay} onClick={onClose}>
      <div
        className={modalStyles.card}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={modalStyles.header}>
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>

          <button
            type="button"
            className={modalStyles.closeBtn}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className={modalStyles.body}>
          {products.length ? (
            <div className={modalStyles.list}>
              {products.map((product) => (
                <div key={`${product.id}-${product.type}`} className={modalStyles.item}>
                  <div className={modalStyles.info}>
                    <div className={modalStyles.icon}>
                      {product.icon || "📦"}
                    </div>

                    <div className={modalStyles.text}>
                      <strong>{product.name}</strong>
                      <p>
                        {product.category_name || "No category"} • {getTypeLabel(product.type)}
                      </p>

                      <small>{getProductAmountText(product)}</small>

                      {product.product_unit_name ? (
                        <small className={modalStyles.expiry}>
                          Unit:{" "}
                          {getProductUnitLabel({
                            name: product.product_unit_name,
                            short_name: product.product_unit_short_name
                          })}
                        </small>
                      ) : null}

                      {Number(product.has_expiry) === 1 ? (
                        <small className={modalStyles.expiry}>
                          {product.expiry_date
                            ? `Expires: ${formatReadableDate(product.expiry_date)}`
                            : "Expiry tracked"}
                          {product.shelf_life_days
                            ? ` • Shelf life: ${product.shelf_life_days} day(s)`
                            : ""}
                        </small>
                      ) : null}
                    </div>
                  </div>

                  <div className={modalStyles.actions}>
                    {isDisabledList ? (
                      <button
                        type="button"
                        className={styles.successBtn}
                        onClick={() => onEnable(product.id)}
                      >
                        Enable
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.editBtn}
                        onClick={() => onEdit(product)}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={modalStyles.empty}>No products found</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InventoryManagement({ activeSection = null }) {
  const [products, setProducts] = useState([]);
  const [disabledProducts, setDisabledProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [productUnits, setProductUnits] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [stockHistory, setStockHistory] = useState([]);

  const [specialLists, setSpecialLists] = useState({
    unlimited: [],
    timed: [],
    expiry_tracked: [],
    disabled: []
  });

  const [productListModal, setProductListModal] = useState({
    open: false,
    title: "",
    subtitle: "",
    products: [],
    isDisabledList: false
  });

  const [form, setForm] = useState(initialForm);
  const [categoryForm, setCategoryForm] = useState(initialCategoryForm);
  const [unitForm, setUnitForm] = useState(initialUnitForm);
  const [restockForm, setRestockForm] = useState(initialRestockForm);
  const [adjustForm, setAdjustForm] = useState(initialAdjustForm);
  const [stockToolSearch, setStockToolSearch] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingUnitId, setEditingUnitId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [stockActionLoading, setStockActionLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [editLoading, setEditLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [pageAlert, setPageAlert] = useState(null);
  const [toasts, setToasts] = useState([]);

  const [confirmState, setConfirmState] = useState({
    open: false,
    title: "",
    message: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    variant: "default",
    onConfirm: null
  });

  const [openSections, setOpenSections] = useState({
    productForm: false,
    stockTools: false,
    categories: false,
    units: false,
    inventoryList: false,
    lowStock: false,
    stockHistory: false,
    disabledProducts: false
  });
  const [focusedSection, setFocusedSection] = useState(activeSection || null);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 8;

  const pushToast = (type, title, message = "") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3500);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  };

  const showAlert = (type, title, message = "") => {
    setPageAlert({ type, title, message });
  };

  const clearAlerts = () => {
    setPageAlert(null);
  };

  const openConfirm = ({
    title,
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    variant = "default",
    onConfirm
  }) => {
    setConfirmState({
      open: true,
      title,
      message,
      confirmText,
      cancelText,
      variant,
      onConfirm
    });
  };

  const closeConfirm = () => {
    if (confirmLoading) return;

    setConfirmState({
      open: false,
      title: "",
      message: "",
      confirmText: "Confirm",
      cancelText: "Cancel",
      variant: "default",
      onConfirm: null
    });
  };

  const openProductListModal = ({
    title,
    subtitle,
    products,
    isDisabledList = false
  }) => {
    setProductListModal({
      open: true,
      title,
      subtitle,
      products,
      isDisabledList
    });
  };

  const closeProductListModal = () => {
    setProductListModal({
      open: false,
      title: "",
      subtitle: "",
      products: [],
      isDisabledList: false
    });
  };

  const toggleSection = (key) => {
    if (focusedSection) {
      setOpenSections((prev) => ({
        ...prev,
        [key]: true
      }));
      return;
    }

    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const showSection = (sectionKey) => {
    setFocusedSection(sectionKey);
    setOpenSections((prev) =>
      Object.keys(prev).reduce(
        (acc, key) => ({
          ...acc,
          [key]: key === sectionKey
        }),
        {}
      )
    );
  };

  const loadProducts = async () => {
    try {
      const res = await getProducts();
      setProducts(res?.data || []);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load products";
      showAlert("error", "Products could not load", msg);
      pushToast("error", "Load failed", msg);
    }
  };

  const loadDisabledProducts = async () => {
    try {
      const res = await getDisabledProducts();
      setDisabledProducts(res?.data || []);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load disabled products";
      showAlert("error", "Disabled products could not load", msg);
      pushToast("error", "Load failed", msg);
    }
  };

  const loadCategories = async () => {
    try {
      const res = await getCategories();
      setCategories(res?.data || []);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load categories";
      showAlert("error", "Categories could not load", msg);
      pushToast("error", "Load failed", msg);
    }
  };

  const loadLowStockProducts = async () => {
    try {
      const res = await getLowStockProducts();
      setLowStockProducts(res?.data || []);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load low stock products";
      showAlert("error", "Low stock could not load", msg);
      pushToast("error", "Load failed", msg);
    }
  };

  const loadProductUnits = async () => {
    try {
      const res = await getProductUnits();
      setProductUnits(res?.data || []);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load product units";
      showAlert("error", "Product units could not load", msg);
      pushToast("error", "Load failed", msg);
    }
  };

  const loadStockHistory = async () => {
    try {
      const res = await getStockHistory();
      setStockHistory(res?.data || []);
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load stock history";
      showAlert("error", "Stock history could not load", msg);
      pushToast("error", "Load failed", msg);
    }
  };

  const loadSpecialLists = async () => {
    try {
      const res = await getProductSpecialLists();

      setSpecialLists({
        unlimited: res?.data?.unlimited || [],
        timed: res?.data?.timed || [],
        expiry_tracked: res?.data?.expiry_tracked || [],
        disabled: res?.data?.disabled || []
      });
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load special product lists";
      showAlert("error", "Special lists could not load", msg);
      pushToast("error", "Load failed", msg);
    }
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      clearAlerts();

      await Promise.all([
        loadProducts(),
        loadDisabledProducts(),
        loadCategories(),
        loadProductUnits(),
        loadLowStockProducts(),
        loadStockHistory(),
        loadSpecialLists()
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (activeSection && INVENTORY_SECTION_KEYS.includes(activeSection)) {
      showSection(activeSection);
      return;
    }

    setFocusedSection(null);
  }, [activeSection]);

  const selectedCategory = useMemo(() => {
    return categories.find((item) => String(item.id) === String(form.category_id));
  }, [categories, form.category_id]);

  const selectedUnit = useMemo(() => {
    return productUnits.find((item) => String(item.id) === String(form.product_unit_id));
  }, [productUnits, form.product_unit_id]);

  const selectedCategoryType = selectedCategory?.type || "other";
  const isTimed = form.type === "timed";
  const isConsumableCategory = selectedCategoryType === "consumable";
  const canShowStockFields = !form.is_unlimited;
  const showConsumableFields = isConsumableCategory;
  const showExpiryFields = isConsumableCategory && !!form.has_expiry;

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    setForm((prev) => {
      const next = { ...prev };

      if (type === "checkbox") {
        next[name] = checked;

        if (name === "is_unlimited" && checked) {
          next.stock = "";
          next.low_stock = "";
          next.reason = "";
        }

        if (name === "has_expiry" && !checked) {
          next.expiry_date = "";
          next.shelf_life_days = "";
        }

        return next;
      }

      next[name] = value;

      if (name === "category_id") {
        const chosenCategory = categories.find(
          (category) => String(category.id) === String(value)
        );

        const chosenCategoryType = chosenCategory?.type || "other";

        if (chosenCategoryType === "consumable") {
          if (!["food", "drink"].includes(next.type)) {
            next.type = "fixed";
          }

          if (!next.consumable_type) {
            next.consumable_type = "other";
          }
        } else {
          next.consumable_type = "";
          next.has_expiry = false;
          next.expiry_date = "";
          next.shelf_life_days = "";
        }

        if (chosenCategoryType === "service") {
          next.is_unlimited = true;
          next.stock = "";
          next.low_stock = "";
          next.reason = "";
        }
      }

      if (name === "type") {
        if (value === "timed") {
          next.is_unlimited = true;
          next.stock = "";
          next.low_stock = "";
          next.price = "";
          next.reason = "";
        }

        if (value === "food") next.consumable_type = "food";
        if (value === "drink") next.consumable_type = "drink";

        if (!["food", "drink"].includes(value) && selectedCategoryType !== "consumable") {
          next.consumable_type = "";
          next.has_expiry = false;
          next.expiry_date = "";
          next.shelf_life_days = "";
        }
      }

      return next;
    });
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const resetCategoryForm = () => {
    setCategoryForm(initialCategoryForm);
    setEditingCategoryId(null);
  };

  const resetUnitForm = () => {
    setUnitForm(initialUnitForm);
    setEditingUnitId(null);
  };

  const resetStockForms = () => {
    setRestockForm(initialRestockForm);
    setAdjustForm(initialAdjustForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    clearAlerts();

    try {
      const payload = {
        ...form,
        category_id: form.category_id || null,
        product_unit_id: form.product_unit_id || null,
        modifier_group_id:
          form.modifier_group_id !== "" ? Number(form.modifier_group_id) : null,
        is_unlimited: !!form.is_unlimited,
        price: form.type === "timed" ? 0 : Number(form.price || 0),
        hourly_rate: form.type === "timed" ? Number(form.hourly_rate || 0) : 0,
        cost: Number(form.cost || 0),
        stock: form.is_unlimited ? 0 : Number(form.stock || 0),
        low_stock: form.is_unlimited ? 0 : Number(form.low_stock || 0),
        consumable_type: showConsumableFields ? form.consumable_type || "other" : null,
        has_expiry: showConsumableFields ? !!form.has_expiry : false,
        expiry_date:
          showConsumableFields && form.has_expiry && form.expiry_date
            ? formatDateForInput(form.expiry_date)
            : null,
        shelf_life_days:
          showConsumableFields && form.has_expiry && form.shelf_life_days !== ""
            ? Number(form.shelf_life_days)
            : null,
        reason: !form.is_unlimited ? form.reason?.trim() || "Product stock updated" : ""
      };

      if (editingId) {
        await updateProduct(editingId, payload);
        showAlert("success", "Product updated", "The product was updated successfully.");
        pushToast("success", "Product updated");
      } else {
        await createProduct(payload);
        showAlert("success", "Product created", "The product was created successfully.");
        pushToast("success", "Product created");
      }

      resetForm();
      await loadAll();
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to save product";
      showAlert("error", "Save failed", msg);
      pushToast("error", "Save failed", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (product) => {
    try {
      setEditLoading(true);
      clearAlerts();

      const response = await getProductById(product.id);
      const details = response?.data || product;

      setEditingId(details.id);
      setForm({
        name: details.name || "",
        icon: details.icon || "📦",
        category_id: details.category_id || "",
        product_unit_id:
          details.product_unit_id === null || details.product_unit_id === undefined
            ? ""
            : String(details.product_unit_id),
        type: details.type || "fixed",
        hourly_rate: toInputNumber(details.hourly_rate, ""),
        price: toInputNumber(details.price, ""),
        cost: toInputNumber(details.cost, ""),
        stock:
          details.stock === null || details.stock === undefined ? "" : String(details.stock),
        low_stock:
          details.low_stock === null || details.low_stock === undefined
            ? ""
            : String(details.low_stock),
        modifier_group_id:
          details.modifier_group_id === null || details.modifier_group_id === undefined
            ? ""
            : String(details.modifier_group_id),
        is_unlimited: !!Number(details.is_unlimited || 0),
        consumable_type: details.consumable_type || "",
        has_expiry: !!Number(details.has_expiry || 0),
        expiry_date: formatDateForInput(details.expiry_date),
        shelf_life_days:
          details.shelf_life_days === null || details.shelf_life_days === undefined
            ? ""
            : String(details.shelf_life_days),
        reason: ""
      });

      setOpenSections((prev) => ({
        ...prev,
        productForm: true
      }));
      setFocusedSection("productForm");

      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to load product details";
      showAlert("error", "Edit load failed", msg);
      pushToast("error", "Edit load failed", msg);
    } finally {
      setEditLoading(false);
    }
  };

  const handleDisable = (id) => {
    openConfirm({
      title: "Disable product",
      message: "Are you sure you want to disable this product?",
      confirmText: "Disable",
      variant: "default",
      onConfirm: async () => {
        try {
          setConfirmLoading(true);
          clearAlerts();

          await disableProduct(id);
          showAlert("success", "Product disabled", "The product is now inactive.");
          pushToast("success", "Product disabled");
          closeConfirm();
          await loadAll();
        } catch (err) {
          const msg = err?.response?.data?.message || "Failed to disable product";
          showAlert("error", "Disable failed", msg);
          pushToast("error", "Disable failed", msg);
        } finally {
          setConfirmLoading(false);
        }
      }
    });
  };

  const handleEnable = (id) => {
    openConfirm({
      title: "Enable product",
      message: "Do you want to enable this product again?",
      confirmText: "Enable",
      variant: "default",
      onConfirm: async () => {
        try {
          setConfirmLoading(true);
          clearAlerts();

          await enableProduct(id);
          showAlert("success", "Product enabled", "The product is active again.");
          pushToast("success", "Product enabled");
          closeConfirm();
          await loadAll();
        } catch (err) {
          const msg = err?.response?.data?.message || "Failed to enable product";
          showAlert("error", "Enable failed", msg);
          pushToast("error", "Enable failed", msg);
        } finally {
          setConfirmLoading(false);
        }
      }
    });
  };

  const handleDelete = (id) => {
    openConfirm({
      title: "Delete product",
      message: "This will permanently remove the product. Continue?",
      confirmText: "Delete",
      variant: "danger",
      onConfirm: async () => {
        try {
          setConfirmLoading(true);
          clearAlerts();

          await deleteProduct(id);
          showAlert("success", "Product deleted", "The product was removed successfully.");
          pushToast("success", "Product deleted");
          closeConfirm();
          await loadAll();
        } catch (err) {
          const msg = err?.response?.data?.message || "Failed to delete product";
          showAlert("error", "Delete failed", msg);
          pushToast("error", "Delete failed", msg);
        } finally {
          setConfirmLoading(false);
        }
      }
    });
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    setCategorySaving(true);
    clearAlerts();

    try {
      if (!categoryForm.name.trim()) {
        showAlert("error", "Category name required", "Please enter a category name.");
        pushToast("error", "Category name required");
        setCategorySaving(false);
        return;
      }

      const payload = {
        name: categoryForm.name.trim(),
        type: categoryForm.type
      };

      if (editingCategoryId) {
        await updateCategory(editingCategoryId, payload);
        showAlert("success", "Category updated", "Category updated successfully.");
        pushToast("success", "Category updated");
      } else {
        await createCategory(payload);
        showAlert("success", "Category created", "Category created successfully.");
        pushToast("success", "Category created");
      }

      resetCategoryForm();
      await loadAll();
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to save category";
      showAlert("error", "Category save failed", msg);
      pushToast("error", "Category save failed", msg);
    } finally {
      setCategorySaving(false);
    }
  };

  const handleCategoryEdit = (category) => {
    setEditingCategoryId(category.id);
    setCategoryForm({
      name: category.name || "",
      type: category.type || "other"
    });

    setOpenSections((prev) => ({
      ...prev,
      categories: true
    }));
    setFocusedSection("categories");

    clearAlerts();
  };

  const handleCategoryDelete = (id) => {
    openConfirm({
      title: "Delete category",
      message: "Are you sure you want to delete this category?",
      confirmText: "Delete",
      variant: "danger",
      onConfirm: async () => {
        try {
          setConfirmLoading(true);
          clearAlerts();

          await deleteCategory(id);
          showAlert("success", "Category deleted", "Category deleted successfully.");
          pushToast("success", "Category deleted");
          closeConfirm();
          await loadAll();
        } catch (err) {
          const msg = err?.response?.data?.message || "Failed to delete category";
          showAlert("error", "Category delete failed", msg);
          pushToast("error", "Category delete failed", msg);
        } finally {
          setConfirmLoading(false);
        }
      }
    });
  };

  const handleUnitSubmit = async (e) => {
    e.preventDefault();
    setCategorySaving(true);
    clearAlerts();

    try {
      if (!unitForm.name.trim()) {
        showAlert("error", "Unit name required", "Please enter a unit type name.");
        pushToast("error", "Unit name required");
        setCategorySaving(false);
        return;
      }

      const payload = {
        name: unitForm.name.trim(),
        short_name: unitForm.short_name.trim() || null
      };

      if (editingUnitId) {
        await updateProductUnit(editingUnitId, payload);
        showAlert("success", "Unit updated", "Product unit updated successfully.");
        pushToast("success", "Unit updated");
      } else {
        await createProductUnit(payload);
        showAlert("success", "Unit created", "Product unit created successfully.");
        pushToast("success", "Unit created");
      }

      resetUnitForm();
      await loadAll();
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to save unit";
      showAlert("error", "Unit save failed", msg);
      pushToast("error", "Unit save failed", msg);
    } finally {
      setCategorySaving(false);
    }
  };

  const handleUnitEdit = (unit) => {
    setEditingUnitId(unit.id);
    setUnitForm({
      name: unit.name || "",
      short_name: unit.short_name || ""
    });

    setOpenSections((prev) => ({
      ...prev,
      units: true
    }));
    setFocusedSection("units");

    clearAlerts();
  };

  const handleUnitDelete = (id) => {
    openConfirm({
      title: "Delete unit type",
      message: "This will remove the unit type and unassign it from linked products. Continue?",
      confirmText: "Delete",
      variant: "danger",
      onConfirm: async () => {
        try {
          setConfirmLoading(true);
          clearAlerts();

          await deleteProductUnit(id);
          showAlert("success", "Unit deleted", "The unit type was removed successfully.");
          pushToast("success", "Unit deleted");
          closeConfirm();
          await loadAll();
        } catch (err) {
          const msg = err?.response?.data?.message || "Failed to delete unit";
          showAlert("error", "Unit delete failed", msg);
          pushToast("error", "Unit delete failed", msg);
        } finally {
          setConfirmLoading(false);
        }
      }
    });
  };

  const handleRestockSubmit = async (e) => {
    e.preventDefault();
    setStockActionLoading(true);
    clearAlerts();

    try {
      if (!restockForm.productId) {
        showAlert("error", "Product required", "Please select a product.");
        pushToast("error", "Please select a product");
        setStockActionLoading(false);
        return;
      }

      if (!restockForm.qty || Number(restockForm.qty) <= 0) {
        showAlert("error", "Quantity required", "Please enter a valid quantity greater than 0.");
        pushToast("error", "Enter a valid quantity");
        setStockActionLoading(false);
        return;
      }

      const actionText = restockForm.action === "remove" ? "removed" : "added";

      await restockProduct(restockForm.productId, {
        qty: Number(restockForm.qty || 0),
        action: restockForm.action,
        reason:
          restockForm.reason ||
          (restockForm.action === "remove" ? "Stock removed" : "Stock added")
      });

      showAlert(
        "success",
        `Stock ${actionText}`,
        `Stock was ${actionText} successfully.`
      );
      pushToast("success", `Stock ${actionText}`);
      resetStockForms();
      await loadAll();
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to update stock";
      showAlert("error", "Stock update failed", msg);
      pushToast("error", "Stock update failed", msg);
    } finally {
      setStockActionLoading(false);
    }
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    setStockActionLoading(true);
    clearAlerts();

    try {
      if (!adjustForm.productId) {
        showAlert("error", "Product required", "Please select a product to adjust.");
        pushToast("error", "Please select a product");
        setStockActionLoading(false);
        return;
      }

      await adjustProductStock(adjustForm.productId, {
        newQty: Number(adjustForm.newQty || 0),
        reason: adjustForm.reason || "Manual adjustment"
      });

      showAlert("success", "Stock adjusted", "Stock quantity was updated successfully.");
      pushToast("success", "Stock adjusted");
      resetStockForms();
      await loadAll();
    } catch (err) {
      const msg = err?.response?.data?.message || "Failed to adjust stock";
      showAlert("error", "Adjustment failed", msg);
      pushToast("error", "Adjustment failed", msg);
    } finally {
      setStockActionLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const keyword = search.toLowerCase().trim();
    if (!keyword) return products;

    return products.filter((product) => {
      return (
        String(product.name || "").toLowerCase().includes(keyword) ||
        String(product.category_name || "").toLowerCase().includes(keyword) ||
        String(product.category_type || "").toLowerCase().includes(keyword) ||
        String(product.type || "").toLowerCase().includes(keyword) ||
        String(product.consumable_type || "").toLowerCase().includes(keyword) ||
        String(product.product_unit_name || "").toLowerCase().includes(keyword) ||
        String(product.product_unit_short_name || "").toLowerCase().includes(keyword)
      );
    });
  }, [products, search]);

  const stockToolProducts = useMemo(() => {
    const keyword = stockToolSearch.toLowerCase().trim();

    return products
      .filter((item) => !Number(item.is_unlimited))
      .filter((product) => {
        if (!keyword) return true;
        return getSearchableProductText(product).includes(keyword);
      });
  }, [products, stockToolSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / ITEMS_PER_PAGE));

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const totalProducts = products.length;
  const totalCategories = categories.length;
  const totalUnits = productUnits.length;
  const lowStockCount = lowStockProducts.length;
  const disabledCount = disabledProducts.length;

  const unlimitedTimedCount = products.filter(
    (item) => Number(item.is_unlimited) === 1 || item.type === "timed"
  ).length;

  const consumableCount = products.filter(
    (item) => item.category_type === "consumable"
  ).length;

  const expiringCount = products.filter(
    (item) => Number(item.has_expiry || 0) === 1
  ).length;
  const isFocusedMode = !!focusedSection;
  const isSectionVisible = (sectionKey) =>
    !isFocusedMode || focusedSection === sectionKey;
  const hasLeftPanelContent = ["productForm", "stockTools", "categories", "units"].some(
    isSectionVisible
  );
  const hasRightPanelContent = [
    "inventoryList",
    "lowStock",
    "stockHistory",
    "disabledProducts"
  ].some(isSectionVisible);

  return (
    <div className={styles.inventoryPage}>
      <ToastStack toasts={toasts} onRemove={removeToast} />
      <PageAlert alert={pageAlert} onClose={() => setPageAlert(null)} />

      <ConfirmModal
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        variant={confirmState.variant}
        loading={confirmLoading}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />

      <ProductListModal
        open={productListModal.open}
        title={productListModal.title}
        subtitle={productListModal.subtitle}
        products={productListModal.products}
        isDisabledList={productListModal.isDisabledList}
        onClose={closeProductListModal}
        onEdit={(product) => {
          closeProductListModal();
          handleEdit(product);
        }}
        onEnable={(id) => {
          closeProductListModal();
          handleEnable(id);
        }}
      />

      <section className={styles.heroCard}>
        <div>
          <p className={styles.heroEyebrow}>Inventory Control</p>
          <h1>Inventory Management</h1>
          <p className={styles.heroText}>
            Create sporty items, food, drinks, services, and general shop products.
            Manage categories, stock, expiry details, restocking, stock adjustment,
            and stock history in one clean dashboard.
          </p>
        </div>

        <button type="button" className={styles.refreshBtn} onClick={loadAll}>
          Refresh
        </button>
      </section>

      <section className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statIcon}>📦</div>
          <div className={styles.statCardContent}>
            <span className={styles.statLabel}>Total Products</span>
            <strong>{totalProducts}</strong>
            <small>Active inventory items</small>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>⚠️</div>
          <div className={styles.statCardContent}>
            <span className={styles.statLabel}>Low Stock</span>
            <strong>{lowStockCount}</strong>
            <small>Needs attention</small>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>🥤</div>
          <div className={styles.statCardContent}>
            <span className={styles.statLabel}>Consumables</span>
            <strong>{consumableCount}</strong>
            <small>Food and drinks</small>
          </div>
        </div>

        <button
          type="button"
          className={`${styles.statCard} ${styles.statCardButton}`}
          onClick={() =>
            openProductListModal({
              title: "Expiry Tracked Products",
              subtitle: "Products with expiry date or shelf life tracking.",
              products: specialLists.expiry_tracked
            })
          }
        >
          <div className={styles.statIcon}>📅</div>
          <div className={styles.statCardContent}>
            <span className={styles.statLabel}>Expiry Tracked</span>
            <strong>{expiringCount}</strong>
            <small>With shelf life or date</small>
          </div>
        </button>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>🗂️</div>
          <div className={styles.statCardContent}>
            <span className={styles.statLabel}>Categories</span>
            <strong>{totalCategories}</strong>
            <small>Organized product groups</small>
          </div>
        </div>

        <div className={styles.statCard}>
          <div className={styles.statIcon}>📏</div>
          <div className={styles.statCardContent}>
            <span className={styles.statLabel}>Unit Types</span>
            <strong>{totalUnits}</strong>
            <small>Optional pack, piece, carton labels</small>
          </div>
        </div>

        <button
          type="button"
          className={`${styles.statCard} ${styles.statCardButton}`}
          onClick={() =>
            openProductListModal({
              title: "Unlimited / Timed Products",
              subtitle: "Services, timed items, and other non-stock products.",
              products: [
                ...specialLists.unlimited,
                ...specialLists.timed.filter(
                  (timedItem) =>
                    !specialLists.unlimited.some(
                      (unlimitedItem) => Number(unlimitedItem.id) === Number(timedItem.id)
                    )
                )
              ]
            })
          }
        >
          <div className={styles.statIcon}>♾️</div>
          <div className={styles.statCardContent}>
            <span className={styles.statLabel}>Unlimited / Timed</span>
            <strong>{unlimitedTimedCount}</strong>
            <small>Services and non-stock items</small>
          </div>
        </button>

        <button
          type="button"
          className={`${styles.statCard} ${styles.statCardButton}`}
          onClick={() =>
            openProductListModal({
              title: "Disabled Products",
              subtitle: "Inactive products that can be enabled again.",
              products: specialLists.disabled,
              isDisabledList: true
            })
          }
        >
          <div className={styles.statIcon}>🚫</div>
          <div className={styles.statCardContent}>
            <span className={styles.statLabel}>Disabled</span>
            <strong>{disabledCount}</strong>
            <small>Inactive products</small>
          </div>
        </button>
      </section>

      <section
        className={`${styles.mainGrid} ${
          isFocusedMode ? styles.mainGridSingleColumn : ""
        }`}
      >
        {hasLeftPanelContent ? (
        <div className={styles.leftPanel}>
          {isSectionVisible("productForm") ? (
          <div className={styles.panelCard}>
            <SectionToggle
              title={editingId ? "Edit Product" : "Add Product"}
              subtitle="Create or update sporty, consumable, service, and general items."
              sectionKey="productForm"
              isOpen={openSections.productForm}
              onToggle={toggleSection}
              rightNode={
                editingId ? (
                  <button type="button" className={styles.ghostBtn} onClick={resetForm}>
                    Cancel
                  </button>
                ) : null
              }
            />

            {openSections.productForm ? (
              <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>Product Name</label>
                    <input
                      type="text"
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      placeholder="Snooker Table / Coke / Burger"
                      required
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Icon</label>
                    <input
                      type="text"
                      name="icon"
                      value={form.icon}
                      onChange={handleChange}
                      placeholder="📦"
                    />
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>Category</label>
                    <select
                      name="category_id"
                      value={form.category_id}
                      onChange={handleChange}
                    >
                      <option value="">Select category</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name} ({category.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label>Product Type</label>
                    <select name="type" value={form.type} onChange={handleChange}>
                      {productTypeOptions.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.formRow}>
                  <div className={styles.field}>
                    <label>Product Unit</label>
                    <select
                      name="product_unit_id"
                      value={form.product_unit_id}
                      onChange={handleChange}
                    >
                      <option value="">No unit</option>
                      {productUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {getProductUnitLabel(unit)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label>Unit Note</label>
                    <div className={styles.disabledInfoBox}>
                      Units are optional. Products can still be created without one.
                    </div>
                  </div>
                </div>

                {selectedCategory ? (
                  <div className={styles.infoPillRow}>
                    <span className={getCategoryTypeClassName(selectedCategory.type, styles)}>
                      {getCategoryTypeLabel(selectedCategory.type)}
                    </span>
                  </div>
                ) : null}

                <div className={styles.toggleBox}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      name="is_unlimited"
                      checked={form.is_unlimited}
                      onChange={handleChange}
                    />
                    <div>
                      <strong>Unlimited stock</strong>
                      <small>
                        Best for timed games, rentals, services, or anything that should
                        not reduce stock quantity.
                      </small>
                    </div>
                  </label>
                </div>

                {isTimed ? (
                  <div className={styles.formRow}>
                    <div className={styles.field}>
                      <label>Hourly Rate</label>
                      <input
                        type="number"
                        name="hourly_rate"
                        value={form.hourly_rate}
                        onChange={handleChange}
                        min="0"
                        step="0.01"
                        placeholder="Enter hourly rate"
                      />
                    </div>

                    <div className={styles.field}>
                      <label>Cost</label>
                      <input
                        type="number"
                        name="cost"
                        value={form.cost}
                        onChange={handleChange}
                        min="0"
                        step="0.01"
                        placeholder="Enter cost"
                      />
                    </div>
                  </div>
                ) : (
                  <div className={styles.formRow}>
                    <div className={styles.field}>
                      <label>Price</label>
                      <input
                        type="number"
                        name="price"
                        value={form.price}
                        onChange={handleChange}
                        min="0"
                        step="0.01"
                        placeholder="Enter price"
                      />
                    </div>

                    <div className={styles.field}>
                      <label>Cost</label>
                      <input
                        type="number"
                        name="cost"
                        value={form.cost}
                        onChange={handleChange}
                        min="0"
                        step="0.01"
                        placeholder="Enter cost"
                      />
                    </div>
                  </div>
                )}

                {canShowStockFields ? (
                  <>
                    <div className={styles.formRow}>
                      <div className={styles.field}>
                        <label>Stock</label>
                        <input
                          type="number"
                          name="stock"
                          value={form.stock}
                          onChange={handleChange}
                          min="0"
                          placeholder="Enter stock quantity"
                        />
                      </div>

                      <div className={styles.field}>
                        <label>Low Stock Level</label>
                        <input
                          type="number"
                          name="low_stock"
                          value={form.low_stock}
                          onChange={handleChange}
                          min="0"
                          placeholder="Enter low stock level"
                        />
                      </div>
                    </div>

                    {editingId ? (
                      <div className={styles.field}>
                        <label>Update Reason</label>
                        <input
                          type="text"
                          name="reason"
                          value={form.reason}
                          onChange={handleChange}
                          placeholder="Optional reason for stock change during edit"
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className={styles.disabledInfoBox}>
                    Stock tracking is turned off for this item because it is unlimited.
                  </div>
                )}

                {showConsumableFields ? (
                  <>
                    <div className={styles.sectionDivider}>
                      <h3>Consumable Settings</h3>
                      <p>Manage food and drink details here.</p>
                    </div>

                    <div className={styles.formRow}>
                      <div className={styles.field}>
                        <label>Consumable Type</label>
                        <select
                          name="consumable_type"
                          value={form.consumable_type}
                          onChange={handleChange}
                        >
                          <option value="">Select consumable type</option>
                          {consumableTypeOptions.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.field}>
                        <label>Expiry Tracking</label>
                        <label className={styles.inlineCheckbox}>
                          <input
                            type="checkbox"
                            name="has_expiry"
                            checked={form.has_expiry}
                            onChange={handleChange}
                          />
                          <span>This product has expiry</span>
                        </label>
                      </div>
                    </div>

                    {showExpiryFields ? (
                      <div className={styles.formRow}>
                        <div className={styles.field}>
                          <label>Expiry Date</label>
                          <input
                            type="date"
                            name="expiry_date"
                            value={form.expiry_date}
                            onChange={handleChange}
                          />
                        </div>

                        <div className={styles.field}>
                          <label>Shelf Life (days)</label>
                          <input
                            type="number"
                            name="shelf_life_days"
                            value={form.shelf_life_days}
                            onChange={handleChange}
                            min="0"
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <div className={styles.field}>
                  <label>Modifier Group ID</label>
                  <input
                    type="number"
                    name="modifier_group_id"
                    value={form.modifier_group_id}
                    onChange={handleChange}
                    placeholder="Optional"
                  />
                </div>

                <div className={styles.previewCard}>
                  <span className={styles.previewIcon}>{form.icon || "📦"}</span>
                  <div>
                    <strong>{form.name || "Product preview"}</strong>
                    <p>
                      {isTimed
                        ? `₦${Number(form.hourly_rate || 0).toLocaleString()}/hr`
                        : `₦${Number(form.price || 0).toLocaleString()}`}
                    </p>
                    <small>
                      {form.is_unlimited
                        ? "Unlimited stock"
                        : `Stock: ${Number(form.stock || 0)}`}
                    </small>
                    <small className={styles.previewMeta}>
                      Unit: {selectedUnit ? getProductUnitLabel(selectedUnit) : "No unit"}
                    </small>
                    {showConsumableFields ? (
                      <small className={styles.previewMeta}>
                        {form.consumable_type ? `Type: ${form.consumable_type}` : "Consumable"}
                        {form.has_expiry && form.expiry_date
                          ? ` • Expires: ${formatReadableDate(form.expiry_date)}`
                          : ""}
                        {form.has_expiry && form.shelf_life_days
                          ? ` • Shelf life: ${form.shelf_life_days} day(s)`
                          : ""}
                      </small>
                    ) : null}
                  </div>
                </div>

                <div className={styles.formActions}>
                  <button type="submit" className={styles.primaryBtn} disabled={saving}>
                    {saving
                      ? editingId
                        ? "Updating..."
                        : "Creating..."
                      : editingId
                      ? "Update Product"
                      : "Create Product"}
                  </button>
                  {editLoading ? (
                    <span className={styles.formHint}>Loading current product details...</span>
                  ) : null}
                </div>
              </form>
            ) : null}
          </div>
          ) : null}

          {isSectionVisible("stockTools") ? (
          <div className={styles.panelCard}>
            <SectionToggle
              title="Stock Tools"
              subtitle="Add, remove, or manually adjust tracked products."
              sectionKey="stockTools"
              isOpen={openSections.stockTools}
              onToggle={toggleSection}
            />

            {openSections.stockTools ? (
              <div className={styles.stockToolsGrid}>
                <form onSubmit={handleRestockSubmit} className={styles.form}>
                  <div className={styles.sectionDivider}>
                    <h3>Stock Movement</h3>
                    <p>Add or remove quantity using the inventory restock route.</p>
                  </div>

                  <div className={styles.field}>
                    <label>Search Product</label>
                    <input
                      type="text"
                      value={stockToolSearch}
                      onChange={(e) => setStockToolSearch(e.target.value)}
                      placeholder="Search by product, category, type, or unit"
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Product</label>
                    <select
                      value={restockForm.productId}
                      onChange={(e) =>
                        setRestockForm((prev) => ({ ...prev, productId: e.target.value }))
                      }
                    >
                      <option value="">Select product</option>
                      {stockToolProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                          {product.category_name ? ` • ${product.category_name}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.field}>
                      <label>Action</label>
                      <select
                        value={restockForm.action}
                        onChange={(e) =>
                          setRestockForm((prev) => ({ ...prev, action: e.target.value }))
                        }
                      >
                        <option value="add">Add Stock</option>
                        <option value="remove">Remove Stock</option>
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label>Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={restockForm.qty}
                        onChange={(e) =>
                          setRestockForm((prev) => ({ ...prev, qty: e.target.value }))
                        }
                        placeholder="Enter qty"
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label>Reason</label>
                    <input
                      type="text"
                      value={restockForm.reason}
                      onChange={(e) =>
                        setRestockForm((prev) => ({ ...prev, reason: e.target.value }))
                      }
                      placeholder={
                        restockForm.action === "remove"
                          ? "Why are you removing stock?"
                          : "Why are you adding stock?"
                      }
                    />
                  </div>

                  <button
                    className={
                      restockForm.action === "remove" ? styles.warnBtn : styles.primaryBtn
                    }
                    type="submit"
                    disabled={stockActionLoading}
                  >
                    {stockActionLoading
                      ? "Processing..."
                      : restockForm.action === "remove"
                      ? "Remove Stock"
                      : "Add Stock"}
                  </button>
                </form>

                <form onSubmit={handleAdjustSubmit} className={styles.form}>
                  <div className={styles.sectionDivider}>
                    <h3>Adjust Stock</h3>
                    <p>Set a new exact quantity for a product.</p>
                  </div>

                  <div className={styles.field}>
                    <label>Search Product</label>
                    <input
                      type="text"
                      value={stockToolSearch}
                      onChange={(e) => setStockToolSearch(e.target.value)}
                      placeholder="Search by product, category, type, or unit"
                    />
                  </div>

                  <div className={styles.field}>
                    <label>Product</label>
                    <select
                      value={adjustForm.productId}
                      onChange={(e) =>
                        setAdjustForm((prev) => ({ ...prev, productId: e.target.value }))
                      }
                    >
                      <option value="">Select product</option>
                      {stockToolProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                          {product.category_name ? ` • ${product.category_name}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.formRow}>
                    <div className={styles.field}>
                      <label>New Quantity</label>
                      <input
                        type="number"
                        min="0"
                        value={adjustForm.newQty}
                        onChange={(e) =>
                          setAdjustForm((prev) => ({ ...prev, newQty: e.target.value }))
                        }
                        placeholder="Enter new qty"
                      />
                    </div>

                    <div className={styles.field}>
                      <label>Reason</label>
                      <input
                        type="text"
                        value={adjustForm.reason}
                        onChange={(e) =>
                          setAdjustForm((prev) => ({ ...prev, reason: e.target.value }))
                        }
                        placeholder="Adjustment reason"
                      />
                    </div>
                  </div>

                  <button
                    className={styles.warnBtn}
                    type="submit"
                    disabled={stockActionLoading}
                  >
                    {stockActionLoading ? "Processing..." : "Adjust Stock"}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
          ) : null}

          {isSectionVisible("categories") ? (
          <div className={styles.panelCard}>
            <SectionToggle
              title={editingCategoryId ? "Edit Category" : "Categories"}
              subtitle="Create and manage product groups with category types."
              sectionKey="categories"
              isOpen={openSections.categories}
              onToggle={toggleSection}
              rightNode={
                editingCategoryId ? (
                  <button type="button" className={styles.ghostBtn} onClick={resetCategoryForm}>
                    Cancel
                  </button>
                ) : null
              }
            />

            {openSections.categories ? (
              <>
                <form onSubmit={handleCategorySubmit} className={styles.categoryForm}>
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) =>
                      setCategoryForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Enter category name"
                  />

                  <select
                    value={categoryForm.type}
                    onChange={(e) =>
                      setCategoryForm((prev) => ({ ...prev, type: e.target.value }))
                    }
                  >
                    {categoryTypeOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="submit"
                    className={styles.primaryBtn}
                    disabled={categorySaving}
                  >
                    {categorySaving
                      ? editingCategoryId
                        ? "Updating..."
                        : "Saving..."
                      : editingCategoryId
                      ? "Update"
                      : "Add"}
                  </button>
                </form>

                <div className={styles.categoryList}>
                  {categories.length ? (
                    categories.map((category) => (
                      <div key={category.id} className={styles.categoryItem}>
                        <div className={styles.categoryInfo}>
                          <span>{category.name}</span>
                          <small className={getCategoryTypeClassName(category.type, styles)}>
                            {getCategoryTypeLabel(category.type)}
                          </small>
                        </div>

                        <div className={styles.categoryActions}>
                          <button
                            type="button"
                            className={styles.editBtn}
                            onClick={() => handleCategoryEdit(category)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            onClick={() => handleCategoryDelete(category.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className={styles.emptyMini}>No categories yet</div>
                  )}
                </div>
              </>
            ) : null}
          </div>
          ) : null}

          {isSectionVisible("units") ? (
          <div className={styles.panelCard}>
            <SectionToggle
              title={editingUnitId ? "Edit Unit Type" : "Product Units"}
              subtitle="Create flexible unit labels like piece, pack, or carton."
              sectionKey="units"
              isOpen={openSections.units}
              onToggle={toggleSection}
              rightNode={
                editingUnitId ? (
                  <button type="button" className={styles.ghostBtn} onClick={resetUnitForm}>
                    Cancel
                  </button>
                ) : null
              }
            />

            {openSections.units ? (
              <>
                <form onSubmit={handleUnitSubmit} className={styles.managementForm}>
                  <input
                    type="text"
                    value={unitForm.name}
                    onChange={(e) =>
                      setUnitForm((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Enter unit name"
                  />

                  <input
                    type="text"
                    value={unitForm.short_name}
                    onChange={(e) =>
                      setUnitForm((prev) => ({ ...prev, short_name: e.target.value }))
                    }
                    placeholder="Short name e.g. pc, ctn"
                  />

                  <button
                    type="submit"
                    className={styles.primaryBtn}
                    disabled={categorySaving}
                  >
                    {categorySaving
                      ? editingUnitId
                        ? "Updating..."
                        : "Saving..."
                      : editingUnitId
                      ? "Update"
                      : "Add"}
                  </button>
                </form>

                <div className={styles.categoryList}>
                  {productUnits.length ? (
                    productUnits.map((unit) => (
                      <div key={unit.id} className={styles.categoryItem}>
                        <div className={styles.categoryInfo}>
                          <span>{unit.name}</span>
                          <small className={styles.metaChip}>
                            {unit.short_name || "No short name"}
                          </small>
                        </div>

                        <div className={styles.categoryActions}>
                          <button
                            type="button"
                            className={styles.editBtn}
                            onClick={() => handleUnitEdit(unit)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.deleteBtn}
                            onClick={() => handleUnitDelete(unit.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className={styles.emptyMini}>No product units yet</div>
                  )}
                </div>
              </>
            ) : null}
          </div>
          ) : null}
        </div>
        ) : null}

        {hasRightPanelContent ? (
        <div className={styles.rightPanel}>
          {isSectionVisible("inventoryList") ? (
          <div className={styles.panelCard}>
            <SectionToggle
              title="Inventory List"
              subtitle="Search and manage your active products."
              sectionKey="inventoryList"
              isOpen={openSections.inventoryList}
              onToggle={toggleSection}
              rightNode={
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search product, category, type, unit..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              }
            />

            {loading ? (
              <div className={styles.loadingBox}>Loading inventory...</div>
            ) : openSections.inventoryList ? (
              filteredProducts.length ? (
                <>
                  <div className={styles.inventoryListFrame}>
                  <div className={styles.inventoryListToolbar}>
                    <div className={styles.inventoryListMeta}>
                      <span className={styles.metaChip}>
                        {filteredProducts.length} listed
                      </span>
                      <span className={styles.metaChip}>
                        Page {currentPage} of {totalPages}
                      </span>
                    </div>
                  </div>

                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <colgroup>
                        <col className={styles.colId} />
                        <col className={styles.colProduct} />
                        <col className={styles.colCategory} />
                        <col className={styles.colType} />
                        <col className={styles.colUnit} />
                        <col className={styles.colPrice} />
                        <col className={styles.colCost} />
                        <col className={styles.colStock} />
                        <col className={styles.colExpiry} />
                        <col className={styles.colStatus} />
                        <col className={styles.colActions} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>ID</th>
                          <th>Product</th>
                          <th>Category</th>
                          <th>Type</th>
                          <th>Unit</th>
                          <th>Price / Rate</th>
                          <th>Cost</th>
                          <th>Stock</th>
                          <th>Expiry</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedProducts.map((product) => {
                          const isUnlimited = Number(product.is_unlimited) === 1;
                          const isLow =
                            !isUnlimited &&
                            Number(product.stock || 0) <= Number(product.low_stock || 0);

                          return (
                            <tr key={product.id}>
                              <td>#{product.id}</td>
                              <td>
                                <div className={styles.productCell}>
                                  <span className={styles.productCellIcon}>
                                    {product.icon || getProductImageLabel(product)}
                                  </span>
                                  <div className={styles.productCellBody}>
                                    <div className={styles.productCellTop}>
                                      <strong>{product.name}</strong>
                                      <small className={styles.productIdTag}>#{product.id}</small>
                                    </div>
                                    <small>
                                      {product.consumable_type
                                        ? `${product.consumable_type}`
                                        : product.category_name || "No category"}
                                    </small>
                                    <div className={styles.inlineMetaRow}>
                                      {product.product_unit_name ? (
                                        <span className={styles.metaChip}>
                                          {getProductUnitLabel({
                                            name: product.product_unit_name,
                                            short_name: product.product_unit_short_name
                                          })}
                                        </span>
                                      ) : null}
                                      {Number(product.has_expiry) === 1 ? (
                                        <span className={styles.metaChipMuted}>
                                          Exp: {formatReadableDate(product.expiry_date)}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <div className={styles.cellStack}>
                                  <span>{product.category_name || "-"}</span>
                                  {product.category_type ? (
                                    <small
                                      className={getCategoryTypeClassName(
                                        product.category_type,
                                        styles
                                      )}
                                    >
                                      {getCategoryTypeLabel(product.category_type)}
                                    </small>
                                  ) : null}
                                </div>
                              </td>
                              <td>
                                <span className={getTypeClassName(product.type, styles)}>
                                  {getTypeLabel(product.type)}
                                </span>
                              </td>
                              <td>{product.product_unit_name ? getProductUnitLabel({
                                name: product.product_unit_name,
                                short_name: product.product_unit_short_name
                              }) : "No unit"}</td>
                              <td>{getProductAmountText(product)}</td>
                              <td>₦{Number(product.cost || 0).toLocaleString()}</td>
                              <td>
                                {isUnlimited ? (
                                  <span className={styles.unlimitedBadge}>Unlimited</span>
                                ) : (
                                  <span
                                    className={isLow ? styles.lowStockBadge : styles.stockBadge}
                                  >
                                    {product.stock}
                                  </span>
                                )}
                              </td>
                              <td>
                                {Number(product.has_expiry) === 1 ? (
                                  <div className={styles.cellStack}>
                                    <span>{formatReadableDate(product.expiry_date)}</span>
                                    <small>
                                      {product.shelf_life_days
                                        ? `${product.shelf_life_days} day(s)`
                                        : "Shelf life not set"}
                                    </small>
                                  </div>
                                ) : (
                                  <span className={styles.statusSoft}>No expiry</span>
                                )}
                              </td>
                              <td>
                                {isUnlimited ? (
                                  <span className={styles.statusSoft}>No tracking</span>
                                ) : isLow ? (
                                  <span className={styles.statusDanger}>Low stock</span>
                                ) : (
                                  <span className={styles.statusGood}>In stock</span>
                                )}
                              </td>
                              <td>
                                <div className={styles.tableActions}>
                                  <button
                                    type="button"
                                    className={styles.editBtn}
                                    onClick={() => handleEdit(product)}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.warnBtn}
                                    onClick={() => handleDisable(product.id)}
                                  >
                                    Disable
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.deleteBtn}
                                    onClick={() => handleDelete(product.id)}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  </div>

                  <div className={styles.mobileCards}>
                    {paginatedProducts.map((product) => {
                      const isUnlimited = Number(product.is_unlimited) === 1;
                      const isLow =
                        !isUnlimited &&
                        Number(product.stock || 0) <= Number(product.low_stock || 0);

                      return (
                        <div key={product.id} className={styles.mobileCard}>
                          <div className={styles.mobileCardTop}>
                            <div className={styles.mobileTitleWrap}>
                              <span className={styles.mobileIcon}>
                                {product.icon || getProductImageLabel(product)}
                              </span>
                              <div>
                                <h4>{product.name}</h4>
                                <p>{product.category_name || "No category"}</p>
                              </div>
                            </div>
                          </div>

                          <div className={styles.mobileTagRow}>
                            {product.category_type ? (
                              <span
                                className={getCategoryTypeClassName(
                                  product.category_type,
                                  styles
                                )}
                              >
                                {getCategoryTypeLabel(product.category_type)}
                              </span>
                            ) : null}

                            <span className={getTypeClassName(product.type, styles)}>
                              {getTypeLabel(product.type)}
                            </span>

                            {product.consumable_type ? (
                              <span className={styles.metaChip}>
                                {product.consumable_type}
                              </span>
                            ) : null}

                            {product.product_unit_name ? (
                              <span className={styles.metaChip}>
                                {getProductUnitLabel({
                                  name: product.product_unit_name,
                                  short_name: product.product_unit_short_name
                                })}
                              </span>
                            ) : null}
                          </div>

                          <div className={styles.mobileMetricsRow}>
                            <div className={styles.mobileMetric}>
                              <span>Unit</span>
                              <strong>
                                {product.product_unit_name
                                  ? getProductUnitLabel({
                                      name: product.product_unit_name,
                                      short_name: product.product_unit_short_name
                                    })
                                  : "No unit"}
                              </strong>
                            </div>
                            <div className={styles.mobileMetric}>
                              <span>Price / Rate</span>
                              <strong>{getProductAmountText(product)}</strong>
                            </div>
                            <div className={styles.mobileMetric}>
                              <span>Stock</span>
                              <strong>{isUnlimited ? "Unlimited" : product.stock}</strong>
                            </div>
                            <div className={styles.mobileMetric}>
                              <span>Status</span>
                              <strong>
                                {isUnlimited ? "No tracking" : isLow ? "Low stock" : "In stock"}
                              </strong>
                            </div>
                          </div>

                          <div className={styles.mobileFooterRow}>
                            <div className={styles.mobileDateMeta}>
                              <span>Expiry Date</span>
                              <strong>
                                {Number(product.has_expiry) === 1
                                  ? formatReadableDate(product.expiry_date)
                                  : "No expiry"}
                              </strong>
                            </div>
                            <div className={styles.mobileDateMeta}>
                              <span>Shelf Life</span>
                              <strong>
                                {product.shelf_life_days
                                  ? `${product.shelf_life_days} day(s)`
                                  : "-"}
                              </strong>
                            </div>

                            <div className={styles.mobileActions}>
                            <button
                              type="button"
                              className={`${styles.editBtn} ${styles.mobileActionBtn}`}
                              onClick={() => handleEdit(product)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className={`${styles.warnBtn} ${styles.mobileActionBtn}`}
                              onClick={() => handleDisable(product.id)}
                            >
                              Disable
                            </button>
                            <button
                              type="button"
                              className={`${styles.deleteBtn} ${styles.mobileActionBtn}`}
                              onClick={() => handleDelete(product.id)}
                            >
                              Delete
                            </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className={styles.paginationWrap}>
                    <div className={styles.paginationInfo}>
                      Showing{" "}
                      <strong>
                        {filteredProducts.length === 0
                          ? 0
                          : (currentPage - 1) * ITEMS_PER_PAGE + 1}
                      </strong>{" "}
                      to{" "}
                      <strong>
                        {Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)}
                      </strong>{" "}
                      of <strong>{filteredProducts.length}</strong> products
                    </div>

                    <div className={styles.pagination}>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                      >
                        Prev
                      </button>

                      <span className={styles.pageIndicator}>
                        Page {currentPage} / {totalPages}
                      </span>

                      <button
                        type="button"
                        className={styles.ghostBtn}
                        onClick={() =>
                          setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                        }
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}>📭</div>
                  <h3>No products found</h3>
                  <p>Try a different search or create a new product.</p>
                </div>
              )
            ) : null}
          </div>
          ) : null}

          {isSectionVisible("lowStock") ? (
          <div className={styles.panelCard}>
            <SectionToggle
              title="Low Stock Products"
              subtitle="Products that already reached or passed the low stock limit."
              sectionKey="lowStock"
              isOpen={openSections.lowStock}
              onToggle={toggleSection}
            />

            {openSections.lowStock ? (
              lowStockProducts.length ? (
                <div className={styles.simpleList}>
                  {lowStockProducts.map((item) => (
                    <div key={item.id} className={styles.simpleListItem}>
                      <div>
                        <strong>
                          {item.icon || "📦"} {item.name}
                        </strong>
                        <p>
                          Stock: {item.stock} / Low stock level: {item.low_stock}
                        </p>
                      </div>
                      <span className={styles.lowStockBadge}>Low stock</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyMini}>No low stock products</div>
              )
            ) : null}
          </div>
          ) : null}

          {isSectionVisible("stockHistory") ? (
          <div className={styles.panelCard}>
            <SectionToggle
              title="Stock History"
              subtitle="Latest 100 inventory stock changes."
              sectionKey="stockHistory"
              isOpen={openSections.stockHistory}
              onToggle={toggleSection}
            />

            {openSections.stockHistory ? (
              stockHistory.length ? (
                <div className={styles.historyList}>
                  {stockHistory.map((item) => (
                    <div key={item.id} className={styles.historyItem}>
                      <div className={styles.historyTop}>
                        <strong>{item.product_name}</strong>
                        <span className={styles.metaChip}>
                          {item.change_qty > 0 ? `+${item.change_qty}` : item.change_qty}
                        </span>
                      </div>
                      <p>
                        {item.before_qty} → {item.after_qty}
                      </p>
                      <small>
                        {item.reason || "No reason"} • by {item.updated_by || "Unknown"}
                      </small>
                      <small className={styles.historyDateTime}>
                        {formatStockHistoryDateTime(item.created_at)}
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyMini}>No stock history yet</div>
              )
            ) : null}
          </div>
          ) : null}

          {isSectionVisible("disabledProducts") ? (
          <div className={styles.panelCard}>
            <SectionToggle
              title="Disabled Products"
              subtitle="Inactive items that can still be enabled again."
              sectionKey="disabledProducts"
              isOpen={openSections.disabledProducts}
              onToggle={toggleSection}
            />

            {openSections.disabledProducts ? (
              disabledProducts.length ? (
                <div className={styles.simpleList}>
                  {disabledProducts.map((item) => (
                    <div key={item.id} className={styles.simpleListItem}>
                      <div>
                        <strong>
                          {item.icon || "📦"} {item.name}
                        </strong>
                        <p>{item.category_name || "No category"}</p>
                      </div>
                      <button
                        type="button"
                        className={styles.successBtn}
                        onClick={() => handleEnable(item.id)}
                      >
                        Enable
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyMini}>No disabled products</div>
              )
            ) : null}
          </div>
          ) : null}
        </div>
        ) : null}
      </section>
    </div>
  );
}
