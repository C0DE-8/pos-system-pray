const express = require("express");
const { query, pool } = require("../config/db");
const { authenticateToken, requirePermission } = require("../middleware/auth");
const { ensureBusinessContext, isAdmin } = require("../utils/tenant");
const branchAccessMiddleware = require("../middleware/branchAccessMiddleware");
const {
  restoreUnitInventory,
  recordUnitInventoryHistory
} = require("../utils/unitHierarchy");

const router = express.Router();

router.use(authenticateToken);

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const SALES_DATE_SQL = "s.sale_date";

function normalizeDateInput(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  return DATE_ONLY_REGEX.test(trimmed) ? trimmed : null;
}

function getDateRangeBounds(queryParams = {}) {
  const fromDate =
    normalizeDateInput(queryParams.date_from) ||
    normalizeDateInput(queryParams.dateFrom);
  const toDate =
    normalizeDateInput(queryParams.date_to) ||
    normalizeDateInput(queryParams.dateTo);
  const range = String(queryParams.range || "all").toLowerCase();

  if (fromDate || toDate) {
    const startDate = fromDate || toDate;
    const endDate = toDate || fromDate;
    const [start, end] =
      startDate <= endDate ? [startDate, endDate] : [endDate, startDate];

    return {
      start: `${start} 00:00:00`,
      end: `${end} 23:59:59`
    };
  }

  if (range === "today") {
    return {
      start: "CURDATE()",
      end: "DATE_ADD(CURDATE(), INTERVAL 1 DAY)"
    };
  }

  if (range === "week") {
    return {
      start: "DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY)",
      end:
        "DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 7 DAY)"
    };
  }

  if (range === "month") {
    return {
      start: "DATE_FORMAT(CURDATE(), '%Y-%m-01')",
      end:
        "DATE_ADD(LAST_DAY(CURDATE()), INTERVAL 1 DAY)"
    };
  }

  return null;
}

function buildSalesWhere(req, options = {}) {
  const where = ["s.business_id = ?"];
  const params = [req.user.business_id];
  const branchId = req.query.branch_id;
  const searchValue =
    typeof req.query.search === "string" ? req.query.search.trim() : "";
  const status =
    typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";
  const payment =
    typeof req.query.payment === "string"
      ? req.query.payment.trim().toLowerCase()
      : "";
  const dateBounds =
    options.includeDateRange === false ? null : getDateRangeBounds(req.query);

  if (!isAdmin(req.user)) {
    where.push("s.branch_id = ?");
    params.push(req.user.branch_id);
  } else if (branchId) {
    where.push("s.branch_id = ?");
    params.push(branchId);
  }

  if (dateBounds) {
    if (DATE_ONLY_REGEX.test(dateBounds.start.slice(0, 10))) {
      where.push(`${SALES_DATE_SQL} BETWEEN ? AND ?`);
      params.push(dateBounds.start, dateBounds.end);
    } else {
      where.push(`${SALES_DATE_SQL} >= ${dateBounds.start}`);
      where.push(`${SALES_DATE_SQL} < ${dateBounds.end}`);
    }
  }

  if (options.includeStatus !== false && status && status !== "all") {
    where.push("LOWER(COALESCE(s.status, 'paid')) = ?");
    params.push(status);
  }

  if (options.includePayment !== false && payment && payment !== "all") {
    if (["cash", "card", "transfer", "split"].includes(payment)) {
      where.push("LOWER(COALESCE(s.payment_method, '')) = ?");
      params.push(payment);
    } else if (payment === "split-cash") {
      where.push("LOWER(COALESCE(s.payment_method, '')) = 'split'");
      where.push("COALESCE(s.split_cash_amount, 0) > 0");
    } else if (payment === "split-card") {
      where.push("LOWER(COALESCE(s.payment_method, '')) = 'split'");
      where.push("COALESCE(s.split_card_amount, 0) > 0");
    } else if (payment === "split-transfer") {
      where.push("LOWER(COALESCE(s.payment_method, '')) = 'split'");
      where.push("COALESCE(s.split_transfer_amount, 0) > 0");
    }
  }

  if (options.includeSearch !== false && searchValue) {
    where.push(`(
      CAST(s.id AS CHAR) LIKE ?
      OR COALESCE(s.sale_code, '') LIKE ?
      OR COALESCE(s.customer, '') LIKE ?
      OR COALESCE(u.name, '') LIKE ?
      OR COALESCE(s.payment_method, '') LIKE ?
    )`);
    const likeValue = `%${searchValue}%`;
    params.push(likeValue, likeValue, likeValue, likeValue, likeValue);
  }

  return {
    sql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    params
  };
}

