import { useEffect, useMemo, useState } from "react";
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
  FiRepeat
} from "react-icons/fi";

import { getProducts } from "../../api/productsApi";
import {
  checkoutSale,
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
import DashboardLoader from "../dashboard-loader/DashboardLoader";
import styles from "./ProductsPOS.module.css";

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

const currencySymbols = {
  NGN: "₦",
  USD: "$",
  GBP: "£",
  EUR: "€",
  GHS: "₵",
  ZAR: "R ",
  KES: "Ksh "
};

export default function ProductsPOS() {
  const [products, setProducts] = useState([]);
  const [members, setMembers] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [currentUser, setCurrentUser] = useState(null);

  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState("Walk-in");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState(null);

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
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState("");

  const [pendingCarts, setPendingCarts] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [savingPending, setSavingPending] = useState(false);
  const [activePendingId, setActivePendingId] = useState(null);
  const [pendingNote, setPendingNote] = useState("");

  const [desktopPendingOpen, setDesktopPendingOpen] = useState(true);
  const [mobileCartOpen, setMobileCartOpen] = useState(true);
  const [mobileProductsOpen, setMobileProductsOpen] = useState(true);
  const [mobilePendingOpen, setMobilePendingOpen] = useState(false);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(true);

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

  useEffect(() => {
    loadInitialData();
    loadPendingCarts();
  }, []);

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

      setCurrentUser(meRes?.user || null);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load POS data");
    } finally {
      setLoadingProducts(false);
      setLoadingSettings(false);
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

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return [];

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
  }, [members, memberSearch]);

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find(
        (item) => item.product_id === product.id && item.item_type !== "timed"
      );

      if (existing) {
        return prev.map((item) =>
          item.cart_id === existing.cart_id
            ? {
                ...item,
                qty: item.qty + 1,
                final_price: (item.qty + 1) * item.unit_price
              }
            : item
        );
      }

      const unitPrice =
        product.type === "timed"
          ? Number(product.hourly_rate || 0)
          : Number(product.price || 0);

      const item = {
        cart_id: `${product.id}-${Date.now()}-${Math.floor(
          Math.random() * 1000
        )}`,
        product_id: product.id,
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
        manage_stock: !product.is_unlimited && Number(product.stock || 0) > 0
      };

      return [...prev, item];
    });
  };

  const increaseQty = (cartId) => {
    setCart((prev) =>
      prev.map((item) =>
        item.cart_id === cartId
          ? {
              ...item,
              qty: item.qty + 1,
              final_price:
                item.item_type === "timed"
                  ? item.final_price
                  : (item.qty + 1) * item.unit_price
            }
          : item
      )
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
                    : (item.qty - 1) * item.unit_price
              }
            : item
        )
        .filter((item) => item.qty > 0)
    );
  };

  const removeItem = (cartId) => {
    setCart((prev) => prev.filter((item) => item.cart_id !== cartId));
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
      if (item.item_type !== "timed" || !item.session_start) return item;

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

  const loyaltyAmount = Number(loyaltyDiscount || 0);
  const giftcardAmount = Number(giftcardDiscount || 0);
  const taxableBase = Math.max(
    0,
    subtotal - discountAmount - loyaltyAmount - giftcardAmount
  );
  const taxRate = Number(settings?.tax_rate || 0);
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

  const buildOrderPayload = () => ({
    customer: selectedMember
      ? selectedMember.full_name || selectedMember.name || "Walk-in"
      : customer || "Walk-in",
    member_id: selectedMember?.id || null,
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
      setCustomer(data.customer || "Walk-in");
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
      setMemberSearch(
        foundMember
          ? foundMember.full_name || foundMember.name || ""
          : data.customer || ""
      );

      setCart(
        (data.items || []).map((item, index) => ({
          cart_id: `pending-${data.id}-${item.id || index}-${Date.now()}`,
          product_id: item.product_id,
          item_name: item.item_name,
          icon: item.icon || "📦",
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

      setReceipt({
        saleId: res?.saleId,
        saleCode: res?.saleCode,
        customer: selectedMember
          ? selectedMember.full_name || selectedMember.name || "Walk-in"
          : customer || "Walk-in",
        cashier: currentUser?.name || "Staff",
        paymentMethod: paymentLabel,
        subtotal,
        discount: discountAmount,
        loyaltyDiscount: loyaltyAmount,
        giftcardDiscount: giftcardAmount,
        tax,
        taxRate,
        total,
        currency: settings?.currency || "NGN",
        items: [...payloadItems],
        createdAt: new Date().toISOString(),
        business_name: settings?.business_name,
        business_address: settings?.business_address,
        business_phone: settings?.business_phone,
        receipt_footer: settings?.receipt_footer
      });

      resetCartState();
      await loadPendingCarts();
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

            html, body {
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
              html, body {
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

  return (
    <div className={styles.posShell}>
      <div className={styles.mobileTopBar}>
        <button
          type="button"
          className={styles.mobileTopCard}
          onClick={() => setMobileCartOpen((prev) => !prev)}
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
            {mobileCartOpen ? <FiChevronUp /> : <FiChevronDown />}
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

      <div className={styles.posPage}>
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
                  <div className={styles.productGrid}>
                    {filteredProducts.map((product) => {
                      const price =
                        product.type === "timed"
                          ? Number(product.hourly_rate || 0)
                          : Number(product.price || 0);

                      return (
                        <button
                          type="button"
                          key={product.id}
                          className={styles.productCard}
                          onClick={() => addToCart(product)}
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
                              : formatMoney(price)}
                          </div>
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
                ) : (
                  <div className={styles.stateBox}>No products found</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className={styles.cartPanel}>
          <button
            type="button"
            className={styles.mobileCollapseBtn}
            onClick={() => setMobileCartOpen((prev) => !prev)}
          >
            <div className={styles.mobileCollapseLeft}>
              <FiShoppingCart />
              <span>
                Cart ({computedCart.length}) • {formatMoney(total)}
              </span>
            </div>
            {mobileCartOpen ? <FiChevronUp /> : <FiChevronDown />}
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
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Customer</label>

              <input
                type="text"
                value={
                  selectedMember
                    ? selectedMember.full_name || selectedMember.name || ""
                    : memberSearch
                }
                onChange={(e) => {
                  const value = e.target.value;
                  setMemberSearch(value);

                  if (!value.trim()) {
                    setSelectedMember(null);
                    setCustomer("Walk-in");
                  } else {
                    setSelectedMember(null);
                    setCustomer("Walk-in");
                  }
                }}
                placeholder="Search member by name, phone, email..."
              />

              {selectedMember ? (
                <div className={styles.removeMemberWrap}>
                  <button
                    type="button"
                    className={styles.removeMemberBtn}
                    onClick={() => {
                      setSelectedMember(null);
                      setMemberSearch("");
                      setCustomer("Walk-in");
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
                            setCustomer(memberName);
                            setMemberSearch(memberName);
                          }}
                        >
                          <div>
                            <strong>{memberName}</strong>
                          </div>
                          <small>
                            {member.member_code || "No Code"}
                            {member.phone ? ` • ${member.phone}` : ""}
                            {member.email ? ` • ${member.email}` : ""}
                          </small>
                        </button>
                      );
                    })
                  ) : (
                    <div className={styles.memberEmpty}>No member found</div>
                  )}
                </div>
              )}

              <small className={styles.cartSub}>
                Current customer:{" "}
                {selectedMember
                  ? selectedMember.full_name || selectedMember.name
                  : "Walk-in"}
              </small>
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
                          : item.item_type}
                      </div>

                      <div className={styles.cartItemPrice}>
                        {item.item_type === "timed"
                          ? `${formatMoney(item.unit_price)}/hr`
                          : `${formatMoney(item.unit_price)} × ${item.qty}`}
                      </div>

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
                    <input type="number" min="0" value={total} readOnly />
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
                    <span>Discount</span>
                    <strong>-{formatMoney(discountAmount)}</strong>
                  </div>
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

                <div className={styles.actionButtons}>
                  <button
                    type="button"
                    className={styles.holdBtn}
                    onClick={handleHoldCart}
                    disabled={savingPending || !computedCart.length}
                  >
                    <FiClock />
                    {savingPending
                      ? "Saving..."
                      : activePendingId
                      ? "Update Hold"
                      : "Hold Cart"}
                  </button>

                  <button
                    type="button"
                    className={styles.checkoutBtn}
                    onClick={handleCheckout}
                    disabled={checkingOut || !computedCart.length}
                  >
                    {checkingOut ? "Processing..." : "Checkout"}
                  </button>
                </div>

                {error ? <div className={styles.errorBox}>{error}</div> : null}
              </div>
            </div>
          </div>
        </aside>
      </div>

      {receipt ? (
        <div className={styles.receiptOverlay}>
          <div className={styles.receiptModal}>
            <div className={styles.receiptHeader}>
              <h3>Receipt</h3>
              <button type="button" onClick={() => setReceipt(null)}>
                <FiX />
              </button>
            </div>

            <div className={styles.receiptBody} id="printable-receipt">
              <div className={styles.rLogo}>{receipt.business_name}</div>
              <div className={styles.rCenter}>{receipt.business_address}</div>
              <div className={styles.rCenter}>{receipt.business_phone}</div>
              <hr className={styles.rHr} />

              <div className={styles.rRow}>
                <span>Receipt No:</span>
                <span>{receipt.saleCode || receipt.saleId || "-"}</span>
              </div>
              <div className={styles.rRow}>
                <span>Date:</span>
                <span>{formatDateTimeLocal(receipt.createdAt)}</span>
              </div>
              <div className={styles.rRow}>
                <span>Customer:</span>
                <span>{receipt.customer}</span>
              </div>
              <div className={styles.rRow}>
                <span>Cashier:</span>
                <span>{receipt.cashier}</span>
              </div>
              <div className={styles.rRow}>
                <span>Payment:</span>
                <span>{receipt.paymentMethod}</span>
              </div>

              <hr className={styles.rHr} />

              <div className={styles.rBold}>Items</div>

              {receipt.items?.map((item, index) => (
                <div key={`${item.product_id}-${index}`}>
                  <div className={styles.rRow}>
                    <span>
                      {item.icon} {item.item_name}
                    </span>
                    <span>{formatMoney(item.final_price)}</span>
                  </div>
                  <div className={styles.rRowSmall}>
                    <span>
                      {item.item_type === "timed"
                        ? `${formatMoney(item.unit_price)}/hr`
                        : `${item.qty} × ${formatMoney(item.unit_price)}`}
                    </span>
                    <span>{item.item_type}</span>
                  </div>
                </div>
              ))}

              <hr className={styles.rHr} />

              <div className={styles.rRow}>
                <span>Subtotal</span>
                <span>{formatMoney(receipt.subtotal)}</span>
              </div>
              <div className={styles.rRow}>
                <span>Discount</span>
                <span className={styles.rRed}>
                  -{formatMoney(receipt.discount)}
                </span>
              </div>
              <div className={styles.rRow}>
                <span>Loyalty</span>
                <span className={styles.rPurple}>
                  -{formatMoney(receipt.loyaltyDiscount)}
                </span>
              </div>
              <div className={styles.rRow}>
                <span>Gift Card</span>
                <span className={styles.rPurple}>
                  -{formatMoney(receipt.giftcardDiscount)}
                </span>
              </div>
              <div className={styles.rRow}>
                <span>Tax ({receipt.taxRate}%)</span>
                <span>{formatMoney(receipt.tax)}</span>
              </div>
              <div className={`${styles.rRow} ${styles.rGrand}`}>
                <span>Total</span>
                <span>{formatMoney(receipt.total)}</span>
              </div>

              <hr className={styles.rHr} />
              <div className={styles.rCenter}>{receipt.receipt_footer}</div>
            </div>

            <div className={styles.receiptActions}>
              <button type="button" className={styles.secondaryBtn} onClick={() => setReceipt(null)}>
                Close
              </button>
              <button type="button" className={styles.primaryBtn} onClick={printReceipt}>
                <FiPrinter />
                Print
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
