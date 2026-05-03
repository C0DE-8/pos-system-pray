const express = require("express");
const { query, pool } = require("../config/db");
const { authenticateToken, requirePermission } = require("../middleware/auth");
const { ensureBusinessContext, isAdmin } = require("../utils/tenant");
const {
  deductUnitInventory,
  loadHierarchy,
  loadInventoryMap,
  calculateTotalInSmallestUnits,
  recordUnitInventoryHistory,
  restoreUnitInventory,
  syncProductStock
} = require("../utils/unitHierarchy");

const router = express.Router();

router.use(authenticateToken);

// =========================
// WAREHOUSE HELPERS
// =========================
async function getProductById(productId) {
  const rows = await query(
    `SELECT id, name, stock, is_unlimited, is_active
     FROM products
     WHERE id = ?
     LIMIT 1`,
    [productId]
  );
  return rows[0] || null;
}

async function getWarehouseStockRow(productId) {
  const rows = await query(
    `SELECT id, product_id, qty
     FROM warehouse_stock
     WHERE product_id = ?
     LIMIT 1`,
    [productId]
  );
  return rows[0] || null;
}

async function ensureWarehouseStockRow(productId) {
  const existing = await getWarehouseStockRow(productId);

  if (existing) return existing;

  await query(
    `INSERT INTO warehouse_stock (product_id, qty)
     VALUES (?, 0)`,
    [productId]
  );

  return await getWarehouseStockRow(productId);
}

