// src/components/pos-management/POSManagement.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiSearch,
  FiTrash2,
  FiPlus,
  FiMinus,
  FiShoppingCart,
  FiCreditCard,
  FiDollarSign,
  FiPrinter,
  FiX,
  FiPauseCircle,
  FiPlayCircle,
  FiClock,
  FiRefreshCw,
  FiChevronDown,
  FiChevronUp,
  FiUser,
  FiTag,
  FiGrid,
  FiFolder,
  FiCheckCircle,
  FiRepeat,
  FiShare2,
  FiExternalLink
} from "react-icons/fi";

import { getProducts } from "../../api/productsApi";
import { getProductUnitHierarchy } from "../../api/unitHierarchyApi";
import {
  checkoutSale,
  splitItemPrice,
  getSalesSummary,
  createPendingCart,
  getPendingCarts,
  getPendingCartById,
  updatePendingCart,
  cancelPendingCart,
  checkoutPendingCart
} from "../../api/posApi";
import { getSettings } from "../../api/settingsApi";
import { getMe } from "../../api/authApi";
import { getMembers } from "../../api/membersApi";
import {
  checkoutCustomerOrder,
  getCustomerOrderById,
  getIncomingCustomerOrders,
  holdCustomerOrder,
  resumeCustomerOrder,
  updateCustomerOrderStatus
} from "../../api/customerOrdersApi";
import DashboardLoader from "../dashboard-loader/DashboardLoader";
import CustomerOrdersAlert from "../pos/CustomerOrdersAlert";
import CustomerOrdersDrawer from "../pos/CustomerOrdersDrawer";
import CustomerOrderDetailsModal from "../pos/CustomerOrderDetailsModal";
import styles from "./POSManagement.module.css";

const PAYMENT_METHODS = [
  { key: "cash", label: "Cash", icon: <FiDollarSign /> },
  { key: "card", label: "Card", icon: <FiCreditCard /> },
  { key: "transfer", label: "Transfer", icon: <FiRepeat /> },
  { key: "split", label: "Split", icon: <FiShoppingCart /> }
];

const DEFAULT_SETTINGS = {
  business_name: "Pray Restaurant & Lounge",
  business_address: "123 Game Street, Lagos",
  business_phone: "+234 800 000 0000",
  tax_rate: 0,
  currency: "NGN",
  receipt_footer: "Thank you for visiting Pray Restaurant & Lounge!"
};

const HALF_PRICE_DISCOUNT_PCT = 50;

const buildSellUnitOptions = (product, unitLevels = []) => {
  return unitLevels.map((level, index) => ({
    unit_level_id: Number(level.id),
    unit_label: level.unit_name || `Unit ${index + 1}`,
    unit_short_name: level.unit_short_name || "",
    unit_price: Number(level.price || product.price || 0),
    current_qty: Number(level.current_qty || 0),
    available_qty: Number(level.available_qty || 0),
    level: Number(level.level || index + 1),
    conversion_factor: Number(level.conversion_factor || 1),
    smallest_unit_multiplier: Number(level.smallest_unit_multiplier || 1),
    is_smallest_unit: Number(level.is_smallest_unit || 0) === 1
  }));
};

const currencySymbols = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
  GHS: "₵",
  ZAR: "R ",
  KES: "Ksh "
};

const getStoredUser = () => {
  try {
    const rawUser = localStorage.getItem("user");
    return rawUser ? JSON.parse(rawUser) : null;
  } catch {
    return null;
  }
};

const getInitialSalesDockPosition = () => {
  if (typeof window === "undefined") {
    return { top: 84, right: 18 };
  }

  return {
    top: window.innerWidth <= 768 ? 72 : 84,
    right: window.innerWidth <= 768 ? 14 : 18
  };
};

const clampSalesDockPosition = (position, dockWidth = 280, dockHeight = 58) => {
  if (typeof window === "undefined") return position;

  const minTop = 12;
  const minRight = 12;
  const maxTop = Math.max(minTop, window.innerHeight - dockHeight - 12);
  const maxRight = Math.max(minRight, window.innerWidth - dockWidth - 12);

  return {
    top: Math.min(Math.max(position.top, minTop), maxTop),
    right: Math.min(Math.max(position.right, minRight), maxRight)
  };
};

const getInitialOrderDockPosition = () => {
  if (typeof window === "undefined") {
    return { top: 200, right: 18 };
  }

  return {
    top: window.innerWidth <= 768 ? 200 : 200,
    right: window.innerWidth <= 768 ? 14 : 18
  };
};

const clampOrderDockPosition = (position, dockWidth = 60, dockHeight = 60) => {
  if (typeof window === "undefined") return position;

  const minTop = 12;
  const minRight = 12;
  const maxTop = Math.max(minTop, window.innerHeight - dockHeight - 12);
  const maxRight = Math.max(minRight, window.innerWidth - dockWidth - 12);

  return {
    top: Math.min(Math.max(position.top, minTop), maxTop),
    right: Math.min(Math.max(position.right, minRight), maxRight)
  };
};

