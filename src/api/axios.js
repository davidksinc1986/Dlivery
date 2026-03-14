import axios from "axios";

const getApiBaseUrl = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;

  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    const resolvedHost = hostname === "localhost" ? "127.0.0.1" : hostname;
    return `${protocol}//${resolvedHost}:3001`;
  }

  return "http://127.0.0.1:3001";
};

const api = axios.create({
  baseURL: getApiBaseUrl(),
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
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