// /inventory/low-stock
router.get("/low-stock", requirePermission("inventory"), async (req, res) => {
  try {
    if (!ensureBusinessContext(req, res)) return;

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

    const rows = await query(`
      SELECT 
        p.id,
        p.name,
        p.icon,
        p.category_id,
        p.type,
        p.price,
        p.cost,
        p.stock,
        p.low_stock,
        p.is_unlimited,
        p.is_active,
        c.name AS category_name,
        c.type AS category_type
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1
        AND p.business_id = ?
        AND p.is_unlimited = 0
        AND p.stock IS NOT NULL
        AND p.low_stock IS NOT NULL
        AND p.stock <= p.low_stock
        ${scopedBranchSql}
      ORDER BY p.stock ASC, p.name ASC
    `, scopedParams);

    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// /inventory/restock
router.post("/restock/:productId", requirePermission("inventory"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { qty, action = "add", reason } = req.body;
    const productId = req.params.productId;
    const branchId = req.query.branch_id || req.user.branch_id || null;

    const changeQty = Number(qty);

    if (!Number.isInteger(changeQty) || changeQty <= 0) {
      return res.status(400).json({
        success: false,
        message: "qty must be greater than 0"
      });
    }

    if (!["add", "remove"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: "action must be either 'add' or 'remove'"
      });
    }

    const [rows] = await conn.execute(
      "SELECT id, stock, is_unlimited, has_unit_hierarchy, name FROM products WHERE id = ? LIMIT 1 FOR UPDATE",
      [productId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const product = rows[0];

    if (Number(product.is_unlimited) === 1) {
      return res.status(400).json({
        success: false,
        message: "Unlimited product stock cannot be adjusted"
      });
    }

    const beforeQty = Number(product.stock || 0);
    const signedChangeQty = action === "remove" ? -changeQty : changeQty;
    const afterQty = beforeQty + signedChangeQty;

    if (afterQty < 0) {
      return res.status(400).json({
        success: false,
        message: "Insufficient stock to remove"
      });
    }

    await conn.beginTransaction();

    if (Number(product.has_unit_hierarchy) === 1) {
      const result =
        action === "add"
          ? await restoreUnitInventory(conn, productId, changeQty, branchId)
          : await deductUnitInventory(conn, productId, changeQty, branchId);

      if (!result.success) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      for (const change of result.changes) {
        await recordUnitInventoryHistory(
          conn,
          Number(productId),
          change.unit_level_id,
          change.before_qty,
          change.after_qty,
          reason || (action === "add" ? "Stock added" : "Stock removed"),
          req.user.id,
          branchId
        );
      }
    } else {
      await conn.execute("UPDATE products SET stock = ? WHERE id = ?", [afterQty, productId]);
    }

    await conn.execute(
      `INSERT INTO stock_history (product_id, before_qty, after_qty, change_qty, reason, by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        productId,
        beforeQty,
        afterQty,
        signedChangeQty,
        reason || (action === "add" ? "Stock added" : "Stock removed"),
        req.user.id
      ]
    );

    await conn.commit();

    res.json({
      success: true,
      message: action === "add" ? "Stock added successfully" : "Stock removed successfully",
      beforeQty,
      changeQty: signedChangeQty,
      afterQty
    });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    conn.release();
  }
});

// /inventory/adjust
router.post("/adjust/:productId", requirePermission("stockAdj"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { newQty, reason } = req.body;
    const productId = req.params.productId;
    const branchId = req.query.branch_id || req.user.branch_id || null;
    const [rows] = await conn.execute(
      "SELECT stock, has_unit_hierarchy FROM products WHERE id = ? LIMIT 1 FOR UPDATE",
      [productId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: "Product not found" });

    const beforeQty = Number(rows[0].stock || 0);
    const afterQty = Number(newQty);

    if (!Number.isInteger(afterQty) || afterQty < 0) {
      return res.status(400).json({
        success: false,
        message: "newQty must be a non-negative whole number"
      });
    }

    await conn.beginTransaction();

    if (Number(rows[0].has_unit_hierarchy) === 1) {
      const delta = afterQty - beforeQty;
      const result =
        delta >= 0
          ? await restoreUnitInventory(conn, productId, delta, branchId)
          : await deductUnitInventory(conn, productId, Math.abs(delta), branchId);

      if (!result.success) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }

      for (const change of result.changes) {
        await recordUnitInventoryHistory(
          conn,
          Number(productId),
          change.unit_level_id,
          change.before_qty,
          change.after_qty,
          reason || "Manual adjustment",
          req.user.id,
          branchId
        );
      }
    } else {
      await conn.execute("UPDATE products SET stock = ? WHERE id = ?", [afterQty, productId]);
    }

    await conn.execute(
      `INSERT INTO stock_history (product_id, before_qty, after_qty, change_qty, reason, by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [productId, beforeQty, afterQty, afterQty - beforeQty, reason || "Manual adjustment", req.user.id]
    );

    await conn.commit();
    res.json({ success: true, message: "Stock adjusted", beforeQty, afterQty });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ success: false, message: error.message });
  } finally {
    conn.release();
  }
});

// /inventory/history
router.get("/history", requirePermission("inventory"), async (req, res) => {
  try {
    const rows = await query(`
      SELECT sh.*, p.name AS product_name, u.name AS updated_by
      FROM stock_history sh
      JOIN products p ON p.id = sh.product_id
      JOIN users u ON u.id = sh.by_user_id
      ORDER BY sh.created_at DESC
      LIMIT 100
    `);

    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// =========================
// GET ALL WAREHOUSE STOCK
// /inventory/warehouse
// =========================
router.get("/warehouse", requirePermission("inventory"), async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        ws.product_id,
        ws.qty AS warehouse_qty,
        p.name,
        p.icon,
        p.category_id,
        p.type,
        p.stock AS shop_stock,
        p.low_stock,
        p.is_unlimited,
        p.is_active,
        c.name AS category_name,
        c.type AS category_type
      FROM warehouse_stock ws
      JOIN products p ON p.id = ws.product_id
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.name ASC
    `);

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

// =========================
// ADD STOCK TO WAREHOUSE
// /inventory/warehouse/add/:productId
// body: { qty, reason }
// =========================
router.post("/warehouse/add/:productId", requirePermission("inventory"), async (req, res) => {
  try {
    const { productId } = req.params;
    const { qty, reason } = req.body;

    const addQty = Number(qty);

    if (!addQty || addQty <= 0) {
      return res.status(400).json({
        success: false,
        message: "qty must be greater than 0"
      });
    }

    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    if (Number(product.is_unlimited) === 1) {
      return res.status(400).json({
        success: false,
        message: "Unlimited product cannot use warehouse stock"
      });
    }

    const warehouseRow = await ensureWarehouseStockRow(productId);
    const beforeQty = Number(warehouseRow.qty || 0);
    const afterQty = beforeQty + addQty;

    await query(
      `UPDATE warehouse_stock
       SET qty = ?
       WHERE product_id = ?`,
      [afterQty, productId]
    );

    await query(
      `INSERT INTO warehouse_history
       (product_id, movement_type, before_qty, change_qty, after_qty, reason, by_user_id)
       VALUES (?, 'add', ?, ?, ?, ?, ?)`,
      [
        productId,
        beforeQty,
        addQty,
        afterQty,
        reason || "Stock added to warehouse",
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: "Stock added to warehouse successfully",
      beforeQty,
      changeQty: addQty,
      afterQty
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// =========================
// REMOVE STOCK FROM WAREHOUSE
// /inventory/warehouse/remove/:productId
// body: { qty, reason }
// =========================
router.post("/warehouse/remove/:productId", requirePermission("inventory"), async (req, res) => {
  try {
    const { productId } = req.params;
    const { qty, reason } = req.body;

    const removeQty = Number(qty);

    if (!removeQty || removeQty <= 0) {
      return res.status(400).json({
        success: false,
        message: "qty must be greater than 0"
      });
    }

    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    if (Number(product.is_unlimited) === 1) {
      return res.status(400).json({
        success: false,
        message: "Unlimited product cannot use warehouse stock"
      });
    }

    const warehouseRow = await ensureWarehouseStockRow(productId);
    const beforeQty = Number(warehouseRow.qty || 0);

    if (removeQty > beforeQty) {
      return res.status(400).json({
        success: false,
        message: "Insufficient warehouse stock"
      });
    }

    const afterQty = beforeQty - removeQty;

    await query(
      `UPDATE warehouse_stock
       SET qty = ?
       WHERE product_id = ?`,
      [afterQty, productId]
    );

    await query(
      `INSERT INTO warehouse_history
       (product_id, movement_type, before_qty, change_qty, after_qty, reason, by_user_id)
       VALUES (?, 'remove', ?, ?, ?, ?, ?)`,
      [
        productId,
        beforeQty,
        -removeQty,
        afterQty,
        reason || "Stock removed from warehouse",
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: "Stock removed from warehouse successfully",
      beforeQty,
      changeQty: -removeQty,
      afterQty
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// =========================
// MOVE STOCK FROM WAREHOUSE TO STORE
// /inventory/warehouse/transfer-to-store/:productId
// body: { qty, reason }
// =========================
router.post("/warehouse/transfer-to-store/:productId", requirePermission("inventory"), async (req, res) => {
  try {
    const { productId } = req.params;
    const { qty, reason } = req.body;

    const moveQty = Number(qty);

    if (!moveQty || moveQty <= 0) {
      return res.status(400).json({
        success: false,
        message: "qty must be greater than 0"
      });
    }

    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    if (Number(product.is_unlimited) === 1) {
      return res.status(400).json({
        success: false,
        message: "Unlimited product cannot be restocked from warehouse"
      });
    }

    const warehouseRow = await ensureWarehouseStockRow(productId);

    const warehouseBefore = Number(warehouseRow.qty || 0);
    const shopBefore = Number(product.stock || 0);

    if (moveQty > warehouseBefore) {
      return res.status(400).json({
        success: false,
        message: "Insufficient warehouse stock"
      });
    }

    const warehouseAfter = warehouseBefore - moveQty;
    const shopAfter = shopBefore + moveQty;

    await query(
      `UPDATE warehouse_stock
       SET qty = ?
       WHERE product_id = ?`,
      [warehouseAfter, productId]
    );

    await query(
      `UPDATE products
       SET stock = ?
       WHERE id = ?`,
      [shopAfter, productId]
    );

    // warehouse history
    await query(
      `INSERT INTO warehouse_history
       (product_id, movement_type, before_qty, change_qty, after_qty, reason, by_user_id)
       VALUES (?, 'transfer_to_store', ?, ?, ?, ?, ?)`,
      [
        productId,
        warehouseBefore,
        -moveQty,
        warehouseAfter,
        reason || "Transferred stock from warehouse to store",
        req.user.id
      ]
    );

    // normal stock history for shop stock
    await query(
      `INSERT INTO stock_history
       (product_id, before_qty, after_qty, change_qty, reason, by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        productId,
        shopBefore,
        shopAfter,
        moveQty,
        reason || "Restocked from warehouse",
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: "Stock moved from warehouse to store successfully",
      warehouse: {
        beforeQty: warehouseBefore,
        changeQty: -moveQty,
        afterQty: warehouseAfter
      },
      store: {
        beforeQty: shopBefore,
        changeQty: moveQty,
        afterQty: shopAfter
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// =========================
// MOVE STOCK FROM STORE BACK TO WAREHOUSE
// /inventory/warehouse/transfer-from-store/:productId
// body: { qty, reason }
// =========================
router.post("/warehouse/transfer-from-store/:productId", requirePermission("inventory"), async (req, res) => {
  try {
    const { productId } = req.params;
    const { qty, reason } = req.body;

    const moveQty = Number(qty);

    if (!moveQty || moveQty <= 0) {
      return res.status(400).json({
        success: false,
        message: "qty must be greater than 0"
      });
    }

    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    if (Number(product.is_unlimited) === 1) {
      return res.status(400).json({
        success: false,
        message: "Unlimited product cannot use warehouse transfer"
      });
    }

    const warehouseRow = await ensureWarehouseStockRow(productId);

    const warehouseBefore = Number(warehouseRow.qty || 0);
    const shopBefore = Number(product.stock || 0);

    if (moveQty > shopBefore) {
      return res.status(400).json({
        success: false,
        message: "Insufficient store stock"
      });
    }

    const warehouseAfter = warehouseBefore + moveQty;
    const shopAfter = shopBefore - moveQty;

    await query(
      `UPDATE warehouse_stock
       SET qty = ?
       WHERE product_id = ?`,
      [warehouseAfter, productId]
    );

    await query(
      `UPDATE products
       SET stock = ?
       WHERE id = ?`,
      [shopAfter, productId]
    );

    await query(
      `INSERT INTO warehouse_history
       (product_id, movement_type, before_qty, change_qty, after_qty, reason, by_user_id)
       VALUES (?, 'transfer_from_store', ?, ?, ?, ?, ?)`,
      [
        productId,
        warehouseBefore,
        moveQty,
        warehouseAfter,
        reason || "Transferred stock from store to warehouse",
        req.user.id
      ]
    );

    await query(
      `INSERT INTO stock_history
       (product_id, before_qty, after_qty, change_qty, reason, by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        productId,
        shopBefore,
        shopAfter,
        -moveQty,
        reason || "Moved stock from store to warehouse",
        req.user.id
      ]
    );

    res.json({
      success: true,
      message: "Stock moved from store to warehouse successfully",
      warehouse: {
        beforeQty: warehouseBefore,
        changeQty: moveQty,
        afterQty: warehouseAfter
      },
      store: {
        beforeQty: shopBefore,
        changeQty: -moveQty,
        afterQty: shopAfter
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// =========================
// WAREHOUSE HISTORY
// /inventory/warehouse/history
// =========================
router.get("/warehouse/history", requirePermission("inventory"), async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        wh.*,
        p.name AS product_name,
        u.name AS updated_by
      FROM warehouse_history wh
      JOIN products p ON p.id = wh.product_id
      LEFT JOIN users u ON u.id = wh.by_user_id
      ORDER BY wh.created_at DESC
      LIMIT 100
    `);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// =========================
// GET SINGLE PRODUCT WAREHOUSE STOCK
// /inventory/warehouse/:productId
// =========================
router.get("/warehouse/:productId", requirePermission("inventory"), async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const warehouseRow = await ensureWarehouseStockRow(productId);

    res.json({
      success: true,
      data: {
        product_id: Number(productId),
        product_name: product.name,
        warehouse_qty: Number(warehouseRow.qty || 0),
        shop_stock: product.stock === null ? null : Number(product.stock || 0),
        is_unlimited: Number(product.is_unlimited || 0)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========================================================
// UNIT HIERARCHY INVENTORY ENDPOINTS
// ========================================================

// /inventory/unit-hierarchy/:productId/breakdown
// Get detailed inventory breakdown by unit level for products with hierarchy
router.get("/unit-hierarchy/:productId/breakdown", requirePermission("inventory"), async (req, res) => {
  try {
    if (!ensureBusinessContext(req, res)) return;
    const { productId } = req.params;
    const branchId = req.query.branch_id || req.user.branch_id || null;

    const productRows = await query(
      `SELECT id, name, stock, has_unit_hierarchy
       FROM products
       WHERE id = ? AND business_id = ?
       LIMIT 1`,
      [productId, req.user.business_id]
    );

    if (!productRows.length) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const product = productRows[0];

    if (Number(product.has_unit_hierarchy) !== 1) {
      return res.status(400).json({
        success: false,
        message: "Product does not have unit hierarchy"
      });
    }

    const hierarchy = await loadHierarchy(pool, productId);
    const inventoryMap = await loadInventoryMap(pool, productId, branchId, false);
    const names = await query(
      `SELECT pul.id, pu.name AS unit_name, pu.short_name AS unit_short_name
       FROM product_unit_levels pul
       JOIN product_units pu ON pu.id = pul.unit_id
       WHERE pul.product_id = ?`,
      [productId]
    );
    const nameMap = new Map(names.map((row) => [Number(row.id), row]));

    const levels = hierarchy.map((level) => ({
      id: Number(level.id),
      level: Number(level.level),
      conversion_factor: Number(level.conversion_factor),
      smallest_unit_multiplier: Number(level.smallest_unit_multiplier || 1),
      is_smallest_unit: Number(level.is_smallest_unit || 0),
      unit_name: nameMap.get(Number(level.id))?.unit_name || null,
      unit_short_name: nameMap.get(Number(level.id))?.unit_short_name || null,
      current_qty: Number(inventoryMap.get(Number(level.id))?.qty || 0)
    }));

    const totalSmallestUnits = calculateTotalInSmallestUnits(hierarchy, inventoryMap);

    res.json({
      success: true,
      data: {
        product_id: Number(productId),
        product_name: product.name,
        total_in_smallest_units: totalSmallestUnits,
        unit_levels: levels
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// /inventory/unit-hierarchy/:productId/sync
// Synchronize traditional stock with unit hierarchy inventory total
// For legacy support - convert traditional stock to unit hierarchy
router.post("/unit-hierarchy/:productId/sync", requirePermission("inventory"), async (req, res) => {
  const conn = await pool.getConnection();
  try {
    if (!ensureBusinessContext(req, res)) return;
    const { productId } = req.params;
    const { action = "sync-to-smallest" } = req.body;
    const branchId = req.query.branch_id || req.user.branch_id || null;

    const productRows = await query(
      `SELECT id, stock, has_unit_hierarchy
       FROM products
       WHERE id = ? AND business_id = ?
       LIMIT 1`,
      [productId, req.user.business_id]
    );

    if (!productRows.length) {
      return res.status(404).json({
        success: false,
        message: "Product not found"
      });
    }

    const product = productRows[0];

    if (Number(product.has_unit_hierarchy) !== 1) {
      return res.status(400).json({
        success: false,
        message: "Product does not have unit hierarchy"
      });
    }

    if (action === "sync-to-smallest") {
      await conn.beginTransaction();
      const hierarchy = await loadHierarchy(conn, productId);
      const smallestLevel = hierarchy[hierarchy.length - 1];
      const inventoryMap = await loadInventoryMap(conn, productId, branchId);
      const existing = inventoryMap.get(Number(smallestLevel.id));
      const currentTotal = calculateTotalInSmallestUnits(hierarchy, inventoryMap);
      const stockQty = Math.max(0, Number(product.stock || 0) - currentTotal);

      if (stockQty <= 0) {
        await conn.rollback();
        return res.json({
          success: true,
          message: "No legacy stock remains to sync",
          data: {
            product_id: Number(productId),
            total_in_smallest_units: currentTotal
          }
        });
      }

      if (existing?.id) {
        await conn.execute(
          `UPDATE unit_inventory
           SET qty = qty + ?
           WHERE id = ?`,
          [stockQty, existing.id]
        );
      } else {
        await conn.execute(
          `INSERT INTO unit_inventory (product_id, unit_level_id, qty, branch_id)
           VALUES (?, ?, ?, ?)`,
          [productId, smallestLevel.id, stockQty, branchId]
        );
      }

      const total = await syncProductStock(conn, productId, branchId);
      await conn.commit();

      res.json({
        success: true,
        message: "Inventory synced to unit hierarchy",
        data: {
          product_id: Number(productId),
          total_in_smallest_units: total
        }
      });
      return;
    }

    return res.status(400).json({
      success: false,
      message: "Unsupported sync action"
    });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({
      success: false,
      message: error.message
    });
  } finally {
    conn.release();
  }
});

module.exports = router;
