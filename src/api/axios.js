import axios from "axios";
import { getApiBaseUrl } from "../config/network";

const getPreferredBaseUrl = () => {
  if (typeof window === "undefined") return getApiBaseUrl();
  return localStorage.getItem("apiBaseUrl") || getApiBaseUrl();
};

const api = axios.create({
  baseURL: getPreferredBaseUrl(),
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.baseURL = getPreferredBaseUrl();
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
