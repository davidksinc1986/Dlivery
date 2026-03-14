import axios from "axios";

const getApiBaseUrl = () => {
  if (process.env.REACT_APP_API_URL) return process.env.REACT_APP_API_URL;

  if (typeof window !== "undefined") {
    const { protocol, hostname, origin } = window.location;

    // Desarrollo local: backend en puerto 3001
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//127.0.0.1:3001`;
    }

    // Producción: priorizar mismo origen (proxy/reverse proxy) para evitar timeouts a :3001
    return origin;
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