function buildSalesAggregateSql(whereSql) {
  return `
    SELECT
      COUNT(*) AS total_sales,
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(s.status, 'paid')) = 'refunded' THEN 1 ELSE 0 END), 0) AS refunded_sales,
      COALESCE(SUM(CASE WHEN LOWER(COALESCE(s.status, 'paid')) = 'refunded' THEN 0 ELSE 1 END), 0) AS completed_sales,
      COALESCE(
        SUM(
          CASE
            WHEN LOWER(COALESCE(s.status, 'paid')) = 'refunded' THEN 0
            ELSE COALESCE(s.total, 0)
          END
        ),
        0
      ) AS revenue
    FROM sales s
    LEFT JOIN users u ON u.id = s.cashier_id
    ${whereSql}
  `;
}

function formatAggregateRow(row = {}) {
  return {
    totalSales: Number(row.total_sales || 0),
    completedSales: Number(row.completed_sales || 0),
    refundedSales: Number(row.refunded_sales || 0),
    revenue: Number(row.revenue || 0)
  };
}

function buildRecentDayEntries() {
  const days = [];

  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - index);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const key = `${year}-${month}-${day}`;
    const label = date.toLocaleDateString("en-US", { weekday: "short" });

    days.push({ key, label });
  }

  return days;
}

async function getSalesTrendRows(req) {
  const trendAnchorWhere = buildSalesWhere(
    req,
    {
      includeDateRange: false,
      includeSearch: false,
      includeStatus: false,
      includePayment: false
    }
  );
  const [anchorRow] = await query(
    `
      SELECT MAX(${SALES_DATE_SQL}) AS latest_sale_date
      FROM sales s
      LEFT JOIN users u ON u.id = s.cashier_id
      ${trendAnchorWhere.sql}
    `,
    trendAnchorWhere.params
  );

  const anchorDate = anchorRow?.latest_sale_date
    ? new Date(anchorRow.latest_sale_date)
    : new Date();

  const recentDays = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(anchorDate);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - offset));

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return {
      key: `${year}-${month}-${day}`,
      label: date.toLocaleDateString("en-US", { weekday: "short" })
    };
  });

  const trendKeys = recentDays.map((entry) => entry.key);
  const trendWhere = buildSalesWhere(
    {
      ...req,
      query: {
        ...req.query,
        date_from: trendKeys[0],
        date_to: trendKeys[trendKeys.length - 1]
      }
    },
    {
      includeSearch: false,
      includeStatus: false,
      includePayment: false
    }
  );

  const trendRows = await query(
    `
      SELECT
        DATE(${SALES_DATE_SQL}) AS sale_day,
        COUNT(*) AS total_sales,
        COALESCE(
          SUM(
            CASE
              WHEN LOWER(COALESCE(s.status, 'paid')) = 'refunded' THEN 0
              ELSE COALESCE(s.total, 0)
            END
          ),
          0
        ) AS revenue
      FROM sales s
      LEFT JOIN users u ON u.id = s.cashier_id
      ${trendWhere.sql}
      GROUP BY DATE(${SALES_DATE_SQL})
      ORDER BY sale_day ASC
    `,
    trendWhere.params
  );

  const trendMap = new Map(
    trendRows.map((row) => [
      String(row.sale_day).slice(0, 10),
      {
        totalSales: Number(row.total_sales || 0),
        revenue: Number(row.revenue || 0)
      }
    ])
  );

  return recentDays.map((entry) => ({
    label: entry.label,
    date: entry.key,
    totalSales: trendMap.get(entry.key)?.totalSales || 0,
    revenue: trendMap.get(entry.key)?.revenue || 0
  }));
}

