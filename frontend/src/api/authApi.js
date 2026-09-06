// src/api/authApi.js
import API from "./api";

/* =========================
   DASHBOARD AUTH (existing)
========================= */
export const loginUser = async (payload) => {
  const { data } = await API.post("/auth/login", payload);
  return data;
};

// Share concurrent requests (including StrictMode mounts). Retry only safe reads.
let branchRequest;
export const getBranchSlugs = () => {
  if (branchRequest) return branchRequest;
  branchRequest = (async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const { data } = await API.get("/auth/branch-slugs", { timeout: 8000 });
        if (!data?.success || !Array.isArray(data.data)) {
          throw new Error("Unable to load branches. Please try again.");
        }
        return data;
      } catch (error) {
        const status = error.response?.status;
        if (attempt === 2 || (status && status !== 429 && status < 500)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  })().finally(() => { branchRequest = null; });
  return branchRequest;
};

export const getSavedBranchSlug = () => {
  return localStorage.getItem("branch_slug") || "";
};

export const getMe = async () => {
  const { data } = await API.get("/auth/me");
  return data;
};

export const logoutUser = async () => {
  const { data } = await API.post("/auth/logout");
  return data;
};

/* =========================
   CLOCK AUTH (separate)
========================= */
export const CLOCK_TOKEN_KEY = "clock_token";
export const CLOCK_USER_KEY = "clock_user";

export const saveClockSession = (token, user) => {
  localStorage.setItem(CLOCK_TOKEN_KEY, token);
  localStorage.setItem(CLOCK_USER_KEY, JSON.stringify(user));
};

export const getClockToken = () => {
  return localStorage.getItem(CLOCK_TOKEN_KEY);
};

export const getClockUser = () => {
  const raw = localStorage.getItem(CLOCK_USER_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const clearClockSession = () => {
  localStorage.removeItem(CLOCK_TOKEN_KEY);
  localStorage.removeItem(CLOCK_USER_KEY);
};

export const loginClockUser = async (payload) => {
  const { data } = await API.post("/auth/login", payload);
  return data;
};

export const getClockMe = async () => {
  const token = getClockToken();

  const { data } = await API.get("/auth/me", {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  return data;
};

export const logoutClockUser = async () => {
  const token = getClockToken();

  const { data } = await API.post(
    "/auth/logout",
    {},
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return data;
};