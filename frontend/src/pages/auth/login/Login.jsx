import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBranchSlugs, loginUser } from "../../../api/authApi";
import styles from "./Login.module.css";
import { Link } from "react-router-dom";

const REMEMBER_LOGIN_KEY = "remembered_login";

const getRememberedLogin = () => {
  try {
    const raw = localStorage.getItem(REMEMBER_LOGIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const clearAuthStorage = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("branch_slug");
};

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

export default function Login() {
  const navigate = useNavigate();
  const rememberedLogin = getRememberedLogin();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [form, setForm] = useState({
    identifier: rememberedLogin?.identifier || "",
    password: "",
    branch_slug: rememberedLogin?.branch_slug || localStorage.getItem("branch_slug") || ""
  });
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedLogin));

  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState("");
  const [branchLoading, setBranchLoading] = useState(true);
  const [branchError, setBranchError] = useState("");
  const [branchAttempt, setBranchAttempt] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const user = localStorage.getItem("user");

    if (token && user && isTokenValid(token)) {
      navigate("/dashboard", { replace: true });
      return;
    }

    clearAuthStorage();
    setCheckingAuth(false);
  }, [navigate]);

  useEffect(() => {
    let active = true;
    const fetchBranchSlugs = async () => {
      setBranchLoading(true);
      setBranchError("");
      try {
        const res = await getBranchSlugs();
        if (!active) return;
        const list = Array.isArray(res?.data) ? res.data : [];
        if (!list.length) setBranchError("No active branches available. Contact your manager.");
        setBranches(list);

        if (list.length) {
          setForm((prev) =>
            list.some((branch) => branch.slug === prev.branch_slug) ? prev : { ...prev, branch_slug: list[0].slug }
          );
        }
      } catch {
        if (!active) return;
        setBranches([]);
        setBranchError("We couldn’t load your branches. Retry or enter your branch code below.");
      } finally {
        if (active) setBranchLoading(false);
      }
    };

    fetchBranchSlugs();
    return () => { active = false; };
  }, [branchAttempt]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = {
        identifier: form.identifier.trim(),
        password: form.password,
        branch_slug: form.branch_slug.trim()
      };

      const data = await loginUser(payload);

      if (!data?.token || !isTokenValid(data.token)) {
        clearAuthStorage();
        setError("Invalid or expired token returned from server");
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      localStorage.setItem("branch_slug", payload.branch_slug);

      if (rememberMe) {
        localStorage.setItem(
          REMEMBER_LOGIN_KEY,
          JSON.stringify({
            identifier: payload.identifier,
            branch_slug: payload.branch_slug
          })
        );
      } else {
        localStorage.removeItem(REMEMBER_LOGIN_KEY);
      }

      navigate("/dashboard", { replace: true });
    } catch (err) {
      clearAuthStorage();
      setError(err?.response?.data?.message || err?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className={styles.loginPage}>
      <section className={styles.story} aria-label="Pray Restaurant and Lounge">
        <div className={styles.wordmark}>PRAY <span>RESTAURANT & LOUNGE</span></div>
        <div className={styles.storyContent}>
          <p className={styles.eyebrow}>THE ART OF GOOD SERVICE</p>
          <h2>Every table.<br />Every detail.<br /><em>Beautifully served.</em></h2>
          <p>Your floor, your orders, your team.<br />One considered space to bring it all together.</p>
        </div>
        <div className={styles.storyFooter}><span>POINT OF SALE</span><span>Made for hospitality ↗</span></div>
      </section>
        <div className={styles.loginCard}>
          <div className={styles.brand}>
            <div className={styles.logoCircle} aria-hidden="true">P<span>✦</span></div>
            <h1>Pray Restaurant & Lounge</h1>
            <p>Checking session...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.loginPage}>
      <section className={styles.story} aria-label="Pray Restaurant and Lounge">
        <div className={styles.wordmark}>PRAY <span>RESTAURANT & LOUNGE</span></div>
        <div className={styles.storyContent}>
          <p className={styles.eyebrow}>THE ART OF GOOD SERVICE</p>
          <h2>Every table.<br />Every detail.<br /><em>Beautifully served.</em></h2>
          <p>Your floor, your orders, your team.<br />One considered space to bring it all together.</p>
        </div>
        <div className={styles.storyFooter}><span>POINT OF SALE</span><span>Made for hospitality ↗</span></div>
      </section>
        <div className={styles.loginCard}>
          <div className={styles.brand}>
            <div className={styles.logoCircle} aria-hidden="true">P<span>✦</span></div>
            <p className={styles.eyebrow}>YOUR SERVICE STARTS HERE</p>
            <h1>Welcome back.</h1>
            <p>Choose your branch and sign in to your workspace.</p>
          </div>

        <form onSubmit={handleLogin} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="identifier">Username or Email</label>
            <div className={styles.inputWrap}>
              <span className={styles.inputIcon}>○</span>
              <input
                id="identifier"
                type="text"
                name="identifier"
                value={form.identifier}
                onChange={handleChange}
                placeholder="Enter your username or email"
                required
                autoComplete="username"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Password</label>
            <div className={styles.inputWrap}>
              <span className={styles.inputIcon}>◇</span>
              <input
                id="password"
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="branch_slug">Your branch</label>
            <div className={styles.inputWrap}>
              <span className={styles.inputIcon}>⌂</span>
              {branchError ? <input id="branch_slug" name="branch_slug" value={form.branch_slug} onChange={handleChange} placeholder="Enter branch code" required /> : <select
                id="branch_slug"
                name="branch_slug"
                value={form.branch_slug}
                onChange={handleChange}
              >
                <option value="">{branchLoading ? "Loading branches…" : "Select branch"}</option>
                {branches.map((branch) => (
                  <option key={`${branch.business_id}-${branch.slug}`} value={branch.slug}>
                    {branch.name} · {branch.business_name}
                  </option>
                ))}
              </select>}
            </div>
          </div>

          {branchError && <div className={styles.branchNotice} role="status">{branchError} <button type="button" disabled={branchLoading} onClick={() => setBranchAttempt((value) => value + 1)}>Try again</button></div>}

          {error ? <div role="alert" className={styles.errorText}>{error}</div> : null}

          <label className={styles.rememberOption}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>
              <strong>Remember me</strong>
              <small>Save username/email and branch on this device</small>
            </span>
          </label>

          <button type="submit" disabled={loading || branchLoading || !form.branch_slug} className={styles.loginBtn}>
            {loading ? "Logging in..." : "Open workspace →"}
          </button>
          <Link to="/clock" className={styles.clockLink}>
            Staff time clock ↗
          </Link>
        </form>
      </div>
    </div>
  );
}
