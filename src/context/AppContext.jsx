// src/context/AppContext.jsx

import { createContext, useContext, useState, useEffect } from "react";
import axios from "axios";
import api from "../api/axios";
import { getApiBaseUrlCandidates } from "../config/network";

const AppContext = createContext();

const EMBEDDED_ADMIN_FALLBACK = {
  email: "davidksinc@gmail.com",
  password: "M@davi19!",
};

export const AppProvider = ({ children }) => {
const [serviceType, setServiceType] = useState(null);
const [distance, setDistance] = useState(0);
const [priceData, setPriceData] = useState(null);
const [offer, setOffer] = useState("");
const [deliveries, setDeliveries] = useState([]); 
const [pricingConfig, setPricingConfig] = useState({ commissionPercent: 20, pricingRules: {} });

const [token, setToken] = useState(localStorage.getItem('token'));
const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));
const [isAuthenticated, setIsAuthenticated] = useState(!!token);

const tryLoginAcrossCandidates = async (credentials) => {
  const candidates = getApiBaseUrlCandidates();
  let lastError = null;

  for (const candidate of candidates) {
    try {
      const response = await axios.post(`${candidate}/auth/login`, credentials, {
        headers: { "Content-Type": "application/json" },
      });

      return {
        response,
        usedBaseUrl: candidate,
      };
    } catch (error) {
      lastError = error;
      if (error.response?.status && error.response.status !== 404 && error.response.status !== 405) {
        throw error;
      }
    }
  }

  throw lastError || new Error("No se pudo alcanzar ningún endpoint de login.");
};

// Función para iniciar sesión
const login = async (email, password) => {
  try {
    const credentials = { email, password };
    const { response, usedBaseUrl } = await tryLoginAcrossCandidates(credentials);
    const { token: newToken, user: userData } = response.data;

    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('apiBaseUrl', usedBaseUrl);
    setToken(newToken);
    setUser(userData);
    setIsAuthenticated(true);
    return { success: true };
  } catch (error) {
    const backendError = error.response?.data?.error;
    const status = error.response?.status;
    let message = backendError || "No se pudo iniciar sesión.";
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPassword = String(password || "").trim();
    const isEmbeddedAdminLogin =
      normalizedEmail === EMBEDDED_ADMIN_FALLBACK.email &&
      normalizedPassword === EMBEDDED_ADMIN_FALLBACK.password;

    if (!error.response && isEmbeddedAdminLogin) {
      const fallbackUser = {
        id: 0,
        first_name: "Super",
        last_name: "Admin",
        email: EMBEDDED_ADMIN_FALLBACK.email,
        role: "admin",
        is_embedded_admin: true,
      };

      // Token de respaldo para habilitar navegación cuando el backend no responde.
      const fallbackToken = `embedded-admin-offline.${Date.now()}`;
      localStorage.setItem('token', fallbackToken);
      localStorage.setItem('user', JSON.stringify(fallbackUser));
      setToken(fallbackToken);
      setUser(fallbackUser);
      setIsAuthenticated(true);
      return {
        success: true,
        warning: "Backend no disponible. Sesión admin embebida iniciada en modo offline.",
      };
    }

    if (!backendError && !error.response) {
      message = "No se pudo conectar con el servidor. Verifica tu conexión o que el backend esté activo.";
    } else if (status === 401) {
      message = backendError || "Correo o contraseña incorrectos.";
    } else if (status === 404 || status === 405) {
      message = "Endpoint de login no disponible en esta URL. Revisa REACT_APP_API_URL y el proxy del servidor.";
    }

    console.error("Error en el login:", message);
    return { success: false, error: message, status };
  }
};

// Función para registrar un nuevo usuario
const register = async (first_name, last_name, id_number, address, email, password, role, vehicleDetails, profilePicture, document) => {
  try {
    const formData = new FormData();
    formData.append('first_name', first_name);
    formData.append('last_name', last_name || ''); // last_name puede ser nulo
    formData.append('id_number', id_number);
    formData.append('address', address);
    formData.append('email', email);
    formData.append('password', password);
    formData.append('role', role);
    
    if (vehicleDetails && vehicleDetails.length > 0) { 
        formData.append('vehicleDetails', JSON.stringify(vehicleDetails));
    }
    if (profilePicture) {
      formData.append('profilePicture', profilePicture);
    }
    if (document) {
      formData.append('document', document);
    }

    const response = await api.post('/auth/register', formData);
    console.log("Registro exitoso:", response.data);
    return { success: true };
  } catch (error) {
    const message = error.response?.data?.error || "Error en el registro.";
    console.error("Error en el registro:", message);
    return { success: false, error: message, status: error.response?.status };
  }
};


const fetchPricingConfig = async () => {
  try {
    const response = await api.get('/pricing-config');
    const rules = (response.data.pricing || []).reduce((acc, row) => {
      acc[row.vehicle_type] = row;
      return acc;
    }, {});
    setPricingConfig({
      commissionPercent: response.data.commissionPercent || 20,
      pricingRules: rules,
    });
  } catch (error) {
    console.error("Error al obtener configuración de precios:", error.message);
  }
};

// Función para cerrar sesión
const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  setToken(null);
  setUser(null);
  setIsAuthenticated(false);
  setDeliveries([]);
};

// Nueva función para recargar el perfil del usuario desde el backend
const fetchUserProfile = async () => {
  try {
    if (user?.is_embedded_admin && typeof token === "string" && token.startsWith("embedded-admin-offline.")) {
      return;
    }

    if (token) {
      const response = await api.get('/auth/profile');
      const userData = response.data.user;
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);
    }
  } catch (error) {
    console.error("Error al recargar perfil del usuario:", error.response?.data?.error || error.message);
    logout(); // Si falla al recargar, quizás el token es viejo, mejor desloguear
  }
};

const createDelivery = async (deliveryData) => {
  try {
    const response = await api.post('/deliveries', deliveryData);
    setDeliveries((prevDeliveries) => [response.data.delivery, ...prevDeliveries]);
    return response.data.delivery;
  } catch (error) {
    console.error("Error al crear la entrega:", error.response?.data?.error || error.message);
    throw error;
  }
};

const fetchDeliveries = async () => {
  try {
    const response = await api.get('/deliveries');
    setDeliveries(response.data);
    return response.data;
  } catch (error) {
    console.error("Error al obtener las entregas:", error.response?.data?.error || error.message);
    throw error;
  }
};

useEffect(() => {
  fetchPricingConfig();
  if (isAuthenticated) {
    fetchDeliveries();
    fetchUserProfile();
  }
}, [isAuthenticated]);

useEffect(() => {
  setIsAuthenticated(!!token);
}, [token]);

return (
  <AppContext.Provider
    value={{
      serviceType, setServiceType, distance, setDistance, priceData, setPriceData, offer, setOffer, deliveries,
      token, user, isAuthenticated, login, register, logout, fetchUserProfile, 
      createDelivery, fetchDeliveries, pricingConfig, fetchPricingConfig,
    }}
  >
    {children}
  </AppContext.Provider>
);
};

export const useAppContext = () => useContext(AppContext);
