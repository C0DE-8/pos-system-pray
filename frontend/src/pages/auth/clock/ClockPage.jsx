// src/pages/auth/clock/ClockPage.jsx
import { useEffect, useState } from "react";
import {
  getBranchSlugs,
  loginClockUser,
  logoutClockUser,
  saveClockSession,
  clearClockSession,
  getClockToken,
  getClockUser
} from "../../../api/authApi";
import styles from "./ClockPage.module.css";
import { Link } from "react-router-dom";

const isTokenValid = (token) => {
  try {
    if (!token) return false;

    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return false;

    const currentTimeInSeconds = Math.floor(Date.now() / 1000);
    return payload.exp > currentTimeInSeconds;
  } catch {
    return false;
  }
};

export default function ClockPage() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [clockedUser, setClockedUser] = useState(null);

  const [form, setForm] = useState({
    identifier: "",
    password: "",
    branch_slug: localStorage.getItem("branch_slug") || ""
  });

  const [loading, setLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [branches, setBranches] = useState([]);
  const [branchError, setBranchError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const token = getClockToken();
    const user = getClockUser();

    if (token && user && isTokenValid(token)) {
      setClockedUser(user);
    } else {
      clearClockSession();
    }

    setCheckingSession(false);
  }, []);

  useEffect(() => {
    const fetchBranchSlugs = async () => {
      try {
        const res = await getBranchSlugs();
        const list = Array.isArray(res?.data) ? res.data : [];
        setBranches(list);
        if (!list.length) setBranchError("No active branches available. Contact your manager.");
        if (list.length) {
          setForm((prev) => list.some(branch => branch.slug === prev.branch_slug) ? prev : ({ ...prev, branch_slug: list[0].slug }));
        }
      } catch {
        setBranchError("Branches could not be loaded. Enter your branch code to continue.");
        setBranches([]);
      }
    };
    fetchBranchSlugs();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleClockIn = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const payload = {
        identifier: form.identifier.trim(),
        password: form.password,
        branch_slug: form.branch_slug.trim()
      };

      const data = await loginClockUser(payload);

      if (!data?.token || !isTokenValid(data.token)) {
        clearClockSession();
        setError("Invalid or expired token returned from server");
        return;
      }

      saveClockSession(data.token, data.user);
      localStorage.setItem("branch_slug", payload.branch_slug);
      setClockedUser(data.user);
      setSuccess(`Clock in successful. Welcome, ${data.user.name}.`);
      setForm({
        identifier: "",
        password: "",
        branch_slug: payload.branch_slug
      });
    } catch (err) {
      clearClockSession();
      setError(err?.response?.data?.message || err?.message || "Clock in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    setError("");
    setSuccess("");
    setLogoutLoading(true);

    try {
      const data = await logoutClockUser();
      const userName = clockedUser?.name || "Staff";

      clearClockSession();
      setClockedUser(null);
      setSuccess(data?.message || `${userName} clocked out successfully.`);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Clock out failed");
    } finally {
      setLogoutLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className={styles.clockPage}>
        <div className={styles.bgGlowOne}></div>
        <div className={styles.bgGlowTwo}></div>
        <div className={styles.bgGrid}></div>

        <div className={styles.clockCard}>
          <div className={styles.brand}>
            <div className={styles.logoCircle}>🕒</div>
            <h1>Staff Clock</h1>
            <p>Checking clock session...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.clockPage}>
      <div className={styles.bgGlowOne}></div>
      <div className={styles.bgGlowTwo}></div>
      <div className={styles.bgGrid}></div>

      <div className={styles.clockCard}>
        <div className={styles.brand}>
          <div className={styles.logoCircle}>🕒</div>
          <h1>Staff Clock</h1>
          <p>Clock in with username/email, password and branch</p>
        </div>

        {!clockedUser ? (
          <form onSubmit={handleClockIn} className={styles.form}>
            <div className={styles.formGroup}>
              <label htmlFor="identifier">Username or Email</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>👤</span>
                <input
                  id="identifier"
                  type="text"
                  name="identifier"
                  value={form.identifier}
                  onChange={handleChange}
                  placeholder="Enter your username or email"
                  autoComplete="username"
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password">Password</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>🔒</span>
                <input
                  id="password"
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="branch_slug">Your branch</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}>🏬</span>
                {branchError ? <input id="branch_slug" name="branch_slug" value={form.branch_slug} onChange={handleChange} placeholder="Enter branch code" required /> : <select
                  id="branch_slug"
                  name="branch_slug"
                  value={form.branch_slug}
                  onChange={handleChange}
                >
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={`${branch.business_id}-${branch.slug}`} value={branch.slug}>
                      {branch.business_name} - {branch.name} ({branch.slug})
                    </option>
                  ))}
                </select>}
              </div>
            </div>

            {branchError && <p role="status" className={styles.errorText}>{branchError}</p>}
            {error ? <div className={styles.errorText}>{error}</div> : null}
            {success ? <div className={styles.successText}>{success}</div> : null}

            <button type="submit" disabled={loading} className={styles.clockInBtn}>
              {loading ? "Clocking in..." : "Clock In"}
            </button>
          </form>
        ) : (
          <div className={styles.loggedInPanel}>
            <div className={styles.userCard}>
              <div className={styles.userAvatar}>
                {clockedUser?.avatar ? (
                  <img src={clockedUser.avatar} alt={clockedUser.name} />
                ) : (
                  <span>{clockedUser?.name?.charAt(0)?.toUpperCase() || "U"}</span>
                )}
              </div>

              <h2>{clockedUser?.name}</h2>
              <p>{clockedUser?.email}</p>
              <span className={styles.roleBadge}>{clockedUser?.role}</span>
            </div>

            {branchError && <p role="status" className={styles.errorText}>{branchError}</p>}
            {error ? <div className={styles.errorText}>{error}</div> : null}
            {success ? <div className={styles.successText}>{success}</div> : null}

            <button
              type="button"
              onClick={handleClockOut}
              disabled={logoutLoading}
              className={styles.clockOutBtn}
            >
              {logoutLoading ? "Clocking out..." : "Clock Out"}
            </button>
                      <Link to="/" className={styles.clockLink}>
                        Go to Clock In / Clock Out
                      </Link>
          </div>
        )}
      </div>
    </div>
  );
}