export default function POSManagement() {
  const [products, setProducts] = useState([]);
  const [members, setMembers] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [currentProductsPage, setCurrentProductsPage] = useState(1);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [currentUser, setCurrentUser] = useState(null);
  const [salesSummary, setSalesSummary] = useState({
    days: [],
    total_sales: 0,
    total_count: 0,
    details: null
  });
  const [loadingSalesSummary, setLoadingSalesSummary] = useState(true);
  const [salesSummaryOpen, setSalesSummaryOpen] = useState(false);
  const [salesSummaryPeek, setSalesSummaryPeek] = useState(false);
  const [salesSummaryDetailsOpen, setSalesSummaryDetailsOpen] = useState(false);
  const [loadingSalesSummaryDetails, setLoadingSalesSummaryDetails] = useState(false);
  const [salesDockPosition, setSalesDockPosition] = useState(
    getInitialSalesDockPosition
  );
  const salesDockRef = useRef(null);
  const cartPanelRef = useRef(null);
  const salesLongPressTimerRef = useRef(null);
  const suppressSalesFabClickRef = useRef(false);
  const salesDragStateRef = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    startTop: 0,
    startRight: 0,
    moved: false
  });

  const [orderDockPosition, setOrderDockPosition] = useState(
    getInitialOrderDockPosition
  );
  const orderDockRef = useRef(null);
  const orderDragStateRef = useRef({
    pointerId: null,
    startX: 0,
    startY: 0,
    startTop: 0,
    startRight: 0,
    moved: false
  });

  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem("pos_cart");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [unitOptionsCache, setUnitOptionsCache] = useState({});
  const [unitPickerProduct, setUnitPickerProduct] = useState(null);
  const [unitPickerOptions, setUnitPickerOptions] = useState([]);
  const [loadingUnitPicker, setLoadingUnitPicker] = useState(false);
  const [unitPickerError, setUnitPickerError] = useState("");
  const [customer, setCustomer] = useState("Walk-in");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberTierSnapshot, setMemberTierSnapshot] = useState(null);

  const [discountPct, setDiscountPct] = useState("");
  const [loyaltyDiscount, setLoyaltyDiscount] = useState("");
  const [giftcardDiscount, setGiftcardDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [cashTendered, setCashTendered] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [splitCard, setSplitCard] = useState("");
  const [splitTransfer, setSplitTransfer] = useState("");
  const [shiftId, setShiftId] = useState("");

  const [checkingOut, setCheckingOut] = useState(false);
  const [splittingItemId, setSplittingItemId] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");

  const [pendingCarts, setPendingCarts] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [savingPending, setSavingPending] = useState(false);
  const [activePendingId, setActivePendingId] = useState(null);
  const [pendingNote, setPendingNote] = useState("");

  const [desktopPendingOpen, setDesktopPendingOpen] = useState(true);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(true);
  const [mobileProductsOpen, setMobileProductsOpen] = useState(true);
  const [mobilePendingOpen, setMobilePendingOpen] = useState(false);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(true);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customerOrdersOpen, setCustomerOrdersOpen] = useState(false);
  const [activeCustomerOrder, setActiveCustomerOrder] = useState(null);
  const [heldCustomerIds, setHeldCustomerIds] = useState(() => {
    try {
      const raw = localStorage.getItem("held_customer_order_ids");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [checkoutCustomerIds, setCheckoutCustomerIds] = useState(() => {
    try {
      const raw = localStorage.getItem("checkout_customer_order_ids");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const formatMoney = (value) => {
    const currency = settings?.currency || "NGN";
    const symbol = currencySymbols[currency] || "₦";

    return `${symbol}${Number(value || 0).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const formatDateTimeLocal = (value) => {
    if (!value) return "";
    const date = new Date(value);
    return date.toLocaleString("en-NG");
  };

  const formatUnitLabel = (item) => {
    if (!item?.unit_label) return "";
    return item.unit_short_name
      ? `${item.unit_label} (${item.unit_short_name})`
      : item.unit_label;
  };

  const formatAvailableUnitStock = (item) => {
    if (!item) return "";
    const unitLabel = formatUnitLabel(item);
    if (!unitLabel) return "";
    const availableQty = Number(item.available_qty ?? item.available_unit_stock ?? 0);
    return `${availableQty} ${unitLabel}`;
  };

  useEffect(() => {
    loadInitialData();
    loadPendingCarts();
    loadCustomerOrders();
    loadSalesSummary();
  }, []);

  useEffect(() => {
    const timer = setInterval(loadCustomerOrders, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadSalesSummary({ silent: true });
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      loadProductsData({ silent: true });
    }, 15000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const rect = salesDockRef.current?.getBoundingClientRect();
      setSalesDockPosition((prev) =>
        clampSalesDockPosition(prev, rect?.width || 280, rect?.height || 58)
      );
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    return () => {
      if (salesLongPressTimerRef.current) {
        window.clearTimeout(salesLongPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem("held_customer_order_ids", JSON.stringify(heldCustomerIds));
  }, [heldCustomerIds]);

  useEffect(() => {
    localStorage.setItem("checkout_customer_order_ids", JSON.stringify(checkoutCustomerIds));
  }, [checkoutCustomerIds]);

  useEffect(() => {
    localStorage.setItem("pos_cart", JSON.stringify(cart));
  }, [cart]);

  const loadProductsData = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoadingProducts(true);
        setError("");
      }

      const productsRes = await getProducts();
      setProducts(productsRes?.data || []);
    } catch (err) {
      if (!silent) {
        setError(err?.response?.data?.message || "Failed to load products");
      }
    } finally {
      if (!silent) {
        setLoadingProducts(false);
      }
    }
  };

  const loadInitialData = async () => {
    try {
      setLoadingProducts(true);
      setLoadingSettings(true);
      setError("");

      const [productsRes, settingsRes, meRes, membersRes] = await Promise.all([
        getProducts(),
        getSettings(),
        getMe().catch(() => null),
        getMembers().catch(() => ({ data: [] }))
      ]);

      setProducts(productsRes?.data || []);
      setMembers(membersRes?.data || []);

      const settingsData = settingsRes?.data || {};
      setSettings({
        business_name:
          settingsData.business_name ||
          settingsData.biz_name ||
          DEFAULT_SETTINGS.business_name,
        business_address:
          settingsData.business_address ||
          settingsData.biz_addr ||
          DEFAULT_SETTINGS.business_address,
        business_phone:
          settingsData.business_phone ||
          settingsData.biz_phone ||
          DEFAULT_SETTINGS.business_phone,
        tax_rate: Number(
          settingsData.tax_rate ??
            settingsData.taxRate ??
            DEFAULT_SETTINGS.tax_rate
        ),
        currency:
          settingsData.currency ||
          settingsData.default_currency ||
          DEFAULT_SETTINGS.currency,
        receipt_footer:
          settingsData.receipt_footer ||
          settingsData.footer ||
          DEFAULT_SETTINGS.receipt_footer
      });

      const storedUser = getStoredUser();
      setCurrentUser(
        meRes?.user ? { ...storedUser, ...meRes.user } : storedUser
      );
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load POS data");
    } finally {
      setLoadingProducts(false);
      setLoadingSettings(false);
    }
  };

  const openCurrentOrderOnMobile = () => {
    setOrderModalOpen(true);
    setMobileCartOpen(true);
    setMobileSummaryOpen(true);

    if (typeof window !== "undefined" && window.innerWidth <= 860) {
      setMobileProductsOpen(false);
    }
  };

  const loadPendingCarts = async () => {
    try {
      setLoadingPending(true);
      const res = await getPendingCarts();
      setPendingCarts(res?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load pending carts");
    } finally {
      setLoadingPending(false);
    }
  };

  const loadCustomerOrders = async () => {
    try {
      const res = await getIncomingCustomerOrders();
      setCustomerOrders(res?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load customer orders");
    }
  };

  const loadSalesSummary = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoadingSalesSummary(true);
      }

      const res = await getSalesSummary();
      setSalesSummary((current) => ({
        days: res?.data?.days || [],
        total_sales: Number(res?.data?.total_sales || 0),
        total_count: Number(res?.data?.total_count || 0),
        details: silent ? current.details : null
      }));
    } catch (err) {
      if (!silent) {
        setError(err?.response?.data?.message || "Failed to load sales summary");
      }
    } finally {
      if (!silent) {
        setLoadingSalesSummary(false);
      }
    }
  };

  const loadSalesSummaryDetails = async () => {
    try {
      setLoadingSalesSummaryDetails(true);
      const res = await getSalesSummary({ include_details: 1 });
      setSalesSummary({
        days: res?.data?.days || [],
        total_sales: Number(res?.data?.total_sales || 0),
        total_count: Number(res?.data?.total_count || 0),
        details: res?.data?.details || null
      });
      setSalesSummaryDetailsOpen(true);
    } catch (err) {
      setError(
        err?.response?.data?.message || "Failed to load detailed sales summary"
      );
    } finally {
      setLoadingSalesSummaryDetails(false);
    }
  };

  const handleSalesDockPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    const rect = salesDockRef.current?.getBoundingClientRect();
    suppressSalesFabClickRef.current = false;
    salesDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTop: salesDockPosition.top,
      startRight: salesDockPosition.right,
      moved: false,
      dockWidth: rect?.width || 280,
      dockHeight: rect?.height || 58
    };

    if (salesLongPressTimerRef.current) {
      window.clearTimeout(salesLongPressTimerRef.current);
    }

    salesLongPressTimerRef.current = window.setTimeout(() => {
      setSalesSummaryPeek(true);
    }, 450);

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleSalesDockPointerMove = (event) => {
    const dragState = salesDragStateRef.current;
    if (dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const nextPosition = clampSalesDockPosition(
      {
        top: dragState.startTop + deltaY,
        right: dragState.startRight - deltaX
      },
      dragState.dockWidth,
      dragState.dockHeight
    );

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      dragState.moved = true;
      suppressSalesFabClickRef.current = true;
      if (salesLongPressTimerRef.current) {
        window.clearTimeout(salesLongPressTimerRef.current);
        salesLongPressTimerRef.current = null;
      }
    }

    setSalesDockPosition(nextPosition);
  };

  const handleSalesDockPointerUp = (event) => {
    const dragState = salesDragStateRef.current;
    if (dragState.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture?.(event.pointerId);

    if (salesLongPressTimerRef.current) {
      window.clearTimeout(salesLongPressTimerRef.current);
      salesLongPressTimerRef.current = null;
    }

    salesDragStateRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      startTop: 0,
      startRight: 0,
      moved: false
    };
  };

  const handleSalesDockPointerCancel = () => {
    if (salesLongPressTimerRef.current) {
      window.clearTimeout(salesLongPressTimerRef.current);
      salesLongPressTimerRef.current = null;
    }
  };

  const handleSalesFabClick = () => {
    if (suppressSalesFabClickRef.current) {
      suppressSalesFabClickRef.current = false;
      return;
    }

    setSalesSummaryOpen((prev) => !prev);
    setSalesSummaryPeek(false);
  };

  const handleOrderDockPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    const rect = orderDockRef.current?.getBoundingClientRect();
    orderDragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTop: orderDockPosition.top,
      startRight: orderDockPosition.right,
      moved: false,
      dockWidth: rect?.width || 60,
      dockHeight: rect?.height || 60
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleOrderDockPointerMove = (event) => {
    const dragState = orderDragStateRef.current;
    if (dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const nextPosition = clampOrderDockPosition(
      {
        top: dragState.startTop + deltaY,
        right: dragState.startRight - deltaX
      },
      dragState.dockWidth,
      dragState.dockHeight
    );

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      dragState.moved = true;
    }

    setOrderDockPosition(nextPosition);
  };

  const handleOrderDockPointerUp = (event) => {
    const dragState = orderDragStateRef.current;
    if (dragState.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture?.(event.pointerId);

    orderDragStateRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      startTop: 0,
      startRight: 0,
      moved: false
    };
  };

  const categories = useMemo(() => {
    return [
      "All",
      ...new Set(products.map((p) => p.category_name).filter(Boolean))
    ];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory =
        activeCategory === "All" || product.category_name === activeCategory;

      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q ||
        product.name?.toLowerCase().includes(q) ||
        product.category_name?.toLowerCase().includes(q) ||
        product.type?.toLowerCase().includes(q);

      return matchesCategory && matchesSearch;
    });
  }, [products, search, activeCategory]);

  const PRODUCTS_PER_PAGE = 6;

  const totalProductPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  }, [filteredProducts]);

  const paginatedProducts = useMemo(() => {
    const startIndex = (currentProductsPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);
  }, [filteredProducts, currentProductsPage]);

  useEffect(() => {
    setCurrentProductsPage(1);
  }, [search, activeCategory]);

  useEffect(() => {
    if (currentProductsPage > totalProductPages) {
      setCurrentProductsPage(totalProductPages);
    }
  }, [currentProductsPage, totalProductPages]);

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();

    if (!q || selectedMember) return [];

    return members
      .filter((member) => {
        return (
          member.full_name?.toLowerCase().includes(q) ||
          member.name?.toLowerCase().includes(q) ||
          member.phone?.toLowerCase().includes(q) ||
          member.email?.toLowerCase().includes(q) ||
          member.member_code?.toLowerCase().includes(q)
        );
      })
      .slice(0, 10);
  }, [members, memberSearch, selectedMember]);

  const displayedCustomerName = selectedMember
    ? selectedMember.full_name || selectedMember.name || "Walk-in"
    : customer?.trim() || "Walk-in";

  const appliedMembershipTierName =
    memberTierSnapshot?.membership_tier_name ||
    selectedMember?.membership_tier_name ||
    selectedMember?.tier ||
    "";

  const appliedMembershipDiscountPct = Number(
    memberTierSnapshot?.membership_discount_pct ??
      selectedMember?.membership_discount_pct ??
      0
  );

  const customerInputValue = selectedMember
    ? selectedMember.full_name || selectedMember.name || ""
    : memberSearch;

  const getLineFinalPrice = (item, qty = item.qty) => {
    if (item.item_type === "timed") {
      return Number(item.final_price || 0);
    }

    const discountPct = Number(item.item_discount_pct || 0);
    const discountMultiplier = Math.max(0, (100 - discountPct) / 100);

    return Number(item.unit_price || 0) * Number(qty || 1) * discountMultiplier;
  };

  const closeUnitPicker = () => {
    setUnitPickerProduct(null);
    setUnitPickerOptions([]);
    setUnitPickerError("");
    setLoadingUnitPicker(false);
  };

  const openUnitPicker = async (product) => {
    setUnitPickerProduct(product);
    setUnitPickerError("");

    const cachedOptions = unitOptionsCache[product.id];
    if (cachedOptions?.length) {
      setUnitPickerOptions(cachedOptions);
      return;
    }

    try {
      setLoadingUnitPicker(true);
      const res = await getProductUnitHierarchy(product.id);
      const options = buildSellUnitOptions(
        product,
        Array.isArray(res?.data?.unit_levels) ? res.data.unit_levels : []
      );

      if (!options.length) {
        setUnitPickerError("No unit hierarchy has been configured for this product yet.");
        setUnitPickerOptions([]);
        return;
      }

      setUnitOptionsCache((current) => ({
        ...current,
        [product.id]: options
      }));
      setUnitPickerOptions(options);
    } catch (err) {
      setUnitPickerError(
        err?.response?.data?.message || "Failed to load product unit options"
      );
      setUnitPickerOptions([]);
    } finally {
      setLoadingUnitPicker(false);
    }
  };

  const addToCart = (product, sellUnit = null) => {
    setCart((prev) => {
      const availableUnitStock = Number(
        sellUnit?.available_qty ?? product.stock ?? 0
      );

      if (!product.is_unlimited && product.type !== "timed" && availableUnitStock <= 0) {
        setError(
          sellUnit?.unit_label
            ? `No ${formatUnitLabel(sellUnit)} stock available`
            : "This product is out of stock"
        );
        return prev;
      }

      const existing = prev.find(
        (item) =>
          item.product_id === product.id &&
          Number(item.unit_level_id || 0) === Number(sellUnit?.unit_level_id || 0) &&
          item.item_type !== "timed" &&
          Number(item.item_discount_pct || 0) === 0
      );

      if (existing) {
        if (existing.manage_stock && existing.qty >= Number(existing.available_unit_stock || 0)) {
          setError(`Only ${formatAvailableUnitStock(existing)} available`);
          return prev;
        }

        return prev.map((item) =>
          item.cart_id === existing.cart_id
            ? {
                ...item,
                qty: item.qty + 1,
                final_price: getLineFinalPrice(item, item.qty + 1)
              }
            : item
        );
      }

      const unitPrice =
        product.type === "timed"
          ? Number(product.hourly_rate || 0)
          : Number(sellUnit?.unit_price ?? product.price ?? 0);

      const item = {
        cart_id: `${product.id}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        product_id: product.id,
        unit_level_id: sellUnit?.unit_level_id || null,
        unit_label: sellUnit?.unit_label || null,
        unit_short_name: sellUnit?.unit_short_name || null,
        available_unit_stock: availableUnitStock,
        item_name: product.name,
        icon: product.icon || "📦",
        item_type: product.type || "fixed",
        qty: 1,
        unit_price: unitPrice,
        cost: Number(product.cost || 0),
        item_discount_pct: 0,
        session_start: product.type === "timed" ? new Date().toISOString() : null,
        session_end: null,
        elapsed_seconds: 0,
        final_price: product.type === "timed" ? 0 : unitPrice,
        manage_stock: !product.is_unlimited && availableUnitStock > 0
      };

      return [...prev, item];
    });

    setError("");
  };

  const handleProductSelection = async (product) => {
    if (Number(product.has_unit_hierarchy) === 1 && product.type !== "timed") {
      await openUnitPicker(product);
      return;
    }

    addToCart(product);
  };

  const increaseQty = (cartId) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.cart_id !== cartId) return item;

        if (item.manage_stock && item.qty >= Number(item.available_unit_stock || 0)) {
          setError(`Only ${formatAvailableUnitStock(item)} available`);
          return item;
        }

        return {
          ...item,
          qty: item.qty + 1,
          final_price:
            item.item_type === "timed"
              ? item.final_price
              : getLineFinalPrice(item, item.qty + 1)
        };
      })
    );
  };

  const decreaseQty = (cartId) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.cart_id === cartId
            ? {
                ...item,
                qty: item.qty - 1,
                final_price:
                  item.item_type === "timed"
                    ? item.final_price
                    : getLineFinalPrice(item, item.qty - 1)
              }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const removeItem = (cartId) => {
    setCart((prev) => prev.filter((item) => item.cart_id !== cartId));
  };

  const toggleHalfPrice = async (cartItem) => {
    if (cartItem.item_type === "timed") {
      setError("Half price is only available for fixed-price products");
      return;
    }

    const isHalfPrice =
      Number(cartItem.item_discount_pct || 0) === HALF_PRICE_DISCOUNT_PCT;

    const nextDiscountPct = isHalfPrice ? 0 : HALF_PRICE_DISCOUNT_PCT;

    try {
      setSplittingItemId(cartItem.cart_id);
      setError("");

      let quotedDiscountPct = nextDiscountPct;

      if (!isHalfPrice) {
        const res = await splitItemPrice({
          unit_price: cartItem.unit_price,
          split_count: 2
        });

        quotedDiscountPct = Number(
          res?.data?.item_discount_pct ?? nextDiscountPct
        );
      }

      setCart((prev) =>
        prev.map((item) => {
          if (item.cart_id !== cartItem.cart_id) return item;

          const updatedItem = {
            ...item,
            item_discount_pct: quotedDiscountPct
          };

          return {
            ...updatedItem,
            final_price: getLineFinalPrice(updatedItem)
          };
        })
      );
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to split item price");
    } finally {
      setSplittingItemId(null);
    }
  };

  const resetCartState = () => {
    setCart([]);
    setDiscountPct("");
    setLoyaltyDiscount("");
    setGiftcardDiscount("");
    setCashTendered("");
    setSplitCash("");
    setSplitCard("");
    setSplitTransfer("");
    setCustomer("Walk-in");
    setSelectedMember(null);
    setMemberTierSnapshot(null);
    setMemberSearch("");
    setPaymentMethod("cash");
    setPendingNote("");
    setActivePendingId(null);
    setShiftId("");
  };

  const clearCart = () => {
    resetCartState();
  };

  const computedCart = useMemo(() => {
    return cart.map((item) => {
      if (item.item_type !== "timed" || !item.session_start) {
        return {
          ...item,
          final_price: getLineFinalPrice(item)
        };
      }

      const end = item.session_end ? new Date(item.session_end) : new Date();
      const start = new Date(item.session_start);
      const elapsedSeconds = Math.max(0, Math.floor((end - start) / 1000));
      const hours = elapsedSeconds / 3600;
      const billedHours = Math.max(hours, 0.5);
      const finalPrice = item.session_end
        ? Number(item.final_price || item.unit_price * billedHours)
        : item.unit_price * billedHours;

      return {
        ...item,
        elapsed_seconds: elapsedSeconds,
        final_price: finalPrice
      };
    });
  }, [cart]);

  const subtotal = useMemo(() => {
    return computedCart.reduce((sum, item) => {
      return sum + Number(item.final_price || 0);
    }, 0);
  }, [computedCart]);

  const discountAmount = useMemo(() => {
    const pct = Number(discountPct || 0);
    return (subtotal * pct) / 100;
  }, [subtotal, discountPct]);
  const membershipDiscountAmount = useMemo(() => {
    return (subtotal * appliedMembershipDiscountPct) / 100;
  }, [subtotal, appliedMembershipDiscountPct]);

  const loyaltyAmount = Number(loyaltyDiscount || 0);
  const giftcardAmount = Number(giftcardDiscount || 0);
  const taxableBase = Math.max(
    0,
    subtotal -
      discountAmount -
      membershipDiscountAmount -
      loyaltyAmount -
      giftcardAmount
  );
  const taxRate = Number(settings?.tax_rate ?? 0);
  const tax = taxableBase * (taxRate / 100);
  const total = taxableBase + tax;

  const splitTotal =
    Number(splitCash || 0) +
    Number(splitCard || 0) +
    Number(splitTransfer || 0);

  const splitRemaining = total - splitTotal;
  const change = Number(cashTendered || 0) - total;

  const payloadItems = useMemo(() => {
    return computedCart.map((item) => ({
      product_id: item.product_id,
      unit_level_id: item.unit_level_id,
      unit_label: item.unit_label,
      unit_short_name: item.unit_short_name,
      item_name: item.item_name,
      icon: item.icon,
      item_type: item.item_type,
      qty: item.qty,
      unit_price: item.unit_price,
      cost: item.cost,
      item_discount_pct: item.item_discount_pct || 0,
      session_start: item.session_start,
      session_end: item.session_end,
      elapsed_seconds: item.elapsed_seconds || 0,
      final_price: item.final_price,
      manage_stock: item.manage_stock
    }));
  }, [computedCart]);

  const groupedCustomerOrders = useMemo(() => {
    const grouped = {
      new: [],
      held: [],
      checkout: [],
      preparing: [],
      ready: [],
      completed: []
    };

    customerOrders.forEach((order) => {
      if (heldCustomerIds.includes(order.id)) {
        grouped.held.push(order);
      } else if (checkoutCustomerIds.includes(order.id)) {
        grouped.checkout.push(order);
      } else if (order.fulfillment_status === "preparing") {
        grouped.preparing.push(order);
      } else if (order.fulfillment_status === "ready") {
        grouped.ready.push(order);
      } else if (["completed", "cancelled"].includes(order.fulfillment_status)) {
        grouped.completed.push(order);
      } else {
        grouped.new.push(order);
      }
    });

    return grouped;
  }, [customerOrders, heldCustomerIds, checkoutCustomerIds]);

  const customerCounts = useMemo(
    () => ({
      new: groupedCustomerOrders.new.length,
      held: groupedCustomerOrders.held.length,
      checkout: groupedCustomerOrders.checkout.length
    }),
    [groupedCustomerOrders]
  );

  const openCustomerOrder = async (order) => {
    try {
      const res = await getCustomerOrderById(order.id);
      setActiveCustomerOrder({ order: res?.order || order, items: res?.items || [] });
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load order details");
    }
  };

  const handleHoldCustomerOrder = async (order) => {
    try {
      await holdCustomerOrder(order.id);
      setHeldCustomerIds((prev) => Array.from(new Set([...prev, order.id])));
      setCheckoutCustomerIds((prev) => prev.filter((id) => id !== order.id));
      loadCustomerOrders();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to hold customer order");
    }
  };

  const handleResumeCustomerOrder = async (order) => {
    try {
      await resumeCustomerOrder(order.id);
      setHeldCustomerIds((prev) => prev.filter((id) => id !== order.id));
      loadCustomerOrders();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to resume customer order");
    }
  };

  const handleCheckoutCustomerOrder = async (order) => {
    try {
      await checkoutCustomerOrder(order.id);
      setCheckoutCustomerIds((prev) => Array.from(new Set([...prev, order.id])));
      setHeldCustomerIds((prev) => prev.filter((id) => id !== order.id));
      loadCustomerOrders();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to move to checkout");
    }
  };

  const sendCustomerOrderToCheckoutCart = () => {
    if (!activeCustomerOrder?.items?.length) return;
    const mapped = activeCustomerOrder.items.map((item, index) => ({
      cart_id: `customer-${activeCustomerOrder.order.id}-${item.id || index}-${Date.now()}`,
      product_id: item.product_id,
      unit_level_id: item.unit_level_id || null,
      unit_label: item.unit_label || null,
      unit_short_name: item.unit_short_name || null,
      item_name: item.item_name,
      icon: item.icon || "🍽️",
      item_type: "fixed",
      qty: Number(item.qty || 1),
      unit_price: Number(item.unit_price || 0),
      cost: 0,
      item_discount_pct: 0,
      session_start: null,
      session_end: null,
      elapsed_seconds: 0,
      final_price: Number(item.final_price || 0),
      manage_stock: false
    }));

    setCart(mapped);
    setCustomer(activeCustomerOrder.order.customer_name || "Walk-in");
    setSelectedMember(null);
    setMemberTierSnapshot(null);
    setMemberSearch(activeCustomerOrder.order.customer_name || "");
    setPendingNote(`From customer order ${activeCustomerOrder.order.order_code}`);
    setCheckoutCustomerIds((prev) => Array.from(new Set([...prev, activeCustomerOrder.order.id])));
    setCustomerOrdersOpen(false);
    setActiveCustomerOrder(null);
    setMobileSummaryOpen(true);
  };

  const handleUpdateCustomerStatus = async (status) => {
    if (!activeCustomerOrder?.order?.id) return;
    try {
      await updateCustomerOrderStatus(activeCustomerOrder.order.id, {
        fulfillment_status: status
      });
      await loadCustomerOrders();
      setActiveCustomerOrder((prev) =>
        prev ? { ...prev, order: { ...prev.order, fulfillment_status: status } } : prev
      );
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update order status");
    }
  };

  const buildOrderPayload = () => ({
    customer: displayedCustomerName,
    member_id: selectedMember?.id || memberTierSnapshot?.member_id || null,
    membership_tier_id:
      memberTierSnapshot?.membership_tier_id ||
      selectedMember?.membership_tier_id ||
      null,
    membership_tier_name: appliedMembershipTierName || null,
    membership_discount_pct: appliedMembershipDiscountPct,
    membership_discount: membershipDiscountAmount,
    shift_id: shiftId || null,
    subtotal,
    discount: discountAmount,
    loyalty_discount: loyaltyAmount,
    giftcard_discount: giftcardAmount,
    tax,
    total,
    currency: settings?.currency || "NGN",
    note: pendingNote || null,
    items: payloadItems
  });

  const validateCheckout = () => {
    if (!computedCart.length) return "Cart is empty";
    if (!paymentMethod) return "Select payment method";

    if (!displayedCustomerName.trim()) {
      return "Customer name is required";
    }

    if (paymentMethod === "cash" && Number(cashTendered || 0) < total) {
      return "Cash tendered is less than total";
    }

    if (
      paymentMethod === "split" &&
      Math.abs(Number(splitRemaining.toFixed(2))) > 0.009
    ) {
      return "Split payment must match the total exactly";
    }

    return "";
  };

  const handleHoldCart = async () => {
    if (!computedCart.length) {
      setError("Cart is empty");
      return;
    }

    try {
      setSavingPending(true);
      setError("");

      const payload = buildOrderPayload();

      if (activePendingId) {
        await updatePendingCart(activePendingId, payload);
      } else {
        await createPendingCart(payload);
      }

      resetCartState();
      await loadPendingCarts();
      setDesktopPendingOpen(true);
      setMobilePendingOpen(true);
      setOrderModalOpen(false);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to save pending cart");
    } finally {
      setSavingPending(false);
    }
  };

  const handleResumePendingCart = async (pendingId) => {
    try {
      setError("");
      const res = await getPendingCartById(pendingId);
      const data = res?.data;

      if (!data) return;

      setActivePendingId(data.id);
      setShiftId(data.shift_id || "");
      setDiscountPct(
        Number(data.subtotal || 0) > 0
          ? (
              (Number(data.discount || 0) / Number(data.subtotal || 1)) *
              100
            ).toFixed(2)
          : ""
      );
      setLoyaltyDiscount(data.loyalty_discount || "");
      setGiftcardDiscount(data.giftcard_discount || "");
      setPendingNote(data.note || "");

      const foundMember = data.member_id
        ? members.find((m) => Number(m.id) === Number(data.member_id)) || null
        : null;

      setSelectedMember(foundMember);
      setMemberTierSnapshot(
        foundMember
          ? {
              member_id: foundMember.id,
              membership_tier_id: foundMember.membership_tier_id || null,
              membership_tier_name:
                foundMember.membership_tier_name || foundMember.tier || null,
              membership_discount_pct: Number(
                foundMember.membership_discount_pct || 0
              )
            }
          : data.member_id || data.membership_tier_name
          ? {
              member_id: data.member_id || null,
              membership_tier_id: data.membership_tier_id || null,
              membership_tier_name: data.membership_tier_name || null,
              membership_discount_pct: Number(data.membership_discount_pct || 0)
            }
          : null
      );

      if (foundMember) {
        const memberName = foundMember.full_name || foundMember.name || "";
        setCustomer(memberName);
        setMemberSearch(memberName);
      } else {
        const customCustomer = data.customer || "Walk-in";
        setCustomer(customCustomer);
        setMemberSearch(customCustomer);
      }

      setCart(
        (data.items || []).map((item, index) => ({
          cart_id: `pending-${data.id}-${item.id || index}-${Date.now()}`,
          product_id: item.product_id,
          unit_level_id: item.unit_level_id || null,
          unit_label: item.unit_label || null,
          unit_short_name: item.unit_short_name || null,
          item_name: item.item_name,
          icon: item.icon,
          item_type: item.item_type || "fixed",
          qty: Number(item.qty || 1),
          unit_price: Number(item.unit_price || 0),
          cost: Number(item.cost || 0),
          item_discount_pct: Number(item.item_discount_pct || 0),
          session_start: item.session_start,
          session_end: item.session_end,
          elapsed_seconds: Number(item.elapsed_seconds || 0),
          final_price: Number(item.final_price || 0),
          manage_stock: !!item.manage_stock
        }))
      );

      setMobileCartOpen(true);
      setMobileSummaryOpen(true);
      setMobilePendingOpen(false);
      setOrderModalOpen(true);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to open pending cart");
    }
  };

  const handleCancelPending = async (pendingId) => {
    try {
      setError("");
      await cancelPendingCart(pendingId);

      if (activePendingId === pendingId) {
        resetCartState();
      }

      await loadPendingCarts();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to cancel pending cart");
    }
  };

  const buildReceipt = ({
    status,
    receiptId,
    saleId = null,
    saleCode = null,
    customerName,
    memberId = null,
    membershipTierName = null,
    membershipDiscountPct = 0,
    membershipDiscountAmount = 0,
    cashierName,
    paymentLabel,
    receiptSubtotal,
    receiptDiscount,
    receiptLoyaltyDiscount,
    receiptGiftcardDiscount,
    receiptTax,
    receiptTaxRate,
    receiptTotal,
    receiptItems,
    createdAt
  }) => ({
    status,
    receiptId,
    saleId,
    saleCode,
    customer: customerName || "Walk-in",
    memberId,
    membershipTierName,
    membershipDiscountPct: Number(membershipDiscountPct || 0),
    membershipDiscount: Number(membershipDiscountAmount || 0),
    cashier: cashierName || currentUser?.name || "Staff",
    paymentMethod: paymentLabel || "pending",
    subtotal: Number(receiptSubtotal || 0),
    discount: Number(receiptDiscount || 0),
    loyaltyDiscount: Number(receiptLoyaltyDiscount || 0),
    giftcardDiscount: Number(receiptGiftcardDiscount || 0),
    tax: Number(receiptTax || 0),
    taxRate: Number(receiptTaxRate || 0),
    total: Number(receiptTotal || 0),
    currency: settings?.currency || "NGN",
    items: receiptItems,
    createdAt: createdAt || new Date().toISOString(),
    business_name: settings?.business_name,
    business_address: settings?.business_address,
    business_phone: settings?.business_phone,
    receipt_footer: settings?.receipt_footer
  });

  const normalizeReceiptItems = (items) => {
    return (items || []).map((item, index) => ({
      cart_id: item.cart_id || item.id || `receipt-${index}`,
      product_id: item.product_id,
      unit_level_id: item.unit_level_id || null,
      unit_label: item.unit_label || null,
      unit_short_name: item.unit_short_name || null,
      item_name: item.item_name,
      icon: item.icon || "📦",
      item_type: item.item_type || "fixed",
      qty: Number(item.qty || 1),
      unit_price: Number(item.unit_price || 0),
      item_discount_pct: Number(item.item_discount_pct || 0),
      session_start: item.session_start,
      session_end: item.session_end,
      elapsed_seconds: Number(item.elapsed_seconds || 0),
      final_price: Number(item.final_price || 0)
    }));
  };

  const openPendingReceipt = async (pendingId, pendingSummary = null) => {
    try {
      setError("");
      const res = await getPendingCartById(pendingId);
      const data = res?.data;

      if (!data) return;

      setReceipt(
        buildReceipt({
          status: "pending",
          receiptId: data.cart_code || `PENDING-${data.id}`,
          customerName: data.customer,
          memberId: data.member_id,
          membershipTierName: data.membership_tier_name,
          membershipDiscountPct: data.membership_discount_pct,
          membershipDiscountAmount: data.membership_discount,
          cashierName: pendingSummary?.cashier_name,
          paymentLabel: "pending",
          receiptSubtotal: data.subtotal,
          receiptDiscount: data.discount,
          receiptLoyaltyDiscount: data.loyalty_discount,
          receiptGiftcardDiscount: data.giftcard_discount,
          receiptTax: data.tax,
          receiptTaxRate: Number(settings?.tax_rate ?? 0),
          receiptTotal: data.total,
          receiptItems: normalizeReceiptItems(data.items),
          createdAt: data.created_at || data.updated_at
        })
      );
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to open pending receipt");
    }
  };

  const handleCheckout = async () => {
    const validationError = validateCheckout();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setCheckingOut(true);
      setError("");

      const paymentLabel =
        paymentMethod === "split"
          ? `split (cash:${Number(splitCash || 0)}, card:${Number(
              splitCard || 0
            )}, transfer:${Number(splitTransfer || 0)})`
          : paymentMethod;

      let res;

      if (activePendingId) {
        // Ensure the latest cart state is persisted before checkout.
        // The backend pending checkout endpoint reads items from DB, not from the client payload.
        await updatePendingCart(activePendingId, buildOrderPayload());
        res = await checkoutPendingCart(activePendingId, {
          payment_method: paymentLabel
        });
      } else {
        const payload = {
          ...buildOrderPayload(),
          payment_method: paymentLabel
        };

        res = await checkoutSale(payload);
      }

      setReceipt(
        buildReceipt({
          status: "completed",
          receiptId: res?.saleCode || res?.saleId,
          saleId: res?.saleId,
          saleCode: res?.saleCode,
          customerName: displayedCustomerName,
          memberId: selectedMember?.id || null,
          membershipTierName: appliedMembershipTierName,
          membershipDiscountPct: appliedMembershipDiscountPct,
          membershipDiscountAmount,
          cashierName: currentUser?.name,
          paymentLabel,
          receiptSubtotal: subtotal,
          receiptDiscount: discountAmount,
          receiptLoyaltyDiscount: loyaltyAmount,
          receiptGiftcardDiscount: giftcardAmount,
          receiptTax: tax,
          receiptTaxRate: taxRate,
          receiptTotal: total,
          receiptItems: normalizeReceiptItems(payloadItems),
          createdAt: new Date().toISOString()
        })
      );

      resetCartState();
      setOrderModalOpen(false);
      await Promise.all([
        loadProductsData({ silent: true }),
        loadPendingCarts(),
        loadCustomerOrders(),
        loadSalesSummary({ silent: true })
      ]);
    } catch (err) {
      setError(err?.response?.data?.message || "Checkout failed");
    } finally {
      setCheckingOut(false);
    }
  };

  const printReceipt = () => {
    const receiptElement = document.getElementById("printable-receipt");
    if (!receiptElement) return;

    const printWindow = window.open("", "_blank", "width=320,height=900");
    if (!printWindow) return;

    const receiptHtml = receiptElement.innerHTML;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Receipt Print</title>
          <meta charset="utf-8" />
          <style>
            @page {
              size: 50mm auto;
              margin: 0;
            }

            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              width: 50mm;
              background: #ffffff;
              color: #000000;
              font-family: "Courier New", Courier, monospace;
            }

            body {
              padding: 2mm;
            }

            .receipt-print {
              width: 46mm;
              margin: 0 auto;
              font-size: 10px;
              line-height: 1.35;
              color: #000;
              word-break: break-word;
            }

            .receipt-print * {
              font-family: "Courier New", Courier, monospace !important;
            }

            .${styles.rLogo} {
              text-align: center;
              font-size: 12px;
              font-weight: 700;
              margin-bottom: 4px;
              word-break: break-word;
            }

            .${styles.rCenter} {
              text-align: center;
              font-size: 9px;
              line-height: 1.35;
              margin-bottom: 4px;
              word-break: break-word;
            }

            .${styles.rHr} {
              border: 0;
              border-top: 1px dashed #000;
              margin: 6px 0;
            }

            .${styles.rRow},
            .${styles.rRowSmall} {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 6px;
              width: 100%;
              margin: 2px 0;
            }

            .${styles.rRow} > span:first-child,
            .${styles.rRowSmall} > span:first-child {
              flex: 1;
              min-width: 0;
              word-break: break-word;
            }

            .${styles.rRow} > span:last-child,
            .${styles.rRowSmall} > span:last-child {
              flex-shrink: 0;
              text-align: right;
              max-width: 40%;
              word-break: break-word;
            }

            .${styles.rRow} {
              font-size: 10px;
            }

            .${styles.rRowSmall} {
              font-size: 8px;
            }

            .${styles.rBold} {
              font-weight: 700;
            }

            .${styles.rSubText} {
              font-size: 8px;
              margin: 2px 0 4px;
              word-break: break-word;
            }

            .${styles.rGrand} {
              font-weight: 700;
              font-size: 11px;
              margin-top: 4px;
            }

            .${styles.rRed},
            .${styles.rPurple} {
              color: #000;
            }

            @media print {
              html,
              body {
                width: 50mm;
                margin: 0;
                padding: 0;
                background: #fff;
              }

              body {
                padding: 2mm;
              }

              .receipt-print {
                width: 46mm;
                margin: 0 auto;
              }
            }
          </style>
        </head>
        <body>
          <div class="receipt-print">
            ${receiptHtml}
          </div>

          <script>
            window.onload = function () {
              window.focus();
              window.print();
              window.close();
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  const buildReceiptShareText = (receiptData) => {
    if (!receiptData) return "";

    const receiptNumber =
      receiptData.saleId || receiptData.saleCode || receiptData.receiptId || "-";

    const lines = [
      settings?.business_name || DEFAULT_SETTINGS.business_name,
      `${String(receiptData.status || "receipt").toUpperCase()} RECEIPT`,
      `Receipt #: ${receiptNumber}`,
      `Date: ${formatDateTimeLocal(receiptData.createdAt)}`,
      `Customer: ${receiptData.customer}`,
      `Cashier: ${receiptData.cashier}`,
      receiptData.membershipTierName
        ? `Membership: ${receiptData.membershipTierName} (${Number(
            receiptData.membershipDiscountPct || 0
          )}% off)`
        : null,
      "",
      ...receiptData.items.map((item) => {
        const discountText = Number(item.item_discount_pct || 0) > 0
          ? ` (${Number(item.item_discount_pct || 0)}% off)`
          : "";

        return `${item.item_name} x${item.qty}${discountText} - ${formatMoney(
          item.final_price
        )}`;
      }),
      "",
      `Subtotal: ${formatMoney(receiptData.subtotal)}`,
      `Discount: -${formatMoney(receiptData.discount)}`,
      receiptData.membershipDiscount > 0
        ? `Membership Discount: -${formatMoney(receiptData.membershipDiscount)}`
        : null,
      `Tax: ${formatMoney(receiptData.tax)}`,
      `Total: ${formatMoney(receiptData.total)}`,
      `Payment: ${String(receiptData.paymentMethod || "pending").toUpperCase()}`,
      "",
      receiptData.receipt_footer || ""
    ];

    return lines.filter((line) => line !== null && line !== undefined).join("\n");
  };

  const shareReceipt = async () => {
    if (!receipt) return;

    const text = buildReceiptShareText(receipt);
    const title = `${settings?.business_name || "Pray Restaurant & Lounge"} Receipt`;

    try {
      if (navigator.share) {
        await navigator.share({ title, text });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setError("Receipt copied. Paste it into your chat or sharing app.");
        return;
      }

      window.prompt("Copy receipt text", text);
    } catch (err) {
      if (err?.name !== "AbortError") {
        setError("Unable to share receipt from this device");
      }
    }
  };

  const shareReceiptToWhatsApp = () => {
    if (!receipt) return;

    const text = buildReceiptShareText(receipt);
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  if (loadingProducts || loadingSettings) {
    return (
      <div className={styles.posPage}>
        <DashboardLoader
          variant="panel"
          label="POS"
          title="Loading Point of Sale"
          subtitle="Preparing products, settings, members, and active carts..."
        />
      </div>
    );
  }

  const salesSummaryDays = salesSummary.days?.length
    ? salesSummary.days
    : [
        { date: "", label: "Today", full_label: "Today", sales_total: 0, sales_count: 0 },
        { date: "", label: "Yesterday", full_label: "Yesterday", sales_total: 0, sales_count: 0 },
        { date: "", label: "2 Days Ago", full_label: "2 Days Ago", sales_total: 0, sales_count: 0 }
      ];
  const salesSummaryDetailDays = salesSummary.details?.days || [];

  return (
    <div className={styles.posShell}>
      {salesSummaryDetailsOpen ? (
        <button
          type="button"
          className={styles.salesDetailsBackdrop}
          aria-label="Close detailed sales summary"
          onClick={() => setSalesSummaryDetailsOpen(false)}
        />
      ) : null}

      {salesSummaryOpen ? (
        <button
          type="button"
          className={styles.salesWidgetBackdrop}
          aria-label="Close sales summary"
          onClick={() => setSalesSummaryOpen(false)}
        />
      ) : null}

      <div className={styles.salesWidgetDock}>
        <button
          type="button"
          ref={salesDockRef}
          className={`${styles.salesWidgetFab} ${
            salesSummaryOpen || salesSummaryPeek ? styles.salesWidgetFabExpanded : ""
          }`}
          style={{
            top: `${salesDockPosition.top}px`,
            right: `${salesDockPosition.right}px`
          }}
          onClick={handleSalesFabClick}
          onPointerDown={handleSalesDockPointerDown}
          onPointerMove={handleSalesDockPointerMove}
          onPointerUp={handleSalesDockPointerUp}
          onPointerCancel={handleSalesDockPointerCancel}
          onMouseEnter={() => setSalesSummaryPeek(true)}
          onMouseLeave={() => {
            if (!salesSummaryOpen) {
              setSalesSummaryPeek(false);
            }
          }}
          aria-expanded={salesSummaryOpen}
          aria-controls="sales-summary-panel"
        >
          <span className={styles.salesWidgetFabIcon}>
            $
          </span>
          <span className={styles.salesWidgetFabText}>
            <strong>Sales Summary</strong>
            <small>{formatMoney(salesSummary.total_sales)}</small>
          </span>
        </button>

        <aside
          id="sales-summary-panel"
          className={`${styles.salesWidgetPanel} ${
            salesSummaryOpen || salesSummaryPeek ? styles.salesWidgetPanelOpen : ""
          }`}
          style={{
            top: `${salesDockPosition.top + 70}px`,
            right: `${salesDockPosition.right}px`
          }}
          aria-label="Your recent sales summary"
        >
          <div className={styles.salesWidgetHeader}>
            <div>
              <p className={styles.salesWidgetEyebrow}>Your sales</p>
              <h3>Last 3 days</h3>
            </div>

            <div className={styles.salesWidgetHeaderActions}>
              <button
                type="button"
                className={styles.salesWidgetRefresh}
                onClick={() => loadSalesSummary()}
                disabled={loadingSalesSummary}
                aria-label="Refresh sales summary"
              >
                <FiRefreshCw />
              </button>

              <button
                type="button"
                className={styles.salesWidgetClose}
                onClick={() => setSalesSummaryOpen(false)}
                aria-label="Close sales summary"
              >
                <FiX />
              </button>
            </div>
          </div>

          <div className={styles.salesWidgetTotal}>
            <span>{currentUser?.name || "Staff"}</span>
            <strong>{formatMoney(salesSummary.total_sales)}</strong>
            <small>{salesSummary.total_count} sale(s) in 3 days</small>
          </div>

          <div className={styles.salesWidgetList}>
            {salesSummaryDays.map((day) => (
              <div key={day.date || day.label} className={styles.salesWidgetDay}>
                <div>
                  <strong>{day.label}</strong>
                  <span>{day.full_label}</span>
                </div>

                <div className={styles.salesWidgetAmount}>
                  <strong>{formatMoney(day.sales_total)}</strong>
                  <span>{day.sales_count} sale(s)</span>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.salesWidgetFooter}>
            <button
              type="button"
              className={styles.salesWidgetViewMore}
              onClick={loadSalesSummaryDetails}
              disabled={loadingSalesSummaryDetails}
            >
              <FiExternalLink />
              {loadingSalesSummaryDetails ? "Loading..." : "View more"}
            </button>
          </div>
        </aside>
      </div>

      <div className={styles.orderMiniDock}>
        <button
          type="button"
          ref={orderDockRef}
          className={styles.orderMiniDockBtn}
          style={{
            top: `${orderDockPosition.top}px`,
            right: `${orderDockPosition.right}px`
          }}
          onPointerDown={handleOrderDockPointerDown}
          onPointerMove={handleOrderDockPointerMove}
          onPointerUp={handleOrderDockPointerUp}
          title={`Current order: ${computedCart.length} item(s)`}
          aria-label={`Current order: ${computedCart.length} item(s)`}
        >
          <span className={styles.orderMiniDockIcon}>
            <FiShoppingCart />
          </span>
          {computedCart.length > 0 && (
            <span className={styles.orderMiniDockBadge}>
              {computedCart.length}
            </span>
          )}
        </button>
      </div>

      {salesSummaryDetailsOpen ? (
        <section
          className={styles.salesDetailsModal}
          aria-label="Detailed three day sales summary"
        >
          <div className={styles.salesDetailsHeader}>
            <div>
              <p className={styles.salesWidgetEyebrow}>Closeout summary</p>
              <h3>Last 3 days sales detail</h3>
              <small>
                {salesSummary.details?.closing_window?.from || ""} to{" "}
                {salesSummary.details?.closing_window?.to || ""}
              </small>
            </div>

            <div className={styles.salesDetailsActions}>
              <button
                type="button"
                className={styles.salesWidgetRefresh}
                onClick={loadSalesSummaryDetails}
                disabled={loadingSalesSummaryDetails}
                aria-label="Refresh detailed sales summary"
              >
                <FiRefreshCw />
              </button>
              <button
                type="button"
                className={styles.salesWidgetClose}
                onClick={() => setSalesSummaryDetailsOpen(false)}
                aria-label="Close detailed sales summary"
              >
                <FiX />
              </button>
            </div>
          </div>

          <div className={styles.salesDetailsOverview}>
            <article className={styles.salesDetailsMetric}>
              <span>Total sales</span>
              <strong>{formatMoney(salesSummary.total_sales)}</strong>
            </article>
            <article className={styles.salesDetailsMetric}>
              <span>Transactions</span>
              <strong>{salesSummary.total_count}</strong>
            </article>
            <article className={styles.salesDetailsMetric}>
              <span>Cashier</span>
              <strong>{currentUser?.name || "Staff"}</strong>
            </article>
          </div>

          <div className={styles.salesDetailsBody}>
            <div className={styles.salesDetailsMain}>
              {salesSummaryDetailDays.map((day) => (
                <article key={day.date} className={styles.salesDetailsDayCard}>
                  <div className={styles.salesDetailsDayHeader}>
                    <div>
                      <strong>{day.label}</strong>
                      <span>{day.full_label}</span>
                    </div>
                    <div className={styles.salesDetailsDayAmount}>
                      <strong>{formatMoney(day.sales_total)}</strong>
                      <span>{day.sales_count} sale(s)</span>
                    </div>
                  </div>

                  <div className={styles.salesDetailsDayStats}>
                    <div>
                      <span>Subtotal</span>
                      <strong>{formatMoney(day.subtotal)}</strong>
                    </div>
                    <div>
                      <span>Discounts</span>
                      <strong>{formatMoney(day.discounts_total)}</strong>
                    </div>
                    <div>
                      <span>Tax</span>
                      <strong>{formatMoney(day.tax_total)}</strong>
                    </div>
                    <div>
                      <span>Units sold</span>
                      <strong>{day.items_sold}</strong>
                    </div>
                  </div>

                  <div className={styles.salesDetailsColumns}>
                    <div className={styles.salesDetailsBlock}>
                      <h4>Payment mix</h4>
                      {day.payment_methods?.length ? (
                        day.payment_methods.map((payment) => (
                          <div
                            key={`${day.date}-${payment.payment_method}`}
                            className={styles.salesDetailsRow}
                          >
                            <span>{payment.payment_method}</span>
                            <strong>
                              {payment.sales_count} / {formatMoney(payment.total)}
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className={styles.salesDetailsEmpty}>No payment data.</p>
                      )}
                    </div>

                    <div className={styles.salesDetailsBlock}>
                      <h4>What was sold</h4>
                      {day.top_items?.length ? (
                        day.top_items.slice(0, 8).map((item) => (
                          <div
                            key={`${day.date}-${item.item_name}-${item.item_type}`}
                            className={styles.salesDetailsRow}
                          >
                            <span>
                              {item.item_name}
                              <small>{item.item_type}</small>
                            </span>
                            <strong>
                              {item.qty} / {formatMoney(item.revenue)}
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className={styles.salesDetailsEmpty}>No sold items.</p>
                      )}
                    </div>
                  </div>

                  <div className={styles.salesDetailsBlock}>
                    <h4>Transactions</h4>
                    {day.sales?.length ? (
                      <div className={styles.salesDetailsSalesList}>
                        {day.sales.map((sale) => (
                          <div key={sale.sale_id} className={styles.salesDetailsSaleRow}>
                            <div>
                              <strong>{sale.sale_code}</strong>
                              <span>
                                {sale.customer} • {sale.payment_method} •{" "}
                                {formatDateTimeLocal(sale.sale_date)}
                              </span>
                            </div>
                            <div className={styles.salesDetailsSaleMeta}>
                              <strong>{formatMoney(sale.total)}</strong>
                              <span>
                                {sale.sold_units} unit(s) • {sale.sold_items} line(s)
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.salesDetailsEmpty}>No sales recorded.</p>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <aside className={styles.salesDetailsSide}>
              <div className={styles.salesDetailsBlock}>
                <h4>All payment methods</h4>
                {salesSummary.details?.payment_methods?.length ? (
                  salesSummary.details.payment_methods.map((payment) => (
                    <div key={payment.payment_method} className={styles.salesDetailsRow}>
                      <span>{payment.payment_method}</span>
                      <strong>
                        {payment.sales_count} / {formatMoney(payment.total)}
                      </strong>
                    </div>
                  ))
                ) : (
                  <p className={styles.salesDetailsEmpty}>No payment totals.</p>
                )}
              </div>

              <div className={styles.salesDetailsBlock}>
                <h4>Top sold items</h4>
                {salesSummary.details?.sold_items?.length ? (
                  salesSummary.details.sold_items.slice(0, 12).map((item) => (
                    <div
                      key={`${item.item_name}-${item.item_type}`}
                      className={styles.salesDetailsRow}
                    >
                      <span>
                        {item.item_name}
                        <small>{item.item_type}</small>
                      </span>
                      <strong>
                        {item.qty} / {formatMoney(item.revenue)}
                      </strong>
                    </div>
                  ))
                ) : (
                  <p className={styles.salesDetailsEmpty}>No item summary.</p>
                )}
              </div>
            </aside>
          </div>
        </section>
      ) : null}

      <CustomerOrdersAlert counts={customerCounts} onOpen={() => setCustomerOrdersOpen(true)} />
      <CustomerOrdersDrawer
        open={customerOrdersOpen}
        onClose={() => setCustomerOrdersOpen(false)}
        groupedOrders={groupedCustomerOrders}
        onOpenOrder={openCustomerOrder}
        onHold={handleHoldCustomerOrder}
        onResume={handleResumeCustomerOrder}
        onCheckout={handleCheckoutCustomerOrder}
      />
      <CustomerOrderDetailsModal
        orderDetails={activeCustomerOrder}
        onClose={() => setActiveCustomerOrder(null)}
        onSendToCheckout={sendCustomerOrderToCheckoutCart}
        onUpdateStatus={handleUpdateCustomerStatus}
      />
      <div className={styles.mobileTopBar}>
        <button
          type="button"
          className={styles.mobileTopCard}
          onClick={() => setOrderModalOpen(true)}
        >
          <div className={styles.mobileTopCardIcon}>
            <FiShoppingCart />
          </div>
          <div className={styles.mobileTopCardText}>
            <strong>Cart</strong>
            <span>
              {computedCart.length} item(s) • {formatMoney(total)}
            </span>
          </div>
          <div className={styles.mobileTopCardArrow}>
            <FiExternalLink />
          </div>
        </button>

        <button
          type="button"
          className={styles.mobileTopCard}
          onClick={() => setMobilePendingOpen((prev) => !prev)}
        >
          <div className={styles.mobileTopCardIcon}>
            <FiClock />
          </div>
          <div className={styles.mobileTopCardText}>
            <strong>Pending</strong>
            <span>{pendingCarts.length} saved cart(s)</span>
          </div>
          <div className={styles.mobileTopCardArrow}>
            {mobilePendingOpen ? <FiChevronUp /> : <FiChevronDown />}
          </div>
        </button>
      </div>

      <div className={styles.desktopPendingSection}>
        <div className={styles.sectionCard}>
          <button
            type="button"
            className={styles.sectionHeaderBtn}
            onClick={() => setDesktopPendingOpen((prev) => !prev)}
          >
            <div className={styles.sectionHeaderLeft}>
              <div className={styles.sectionHeaderIcon}>
                <FiFolder />
              </div>
              <div>
                <h3>Pending Carts</h3>
                <p>{pendingCarts.length} cart(s) waiting</p>
              </div>
            </div>

            <div className={styles.sectionHeaderRight}>
              <span className={styles.countBadge}>{pendingCarts.length}</span>
              {desktopPendingOpen ? <FiChevronUp /> : <FiChevronDown />}
            </div>
          </button>

          {desktopPendingOpen ? (
            <div className={styles.sectionBody}>
              <div className={styles.pendingToolbar}>
                <button
                  type="button"
                  onClick={loadPendingCarts}
                  className={styles.pendingRefreshBtn}
                >
                  <FiRefreshCw />
                  Refresh
                </button>
              </div>

              {loadingPending ? (
                <div className={styles.pendingEmpty}>Loading pending carts...</div>
              ) : pendingCarts.length ? (
                <div className={styles.pendingGrid}>
                  {pendingCarts.map((pending) => (
                    <div key={pending.id} className={styles.pendingCard}>
                      <div className={styles.pendingCardTop}>
                        <div>
                          <strong>{pending.customer || "Walk-in"}</strong>
                          <small>{pending.cart_code}</small>
                        </div>
                        <span className={styles.pendingAmount}>
                          {formatMoney(pending.total)}
                        </span>
                      </div>

                      <div className={styles.pendingMeta}>
                        <span>
                          <FiTag />
                          {pending.items_count || 0} item(s)
                        </span>
                        <span>
                          <FiUser />
                          {pending.cashier_name || "Staff"}
                        </span>
                      </div>

                      {pending.note ? (
                        <div className={styles.pendingNote}>{pending.note}</div>
                      ) : null}

                    <div className={styles.pendingActions}>
                        <button
                          type="button"
                          className={styles.pendingReceiptBtn}
                          onClick={() => openPendingReceipt(pending.id, pending)}
                        >
                          <FiPrinter />
                          Receipt
                        </button>

                        <button
                          type="button"
                          className={styles.resumeBtn}
                          onClick={() => handleResumePendingCart(pending.id)}
                        >
                          <FiPlayCircle />
                          Resume
                        </button>

                        <button
                          type="button"
                          className={styles.cancelPendingBtn}
                          onClick={() => handleCancelPending(pending.id)}
                        >
                          <FiX />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.pendingEmpty}>No pending carts yet</div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {mobilePendingOpen ? (
        <div className={styles.mobileOnlyBlock}>
          <div className={styles.sectionCard}>
            <div className={styles.mobileSectionHeader}>
              <div className={styles.sectionHeaderLeft}>
                <div className={styles.sectionHeaderIcon}>
                  <FiClock />
                </div>
                <div>
                  <h3>Pending Carts</h3>
                  <p>{pendingCarts.length} saved cart(s)</p>
                </div>
              </div>

              <button
                type="button"
                onClick={loadPendingCarts}
                className={styles.pendingRefreshIconBtn}
              >
                <FiRefreshCw />
              </button>
            </div>

            {loadingPending ? (
              <div className={styles.pendingEmpty}>Loading pending carts...</div>
            ) : pendingCarts.length ? (
              <div className={styles.pendingList}>
                {pendingCarts.map((pending) => (
                  <div key={pending.id} className={styles.pendingCard}>
                    <div className={styles.pendingCardTop}>
                      <div>
                        <strong>{pending.customer || "Walk-in"}</strong>
                        <small>{pending.cart_code}</small>
                      </div>
                      <span className={styles.pendingAmount}>
                        {formatMoney(pending.total)}
                      </span>
                    </div>

                    <div className={styles.pendingMeta}>
                      <span>
                        <FiTag />
                        {pending.items_count || 0} item(s)
                      </span>
                      <span>
                        <FiUser />
                        {pending.cashier_name || "Staff"}
                      </span>
                    </div>

                    {pending.note ? (
                      <div className={styles.pendingNote}>{pending.note}</div>
                    ) : null}

                      <div className={styles.pendingActions}>
                      <button
                        type="button"
                        className={styles.pendingReceiptBtn}
                        onClick={() => openPendingReceipt(pending.id, pending)}
                      >
                        <FiPrinter />
                        Receipt
                      </button>

                      <button
                        type="button"
                        className={styles.resumeBtn}
                        onClick={() => handleResumePendingCart(pending.id)}
                      >
                        <FiPlayCircle />
                        Resume
                      </button>

                      <button
                        type="button"
                        className={styles.cancelPendingBtn}
                        onClick={() => handleCancelPending(pending.id)}
                      >
                        <FiX />
                        Cancel
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.pendingEmpty}>No pending carts yet</div>
            )}
          </div>
        </div>
      ) : null}

      <div className={`${styles.posPage} ${styles.posPageOrderModal}`}>
        <section className={styles.productsPanel}>
          <button
            type="button"
            className={styles.mobileCollapseBtn}
            onClick={() => setMobileProductsOpen((prev) => !prev)}
          >
            <div className={styles.mobileCollapseLeft}>
              <FiGrid />
              <span>Products</span>
            </div>
            {mobileProductsOpen ? <FiChevronUp /> : <FiChevronDown />}
          </button>

          <div
            className={`${styles.mobileCollapseBody} ${
              mobileProductsOpen ? styles.mobileCollapseBodyOpen : ""
            } ${styles.desktopAlwaysOpen}`}
          >
            <div className={styles.productsCardBody}>
              <div className={styles.headerRow}>
                <div>
                  <h2 className={styles.title}>POS Checkout</h2>
                  <p className={styles.subtitle}>
                    Browse products and complete sales
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.openOrderBtn}
                  onClick={() => setOrderModalOpen(true)}
                >
                  <FiShoppingCart />
                  <span>{computedCart.length} item(s)</span>
                  <strong>{formatMoney(total)}</strong>
                </button>
              </div>

              <div className={styles.toolbar}>
                <div className={styles.searchBox}>
                  <FiSearch />
                  <input
                    type="text"
                    placeholder="Search products, category, type..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>

                <input
                  className={styles.shiftInput}
                  type="text"
                  placeholder="Shift ID (optional)"
                  value={shiftId}
                  onChange={(e) => setShiftId(e.target.value)}
                />
              </div>

              <div className={styles.categoryBar}>
                {categories.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`${styles.categoryBtn} ${
                      activeCategory === category ? styles.categoryBtnActive : ""
                    }`}
                    onClick={() => setActiveCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>

              <div className={styles.productsScrollArea}>
                {filteredProducts.length ? (
                  <>
                    <div className={styles.productsMetaBar}>
                      <span className={styles.productsCountText}>
                        Showing {paginatedProducts.length} of {filteredProducts.length} product(s)
                      </span>
                      <span className={styles.productsCountText}>
                        Page {currentProductsPage} of {totalProductPages}
                      </span>
                    </div>

                    <div className={styles.productGrid}>
                      {paginatedProducts.map((product) => {
                        const price =
                          product.type === "timed"
                            ? Number(product.hourly_rate || 0)
                            : Number(product.price || 0);

                        return (
                          <button
                            type="button"
                            key={product.id}
                            className={styles.productCard}
                            onClick={() => handleProductSelection(product)}
                          >
                            <div className={styles.productTop}>
                              <span className={styles.productIcon}>
                                {product.icon || "📦"}
                              </span>
                              <span className={styles.productType}>
                                {product.type || "fixed"}
                              </span>
                            </div>

                            <div className={styles.productName}>{product.name}</div>
                            <div className={styles.productCategory}>
                              {product.category_name || "Uncategorized"}
                            </div>
                            <div className={styles.productPrice}>
                              {product.type === "timed"
                                ? `${formatMoney(price)}/hr`
                                : Number(product.has_unit_hierarchy) === 1
                                ? `From ${formatMoney(price)}`
                                : formatMoney(price)}
                            </div>
                            {Number(product.has_unit_hierarchy) === 1 ? (
                              <div className={styles.productUnitHint}>
                                Choose unit to see stock and price
                              </div>
                            ) : null}
                            <div className={styles.productStock}>
                              Stock:{" "}
                              {product.is_unlimited
                                ? "∞"
                                : Number(product.stock || 0)}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className={styles.paginationBar}>
                      <button
                        type="button"
                        className={styles.paginationBtn}
                        onClick={() =>
                          setCurrentProductsPage((prev) => Math.max(prev - 1, 1))
                        }
                        disabled={currentProductsPage === 1}
                      >
                        Previous
                      </button>

                      <div className={styles.paginationPages}>
                        {Array.from({ length: totalProductPages }, (_, index) => {
                          const page = index + 1;

                          return (
                            <button
                              type="button"
                              key={page}
                              className={`${styles.paginationNumber} ${
                                currentProductsPage === page
                                  ? styles.paginationNumberActive
                                  : ""
                              }`}
                              onClick={() => setCurrentProductsPage(page)}
                            >
                              {page}
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        className={styles.paginationBtn}
                        onClick={() =>
                          setCurrentProductsPage((prev) =>
                            Math.min(prev + 1, totalProductPages)
                          )
                        }
                        disabled={currentProductsPage === totalProductPages}
                      >
                        Next
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={styles.stateBox}>No products found</div>
                )}
              </div>
            </div>
          </div>
        </section>

        {orderModalOpen ? (
          <button
            type="button"
            className={styles.orderModalBackdrop}
            onClick={() => setOrderModalOpen(false)}
            aria-label="Minimize current order"
          />
        ) : null}

        <aside
          ref={cartPanelRef}
          className={`${styles.cartPanel} ${styles.orderModalPanel} ${
            orderModalOpen ? styles.orderModalPanelOpen : ""
          }`}
          aria-hidden={!orderModalOpen}
        >
          <button
            type="button"
            className={styles.mobileCollapseBtn}
            onClick={() => setOrderModalOpen(false)}
          >
            <div className={styles.mobileCollapseLeft}>
              <FiShoppingCart />
              <span>
                Cart ({computedCart.length}) • {formatMoney(total)}
              </span>
            </div>
            <FiChevronDown />
          </button>

          <div
            className={`${styles.mobileCollapseBody} ${
              mobileCartOpen ? styles.mobileCollapseBodyOpen : ""
            } ${styles.desktopAlwaysOpen}`}
          >
            <div className={styles.cartHeader}>
              <div>
                <h3 className={styles.cartTitle}>
                  Current Order{" "}
                  {activePendingId ? (
                    <span className={styles.pendingBadge}>
                      Pending #{activePendingId}
                    </span>
                  ) : null}
                </h3>
                <p className={styles.cartSub}>{computedCart.length} item(s)</p>
              </div>

              <div className={styles.cartHeaderActions}>
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={clearCart}
                >
                  <FiTrash2 />
                  Clear
                </button>
                <button
                  type="button"
                  className={styles.minimizeOrderBtn}
                  onClick={() => setOrderModalOpen(false)}
                >
                  <FiChevronDown />
                  Minimize
                </button>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Customer</label>

              <input
                type="text"
                value={customerInputValue}
                onChange={(e) => {
                  const value = e.target.value;
                  setMemberSearch(value);

                  if (selectedMember) {
                    setSelectedMember(null);
                  }
                  setMemberTierSnapshot(null);

                  setCustomer(value.trim() || "Walk-in");
                }}
                placeholder="Search member or type custom walk-in name..."
              />

              {selectedMember ? (
                <div className={styles.removeMemberWrap}>
                  <button
                    type="button"
                    className={styles.removeMemberBtn}
                    onClick={() => {
                      setSelectedMember(null);
                      setMemberTierSnapshot(null);
                      setMemberSearch(customer?.trim() || "");
                    }}
                  >
                    <FiX />
                    Remove member
                  </button>
                </div>
              ) : null}

              {!selectedMember && memberSearch.trim() && (
                <div className={styles.memberDropdown}>
                  {filteredMembers.length ? (
                    filteredMembers.map((member) => {
                      const memberName =
                        member.full_name || member.name || "Unnamed Member";

                      return (
                        <button
                          key={member.id}
                          type="button"
                          className={styles.memberOption}
                          onClick={() => {
                            setSelectedMember(member);
                            setMemberTierSnapshot({
                              member_id: member.id,
                              membership_tier_id: member.membership_tier_id || null,
                              membership_tier_name:
                                member.membership_tier_name || member.tier || null,
                              membership_discount_pct: Number(
                                member.membership_discount_pct || 0
                              )
                            });
                            setCustomer(memberName);
                            setMemberSearch(memberName);
                          }}
                        >
                          <div>
                            <strong>{memberName}</strong>
                          </div>
                          <small>
                            {member.member_code || "No Code"}{" "}
                            {member.membership_tier_name || member.tier
                              ? `• ${member.membership_tier_name || member.tier}${
                                  Number(member.membership_discount_pct || 0) > 0
                                    ? ` (${Number(member.membership_discount_pct || 0)}% off)`
                                    : ""
                                } `
                              : ""}
                            {member.phone ? `• ${member.phone}` : ""}
                            {member.email ? ` • ${member.email}` : ""}
                          </small>
                        </button>
                      );
                    })
                  ) : (
                    <div className={styles.memberEmpty}>
                      No member found. Continue with custom customer:{" "}
                      <strong>{customer?.trim() || "Walk-in"}</strong>
                    </div>
                  )}
                </div>
              )}

              <small className={styles.cartSub}>
                Current customer: {displayedCustomerName}
              </small>
              {appliedMembershipTierName ? (
                <small className={styles.cartSub}>
                  Membership tier: {appliedMembershipTierName} •{" "}
                  {Number(appliedMembershipDiscountPct || 0)}% discount
                </small>
              ) : null}
            </div>

            <div className={styles.formGroup}>
              <label>Pending Note (optional)</label>
              <input
                type="text"
                value={pendingNote}
                onChange={(e) => setPendingNote(e.target.value)}
                placeholder="Example: Mr Sam will pay later"
              />
            </div>

            <div className={styles.cartItems}>
              {computedCart.length ? (
                computedCart.map((item) => (
                  <div key={item.cart_id} className={styles.cartItem}>
                    <div className={styles.cartItemInfo}>
                      <div className={styles.cartItemName}>
                        <span>{item.icon}</span>
                        <strong>{item.item_name}</strong>
                      </div>

                      <div className={styles.cartItemMeta}>
                        {item.item_type === "timed" && item.session_start
                          ? `Started: ${formatDateTimeLocal(item.session_start)}`
                          : item.unit_label
                          ? `${item.item_type} • Unit: ${formatUnitLabel(item)}`
                          : item.item_type}
                      </div>

                      {item.unit_label ? (
                        <div className={styles.cartItemMeta}>
                          Available stock: {formatAvailableUnitStock(item)}
                        </div>
                      ) : null}

                      <div className={styles.cartItemPrice}>
                        {item.item_type === "timed"
                          ? `${formatMoney(item.unit_price)}/hr`
                          : `${formatMoney(item.unit_price)} × ${item.qty}`}
                      </div>

                      {Number(item.item_discount_pct || 0) > 0 ? (
                        <div className={styles.cartItemDeal}>
                          <FiTag />
                          {Number(item.item_discount_pct || 0)}% item discount
                        </div>
                      ) : null}

                      {item.item_type === "timed" ? (
                        <div className={styles.cartItemMeta}>
                          Elapsed:{" "}
                          {Math.floor((item.elapsed_seconds || 0) / 3600)
                            .toString()
                            .padStart(2, "0")}
                          :
                          {Math.floor(((item.elapsed_seconds || 0) % 3600) / 60)
                            .toString()
                            .padStart(2, "0")}
                          :
                          {Math.floor((item.elapsed_seconds || 0) % 60)
                            .toString()
                            .padStart(2, "0")}
                        </div>
                      ) : null}
                    </div>

                    <div className={styles.qtyControls}>
                      {item.item_type !== "timed" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => decreaseQty(item.cart_id)}
                          >
                            <FiMinus />
                          </button>
                          <span>{item.qty}</span>
                          <button
                            type="button"
                            onClick={() => increaseQty(item.cart_id)}
                          >
                            <FiPlus />
                          </button>
                        </>
                      ) : (
                        <span className={styles.timedBadge}>Timed</span>
                      )}
                    </div>

                    <div className={styles.cartItemActions}>
                      <strong>{formatMoney(item.final_price)}</strong>
                      {item.item_type !== "timed" ? (
                        <button
                          type="button"
                          className={`${styles.halfPriceBtn} ${
                            Number(item.item_discount_pct || 0) ===
                            HALF_PRICE_DISCOUNT_PCT
                              ? styles.halfPriceBtnActive
                              : ""
                          }`}
                          onClick={() => toggleHalfPrice(item)}
                          disabled={splittingItemId === item.cart_id}
                          title="Charge half of this product price"
                        >
                          {splittingItemId === item.cart_id
                            ? "..."
                            : Number(item.item_discount_pct || 0) ===
                              HALF_PRICE_DISCOUNT_PCT
                            ? "Full"
                            : "1/2"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => removeItem(item.cart_id)}
                      >
                        <FiX />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.emptyCart}>Cart is empty</div>
              )}
            </div>

            <button
              type="button"
              className={styles.mobileCollapseBtnSecondary}
              onClick={() => setMobileSummaryOpen((prev) => !prev)}
            >
              <div className={styles.mobileCollapseLeft}>
                <FiCheckCircle />
                <span>Payment & Summary</span>
              </div>
              {mobileSummaryOpen ? <FiChevronUp /> : <FiChevronDown />}
            </button>

            <div
              className={`${styles.summaryCollapse} ${
                mobileSummaryOpen ? styles.summaryCollapseOpen : ""
              }`}
            >
              <div className={styles.summary}>
                {appliedMembershipTierName ? (
                  <div className={styles.memberDiscountCard}>
                    <strong>{appliedMembershipTierName}</strong>
                    <span>
                      Auto-applied member discount:{" "}
                      {Number(appliedMembershipDiscountPct || 0)}%
                    </span>
                  </div>
                ) : null}

                <div className={styles.formGroup}>
                  <label>Order Discount %</label>
                  <input
                    type="number"
                    min="0"
                    value={discountPct}
                    onChange={(e) => setDiscountPct(e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Loyalty Discount</label>
                  <input
                    type="number"
                    min="0"
                    value={loyaltyDiscount}
                    onChange={(e) => setLoyaltyDiscount(e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Gift Card Discount</label>
                  <input
                    type="number"
                    min="0"
                    value={giftcardDiscount}
                    onChange={(e) => setGiftcardDiscount(e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className={styles.paymentMethods}>
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      type="button"
                      key={method.key}
                      className={`${styles.paymentBtn} ${
                        paymentMethod === method.key
                          ? styles.paymentBtnActive
                          : ""
                      }`}
                      onClick={() => setPaymentMethod(method.key)}
                    >
                      {method.icon}
                      {method.label}
                    </button>
                  ))}
                </div>

                {paymentMethod === "cash" && (
                  <div className={styles.formGroup}>
                    <label>Cash Tendered</label>
                    <input
                      type="number"
                      min="0"
                      value={cashTendered}
                      onChange={(e) => setCashTendered(e.target.value)}
                      placeholder="0"
                    />
                    <small
                      className={
                        change >= 0 ? styles.successText : styles.errorText
                      }
                    >
                      Change: {formatMoney(change)}
                    </small>
                  </div>
                )}

                {paymentMethod === "transfer" && (
                  <div className={styles.formGroup}>
                    <label>Transfer Payment</label>
                    <input
                      type="number"
                      min="0"
                      value={total}
                      readOnly
                      placeholder="0"
                    />
                    <small className={styles.successText}>
                      Customer will pay by transfer: {formatMoney(total)}
                    </small>
                  </div>
                )}

                {paymentMethod === "split" && (
                  <div className={styles.splitGrid}>
                    <div className={styles.formGroup}>
                      <label>Cash Part</label>
                      <input
                        type="number"
                        min="0"
                        value={splitCash}
                        onChange={(e) => setSplitCash(e.target.value)}
                        placeholder="0"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Card Part</label>
                      <input
                        type="number"
                        min="0"
                        value={splitCard}
                        onChange={(e) => setSplitCard(e.target.value)}
                        placeholder="0"
                      />
                    </div>

                    <div className={styles.formGroup}>
                      <label>Transfer Part</label>
                      <input
                        type="number"
                        min="0"
                        value={splitTransfer}
                        onChange={(e) => setSplitTransfer(e.target.value)}
                        placeholder="0"
                      />
                    </div>

                    <small
                      className={`${styles.splitHint} ${
                        Math.abs(splitRemaining) < 0.01
                          ? styles.successText
                          : styles.errorText
                      }`}
                    >
                      Remaining: {formatMoney(splitRemaining)}
                    </small>
                  </div>
                )}

                <div className={styles.totalsBox}>
                  <div className={styles.totalRow}>
                    <span>Subtotal</span>
                    <strong>{formatMoney(subtotal)}</strong>
                  </div>
                  <div className={styles.totalRow}>
                    <span>Order Discount</span>
                    <strong>-{formatMoney(discountAmount)}</strong>
                  </div>
                  {membershipDiscountAmount > 0 ? (
                    <div className={styles.totalRow}>
                      <span>
                        Membership Discount
                        {appliedMembershipTierName
                          ? ` (${appliedMembershipTierName})`
                          : ""}
                      </span>
                      <strong>-{formatMoney(membershipDiscountAmount)}</strong>
                    </div>
                  ) : null}
                  <div className={styles.totalRow}>
                    <span>Loyalty</span>
                    <strong>-{formatMoney(loyaltyAmount)}</strong>
                  </div>
                  <div className={styles.totalRow}>
                    <span>Gift Card</span>
                    <strong>-{formatMoney(giftcardAmount)}</strong>
                  </div>
                  <div className={styles.totalRow}>
                    <span>Tax ({taxRate}%)</span>
                    <strong>{formatMoney(tax)}</strong>
                  </div>
                  <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                    <span>Total</span>
                    <strong>{formatMoney(total)}</strong>
                  </div>
                </div>

                {error ? <div className={styles.errorBox}>{error}</div> : null}

                <div className={styles.actionButtons}>
                  <button
                    type="button"
                    className={styles.holdBtn}
                    onClick={handleHoldCart}
                    disabled={savingPending || !computedCart.length}
                  >
                    <FiPauseCircle />
                    {savingPending
                      ? "Saving..."
                      : activePendingId
                      ? "Update Pending"
                      : "Hold as Pending"}
                  </button>

                  <button
                    type="button"
                    className={styles.checkoutBtn}
                    onClick={handleCheckout}
                    disabled={checkingOut || !computedCart.length}
                  >
                    {checkingOut
                      ? "Processing..."
                      : activePendingId
                      ? "Checkout Pending"
                      : "Complete Checkout"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {!orderModalOpen ? (
        <button
          type="button"
          className={styles.orderMiniDock}
          onClick={() => setOrderModalOpen(true)}
        >
          <FiShoppingCart />
          <span>
            Current Order • {computedCart.length} item(s)
          </span>
          <strong>{formatMoney(total)}</strong>
        </button>
      ) : null}

      {unitPickerProduct ? (
        <div className={styles.unitPickerOverlay}>
          <button
            type="button"
            className={styles.unitPickerBackdrop}
            onClick={closeUnitPicker}
            aria-label="Close unit picker"
          />
          <div className={styles.unitPickerModal}>
            <div className={styles.unitPickerHeader}>
              <div>
                <p className={styles.unitPickerEyebrow}>Select Sell Unit</p>
                <h3>{unitPickerProduct.icon || "📦"} {unitPickerProduct.name}</h3>
                <small>
                  Choose the unit value and selling price for this item before adding it to the cart.
                </small>
              </div>
              <button type="button" onClick={closeUnitPicker}>
                <FiX />
              </button>
            </div>

            {loadingUnitPicker ? (
              <div className={styles.unitPickerState}>Loading unit options...</div>
            ) : unitPickerError ? (
              <div className={styles.unitPickerError}>{unitPickerError}</div>
            ) : (
              <div className={styles.unitOptionGrid}>
                {unitPickerOptions.map((option) => (
                  <button
                    type="button"
                    key={option.unit_level_id}
                    className={styles.unitOptionCard}
                    disabled={option.available_qty <= 0}
                    onClick={() => {
                      addToCart(unitPickerProduct, option);
                      closeUnitPicker();
                    }}
                  >
                    <div className={styles.unitOptionTop}>
                      <strong>{formatUnitLabel(option)}</strong>
                      <span>{formatMoney(option.unit_price)}</span>
                    </div>
                    <div className={styles.unitOptionMeta}>
                      {option.level === 1
                        ? "Largest unit"
                        : `${option.conversion_factor} per parent`}
                    </div>
                    <div className={styles.unitOptionMeta}>
                      {option.smallest_unit_multiplier} smallest-unit value
                    </div>
                    <div className={styles.unitOptionMeta}>
                      Available stock: {option.available_qty} {formatUnitLabel(option)}
                    </div>
                    {option.available_qty <= 0 ? (
                      <div className={styles.unitOptionMeta}>Out of stock</div>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {receipt ? (
        <div className={styles.receiptOverlay}>
          <div className={styles.receiptModal}>
            <div className={styles.receiptHeader}>
              <div>
                <h3>Receipt</h3>
                <p className={styles.receiptStatus}>
                  {receipt.status === "pending" ? "Pending transaction" : "Completed transaction"}
                </p>
              </div>
              <button type="button" onClick={() => setReceipt(null)}>
                <FiX />
              </button>
            </div>

            <div className={styles.receiptBody} id="printable-receipt">
              <div className={styles.rLogo}>🎮 {receipt.business_name}</div>
              <div className={styles.rCenter}>
                {receipt.business_address}
                <br />
                {receipt.business_phone}
              </div>

              <hr className={styles.rHr} />

              <div className={styles.rRow}>
                <span>Receipt #</span>
                <span>{receipt.saleId || receipt.saleCode || receipt.receiptId}</span>
              </div>

              <div className={styles.rRow}>
                <span>Status</span>
                <span>{String(receipt.status || "completed").toUpperCase()}</span>
              </div>

              <div className={styles.rRow}>
                <span>Date</span>
                <span>{formatDateTimeLocal(receipt.createdAt)}</span>
              </div>

              <div className={styles.rRow}>
                <span>Customer</span>
                <span>{receipt.customer}</span>
              </div>

              {receipt.membershipTierName ? (
                <div className={styles.rRow}>
                  <span>Membership</span>
                  <span>
                    {receipt.membershipTierName} ({Number(
                      receipt.membershipDiscountPct || 0
                    )}
                    %)
                  </span>
                </div>
              ) : null}

              <div className={styles.rRow}>
                <span>Cashier</span>
                <span>{receipt.cashier}</span>
              </div>

              <hr className={styles.rHr} />

              {receipt.items.some((item) => item.item_type === "timed") ? (
                <>
                  <div className={styles.rBold}>TIMED SESSIONS</div>
                  {receipt.items
                    .filter((item) => item.item_type === "timed")
                    .map((item, index) => (
                      <div key={item.cart_id || index}>
                        <div className={styles.rRow}>
                          <span>
                            {item.icon} {item.item_name}
                          </span>
                          <span className={styles.rBold}>
                            {formatMoney(item.final_price || 0)}
                          </span>
                        </div>
                        <div className={styles.rSubText}>
                          Start:{" "}
                          {item.session_start
                            ? formatDateTimeLocal(item.session_start)
                            : "-"}
                        </div>
                        <div className={styles.rRowSmall}>
                          <span>
                            End:{" "}
                            {item.session_end
                              ? formatDateTimeLocal(item.session_end)
                              : "-"}
                          </span>
                          <span>
                            {Math.floor((item.elapsed_seconds || 0) / 3600)
                              .toString()
                              .padStart(2, "0")}
                            :
                            {Math.floor(((item.elapsed_seconds || 0) % 3600) / 60)
                              .toString()
                              .padStart(2, "0")}
                            :
                            {Math.floor((item.elapsed_seconds || 0) % 60)
                              .toString()
                              .padStart(2, "0")}
                          </span>
                        </div>
                      </div>
                    ))}
                  <hr className={styles.rHr} />
                </>
              ) : null}

              {receipt.items
                .filter((item) => item.item_type !== "timed")
                .map((item, index) => (
                  <div key={item.cart_id || index} className={styles.rRow}>
                    <span>
                      {item.icon} {item.item_name}
                      {item.unit_label ? ` (${formatUnitLabel(item)})` : ""} ×{item.qty}
                      {Number(item.item_discount_pct || 0) > 0
                        ? ` (${Number(item.item_discount_pct || 0)}% off)`
                        : ""}
                    </span>
                    <span>{formatMoney(item.final_price)}</span>
                  </div>
                ))}

              {receipt.items.some((item) => item.item_type !== "timed") ? (
                <hr className={styles.rHr} />
              ) : null}

              <div className={styles.rRow}>
                <span>Subtotal</span>
                <span>{formatMoney(receipt.subtotal)}</span>
              </div>

              {receipt.discount > 0 ? (
                <div className={`${styles.rRow} ${styles.rRed}`}>
                  <span>Order Discount</span>
                  <span>-{formatMoney(receipt.discount)}</span>
                </div>
              ) : null}

              {receipt.membershipDiscount > 0 ? (
                <div className={`${styles.rRow} ${styles.rPurple}`}>
                  <span>
                    Membership Discount
                    {receipt.membershipTierName
                      ? ` (${receipt.membershipTierName})`
                      : ""}
                  </span>
                  <span>-{formatMoney(receipt.membershipDiscount)}</span>
                </div>
              ) : null}

              {receipt.loyaltyDiscount > 0 ? (
                <div className={`${styles.rRow} ${styles.rPurple}`}>
                  <span>Loyalty Points</span>
                  <span>-{formatMoney(receipt.loyaltyDiscount)}</span>
                </div>
              ) : null}

              {receipt.giftcardDiscount > 0 ? (
                <div className={`${styles.rRow} ${styles.rPurple}`}>
                  <span>Gift Card</span>
                  <span>-{formatMoney(receipt.giftcardDiscount)}</span>
                </div>
              ) : null}

              <div className={styles.rRow}>
                <span>Tax ({receipt.taxRate}%)</span>
                <span>{formatMoney(receipt.tax)}</span>
              </div>

              <div className={`${styles.rRow} ${styles.rGrand}`}>
                <span>TOTAL</span>
                <span>{formatMoney(receipt.total)}</span>
              </div>

              <div className={styles.rRow}>
                <span>Payment</span>
                <span>{String(receipt.paymentMethod || "").toUpperCase()}</span>
              </div>

              <hr className={styles.rHr} />

              <div className={styles.rCenter}>{receipt.receipt_footer}</div>
            </div>

            <div className={styles.receiptActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => setReceipt(null)}
              >
                Close
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={shareReceiptToWhatsApp}
              >
                WhatsApp
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={shareReceipt}
              >
                <FiShare2 />
                Share
              </button>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={printReceipt}
              >
                <FiPrinter />
                Print Receipt
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
