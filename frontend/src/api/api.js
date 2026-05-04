// src/api/api.js
import axios from "axios";

// https://api.pos.adsoforion.com/ https://api.pray-pos.copupbid.com/api
const API = axios.create({
  baseURL: "http://localhost:5000/api"
});

API.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    const rawUser = localStorage.getItem("user");
    let user = null;

    try {
      user = rawUser ? JSON.parse(rawUser) : null;
    } catch (error) {
      user = null;
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    const branchId = user?.branch_id;
    if (branchId) {
      const method = String(config.method || "get").toLowerCase();
      const isAuthRoute = String(config.url || "").includes("/auth/");

      if (!isAuthRoute) {
        if (method === "get") {
          config.params = config.params || {};
          if (!config.params.branch_id) {
            config.params.branch_id = branchId;
          }
        } else {
          const payload = config.data && typeof config.data === "object" ? config.data : {};
          if (!payload.branch_id) {
            payload.branch_id = branchId;
          }
          config.data = payload;
        }
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/";
    }
    return Promise.reject(error);
  }
);

export default API;