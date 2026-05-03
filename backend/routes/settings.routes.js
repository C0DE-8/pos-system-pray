const express = require("express");
const { query } = require("../config/db");
const moment = require("moment");
const { authenticateToken, requirePermission, requireAnyPermission } = require("../middleware/auth");
const { ensureBusinessContext, isAdmin } = require("../utils/tenant");

const router = express.Router();

router.use(authenticateToken);

// settings/ get settings
router.get("/", async (req, res) => {
  try {
    if (!ensureBusinessContext(req, res)) return;
    const rows = await query("SELECT * FROM settings LIMIT 1");
    res.json({ success: true, data: rows[0] || null });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// settings/ update settings
router.put("/", requirePermission("settings"), async (req, res) => {
  try {
    const {
      currency,
      tax_rate,
      biz_name,
      biz_addr,
      biz_phone,
      footer,
      low_stock,
      loyalty_earn_rate,
      loyalty_redeem_rate
    } = req.body;

    await query(
      `UPDATE settings SET
        currency=?, tax_rate=?, biz_name=?, biz_addr=?, biz_phone=?, footer=?, low_stock=?, loyalty_earn_rate=?, loyalty_redeem_rate=?
       WHERE id=1`,
      [
        currency,
        tax_rate,
        biz_name,
        biz_addr,
        biz_phone,
        footer,
        low_stock,
        loyalty_earn_rate,
        loyalty_redeem_rate
      ]
    );

    res.json({ success: true, message: "Settings updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
// settings/expiry-alerts GET expiry alerts
router.get(
  "/expiry-alerts",
  requireAnyPermission("settings", "inventory"),
  async (req, res) => {
  try {
    if (!ensureBusinessContext(req, res)) return;
    const settingsRows = await query("SELECT * FROM settings WHERE id = 1 LIMIT 1");
    const settings = settingsRows[0];

    if (!settings) {
      return res.status(404).json({
        success: false,
        message: "Settings not found"
      });
    }

    if (!settings.expiry_alert_enabled) {
      return res.json({
        success: true,
        enabled: false,
        count: 0,
        data: []
      });
    }

    // remove DATEDIFF from SQL
    const branchId = req.query?.branch_id ? Number(req.query.branch_id) : null;
    const scopedBranchSql = !isAdmin(req.user)
      ? "AND p.branch_id = ?"
      : branchId
        ? "AND p.branch_id = ?"
        : "";
    const scopedParams = !isAdmin(req.user)
      ? [req.user.business_id, req.user.branch_id]
      : branchId
        ? [req.user.business_id, branchId]
        : [req.user.business_id];

    const rows = await query(
      `
      SELECT
        p.id,
        p.name,
        p.icon,
        p.stock,
        p.expiry_date,
        p.has_expiry,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1
        AND p.business_id = ?
        AND p.has_expiry = 1
        AND p.expiry_date IS NOT NULL
        ${scopedBranchSql}
      ORDER BY p.expiry_date ASC
      `
    , scopedParams);

    const today = moment().startOf("day");

    const filtered = rows
      .map(item => {
        const expiry = moment(item.expiry_date).startOf("day");
        const days_left = expiry.diff(today, "days");

        return {
          ...item,
          days_left,
          expiry_formatted: expiry.format("YYYY-MM-DD"),
          expiry_human: expiry.fromNow() // 🔥 nice UI text
        };
      })
      .filter(item =>
        item.days_left >= 0 &&
        item.days_left <= settings.expiry_alert_days
      );

    res.json({
      success: true,
      enabled: true,
      count: filtered.length,
      alert_days: settings.expiry_alert_days,
      data: filtered
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});
// settings/products / get all active products
router.get("/products", async (req, res) => {
  try {
    if (!ensureBusinessContext(req, res)) return;
    const rows = await query(
      `
      SELECT 
        p.id,
        p.name,
        p.icon,
        p.category_id,
        p.type,
        p.hourly_rate,
        p.price,
        p.cost,
        p.stock,
        p.low_stock,
        p.modifier_group_id,
        p.is_unlimited,
        p.is_active,
        p.consumable_type,
        p.has_expiry,
        p.expiry_date,
        p.shelf_life_days,
        c.name AS category_name,
        c.type AS category_type
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1
        AND p.business_id = ?
      ORDER BY p.id DESC
      `
    , [req.user.business_id]);

    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