// sales/ all sales
router.get("/", requirePermission("sales"), branchAccessMiddleware, async (req, res) => {
  try {
    if (!ensureBusinessContext(req, res)) return;

    const parsedPage = Number.parseInt(req.query.page, 10);
    const parsedPerPage = Number.parseInt(
      req.query.per_page ?? req.query.perPage,
      10
    );
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const perPage =
      Number.isFinite(parsedPerPage) && parsedPerPage > 0
        ? Math.min(parsedPerPage, 100)
        : 10;
    const offset = (page - 1) * perPage;

    const { sql: whereSql, params } = buildSalesWhere(req);
    const [countRow] = await query(
      `
        SELECT COUNT(*) AS total
        FROM sales s
        LEFT JOIN users u ON u.id = s.cashier_id
        ${whereSql}
      `,
      params
    );

    const total = Number(countRow?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const safePage = Math.min(page, totalPages);
    const safeOffset = (safePage - 1) * perPage;

    const rows = await query(
      `
        SELECT s.*, u.name AS cashier_name
        FROM sales s
        LEFT JOIN users u ON u.id = s.cashier_id
        ${whereSql}
        ORDER BY s.id DESC
        LIMIT ? OFFSET ?
      `,
      [...params, perPage, safeOffset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: safePage,
        per_page: perPage,
        total,
        total_pages: totalPages
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// sales/payment-types?type=card&split_with=cash filter sales by payment type and split breakdown
router.get("/payment-types", requirePermission("sales"), branchAccessMiddleware, async (req, res) => {
  try {
    if (!ensureBusinessContext(req, res)) return;
    const { type, split_with, branch_id } = req.query;

    let sql = `
      SELECT 
        s.*,
        u.name AS cashier_name
      FROM sales s
      JOIN users u ON u.id = s.cashier_id
    `;

    const where = [];
    const params = [];

    where.push("s.business_id = ?");
    params.push(req.user.business_id);
    if (!isAdmin(req.user)) {
      where.push("s.branch_id = ?");
      params.push(req.user.branch_id);
    } else if (branch_id) {
      where.push("s.branch_id = ?");
      params.push(branch_id);
    }

    // filter by main payment type
    if (type) {
      where.push(`s.payment_method = ?`);
      params.push(type);
    }

    // extra filter for split breakdown
    if (split_with === "cash") {
      where.push(`s.payment_method = 'split'`);
      where.push(`COALESCE(s.split_cash_amount, 0) > 0`);
    }

    if (split_with === "card") {
      where.push(`s.payment_method = 'split'`);
      where.push(`COALESCE(s.split_card_amount, 0) > 0`);
    }

    if (split_with === "transfer") {
      where.push(`s.payment_method = 'split'`);
      where.push(`COALESCE(s.split_transfer_amount, 0) > 0`);
    }

    if (where.length > 0) {
      sql += ` WHERE ` + where.join(" AND ");
    }

    sql += ` ORDER BY s.id DESC LIMIT 200`;

    const rows = await query(sql, params);

    const formatted = rows.map((sale) => ({
      ...sale,
      payment_breakdown:
        sale.payment_method === "split"
          ? {
              cash: Number(sale.split_cash_amount || 0),
              card: Number(sale.split_card_amount || 0),
              transfer: Number(sale.split_transfer_amount || 0)
            }
          : null
    }));

    res.json({
      success: true,
      filters: {
        type: type || "all",
        split_with: split_with || null
      },
      count: formatted.length,
      data: formatted
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get("/summary", requirePermission("sales"), branchAccessMiddleware, async (req, res) => {
  try {
    if (!ensureBusinessContext(req, res)) return;

    const filteredWhere = buildSalesWhere(req);
    const overviewBaseOptions = {
      includeDateRange: false,
      includeSearch: false,
      includeStatus: false,
      includePayment: false
    };
    const overallWhere = buildSalesWhere(req, overviewBaseOptions);
    const todayWhere = buildSalesWhere(
      {
        ...req,
        query: {
          ...req.query,
          range: "today",
          date_from: "",
          date_to: "",
          dateFrom: "",
          dateTo: ""
        }
      },
      {
        includeSearch: false,
        includeStatus: false,
        includePayment: false
      }
    );
    const weekWhere = buildSalesWhere(
      {
        ...req,
        query: {
          ...req.query,
          range: "week",
          date_from: "",
          date_to: "",
          dateFrom: "",
          dateTo: ""
        }
      },
      {
        includeSearch: false,
        includeStatus: false,
        includePayment: false
      }
    );
    const monthWhere = buildSalesWhere(
      {
        ...req,
        query: {
          ...req.query,
          range: "month",
          date_from: "",
          date_to: "",
          dateFrom: "",
          dateTo: ""
        }
      },
      {
        includeSearch: false,
        includeStatus: false,
        includePayment: false
      }
    );

    const [todayRows, weekRows, monthRows, overallRows, filteredRows, trend] =
      await Promise.all([
        query(buildSalesAggregateSql(todayWhere.sql), todayWhere.params),
        query(buildSalesAggregateSql(weekWhere.sql), weekWhere.params),
        query(buildSalesAggregateSql(monthWhere.sql), monthWhere.params),
        query(buildSalesAggregateSql(overallWhere.sql), overallWhere.params),
        query(buildSalesAggregateSql(filteredWhere.sql), filteredWhere.params),
        getSalesTrendRows(req)
      ]);

    res.json({
      success: true,
      data: {
        today: formatAggregateRow(todayRows[0]),
        week: formatAggregateRow(weekRows[0]),
        month: formatAggregateRow(monthRows[0]),
        overall: formatAggregateRow(overallRows[0]),
        filtered: formatAggregateRow(filteredRows[0]),
        trend
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

router.get("/trend", requirePermission("sales"), branchAccessMiddleware, async (req, res) => {
  try {
    if (!ensureBusinessContext(req, res)) return;

    const trend = await getSalesTrendRows(req);

    res.json({
      success: true,
      data: trend
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});
// sales/:id sale details
router.get("/:id", requirePermission("sales"), branchAccessMiddleware, async (req, res) => {
  try {
    if (!ensureBusinessContext(req, res)) return;
    const branchId = req.query.branch_id || req.body.branch_id;
    const where = ["id = ?", "business_id = ?"];
    const params = [req.params.id, req.user.business_id];
    if (!isAdmin(req.user)) {
      where.push("branch_id = ?");
      params.push(req.user.branch_id);
    } else if (branchId) {
      where.push("branch_id = ?");
      params.push(branchId);
    }
    const sales = await query(`SELECT * FROM sales WHERE ${where.join(" AND ")} LIMIT 1`, params);
    if (!sales.length) return res.status(404).json({ success: false, message: "Sale not found" });

    const items = await query("SELECT * FROM sale_items WHERE sale_id = ?", [req.params.id]);

    res.json({ success: true, sale: sales[0], items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// sales/:id/refund refund sale
router.post("/:id/refund", requirePermission("refunds"), branchAccessMiddleware, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (!ensureBusinessContext(req, res)) return;
    const { reason } = req.body;
    await conn.beginTransaction();

    const branchId = req.query.branch_id || req.body.branch_id;
    let saleSql = "SELECT * FROM sales WHERE id = ? AND business_id = ?";
    const saleParams = [req.params.id, req.user.business_id];
    if (!isAdmin(req.user)) {
      saleSql += " AND branch_id = ?";
      saleParams.push(req.user.branch_id);
    } else if (branchId) {
      saleSql += " AND branch_id = ?";
      saleParams.push(branchId);
    }
    saleSql += " LIMIT 1";
    const [sales] = await conn.execute(saleSql, saleParams);
    if (!sales.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, message: "Sale not found" });
    }

    const sale = sales[0];
    if (sale.status === "refunded") {
      await conn.rollback();
      return res.status(400).json({ success: false, message: "Already refunded" });
    }

    const [items] = await conn.execute("SELECT * FROM sale_items WHERE sale_id = ?", [req.params.id]);

    for (const item of items) {
      if (item.product_id) {
        const [products] = await conn.execute(
          "SELECT stock, is_unlimited, has_unit_hierarchy FROM products WHERE id = ? LIMIT 1 FOR UPDATE",
          [item.product_id]
        );
        if (products.length) {
          const product = products[0];
          if (Number(product.is_unlimited) === 1) continue;

          const changeQty = Number(item.qty ?? 0);
          if (changeQty <= 0) continue;

          // Handle unit hierarchy products
          if (Number(product.has_unit_hierarchy) === 1) {
            const restoreResult = await restoreUnitInventory(
              conn,
              item.product_id,
              changeQty,
              sale.branch_id || req.user.branch_id || null
            );

            if (restoreResult.success) {
              for (const change of restoreResult.changes) {
                await recordUnitInventoryHistory(
                  conn,
                  item.product_id,
                  change.unit_level_id,
                  change.before_qty,
                  change.after_qty,
                  `Refund sale #${req.params.id}: ${reason || "Refunded"}`,
                  req.user.id,
                  sale.branch_id || req.user.branch_id || null
                );
              }
            }
          } else {
            // Handle traditional stock products
            const beforeQty = Number(product.stock ?? 0);
            const afterQty = beforeQty + changeQty;

            await conn.execute("UPDATE products SET stock = ? WHERE id = ?", [afterQty, item.product_id]);
            await conn.execute(
              `INSERT INTO stock_history (product_id, before_qty, after_qty, change_qty, reason, by_user_id, business_id, branch_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                item.product_id,
                beforeQty,
                afterQty,
                changeQty,
                `Refund sale #${req.params.id}: ${reason || "Refunded"}`,
                req.user.id,
                sale.business_id || req.user.business_id || null,
                sale.branch_id || req.user.branch_id || null
              ]
            );
          }
        }
      }
    }

    await conn.execute(
      "UPDATE sales SET status='refunded', refund_reason=? WHERE id=?",
      [reason || "Refunded", req.params.id]
    );

    await conn.commit();
    res.json({ success: true, message: "Sale refunded successfully" });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
