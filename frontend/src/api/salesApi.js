import API from "./api";

// get all sales
export const getSales = async (params = {}) => {
  const { data } = await API.get("/sales", { params });
  return data;
};

// get sales by payment type / split breakdown
export const getSalesByPaymentType = async (params = {}) => {
  const { data } = await API.get("/sales/payment-types", { params });
  return data;
};

// get sales summary and trend metrics
export const getSalesSummary = async (params = {}) => {
  const { data } = await API.get("/sales/summary", { params });
  return data;
};

// get one sale details
export const getSaleById = async (id) => {
  const { data } = await API.get(`/sales/${id}`);
  return data;
};

// refund sale
export const refundSale = async (id, payload) => {
  const { data } = await API.post(`/sales/${id}/refund`, payload);
  return data;
};
