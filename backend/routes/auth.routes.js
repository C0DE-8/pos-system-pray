const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query } = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();
const { createBranchDirectory, TRANSIENT_ERRORS } = require("../services/branchDirectory");
const listBranches = createBranchDirectory(query);

// /api/auth/branch-slugs - get active branch slugs for login selector
router.get("/branch-slugs", async (req, res) => {
  try {
    const rows = await listBranches();
    res.set("Cache-Control", "no-store");

    return res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("Branch directory lookup failed", { code: error.code, message: error.message });
    const transient = TRANSIENT_ERRORS.has(error.code);
    if (transient) res.set("Retry-After", "2");
    return res.status(transient ? 503 : 500).json({
      success: false,
      message: "Branches are temporarily unavailable. Please try again."
    });
  }
});

// /api/auth/login - login with username/email + password + branch_slug
router.post("/login", async (req, res) => {
  try {
    const { identifier, email, username, password, branch_slug } = req.body;
    const loginValue = String(identifier || email || username || "").trim();

    if (!loginValue || !password || !branch_slug) {
      return res.status(400).json({
        success: false,
        message: "username/email, password and branch_slug are required"
      });
    }

    const users = await query(
      `SELECT *
       FROM users
       WHERE (email = ? OR name = ?)
       AND is_active = 1 
       LIMIT 1`,
      [loginValue, loginValue]
    );

    if (!users.length) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = users[0];

    const passwordHash = user.password_hash || user.pin_hash;
    const isMatch = await bcrypt.compare(password, passwordHash);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const branches = await query(
      `SELECT id, business_id, is_active
       FROM business_branches
       WHERE slug = ?
       LIMIT 1`,
      [branch_slug]
    );

    if (!branches.length || !Number(branches[0].is_active)) {
      return res.status(404).json({
        success: false,
        message: "Branch not found or inactive"
      });
    }

    const branch = branches[0];

    if (Number(user.business_id) !== Number(branch.business_id)) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access this branch"
      });
    }

    if (!["admin", "owner"].includes(String(user.role).toLowerCase())) {
      if (Number(user.branch_id) !== Number(branch.id)) {
        return res.status(403).json({
          success: false,
          message: "You are not authorized to access this branch"
        });
      }
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        business_id: user.business_id || null,
        branch_id: branch.id
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "15h" }
    );

    await query(
      "INSERT INTO clock_events (user_id, event_type) VALUES (?, 'in')",
      [user.id]
    );

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        business_id: user.business_id || null,
        branch_id: branch.id
      }
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// logout
router.post("/logout", authMiddleware, async (req, res) => {
  try {
    await query(
      "INSERT INTO clock_events (user_id, event_type) VALUES (?, 'out')",
      [req.user.id]
    );

    return res.json({ success: true, message: "Logout recorded" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// auth/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const permissions = await query(
      "SELECT * FROM user_permissions WHERE user_id = ? LIMIT 1",
      [req.user.id]
    );

    return res.json({
      success: true,
      user: req.user,
      permissions: permissions[0] || null
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;