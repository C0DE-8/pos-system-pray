import { useEffect, useMemo, useState } from "react";
import moment from "moment";
import * as XLSX from "xlsx";
import {
  FiRefreshCw,
  FiDownload,
  FiPrinter,
  FiSearch,
  FiBarChart2,
  FiTrendingUp,
  FiDollarSign,
  FiShoppingBag,
  FiRotateCcw,
  FiEye,
  FiX,
  FiCalendar,
  FiFilter,
  FiChevronDown,
  FiChevronUp
} from "react-icons/fi";

import {
  getSales,
  getSaleById,
  refundSale,
  getSalesByPaymentType,
  getSalesSummary
} from "../../api/salesApi";
import { getSettings } from "../../api/settingsApi";
import { toast } from "../CustomToaster/toast";
import styles from "./SalesManagement.module.css";

const DEFAULT_SETTINGS = {
  business_name: "Arena Pro Game Center",
  business_address: "123 Game Street, Lagos",
  business_phone: "+234 800 000 0000",
  tax_rate: 0,
  currency: "NGN",
  receipt_footer: "Thank you for your patronage!"
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

const EMPTY_SALES_SUMMARY = {
  today: { totalSales: 0, completedSales: 0, refundedSales: 0, revenue: 0 },
  week: { totalSales: 0, completedSales: 0, refundedSales: 0, revenue: 0 },
  month: { totalSales: 0, completedSales: 0, refundedSales: 0, revenue: 0 },
  overall: { totalSales: 0, completedSales: 0, refundedSales: 0, revenue: 0 },
  filtered: { totalSales: 0, completedSales: 0, refundedSales: 0, revenue: 0 },
  trend: []
};

const buildSevenDayTrend = (sales) => {
  const dailyMap = new Map();

  for (let index = 6; index >= 0; index -= 1) {
    const day = moment().startOf("day").subtract(index, "days");
    dailyMap.set(day.format("YYYY-MM-DD"), {
      label: day.format("ddd"),
      total: 0
    });
  }

  sales.forEach((sale) => {
    const saleDate = sale?.sale_date || sale?.created_at;
    if (!saleDate) return;
    if (String(sale?.status || "").toLowerCase() === "refunded") return;

    const key = moment(saleDate).format("YYYY-MM-DD");
    if (!dailyMap.has(key)) return;

    const current = dailyMap.get(key);
    current.total += Number(sale.total_amount || sale.total || 0);
  });

  return Array.from(dailyMap.values());
};

export default function SalesManagement() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [refundLoadingId, setRefundLoadingId] = useState(null);

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [selectedSale, setSelectedSale] = useState(null);
  const [saleItems, setSaleItems] = useState([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [rangeFilter, setRangeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");

  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundReason, setRefundReason] = useState("");
  const [refundSaleId, setRefundSaleId] = useState(null);
  const [sectionsOpen, setSectionsOpen] = useState({
    overview: true,
    trend: true,
    filters: true,
    results: true
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [detailItemsPage, setDetailItemsPage] = useState(1);
  const [salesSummary, setSalesSummary] = useState(EMPTY_SALES_SUMMARY);

  const SALES_PER_PAGE = 10;
  const SALE_ITEMS_PER_PAGE = 8;

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);

      const [salesRes, settingsRes] = await Promise.all([
        getSales(),
        getSettings().catch(() => ({ data: {} }))
      ]);

      setSales(salesRes?.data || []);

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
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load sales");
    } finally {
      setLoading(false);
    }
  };

  const fetchSales = async () => {
    try {
      setLoading(true);

      const res = await getSales();
      setSales(res?.data || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load sales");
    } finally {
      setLoading(false);
    }
  };

  const fetchSalesByPayment = async (filters = {}) => {
    try {
      setLoading(true);

      const res = await getSalesByPaymentType(filters);
      setSales(res?.data || []);

      const niceType = filters.type || "all";
      const niceSplit = filters.split_with ? ` / ${filters.split_with}` : "";
      toast.success(`Showing ${niceType}${niceSplit} sales`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to filter sales");
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentFilterChange = async (value) => {
    setPaymentFilter(value);

    if (value === "all") {
      await fetchSales();
      return;
    }

    if (value === "cash") {
      await fetchSalesByPayment({ type: "cash" });
      return;
    }

    if (value === "card") {
      await fetchSalesByPayment({ type: "card" });
      return;
    }

    if (value === "transfer") {
      await fetchSalesByPayment({ type: "transfer" });
      return;
    }

    if (value === "split") {
      await fetchSalesByPayment({ type: "split" });
      return;
    }

    if (value === "split-cash") {
      await fetchSalesByPayment({ type: "split", split_with: "cash" });
      return;
    }

    if (value === "split-card") {
      await fetchSalesByPayment({ type: "split", split_with: "card" });
      return;
    }

    if (value === "split-transfer") {
      await fetchSalesByPayment({ type: "split", split_with: "transfer" });
      return;
    }
  };

  const formatMoney = (value) => {
    const currency = settings?.currency || "NGN";
    const symbol = currencySymbols[currency] || "₦";
    return `${symbol}${Number(value || 0).toLocaleString("en-NG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  const getSaleDate = (sale) => {
    return sale?.sale_date || sale?.created_at || null;
  };

  const formatDateTime = (value) => {
    if (!value) return "—";
    return moment(value).format("DD MMM YYYY, hh:mm A");
  };

  const isRefundedSale = (sale) =>
    String(sale?.status || "").toLowerCase() === "refunded";

  const getReadablePaymentMethod = (sale) => {
    if (!sale) return "—";

    if (sale.payment_method !== "split") {
      return sale.payment_method || "—";
    }

    const cash = Number(sale?.payment_breakdown?.cash ?? sale?.split_cash_amount ?? 0);
    const card = Number(sale?.payment_breakdown?.card ?? sale?.split_card_amount ?? 0);
    const transfer = Number(
      sale?.payment_breakdown?.transfer ?? sale?.split_transfer_amount ?? 0
    );

    const parts = [];
    if (cash > 0) parts.push(`Cash: ${formatMoney(cash)}`);
    if (card > 0) parts.push(`Card: ${formatMoney(card)}`);
    if (transfer > 0) parts.push(`Transfer: ${formatMoney(transfer)}`);

    return parts.length ? `Split (${parts.join(" / ")})` : "split";
  };

  const openSaleDetails = async (saleId) => {
    try {
      setDetailsLoading(true);
      setShowDetailsModal(true);

      const res = await getSaleById(saleId);
      setSelectedSale(res?.sale || null);
      setSaleItems(res?.items || []);
    } catch (err) {
      setShowDetailsModal(false);
      toast.error(err?.response?.data?.message || "Failed to load sale details");
    } finally {
      setDetailsLoading(false);
    }
  };

  const openRefundModal = (saleId) => {
    setRefundSaleId(saleId);
    setRefundReason("");
    setShowRefundModal(true);
  };

  const handleRefund = async () => {
    if (!refundSaleId) return;

    try {
      setRefundLoadingId(refundSaleId);

      const finalReason = refundReason.trim() || "Refunded";

      await refundSale(refundSaleId, { reason: finalReason });

      toast.success("Sale refunded successfully");
      setShowRefundModal(false);
      setRefundReason("");
      setRefundSaleId(null);

      if (selectedSale?.id === refundSaleId) {
        setSelectedSale((prev) =>
          prev
            ? {
                ...prev,
                status: "refunded",
                refund_reason: finalReason
              }
            : prev
        );
      }

      if (paymentFilter === "all") {
        await fetchSales();
      } else {
        await handlePaymentFilterChange(paymentFilter);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to refund sale");
    } finally {
      setRefundLoadingId(null);
    }
  };

  const isInRange = (sale, range) => {
    const saleDate = getSaleDate(sale);
    if (!saleDate) return false;

    const m = moment(saleDate);

    if (range === "today") return m.isSame(moment(), "day");
    if (range === "week") return m.isSame(moment(), "week");
    if (range === "month") return m.isSame(moment(), "month");
    return true;
  };

  const isInCustomDateRange = (sale) => {
    const saleDate = getSaleDate(sale);
    if (!saleDate) return false;

    const m = moment(saleDate);
    const hasFrom = !!dateFrom;
    const hasTo = !!dateTo;

    if (!hasFrom && !hasTo) return true;

    if (hasFrom && hasTo) {
      const from = moment(dateFrom).startOf("day");
      const to = moment(dateTo).endOf("day");
      return m.isBetween(from, to, undefined, "[]");
    }

    if (hasFrom) {
      const from = moment(dateFrom).startOf("day");
      return m.isSameOrAfter(from);
    }

    if (hasTo) {
      const to = moment(dateTo).endOf("day");
      return m.isSameOrBefore(to);
    }

    return true;
  };

  const clearDateFilters = () => {
    setDateFrom("");
    setDateTo("");
    setRangeFilter("all");
  };

  const clearAllFilters = async () => {
    setSearch("");
    setStatusFilter("all");
    setRangeFilter("all");
    setDateFrom("");
    setDateTo("");
    setPaymentFilter("all");
    await fetchSales();
  };

  const toggleSection = (sectionKey) => {
    setSectionsOpen((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      const searchValue = search.trim().toLowerCase();

      const matchesSearch =
        !searchValue ||
        String(sale.id || "").toLowerCase().includes(searchValue) ||
        String(sale.cashier_name || "").toLowerCase().includes(searchValue) ||
        String(sale.payment_method || "").toLowerCase().includes(searchValue) ||
        String(sale.customer_name || "").toLowerCase().includes(searchValue) ||
        getReadablePaymentMethod(sale).toLowerCase().includes(searchValue);

      const matchesStatus =
        statusFilter === "all"
          ? true
          : String(sale.status || "").toLowerCase() === statusFilter.toLowerCase();

      const matchesRange = isInRange(sale, rangeFilter);
      const matchesCustomDate = isInCustomDateRange(sale);

      return matchesSearch && matchesStatus && matchesRange && matchesCustomDate;
    });
  }, [sales, search, statusFilter, rangeFilter, dateFrom, dateTo]);

  const filteredSalesTotal = useMemo(() => {
    return filteredSales
      .filter((sale) => !isRefundedSale(sale))
      .reduce((sum, sale) => sum + Number(sale.total_amount || sale.total || 0), 0);
  }, [filteredSales]);

  const summaryParams = useMemo(() => {
    const params = {};

    if (search.trim()) params.search = search.trim();
    if (statusFilter !== "all") params.status = statusFilter;
    if (rangeFilter !== "all") params.range = rangeFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (paymentFilter !== "all") params.payment = paymentFilter;

    return params;
  }, [search, statusFilter, rangeFilter, dateFrom, dateTo, paymentFilter]);

  const totalSalesPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredSales.length / SALES_PER_PAGE));
  }, [filteredSales.length]);

  const paginatedSales = useMemo(() => {
    const startIndex = (currentPage - 1) * SALES_PER_PAGE;
    return filteredSales.slice(startIndex, startIndex + SALES_PER_PAGE);
  }, [filteredSales, currentPage]);

  const todayStats = salesSummary.today || EMPTY_SALES_SUMMARY.today;
  const weekStats = salesSummary.week || EMPTY_SALES_SUMMARY.week;
  const monthStats = salesSummary.month || EMPTY_SALES_SUMMARY.month;
  const overallStats = salesSummary.overall || EMPTY_SALES_SUMMARY.overall;
  const filteredStats = salesSummary.filtered || EMPTY_SALES_SUMMARY.filtered;
  const chartData = useMemo(() => buildSevenDayTrend(filteredSales), [filteredSales]);

  const chartMax = Math.max(...chartData.map((item) => item.total), 1);

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedSale(null);
    setSaleItems([]);
  };

  const closeRefundModal = () => {
    setShowRefundModal(false);
    setRefundSaleId(null);
    setRefundReason("");
  };

  const buildReportRows = (list) => {
    return list.map((sale) => ({
      "Sale ID": sale.id,
      Cashier: sale.cashier_name || "",
      Customer: sale.customer_name || "Walk-in",
      "Payment Method": getReadablePaymentMethod(sale),
      Total: Number(sale.total_amount || sale.total || 0),
      Status: sale.status || "paid",
      Date: formatDateTime(getSaleDate(sale)),
      Business: settings.business_name,
      Address: settings.business_address,
      Phone: settings.business_phone
    }));
  };

  const getActiveDateLabel = () => {
    if (dateFrom && dateTo) {
      return `${moment(dateFrom).format("DD MMM YYYY")} - ${moment(dateTo).format("DD MMM YYYY")}`;
    }
    if (dateFrom) {
      return `From ${moment(dateFrom).format("DD MMM YYYY")}`;
    }
    if (dateTo) {
      return `Until ${moment(dateTo).format("DD MMM YYYY")}`;
    }
    if (rangeFilter === "today") return "Today";
    if (rangeFilter === "week") return "This Week";
    if (rangeFilter === "month") return "This Month";
    return "All Time";
  };

  const getPaymentFilterLabel = () => {
    if (paymentFilter === "cash") return "Cash";
    if (paymentFilter === "card") return "Card";
    if (paymentFilter === "transfer") return "Transfer";
    if (paymentFilter === "split") return "Split";
    if (paymentFilter === "split-cash") return "Split / Cash";
    if (paymentFilter === "split-card") return "Split / Card";
    if (paymentFilter === "split-transfer") return "Split / Transfer";
    return "All Payments";
  };

  const downloadExcel = () => {
    try {
      const workbook = XLSX.utils.book_new();
      const exportRows = paginatedSales;
      const exportTotal = exportRows
        .filter((sale) => !isRefundedSale(sale))
        .reduce((sum, sale) => sum + Number(sale.total_amount || sale.total || 0), 0);

      const reportMeta = [
        { Field: "Business Name", Value: settings.business_name },
        { Field: "Business Address", Value: settings.business_address },
        { Field: "Business Phone", Value: settings.business_phone },
        { Field: "Currency", Value: settings.currency },
        { Field: "Generated On", Value: formatDateTime(new Date()) },
        { Field: "Date Filter", Value: getActiveDateLabel() },
        { Field: "Payment Filter", Value: getPaymentFilterLabel() },
        { Field: "Current Page", Value: currentPage },
        { Field: "Rows On Page", Value: exportRows.length },
        { Field: "Filtered Records", Value: filteredSales.length },
        { Field: "Filtered Revenue", Value: Number(filteredSalesTotal) },
        { Field: "Page Revenue", Value: Number(exportTotal) }
      ];

      const dataSheet = buildReportRows(exportRows);
      const trendSheet = chartData.map((item) => ({
        Day: item.label,
        Revenue: Number(item.total || 0)
      }));

      const workbookMeta = XLSX.utils.json_to_sheet(reportMeta);
      const workbookSales = XLSX.utils.json_to_sheet(dataSheet);
      const workbookTrend = XLSX.utils.json_to_sheet(trendSheet);

      workbookMeta["!cols"] = [{ wch: 20 }, { wch: 40 }];
      workbookSales["!cols"] = [
        { wch: 10 },
        { wch: 20 },
        { wch: 22 },
        { wch: 32 },
        { wch: 14 },
        { wch: 14 },
        { wch: 24 },
        { wch: 28 },
        { wch: 34 },
        { wch: 20 }
      ];
      workbookTrend["!cols"] = [{ wch: 14 }, { wch: 18 }];

      XLSX.utils.book_append_sheet(workbook, workbookMeta, "Report Info");
      XLSX.utils.book_append_sheet(workbook, workbookSales, `Sales Page ${currentPage}`);
      XLSX.utils.book_append_sheet(workbook, workbookTrend, "7-Day Trend");

      XLSX.writeFile(
        workbook,
        `sales-report-${moment().format("YYYY-MM-DD-HH-mm")}.xlsx`
      );
    } catch {
      toast.error("Failed to download Excel file");
    }
  };

  const downloadWordDoc = () => {
    try {
      const exportRows = paginatedSales;
      const exportTotal = exportRows
        .filter((sale) => !isRefundedSale(sale))
        .reduce((sum, sale) => sum + Number(sale.total_amount || sale.total || 0), 0);

      const rowsHtml = exportRows
        .map(
          (sale) => `
            <tr>
              <td>${sale.id}</td>
              <td>${sale.cashier_name || ""}</td>
              <td>${sale.customer_name || "Walk-in"}</td>
              <td>${getReadablePaymentMethod(sale)}</td>
              <td>${formatMoney(sale.total_amount || sale.total)}</td>
              <td>${sale.status || "paid"}</td>
              <td>${formatDateTime(getSaleDate(sale))}</td>
            </tr>
          `
        )
        .join("");

      const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="utf-8" />
            <title>Sales Report</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
              h1 { margin-bottom: 6px; }
              .muted { color: #64748b; margin-bottom: 16px; }
              .metaBox {
                margin: 16px 0 20px;
                padding: 14px;
                border: 1px solid #cbd5e1;
                background: #f8fafc;
                border-radius: 8px;
              }
              .metaBox p { margin: 6px 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td {
                border: 1px solid #cbd5e1;
                padding: 10px;
                text-align: left;
                font-size: 13px;
              }
              th { background: #f1f5f9; }
              .totalRow td { font-weight: bold; background: #f8fafc; }
              .trendList { margin-top: 18px; padding-left: 18px; }
              .trendList li { margin-bottom: 6px; }
            </style>
          </head>
          <body>
            <h1>${settings.business_name} - Sales Report</h1>
            <p class="muted">Generated on ${formatDateTime(new Date())}</p>

            <div class="metaBox">
              <p><strong>Address:</strong> ${settings.business_address}</p>
              <p><strong>Phone:</strong> ${settings.business_phone}</p>
              <p><strong>Date Filter:</strong> ${getActiveDateLabel()}</p>
              <p><strong>Payment Filter:</strong> ${getPaymentFilterLabel()}</p>
              <p><strong>Current Page:</strong> ${currentPage}</p>
              <p><strong>Rows On Page:</strong> ${exportRows.length}</p>
              <p><strong>Filtered Records:</strong> ${filteredSales.length}</p>
              <p><strong>Filtered Revenue:</strong> ${formatMoney(filteredSalesTotal)}</p>
              <p><strong>Page Revenue:</strong> ${formatMoney(exportTotal)}</p>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Sale ID</th>
                  <th>Cashier</th>
                  <th>Customer</th>
                  <th>Payment Method</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
                <tr class="totalRow">
                  <td colspan="4">Page Total</td>
                  <td>${formatMoney(exportTotal)}</td>
                  <td colspan="2"></td>
                </tr>
              </tbody>
            </table>

            <h2>7-Day Sales Trend</h2>
            <ul class="trendList">
              ${chartData
                .map((item) => `<li><strong>${item.label}:</strong> ${formatMoney(item.total)}</li>`)
                .join("")}
            </ul>
          </body>
        </html>
      `;

      const blob = new Blob(["\ufeff", html], { type: "application/msword" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sales-report-${moment().format("YYYY-MM-DD-HH-mm")}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download Word document");
    }
  };

  const detailsTotals = useMemo(() => {
    return {
      qty: saleItems.reduce((sum, item) => sum + Number(item.qty || 0), 0),
      amount: saleItems.reduce(
        (sum, item) => sum + Number(item.final_price || item.total || 0),
        0
      )
    };
  }, [saleItems]);

  const totalSaleItemsPages = useMemo(() => {
    return Math.max(1, Math.ceil(saleItems.length / SALE_ITEMS_PER_PAGE));
  }, [saleItems.length]);

  const paginatedSaleItems = useMemo(() => {
    const startIndex = (detailItemsPage - 1) * SALE_ITEMS_PER_PAGE;
    return saleItems.slice(startIndex, startIndex + SALE_ITEMS_PER_PAGE);
  }, [saleItems, detailItemsPage]);

  const receiptData = useMemo(() => {
    if (!selectedSale) return null;

    const subtotal =
      Number(selectedSale.subtotal ?? selectedSale.sub ?? detailsTotals.amount ?? 0) || 0;
    const discount =
      Number(
        selectedSale.discount ??
          selectedSale.disc ??
          selectedSale.total_discount ??
          0
      ) || 0;
    const loyaltyDiscount =
      Number(selectedSale.loyalty_discount ?? selectedSale.loyD ?? 0) || 0;
    const giftCardDiscount =
      Number(selectedSale.giftcard_discount ?? selectedSale.gcD ?? 0) || 0;
    const tax =
      Number(selectedSale.tax ?? selectedSale.tax_amount ?? 0) || 0;
    const total =
      Number(selectedSale.total_amount ?? selectedSale.total ?? detailsTotals.amount ?? 0) || 0;

    return {
      subtotal,
      discount,
      loyaltyDiscount,
      giftCardDiscount,
      tax,
      total
    };
  }, [selectedSale, detailsTotals]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, rangeFilter, dateFrom, dateTo, paymentFilter, sales]);

  useEffect(() => {
    let active = true;
    const timeoutId = window.setTimeout(async () => {
      try {
        setSummaryLoading(true);
        const res = await getSalesSummary(summaryParams);

        if (active) {
          setSalesSummary(res?.data || EMPTY_SALES_SUMMARY);
        }
      } catch (err) {
        if (active) {
          setSalesSummary(EMPTY_SALES_SUMMARY);
          toast.error(
            err?.response?.data?.message || "Failed to load sales summary"
          );
        }
      } finally {
        if (active) {
          setSummaryLoading(false);
        }
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [summaryParams]);

  useEffect(() => {
    if (currentPage > totalSalesPages) {
      setCurrentPage(totalSalesPages);
    }
  }, [currentPage, totalSalesPages]);

  useEffect(() => {
    setDetailItemsPage(1);
  }, [selectedSale, saleItems]);

  const printSaleInvoice = () => {
    if (!selectedSale) return;

    const printElement = document.getElementById("printable-sale-invoice");
    if (!printElement) return;

    const printWindow = window.open("", "_blank", "width=260,height=820");
    if (!printWindow) return;

    const html = printElement.innerHTML;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Thermal Receipt</title>
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
              max-width: 50mm;
              background: #fff;
              color: #000;
              font-family: "Courier New", Courier, monospace;
            }

            body {
              padding: 2mm;
            }

            .thermalPrintShell {
              width: 46mm;
              max-width: 46mm;
              margin: 0 auto;
            }

            .thermalReceipt {
              width: 100%;
              color: #000;
              font-size: 9px;
              line-height: 1.3;
              font-family: "Courier New", Courier, monospace;
            }

            .thermalReceipt * {
              font-family: "Courier New", Courier, monospace !important;
            }

            .rStamp {
              border: 1px solid #000;
              text-align: center;
              font-size: 9px;
              font-weight: 700;
              padding: 3px;
              margin-bottom: 5px;
              letter-spacing: 0.8px;
            }

            .rLogo {
              text-align: center;
              font-size: 11px;
              font-weight: 700;
              margin-bottom: 3px;
              word-break: break-word;
              overflow-wrap: break-word;
            }

            .rCenter {
              text-align: center;
              font-size: 8px;
              line-height: 1.25;
              margin-bottom: 2px;
              word-break: break-word;
              overflow-wrap: break-word;
            }

            .rSectionTitle {
              font-size: 8px;
              font-weight: 700;
              letter-spacing: 0.5px;
              margin-bottom: 3px;
            }

            .rHr {
              border: 0;
              border-top: 1px dashed #000;
              margin: 5px 0;
            }

            .rRow,
            .rRowSmall {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              gap: 4px;
              width: 100%;
              margin: 2px 0;
            }

            .rRow > span:first-child,
            .rRowSmall > span:first-child {
              flex: 1;
              min-width: 0;
              word-break: break-word;
              overflow-wrap: break-word;
            }

            .rRow > span:last-child,
            .rRowSmall > span:last-child {
              flex-shrink: 0;
              text-align: right;
              white-space: nowrap;
              max-width: 44%;
            }

            .rRowSmall {
              font-size: 8px;
            }

            .rBold {
              font-weight: 700;
            }

            .rSubText {
              font-size: 7.5px;
              line-height: 1.2;
              margin: 1px 0 3px;
              word-break: break-word;
              overflow-wrap: break-word;
            }

            .rGrand {
              font-weight: 700;
              font-size: 10px;
              margin-top: 2px;
            }

            @media print {
              @page {
                size: 50mm auto;
                margin: 0;
              }

              html, body {
                width: 50mm;
                max-width: 50mm;
                margin: 0;
                padding: 0;
                background: #fff;
              }

              body {
                padding: 2mm;
              }

              .thermalPrintShell {
                width: 46mm;
                max-width: 46mm;
                margin: 0 auto;
              }
            }
          </style>
        </head>
        <body>
          <div class="thermalPrintShell">
            ${html}
          </div>
          <script>
            window.onload = function () {
              window.focus();
              setTimeout(function () {
                window.print();
                window.close();
              }, 250);
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  };

  const renderReceiptContent = () => {
    if (!selectedSale || !receiptData) return null;

    return (
      <div className={styles.thermalReceipt}>
        {isRefundedSale(selectedSale) ? (
          <div className={styles.rStamp}>REFUNDED</div>
        ) : null}

        <div className={styles.rLogo}>{settings.business_name}</div>
        <div className={styles.rCenter}>{settings.business_address}</div>
        <div className={styles.rCenter}>{settings.business_phone}</div>

        <hr className={styles.rHr} />

        <div className={styles.rRow}>
          <span>Receipt #</span>
          <span className={styles.rBold}>#{selectedSale.id}</span>
        </div>
        <div className={styles.rRowSmall}>
          <span>Date</span>
          <span>{formatDateTime(getSaleDate(selectedSale))}</span>
        </div>
        <div className={styles.rRowSmall}>
          <span>Customer</span>
          <span>{selectedSale.customer_name || "Walk-in"}</span>
        </div>
        <div className={styles.rRowSmall}>
          <span>Cashier</span>
          <span>{selectedSale.cashier_name || "—"}</span>
        </div>
        <div className={styles.rRowSmall}>
          <span>Payment</span>
          <span>{getReadablePaymentMethod(selectedSale)}</span>
        </div>
        <div className={styles.rRowSmall}>
          <span>Status</span>
          <span>{selectedSale.status || "paid"}</span>
        </div>

        <hr className={styles.rHr} />

        <div className={styles.rSectionTitle}>ITEMS</div>

        {saleItems.length ? (
          saleItems.map((item, index) => (
            <div key={item.id || index} className={styles.receiptItemBlock}>
              <div className={styles.rRow}>
                <span>{item.item_name || `Item ${index + 1}`}</span>
                <span>{formatMoney(item.final_price || item.total || 0)}</span>
              </div>
              <div className={styles.rSubText}>
                Qty: {item.qty || 0} • Unit: {formatMoney(item.unit_price || 0)}
              </div>
              {item.session_start || item.session_end ? (
                <div className={styles.rSubText}>
                  {item.session_start ? `Start: ${formatDateTime(item.session_start)}` : ""}
                  {item.session_start && item.session_end ? " • " : ""}
                  {item.session_end ? `End: ${formatDateTime(item.session_end)}` : ""}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className={styles.rSubText}>No items found</div>
        )}

        <hr className={styles.rHr} />

        <div className={styles.rRow}>
          <span>Subtotal</span>
          <span>{formatMoney(receiptData.subtotal)}</span>
        </div>

        {receiptData.discount > 0 ? (
          <div className={`${styles.rRow} ${styles.discountRow}`}>
            <span>Discount</span>
            <span>-{formatMoney(receiptData.discount)}</span>
          </div>
        ) : null}

        {receiptData.loyaltyDiscount > 0 ? (
          <div className={`${styles.rRow} ${styles.loyaltyRow}`}>
            <span>Loyalty</span>
            <span>-{formatMoney(receiptData.loyaltyDiscount)}</span>
          </div>
        ) : null}

        {receiptData.giftCardDiscount > 0 ? (
          <div className={`${styles.rRow} ${styles.loyaltyRow}`}>
            <span>Gift Card</span>
            <span>-{formatMoney(receiptData.giftCardDiscount)}</span>
          </div>
        ) : null}

        {receiptData.tax > 0 ? (
          <div className={styles.rRow}>
            <span>Tax</span>
            <span>{formatMoney(receiptData.tax)}</span>
          </div>
        ) : null}

        <hr className={styles.rHr} />

        <div className={styles.rRow}>
          <span>Total Qty</span>
          <span>{detailsTotals.qty}</span>
        </div>

        <div className={`${styles.rRow} ${styles.rGrand}`}>
          <span>TOTAL</span>
          <span>{formatMoney(receiptData.total)}</span>
        </div>

        {selectedSale?.refund_reason ? (
          <>
            <hr className={styles.rHr} />
            <div className={styles.rSubText}>
              Refund Reason: {selectedSale.refund_reason}
            </div>
          </>
        ) : null}

        <hr className={styles.rHr} />
        <div className={styles.rCenter}>{settings.receipt_footer}</div>
      </div>
    );
  };

  return (
    <div className={styles.wrapper}>
      <section className={styles.sectionCard}>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={() => toggleSection("overview")}
        >
          <div>
            <h2 className={styles.title}>Sales Overview</h2>
            <p className={styles.subtitle}>
              Revenue snapshots, totals, and refund overview
            </p>
          </div>
          <span className={styles.sectionToggleIcon}>
            {sectionsOpen.overview ? <FiChevronUp /> : <FiChevronDown />}
          </span>
        </button>

        {sectionsOpen.overview ? (
          <div className={styles.sectionBody}>
            <div className={styles.analyticsGrid}>
              <div className={styles.analyticsCard}>
                <div className={styles.analyticsIcon}><FiDollarSign /></div>
                <div>
                  <h4>Today Revenue</h4>
                  <p>{summaryLoading ? "..." : formatMoney(todayStats.revenue)}</p>
                  <span>{todayStats.totalSales} sale(s) today</span>
                </div>
              </div>

              <div className={styles.analyticsCard}>
                <div className={styles.analyticsIcon}><FiTrendingUp /></div>
                <div>
                  <h4>This Week</h4>
                  <p>{summaryLoading ? "..." : formatMoney(weekStats.revenue)}</p>
                  <span>{weekStats.totalSales} sale(s) this week</span>
                </div>
              </div>

              <div className={styles.analyticsCard}>
                <div className={styles.analyticsIcon}><FiBarChart2 /></div>
                <div>
                  <h4>This Month</h4>
                  <p>{summaryLoading ? "..." : formatMoney(monthStats.revenue)}</p>
                  <span>{monthStats.totalSales} sale(s) this month</span>
                </div>
              </div>

              <div className={styles.analyticsCard}>
                <div className={styles.analyticsIcon}><FiShoppingBag /></div>
                <div>
                  <h4>Overall Revenue</h4>
                  <p>{summaryLoading ? "..." : formatMoney(overallStats.revenue)}</p>
                  <span>{overallStats.totalSales} total record(s)</span>
                </div>
              </div>
            </div>

            <div className={styles.topGrid}>
              <div className={styles.statCard}>
                <h3>Total Sales</h3>
                <p>{summaryLoading ? "..." : overallStats.totalSales}</p>
                <span>All sales records</span>
              </div>

              <div className={styles.statCard}>
                <h3>Completed</h3>
                <p>{summaryLoading ? "..." : overallStats.completedSales}</p>
                <span>Non-refunded sales</span>
              </div>

              <div className={styles.statCard}>
                <h3>Refunded</h3>
                <p>{summaryLoading ? "..." : overallStats.refundedSales}</p>
                <span>Refunded transactions</span>
              </div>

              <div className={styles.statCard}>
                <h3>Filtered Revenue</h3>
                <p>{summaryLoading ? "..." : formatMoney(filteredStats.revenue)}</p>
                <span>Based on current filters</span>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.sectionCard}>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={() => toggleSection("trend")}
        >
          <div>
            <h2 className={styles.title}>7-Day Sales Trend</h2>
            <p className={styles.subtitle}>
              Quick visual of the last seven days non-refunded revenue
            </p>
          </div>
          <span className={styles.sectionToggleIcon}>
            {sectionsOpen.trend ? <FiChevronUp /> : <FiChevronDown />}
          </span>
        </button>

        {sectionsOpen.trend ? (
          <div className={styles.sectionBody}>
            <div className={styles.chartWrap}>
              {chartData.map((item) => (
                <div key={item.label} className={styles.chartBarItem}>
                  <div className={styles.chartValue}>{formatMoney(item.total)}</div>
                  <div className={styles.chartTrack}>
                    <div
                      className={styles.chartBar}
                      style={{
                        height: `${Math.max((item.total / chartMax) * 180, item.total > 0 ? 16 : 6)}px`
                      }}
                    />
                  </div>
                  <div className={styles.chartLabel}>{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className={styles.sectionCard}>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={() => toggleSection("filters")}
        >
          <div>
            <h2 className={styles.title}>Filters And Exports</h2>
            <p className={styles.subtitle}>
              Narrow results, export reports, and refresh the current sales scope
            </p>
          </div>
          <span className={styles.sectionToggleIcon}>
            {sectionsOpen.filters ? <FiChevronUp /> : <FiChevronDown />}
          </span>
        </button>

        {sectionsOpen.filters ? (
          <div className={styles.sectionBody}>
            <div className={styles.cardHeader}>
              <div className={styles.resultsMeta}>
                <span className={styles.metaChip}>
                  {summaryLoading ? "..." : filteredStats.totalSales} filtered sales
                </span>
                <span className={styles.metaChip}>
                  {summaryLoading ? "..." : formatMoney(filteredStats.revenue)} revenue
                </span>
                <span className={styles.metaChip}>{getPaymentFilterLabel()}</span>
              </div>

              <div className={styles.headerActions}>
                <button
                  className={styles.secondaryBtn}
                  onClick={downloadExcel}
                  disabled={loading || filteredSales.length === 0}
                >
                  <FiDownload />
                  Excel
                </button>

                <button
                  className={styles.secondaryBtn}
                  onClick={downloadWordDoc}
                  disabled={loading || filteredSales.length === 0}
                >
                  <FiDownload />
                  Doc
                </button>

                <button
                  className={styles.secondaryBtn}
                  onClick={clearAllFilters}
                  disabled={loading}
                >
                  <FiFilter />
                  Reset Filters
                </button>

                <button
                  className={styles.secondaryBtn}
                  onClick={() => handlePaymentFilterChange(paymentFilter)}
                  disabled={loading}
                >
                  <FiRefreshCw />
                  {loading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>

            <div className={styles.toolbar}>
              <div className={styles.searchBox}>
                <FiSearch />
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="Search by sale ID, cashier, customer, or payment method"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className={styles.filterSelect}
                value={paymentFilter}
                onChange={(e) => handlePaymentFilterChange(e.target.value)}
              >
                <option value="all">All Payments</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="transfer">Transfer</option>
                <option value="split">Split (All)</option>
                <option value="split-cash">Split + Cash</option>
                <option value="split-card">Split + Card</option>
                <option value="split-transfer">Split + Transfer</option>
              </select>

              <select
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Status</option>
                <option value="paid">Paid</option>
                <option value="completed">Completed</option>
                <option value="refunded">Refunded</option>
                <option value="pending">Pending</option>
              </select>

              <select
                className={styles.filterSelect}
                value={rangeFilter}
                onChange={(e) => setRangeFilter(e.target.value)}
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
              </select>

              <div className={styles.dateFilterGroup}>
                <div className={styles.dateInputWrap}>
                  <FiCalendar />
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    aria-label="Date from"
                  />
                </div>

                <div className={styles.dateInputWrap}>
                  <FiCalendar />
                  <input
                    type="date"
                    className={styles.dateInput}
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    aria-label="Date to"
                  />
                </div>

                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={clearDateFilters}
                >
                  Clear Dates
                </button>
              </div>
            </div>

            {(dateFrom || dateTo || rangeFilter !== "all" || paymentFilter !== "all") && (
              <div className={styles.activeFilterNote}>
                Active filters:
                <strong> {getActiveDateLabel()}</strong>
                {" • "}
                <strong>{getPaymentFilterLabel()}</strong>
              </div>
            )}
          </div>
        ) : null}
      </section>

      <section className={styles.sectionCard}>
        <button
          type="button"
          className={styles.sectionToggle}
          onClick={() => toggleSection("results")}
        >
          <div>
            <h2 className={styles.title}>Sales Results</h2>
            <p className={styles.subtitle}>
              Review transactions, inspect details, refund, and move through pages
            </p>
          </div>
          <span className={styles.sectionToggleIcon}>
            {sectionsOpen.results ? <FiChevronUp /> : <FiChevronDown />}
          </span>
        </button>

        {sectionsOpen.results ? (
          <div className={styles.sectionBody}>
            <div className={styles.resultsSummaryBar}>
              <span>
                Showing {paginatedSales.length} of {filteredSales.length} sale(s)
              </span>
              <span>
                Page {currentPage} of {totalSalesPages}
              </span>
            </div>

            {loading ? (
              <div className={styles.loader}>Loading sales...</div>
            ) : filteredSales.length === 0 ? (
              <div className={styles.emptyState}>No sales found</div>
            ) : (
              <>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Sale ID</th>
                        <th>Cashier</th>
                        <th>Customer</th>
                        <th>Payment</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {paginatedSales.map((sale) => {
                        const isRefunded = isRefundedSale(sale);

                        return (
                          <tr key={sale.id}>
                            <td>#{sale.id}</td>
                            <td>{sale.cashier_name || "—"}</td>
                            <td>{sale.customer_name || "Walk-in"}</td>
                            <td>
                              <span className={styles.paymentText}>
                                {getReadablePaymentMethod(sale)}
                              </span>
                            </td>
                            <td>{formatMoney(sale.total_amount || sale.total)}</td>
                            <td>
                              <span
                                className={`${styles.badge} ${
                                  isRefunded ? styles.badgeDanger : styles.badgeSuccess
                                }`}
                              >
                                {sale.status || "paid"}
                              </span>
                            </td>
                            <td>{formatDateTime(getSaleDate(sale))}</td>
                            <td>
                              <div className={styles.actionButtons}>
                                <button
                                  className={styles.primaryBtn}
                                  onClick={() => openSaleDetails(sale.id)}
                                >
                                  <FiEye />
                                  View
                                </button>

                                {!isRefunded ? (
                                  <button
                                    className={styles.dangerBtn}
                                    onClick={() => openRefundModal(sale.id)}
                                    disabled={refundLoadingId === sale.id}
                                  >
                                    <FiRotateCcw />
                                    {refundLoadingId === sale.id ? "Refunding..." : "Refund"}
                                  </button>
                                ) : (
                                  <button className={styles.disabledBtn} disabled>
                                    Refunded
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className={styles.paginationBar}>
                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>

                  <div className={styles.paginationPages}>
                    {Array.from({ length: totalSalesPages }, (_, index) => {
                      const page = index + 1;
                      return (
                        <button
                          key={page}
                          type="button"
                          className={`${styles.pageNumberBtn} ${
                            currentPage === page ? styles.pageNumberBtnActive : ""
                          }`}
                          onClick={() => setCurrentPage(page)}
                        >
                          {page}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalSalesPages))
                    }
                    disabled={currentPage === totalSalesPages}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </section>

      {showDetailsModal ? (
        <div className={styles.modalOverlay} onClick={closeDetailsModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3>Sale Details</h3>
                <p>Inspect the selected sale, its items, and print invoice</p>
              </div>

              <div className={styles.headerActions}>
                <button
                  className={styles.secondaryBtn}
                  onClick={printSaleInvoice}
                  disabled={!selectedSale}
                >
                  <FiPrinter />
                  Print Receipt
                </button>

                <button className={styles.closeBtn} onClick={closeDetailsModal}>
                  <FiX />
                </button>
              </div>
            </div>

            {detailsLoading ? (
              <div className={styles.loader}>Loading sale details...</div>
            ) : !selectedSale ? (
              <div className={styles.emptyStateSmall}>No sale selected</div>
            ) : (
              <>
                <div className={styles.receiptLayout}>
                  <div className={styles.receiptPreviewCard}>
                    <div className={styles.receiptPreviewHeader}>
                      <h4>Thermal Receipt Preview</h4>
                    </div>

                    <div className={styles.receiptPreviewWrap}>
                      <div className={styles.receiptPaper}>
                        {renderReceiptContent()}
                      </div>
                    </div>
                  </div>

                  <div className={styles.saleMetaPanel}>
                    <div className={styles.detailsGrid}>
                      <div className={styles.detailCard}>
                        <span>Sale ID</span>
                        <strong>#{selectedSale.id}</strong>
                      </div>

                      <div className={styles.detailCard}>
                        <span>Status</span>
                        <strong>{selectedSale.status || "paid"}</strong>
                      </div>

                      <div className={styles.detailCard}>
                        <span>Customer</span>
                        <strong>{selectedSale.customer_name || "Walk-in"}</strong>
                      </div>

                      <div className={styles.detailCard}>
                        <span>Cashier</span>
                        <strong>{selectedSale.cashier_name || "—"}</strong>
                      </div>

                      <div className={styles.detailCard}>
                        <span>Payment Method</span>
                        <strong>{getReadablePaymentMethod(selectedSale)}</strong>
                      </div>

                      <div className={styles.detailCard}>
                        <span>Total Amount</span>
                        <strong>{formatMoney(selectedSale.total_amount || selectedSale.total)}</strong>
                      </div>

                      <div className={styles.detailCard}>
                        <span>Date</span>
                        <strong>{formatDateTime(getSaleDate(selectedSale))}</strong>
                      </div>

                      <div className={styles.detailCard}>
                        <span>Total Qty</span>
                        <strong>{detailsTotals.qty}</strong>
                      </div>

                      <div className={styles.detailCard}>
                        <span>Items</span>
                        <strong>{saleItems.length}</strong>
                      </div>
                    </div>

                    {selectedSale?.refund_reason ? (
                      <div className={styles.refundReasonBox}>
                        Refund Reason: {selectedSale.refund_reason}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className={styles.itemsSection}>
                  <div className={styles.itemsHeader}>
                    <h4>Sale Items</h4>
                    <span>
                      {saleItems.length} item(s) • Qty {detailsTotals.qty} • Amount{" "}
                      {formatMoney(detailsTotals.amount)}
                    </span>
                  </div>

                  <div className={styles.resultsSummaryBar}>
                    <span>
                      Showing {paginatedSaleItems.length} of {saleItems.length} item(s)
                    </span>
                    <span>
                      Page {detailItemsPage} of {totalSaleItemsPages}
                    </span>
                  </div>

                  <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Product ID</th>
                          <th>Item</th>
                          <th>Qty</th>
                          <th>Unit Price</th>
                          <th>Final Price</th>
                          <th>Session Start</th>
                          <th>Session End</th>
                        </tr>
                      </thead>

                      <tbody>
                        {paginatedSaleItems.length ? (
                          paginatedSaleItems.map((item, index) => (
                            <tr key={item.id || index}>
                              <td>{item.product_id || "—"}</td>
                              <td>{item.item_name || "—"}</td>
                              <td>{item.qty || 0}</td>
                              <td>{formatMoney(item.unit_price || 0)}</td>
                              <td>{formatMoney(item.final_price || item.total || 0)}</td>
                              <td>{formatDateTime(item.session_start)}</td>
                              <td>{formatDateTime(item.session_end)}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7" className={styles.emptyCell}>
                              No items found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles.paginationBar}>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => setDetailItemsPage((prev) => Math.max(prev - 1, 1))}
                      disabled={detailItemsPage === 1}
                    >
                      Previous
                    </button>

                    <div className={styles.paginationPages}>
                      {Array.from({ length: totalSaleItemsPages }, (_, index) => {
                        const page = index + 1;
                        return (
                          <button
                            key={page}
                            type="button"
                            className={`${styles.pageNumberBtn} ${
                              detailItemsPage === page ? styles.pageNumberBtnActive : ""
                            }`}
                            onClick={() => setDetailItemsPage(page)}
                          >
                            {page}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() =>
                        setDetailItemsPage((prev) =>
                          Math.min(prev + 1, totalSaleItemsPages)
                        )
                      }
                      disabled={detailItemsPage === totalSaleItemsPages}
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div
                  id="printable-sale-invoice"
                  className={styles.hiddenPrintArea}
                  style={{ width: "46mm", maxWidth: "46mm" }}
                >
                  {renderReceiptContent()}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {showRefundModal ? (
        <div className={styles.modalOverlay} onClick={closeRefundModal}>
          <div className={styles.smallModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <h3>Refund Sale</h3>
                <p>Enter a reason for this refund</p>
              </div>

              <button className={styles.closeBtn} onClick={closeRefundModal}>
                <FiX />
              </button>
            </div>

            <div className={styles.formGroup}>
              <label>Refund Reason</label>
              <textarea
                className={styles.textarea}
                rows="5"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Type reason for refund"
              />
            </div>

            <div className={styles.modalActions}>
              <button className={styles.secondaryBtn} onClick={closeRefundModal}>
                Cancel
              </button>
              <button
                className={styles.dangerBtn}
                onClick={handleRefund}
                disabled={!!refundLoadingId}
              >
                {refundLoadingId ? "Refunding..." : "Confirm Refund"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
