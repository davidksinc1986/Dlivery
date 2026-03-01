// src/context/AppContext.jsx

import { createContext, useContext, useState, useEffect } from "react";
import api from "../api/axios";

const AppContext = createContext();

export const AppProvider = ({ children }) => {
const [serviceType, setServiceType] = useState(null);
const [distance, setDistance] = useState(0);
const [priceData, setPriceData] = useState(null);
const [offer, setOffer] = useState("");
const [deliveries, setDeliveries] = useState([]); 

const [token, setToken] = useState(localStorage.getItem('token'));
const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));
const [isAuthenticated, setIsAuthenticated] = useState(!!token);

// Función para iniciar sesión
const login = async (email, password) => {
  try {
    const response = await api.post('/auth/login', { email, password });
    const { token: newToken, user: userData } = response.data; 
    
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    setIsAuthenticated(true);
    return true;
  } catch (error) {
    console.error("Error en el login:", error.response?.data?.error || error.message);
    return false;
  }
};

// Función para registrar un nuevo usuario
const register = async (first_name, last_name, id_number, address, email, password, role, vehicleDetails) => { // YA NO RECIBE ARCHIVOS DIRECTAMENTE
  try {
    const formData = new FormData();
    formData.append('first_name', first_name);
    formData.append('last_name', last_name || ''); // last_name puede ser nulo
    formData.append('id_number', id_number);
    formData.append('address', address);
    formData.append('email', email);
    formData.append('password', password);
    formData.append('role', role);
    
    // vehicleDetails se envía como JSON string
    if (vehicleDetails && vehicleDetails.length > 0) { 
        formData.append('vehicleDetails', JSON.stringify(vehicleDetails));
    }
    // NO HAY ARCHIVOS EN EL REGISTRO INICIAL
    // if (document) { formData.append('document', document); }

    const response = await api.post('/auth/register', formData);
    console.log("Registro exitoso:", response.data);
    return true;
  } catch (error) {
    console.error("Error en el registro:", error.response?.data?.error || error.message);
    return false;
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
  if (isAuthenticated) {
    fetchDeliveries();
    fetchUserProfile(); // Cargar perfil al inicio si está autenticado
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
      createDelivery, fetchDeliveries,
    }}
  >
    {children}
  </AppContext.Provider>
);
};

export const useAppContext = () => useContext(AppContext);