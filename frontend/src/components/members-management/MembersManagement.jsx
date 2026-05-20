import { useEffect, useMemo, useState } from "react";
import moment from "moment";
import * as XLSX from "xlsx";
import {
  getMembers,
  getMembershipTiers,
  createMembershipTier,
  updateMembershipTier,
  createMember,
  getMemberHistory
} from "../../api/membersApi";
import styles from "./MembersManagement.module.css";

const initialForm = {
  name: "",
  phone: "",
  email: "",
  membership_tier_id: ""
};

const initialTierForm = {
  name: "",
  discount_pct: ""
};

export default function MembersManagement() {
  const [members, setMembers] = useState([]);
  const [membershipTiers, setMembershipTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tierSubmitting, setTierSubmitting] = useState(false);
  const [updatingTierId, setUpdatingTierId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  const [form, setForm] = useState(initialForm);
  const [tierForm, setTierForm] = useState(initialTierForm);
  const [editingTier, setEditingTier] = useState(null);

  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberSales, setMemberSales] = useState([]);

  const fetchMembers = async () => {
    try {
      setLoading(true);
      setError("");

      const [membersRes, tiersRes] = await Promise.all([
        getMembers(),
        getMembershipTiers()
      ]);

      setMembers(membersRes?.data || []);
      setMembershipTiers(tiersRes?.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to load members");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleTierChange = (e) => {
    const { name, value } = e.target;

    setTierForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleEditingTierChange = (e) => {
    const { name, value } = e.target;

    setEditingTier((prev) =>
      prev
        ? {
            ...prev,
            [name]: value
          }
        : prev
    );
  };

  const handleCreateMember = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      setError("Member name is required");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      setSuccessMessage("");

      const res = await createMember({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        membership_tier_id: form.membership_tier_id
          ? Number(form.membership_tier_id)
          : null
      });

      setSuccessMessage(
        res?.memberCode
          ? `Member added successfully. Code: ${res.memberCode}`
          : "Member added successfully"
      );

      setForm(initialForm);
      await fetchMembers();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create member");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateTier = async (e) => {
    e.preventDefault();

    if (!tierForm.name.trim()) {
      setError("Tier name is required");
      return;
    }

    try {
      setTierSubmitting(true);
      setError("");
      setSuccessMessage("");

      const res = await createMembershipTier({
        name: tierForm.name.trim(),
        discount_pct: Number(tierForm.discount_pct || 0)
      });

      setSuccessMessage(
        res?.data?.name
          ? `Membership tier created: ${res.data.name}`
          : "Membership tier created successfully"
      );

      setTierForm(initialTierForm);
      await fetchMembers();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to create membership tier");
    } finally {
      setTierSubmitting(false);
    }
  };

  const startEditingTier = (tier) => {
    setEditingTier({
      id: tier.id,
      name: tier.name || "",
      discount_pct: String(Number(tier.discount_pct || 0))
    });
    setError("");
    setSuccessMessage("");
  };

  const cancelEditingTier = () => {
    setEditingTier(null);
  };

  const handleUpdateTier = async (e) => {
    e.preventDefault();

    if (!editingTier?.id) return;

    if (!String(editingTier.name || "").trim()) {
      setError("Tier name is required");
      return;
    }

    try {
      setUpdatingTierId(editingTier.id);
      setError("");
      setSuccessMessage("");

      const res = await updateMembershipTier(editingTier.id, {
        name: String(editingTier.name || "").trim(),
        discount_pct: Number(editingTier.discount_pct || 0)
      });

      setSuccessMessage(
        res?.data?.name
          ? `Membership tier updated: ${res.data.name}`
          : "Membership tier updated successfully"
      );

      setEditingTier(null);
      await fetchMembers();
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to update membership tier");
    } finally {
      setUpdatingTierId(null);
    }
  };

  const openHistoryModal = async (memberId) => {
    try {
      setHistoryLoading(true);
      setError("");
      setShowHistoryModal(true);

      const res = await getMemberHistory(memberId);
      setSelectedMember(res?.member || null);
      setMemberSales(res?.sales || []);
    } catch (err) {
      setShowHistoryModal(false);
      setError(err?.response?.data?.message || "Failed to load member history");
    } finally {
      setHistoryLoading(false);
    }
  };

  const closeHistoryModal = () => {
    setShowHistoryModal(false);
    setSelectedMember(null);
    setMemberSales([]);
  };

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const searchValue = search.toLowerCase();

      const matchesSearch =
        String(member.name || "").toLowerCase().includes(searchValue) ||
        String(member.phone || "").toLowerCase().includes(searchValue) ||
        String(member.email || "").toLowerCase().includes(searchValue) ||
        String(member.member_code || "").toLowerCase().includes(searchValue);

      const matchesTier =
        tierFilter === "all"
          ? true
          : String(member.tier || "").toLowerCase() === tierFilter.toLowerCase();

      return matchesSearch && matchesTier;
    });
  }, [members, search, tierFilter]);

  const tierOptions = useMemo(() => {
    const optionMap = new Map();

    membershipTiers.forEach((tier) => {
      optionMap.set(String(tier.name || "").toLowerCase(), {
        value: tier.name,
        label: `${tier.name} (${Number(tier.discount_pct || 0)}% off)`
      });
    });

    members.forEach((member) => {
      const tierName = String(member.tier || "").trim();
      if (!tierName) return;
      const key = tierName.toLowerCase();

      if (!optionMap.has(key)) {
        optionMap.set(key, {
          value: tierName,
          label: tierName
        });
      }
    });

    return Array.from(optionMap.values()).sort((a, b) =>
      a.value.localeCompare(b.value)
    );
  }, [membershipTiers, members]);

  const stats = useMemo(() => {
    const totalMembers = members.length;
    const vip = members.filter(
      (member) => String(member.tier || "").toLowerCase() === "vip"
    ).length;
    const regular = members.filter(
      (member) => String(member.tier || "").toLowerCase() === "regular"
    ).length;

    return {
      totalMembers,
      totalTiers: membershipTiers.length,
      vip,
      regular
    };
  }, [members, membershipTiers]);

  const formatMoney = (value) => {
    return `₦${Number(value || 0).toLocaleString()}`;
  };

  const formatDateTime = (value) => {
    if (!value) return "—";
    return moment(value).format("DD MMM YYYY, hh:mm A");
  };

  const downloadMembersExcel = () => {
    try {
      const excelData = filteredMembers.map((member) => ({
        ID: member.id,
        "Member Code": member.member_code || "",
        Name: member.name || "",
        Phone: member.phone || "",
        Email: member.email || "",
        Tier: member.tier || "",
        "Tier Discount %": Number(member.membership_discount_pct || 0),
        "Created At": formatDateTime(member.created_at)
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(workbook, worksheet, "Members");
      XLSX.writeFile(
        workbook,
        `members-report-${moment().format("YYYY-MM-DD-HH-mm")}.xlsx`
      );
    } catch (err) {
      setError("Failed to download members Excel file");
    }
  };

  const downloadMembersDoc = () => {
    try {
      const rowsHtml = filteredMembers
        .map(
          (member) => `
            <tr>
              <td>${member.id}</td>
              <td>${member.member_code || ""}</td>
              <td>${member.name || ""}</td>
              <td>${member.phone || ""}</td>
              <td>${member.email || ""}</td>
              <td>${member.tier || ""}</td>
              <td>${Number(member.membership_discount_pct || 0)}%</td>
              <td>${formatDateTime(member.created_at)}</td>
            </tr>
          `
        )
        .join("");

      const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="utf-8">
            <title>Members Report</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 24px;
                color: #0f172a;
              }
              h1 {
                margin-bottom: 8px;
              }
              p {
                margin-top: 0;
                color: #475569;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
              }
              th, td {
                border: 1px solid #cbd5e1;
                padding: 10px;
                text-align: left;
                font-size: 13px;
              }
              th {
                background: #f1f5f9;
              }
            </style>
          </head>
          <body>
            <h1>Members Report</h1>
            <p>Generated on ${moment().format("DD MMM YYYY, hh:mm A")}</p>

            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Member Code</th>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Tier</th>
                  <th>Tier Discount %</th>
                  <th>Created At</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </body>
        </html>
      `;

      const blob = new Blob(["\ufeff", html], {
        type: "application/msword"
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `members-report-${moment().format("YYYY-MM-DD-HH-mm")}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Failed to download members Word document");
    }
  };

  const downloadMemberHistoryExcel = () => {
    if (!selectedMember) return;

    try {
      const memberSheet = [
        {
          ID: selectedMember.id,
          "Member Code": selectedMember.member_code || "",
          Name: selectedMember.name || "",
          Phone: selectedMember.phone || "",
          Email: selectedMember.email || "",
          Tier: selectedMember.tier || "",
          "Tier Discount %": Number(selectedMember.membership_discount_pct || 0),
          "Created At": formatDateTime(selectedMember.created_at)
        }
      ];

      const salesSheet = memberSales.map((sale) => ({
        "Sale ID": sale.id,
        Customer: sale.customer || sale.customer_name || "",
        Total: Number(sale.total_amount || sale.total || 0),
        Status: sale.status || "",
        "Payment Method": sale.payment_method || "",
        "Sale Date": formatDateTime(sale.sale_date || sale.created_at)
      }));

      const workbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(memberSheet),
        "Member"
      );

      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.json_to_sheet(salesSheet),
        "History"
      );

      XLSX.writeFile(
        workbook,
        `member-history-${selectedMember.id}-${moment().format("YYYY-MM-DD-HH-mm")}.xlsx`
      );
    } catch (err) {
      setError("Failed to download member history Excel");
    }
  };

  const downloadMemberHistoryDoc = () => {
    if (!selectedMember) return;

    try {
      const salesRows = memberSales
        .map(
          (sale) => `
            <tr>
              <td>${sale.id}</td>
              <td>${sale.customer || sale.customer_name || ""}</td>
              <td>${formatMoney(sale.total_amount || sale.total)}</td>
              <td>${sale.status || ""}</td>
              <td>${sale.payment_method || ""}</td>
              <td>${formatDateTime(sale.sale_date || sale.created_at)}</td>
            </tr>
          `
        )
        .join("");

      const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:w="urn:schemas-microsoft-com:office:word"
              xmlns="http://www.w3.org/TR/REC-html40">
          <head>
            <meta charset="utf-8">
            <title>Member History</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 24px;
                color: #0f172a;
              }
              h1, h2 {
                margin-bottom: 10px;
              }
              .meta p {
                margin: 6px 0;
              }
              table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 16px;
              }
              th, td {
                border: 1px solid #cbd5e1;
                padding: 10px;
                text-align: left;
                font-size: 13px;
              }
              th {
                background: #f1f5f9;
              }
            </style>
          </head>
          <body>
            <h1>Member History</h1>

            <div class="meta">
              <p><strong>ID:</strong> ${selectedMember.id}</p>
              <p><strong>Member Code:</strong> ${selectedMember.member_code || ""}</p>
              <p><strong>Name:</strong> ${selectedMember.name || ""}</p>
              <p><strong>Phone:</strong> ${selectedMember.phone || ""}</p>
              <p><strong>Email:</strong> ${selectedMember.email || ""}</p>
              <p><strong>Tier:</strong> ${selectedMember.tier || ""}</p>
              <p><strong>Tier Discount:</strong> ${Number(
                selectedMember.membership_discount_pct || 0
              )}%</p>
              <p><strong>Created At:</strong> ${formatDateTime(selectedMember.created_at)}</p>
            </div>

            <h2>Sales History</h2>

            <table>
              <thead>
                <tr>
                  <th>Sale ID</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Payment Method</th>
                  <th>Sale Date</th>
                </tr>
              </thead>
              <tbody>
                ${salesRows || '<tr><td colspan="6">No sales found</td></tr>'}
              </tbody>
            </table>
          </body>
        </html>
      `;

      const blob = new Blob(["\ufeff", html], {
        type: "application/msword"
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `member-history-${selectedMember.id}-${moment().format("YYYY-MM-DD-HH-mm")}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError("Failed to download member history Word document");
    }
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.topGrid}>
        <div className={styles.statCard}>
          <h3>Total Members</h3>
          <p>{stats.totalMembers}</p>
          <span>All registered members</span>
        </div>

        <div className={styles.statCard}>
          <h3>Membership Tiers</h3>
          <p>{stats.totalTiers}</p>
          <span>Available tiers for members</span>
        </div>

        <div className={styles.statCard}>
          <h3>VIP</h3>
          <p>{stats.vip}</p>
          <span>VIP members</span>
        </div>

        <div className={styles.statCard}>
          <h3>Regular</h3>
          <p>{stats.regular}</p>
          <span>Regular members</span>
        </div>
      </div>

      <div className={styles.contentGrid}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.title}>Add Member</h2>
              <p className={styles.subtitle}>
                Register a new member for Pray Restaurant & Lounge
              </p>
            </div>
          </div>

          {error ? <div className={styles.errorBox}>{error}</div> : null}
          {successMessage ? (
            <div className={styles.successBox}>{successMessage}</div>
          ) : null}

          <form onSubmit={handleCreateMember} className={styles.form}>
            <div className={styles.formGroup}>
              <label>Name</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Enter member name"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Phone</label>
              <input
                type="text"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="Enter phone number"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Enter email address"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Membership Tier</label>
              <select
                name="membership_tier_id"
                value={form.membership_tier_id}
                onChange={handleChange}
              >
                <option value="">Select tier</option>
                {membershipTiers.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.name} ({Number(tier.discount_pct || 0)}% off)
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className={styles.primaryBtn}
              disabled={submitting}
            >
              {submitting ? "Adding Member..." : "Add Member"}
            </button>
          </form>

          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.title}>Create Membership Tier</h2>
              <p className={styles.subtitle}>
                Add new tiers like VIP, Regular, or custom benefits
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateTier} className={styles.form}>
            <div className={styles.formGroup}>
              <label>Tier Name</label>
              <input
                type="text"
                name="name"
                value={tierForm.name}
                onChange={handleTierChange}
                placeholder="Example: Premium"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Discount %</label>
              <input
                type="number"
                min="0"
                max="100"
                name="discount_pct"
                value={tierForm.discount_pct}
                onChange={handleTierChange}
                placeholder="0"
              />
            </div>

            <button
              type="submit"
              className={styles.secondaryBtn}
              disabled={tierSubmitting}
            >
              {tierSubmitting ? "Creating Tier..." : "Create Tier"}
            </button>
          </form>

          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.title}>Membership Tier Benefits</h2>
              <p className={styles.subtitle}>
                View existing tiers and update their discount benefits
              </p>
            </div>
          </div>

          {membershipTiers.length ? (
            <div className={styles.tierList}>
              {membershipTiers.map((tier) => (
                <div key={tier.id} className={styles.tierItem}>
                  <div>
                    <strong>{tier.name}</strong>
                    <span>{Number(tier.discount_pct || 0)}% discount</span>
                  </div>

                  <button
                    type="button"
                    className={styles.secondaryBtn}
                    onClick={() => startEditingTier(tier)}
                  >
                    Update Tier
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyStateSmall}>No membership tiers found</div>
          )}

          {editingTier ? (
            <form onSubmit={handleUpdateTier} className={styles.form}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.title}>Update Tier</h2>
                  <p className={styles.subtitle}>
                    Edit the tier name and discount benefit
                  </p>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Tier Name</label>
                <input
                  type="text"
                  name="name"
                  value={editingTier.name}
                  onChange={handleEditingTierChange}
                  placeholder="Tier name"
                />
              </div>

              <div className={styles.formGroup}>
                <label>Discount %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  name="discount_pct"
                  value={editingTier.discount_pct}
                  onChange={handleEditingTierChange}
                  placeholder="0"
                />
              </div>

              <div className={styles.inlineActions}>
                <button
                  type="submit"
                  className={styles.primaryBtn}
                  disabled={updatingTierId === editingTier.id}
                >
                  {updatingTierId === editingTier.id
                    ? "Updating Tier..."
                    : "Save Tier"}
                </button>

                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={cancelEditingTier}
                  disabled={updatingTierId === editingTier.id}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}
        </section>

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.title}>Members</h2>
              <p className={styles.subtitle}>
                View, search, and export registered members
              </p>
            </div>

            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={downloadMembersExcel}
              >
                Export Excel
              </button>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={downloadMembersDoc}
              >
                Export Word
              </button>
            </div>
          </div>

          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>⌕</span>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search name, member code, phone, or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search ? (
                <button
                  type="button"
                  className={styles.clearSearchBtn}
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              ) : null}
            </div>

            <select
              className={styles.filterSelect}
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
            >
              <option value="all">All Tiers</option>
              {tierOptions.map((tier) => (
                <option key={tier.value} value={tier.value}>
                  {tier.label}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className={styles.loader}>Loading members...</div>
          ) : filteredMembers.length === 0 ? (
            <div className={styles.emptyState}>No members found</div>
          ) : (
            <div className={styles.tableOuter}>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Member Code</th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Email</th>
                      <th>Tier</th>
                      <th>Discount %</th>
                      <th>Created At</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.map((member) => (
                      <tr key={member.id}>
                        <td>{member.id}</td>
                        <td>{member.member_code || "—"}</td>
                        <td>{member.name || "—"}</td>
                        <td>{member.phone || "—"}</td>
                        <td>{member.email || "—"}</td>
                        <td>
                          <span className={styles.badge}>
                            {member.tier || "—"}
                          </span>
                        </td>
                        <td>{Number(member.membership_discount_pct || 0)}%</td>
                        <td>{formatDateTime(member.created_at)}</td>
                        <td>
                          <button
                            type="button"
                            className={styles.secondaryBtn}
                            onClick={() => openHistoryModal(member.id)}
                          >
                            View History
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      {showHistoryModal ? (
        <div className={styles.modalOverlay} onClick={closeHistoryModal}>
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h3>Member History</h3>
                <p>
                  Detailed sales and profile information for the selected member
                </p>
              </div>

              <button
                type="button"
                className={styles.closeBtn}
                onClick={closeHistoryModal}
              >
                ×
              </button>
            </div>

            {historyLoading ? (
              <div className={styles.loader}>Loading member history...</div>
            ) : selectedMember ? (
              <>
                <div className={styles.detailsGrid}>
                  <div className={styles.detailCard}>
                    <span>Member Code</span>
                    <strong>{selectedMember.member_code || "—"}</strong>
                  </div>

                  <div className={styles.detailCard}>
                    <span>Name</span>
                    <strong>{selectedMember.name || "—"}</strong>
                  </div>

                  <div className={styles.detailCard}>
                    <span>Tier</span>
                    <strong>{selectedMember.tier || "—"}</strong>
                  </div>

                  <div className={styles.detailCard}>
                    <span>Tier Discount</span>
                    <strong>{Number(selectedMember.membership_discount_pct || 0)}%</strong>
                  </div>

                  <div className={styles.detailCard}>
                    <span>Phone</span>
                    <strong>{selectedMember.phone || "—"}</strong>
                  </div>

                  <div className={styles.detailCard}>
                    <span>Email</span>
                    <strong>{selectedMember.email || "—"}</strong>
                  </div>

                  <div className={styles.detailCard}>
                    <span>Created At</span>
                    <strong>{formatDateTime(selectedMember.created_at)}</strong>
                  </div>
                </div>

                <div className={styles.itemsSection}>
                  <div className={styles.itemsHeader}>
                    <div>
                      <h4>Sales History</h4>
                      <span>{memberSales.length} record(s)</span>
                    </div>

                    <div className={styles.headerActions}>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={downloadMemberHistoryExcel}
                      >
                        Export Excel
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryBtn}
                        onClick={downloadMemberHistoryDoc}
                      >
                        Export Word
                      </button>
                    </div>
                  </div>

                  {memberSales.length === 0 ? (
                    <div className={styles.emptyStateSmall}>
                      No sales found for this member
                    </div>
                  ) : (
                    <div className={styles.tableOuter}>
                      <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>Sale ID</th>
                              <th>Customer</th>
                              <th>Total</th>
                              <th>Status</th>
                              <th>Payment Method</th>
                              <th>Sale Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {memberSales.map((sale) => (
                              <tr key={sale.id}>
                                <td>{sale.id}</td>
                                <td>{sale.customer || sale.customer_name || "—"}</td>
                                <td>
                                  {formatMoney(
                                    sale.total_amount || sale.total || 0
                                  )}
                                </td>
                                <td>{sale.status || "—"}</td>
                                <td>{sale.payment_method || "—"}</td>
                                <td>
                                  {formatDateTime(
                                    sale.sale_date || sale.created_at
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className={styles.emptyStateSmall}>
                No member information found
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
