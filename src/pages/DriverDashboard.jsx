// src/pages/DriverDashboard.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react'; // <--- Añadido useCallback
import { useAppContext } from '../context/AppContext';
import api from '../api/axios';
import MapComponent from "../components/Map/MapComponent";
import { io } from "socket.io-client";
import { formatVehicleType, groupDeliveriesByVehicleType, parseCoordinateString, toMapsQuery } from "../utils/deliveryUtils";
import UserProfile from "../components/UserProfile"; // <--- Importado UserProfile
import { getSocketServerUrl } from "../config/network";

const SOCKET_SERVER_URL = getSocketServerUrl();

export default function DriverDashboard() {
const { logout, user, token } = useAppContext();
const [isDriverAvailable, setIsDriverAvailable] = useState(!!user?.is_available);
const [availableDeliveries, setAvailableDeliveries] = useState([]); // Todas las disponibles del pool
const [assignedDeliveries, setAssignedDeliveries] = useState([]); // Aceptadas pero no iniciadas
const [inProgressDeliveries, setInProgressDeliveries] = useState([]); // Iniciadas
const [driverError, setDriverError] = useState("");
const [pinInput, setPinInput] = useState("");
const [totalEarnings, setTotalEarnings] = useState(0);
const [notifications, setNotifications] = useState([]);

const socketRef = useRef(null);
const currentDeliveryIntervalIdRef = useRef(null);

const [showProfile, setShowProfile] = useState(false); // Estado para mostrar/ocultar perfil

// Limpiar y reconectar Socket.IO al desmontar o cambiar user/token
useEffect(() => {
  if (user && token) {
    if (!socketRef.current) { // Solo inicializar si no está ya conectado
      socketRef.current = io(SOCKET_SERVER_URL);

      socketRef.current.on("connect", () => {
        console.log("Conectado al servidor WebSocket como conductor:", socketRef.current.id);
        if (isDriverAvailable) {
            sendDriverLocationOnce(); // Envía la ubicación una vez al conectar
        }
      });

      socketRef.current.on("location_error", (error) => {
        console.error("Error de ubicación del conductor:", error.message);
        setDriverError(`Error de ubicación: ${error.message}`);
      });

      socketRef.current.on("disconnect", () => {
        console.log("Desconectado del servidor WebSocket como conductor.");
        if (currentDeliveryIntervalIdRef.current) {
          clearInterval(currentDeliveryIntervalIdRef.current); // Detener el envío de ubicación
          currentDeliveryIntervalIdRef.current = null;
        }
      });
    }
  } else { // Si no hay usuario o token, o se desloguea, desconectar socket
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }

  return () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };
}, [user, token, isDriverAvailable]);

// Función para obtener la ubicación del conductor (GPS real) una sola vez
const sendDriverLocationOnce = useCallback(() => { // <--- useCallback para memorizar la función
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      try {
          await api.put('/drivers/availability', { is_available: true, latitude, longitude });
          console.log(`Ubicación enviada al backend: ${latitude}, ${longitude}`);
      } catch (error) { // <-- SINTAXIS CORREGIDA
          console.error("Error al enviar la ubicación al backend:", error);
      }
    }, (error) => {
      console.error("Error al obtener la ubicación GPS:", error.message);
      setDriverError("Error al obtener tu ubicación GPS. Asegúrate de permitir el acceso.");
    }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
  } else {
    setDriverError("Tu navegador no soporta geolocalización.");
  }
}, [api]); // Depende de 'api'

// Función para enviar la ubicación del conductor en intervalos
const sendDriverLocation = useCallback((deliveryId) => { // <--- useCallback para memorizar la función
  // Debug: Ver el token justo antes de emitir
  if (!token) {
      console.error("sendDriverLocation: Token no disponible. No se puede enviar la ubicación.");
      return;
  }

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("send_location", {
              token: token, // <-- Usamos la variable 'token' directamente
              delivery_id: deliveryId,
              latitude,
              longitude,
        });
        console.log(`Enviando ubicación para entrega ${deliveryId}: ${latitude}, ${longitude}`);
      }
    }, (error) => {
      console.error("Error al obtener la ubicación GPS en intervalo:", error.message);
      setDriverError("Error al obtener tu ubicación GPS. Asegúrate de permitir el acceso.");
    }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
  } else {
    setDriverError("Tu navegador no soporta geolocalización.");
  }
}, [token, api]); // Depende de 'token' y 'api'

// Función para obtener MIS entregas (asignadas o en progreso)
const fetchMyDeliveries = useCallback(async () => { // <--- useCallback
  setDriverError("");
  try {
      const response = await api.get('/drivers/my-deliveries');
      const myDeliveries = response.data;
      setAssignedDeliveries(myDeliveries.filter(del => del.status === 'assigned'));
      setInProgressDeliveries(myDeliveries.filter(del => del.status === 'in_progress'));
  } catch (error) { // <-- SINTAXIS CORREGIDA
      console.error("Error al cargar mis entregas:", error);
      setDriverError(error.response?.data?.error || "Error al cargar tus entregas.");
  }
}, [api]); // Depende de 'api'

// Cargar ganancias del conductor
const fetchEarnings = useCallback(async (period = 'total') => { // <--- useCallback
  setDriverError("");
  try {
      const response = await api.get(`/drivers/earnings?period=${period}`);
      setTotalEarnings(response.data.total_earnings);
  } catch (error) { // <-- SINTAXIS CORREGIDA
      console.error("Error al cargar ganancias:", error);
      setDriverError(error.response?.data?.error || "Error al cargar tus ganancias.");
  }
}, [api]); // Depende de 'api'

const fetchNotifications = useCallback(async () => {
  try {
    const response = await api.get('/drivers/notifications');
    setNotifications(response.data || []);
  } catch (error) {
    console.error('Error al cargar notificaciones', error.message);
  }
}, []);

// Función para alternar la disponibilidad (Online/Offline)
const toggleAvailability = useCallback(async () => { // <--- useCallback
  setDriverError("");
  try {
    const newAvailability = !isDriverAvailable;
    if (newAvailability) { // Si se pone disponible, intenta enviar ubicación
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const { latitude, longitude } = position.coords;
          await api.put('/drivers/availability', { is_available: true, latitude, longitude });
          setIsDriverAvailable(true);
          alert(`Tu estado ahora es: Disponible (Online)`);
          fetchAvailableDeliveries();
        }, (error) => {
          console.error("Error al obtener ubicación para disponibilidad:", error);
          setDriverError("Error al obtener tu ubicación. No se pudo poner online.");
        }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 });
      } else {
        setDriverError("Tu navegador no soporta geolocalización para ponerte online.");
      }
    } else { // Si se desconecta, simplemente actualiza el estado
      await api.put('/drivers/availability', { is_available: false });
      setIsDriverAvailable(false);
      alert(`Tu estado ahora es: No Disponible (Offline)`);
      setAvailableDeliveries([]);
    }
  } catch (error) { // <-- SINTAXIS CORREGIDA
    setDriverError(error.response?.data?.error || "Error al cambiar disponibilidad.");
  }
}, [isDriverAvailable, api, fetchAvailableDeliveries]); // Depende de 'isDriverAvailable', 'api', 'fetchAvailableDeliveries'

// Función para obtener las entregas disponibles (pool de ofertas)
const fetchAvailableDeliveries = useCallback(async () => { // <--- useCallback
  setDriverError("");
  if (!isDriverAvailable) {
    setAvailableDeliveries([]);
    return;
  }
  try {
    const response = await api.get('/drivers/deliveries/available');
    setAvailableDeliveries(response.data);
  } catch (error) { // <-- SINTAXIS CORREGIDA
    setDriverError(error.response?.data?.error || "Error al cargar entregas disponibles.");
    setAvailableDeliveries([]);
  }
}, [isDriverAvailable, api]); // Depende de 'isDriverAvailable', 'api'

// Efecto para cargar disponibilidad inicial, mis entregas y ganancias
useEffect(() => {
  if (user) {
    setIsDriverAvailable(!!user.is_available);
    fetchMyDeliveries();
    fetchEarnings(); // Cargar ganancias al inicio
    fetchNotifications();
  }
}, [user, fetchMyDeliveries, fetchEarnings, fetchNotifications]);

// Efecto para cargar entregas disponibles (pool)
useEffect(() => {
  if (user?.role === 'driver' && isDriverAvailable) {
    fetchAvailableDeliveries();
    const interval = setInterval(fetchAvailableDeliveries, 15000); // Refresca cada 15 segundos
    return () => clearInterval(interval);
  } else {
    setAvailableDeliveries([]);
  }
}, [isDriverAvailable, user, fetchAvailableDeliveries]); // Depende de 'isDriverAvailable', 'user', 'fetchAvailableDeliveries'

// Función para aceptar una entrega
const handleAcceptDelivery = useCallback(async (deliveryId) => { // <--- useCallback
  setDriverError("");
  try {
    await api.post(`/drivers/deliveries/${deliveryId}/accept`);
    alert(`Entrega #${deliveryId} aceptada.`);
    fetchAvailableDeliveries();
    fetchMyDeliveries();
  } catch (error) { // <-- SINTAXIS CORREGIDA
    setDriverError(error.response?.data?.error || "Error al aceptar entrega.");
  }
}, [api, fetchAvailableDeliveries, fetchMyDeliveries]); // Depende de 'api', 'fetchAvailableDeliveries', 'fetchMyDeliveries'

// Función para iniciar una entrega
const handleStartDelivery = useCallback(async (deliveryId) => { // <--- useCallback
  setDriverError("");
  try {
    await api.post(`/drivers/deliveries/${deliveryId}/start`);
    alert(`Entrega #${deliveryId} iniciada.`);
    fetchMyDeliveries();
    
    // INICIAR ENVÍO DE UBICACIÓN VÍA WEBSOCKET
    if (socketRef.current && socketRef.current.connected) {
      if (currentDeliveryIntervalIdRef.current) {
        clearInterval(currentDeliveryIntervalIdRef.current); // Detener cualquier tracking anterior
      }
      currentDeliveryIntervalIdRef.current = setInterval(() => sendDriverLocation(deliveryId), 5000);
      alert("¡Tracking de ubicación iniciado!");
    } else {
      setDriverError("Error: Socket.IO no conectado para iniciar tracking.");
    }
  } catch (error) { // <-- SINTAXIS CORREGIDA
    setDriverError(error.response?.data?.error || "Error al iniciar entrega.");
  }
}, [api, fetchMyDeliveries, sendDriverLocation, token]); // Depende de 'api', 'fetchMyDeliveries', 'sendDriverLocation', 'token'

// Función para completar una entrega
const handleCompleteDelivery = useCallback(async (deliveryId) => { // <--- useCallback
  setDriverError("");
  if (!pinInput) {
      setDriverError("Por favor, ingresa el PIN de confirmación.");
      return;
  }
  try {
    await api.post(`/drivers/deliveries/${deliveryId}/complete`, { pin: pinInput }); 
    alert(`Entrega #${deliveryId} completada.`);
    fetchMyDeliveries();
    fetchEarnings(); // Recargar ganancias al completar
    setPinInput("");
    
    // DETENER ENVÍO DE UBICACIÓN VÍA WEBSOCKET
    if (currentDeliveryIntervalIdRef.current) {
      clearInterval(currentDeliveryIntervalIdRef.current);
      currentDeliveryIntervalIdRef.current = null;
      alert("¡Tracking de ubicación detenido!");
    }

  } catch (error) { // <-- SINTAXIS CORREGIDA
    setDriverError(error.response?.data?.error || "Error al completar entrega.");
    alert(error.response?.data?.error || "Error al completar entrega."); // Alerta para PIN incorrecto
  }
}, [pinInput, api, fetchMyDeliveries, fetchEarnings]); // Depende de 'pinInput', 'api', 'fetchMyDeliveries', 'fetchEarnings'

// Lógica para el mapa del conductor
const activeDeliveryForMap = inProgressDeliveries.length > 0 ? inProgressDeliveries[0] : null; 
const mapMarkers = [];
let mapCenter = [9.93, -84.08];

if (activeDeliveryForMap) {
    const originParts = parseCoordinateString(activeDeliveryForMap.origin);
    const destinationParts = parseCoordinateString(activeDeliveryForMap.destination);

    if (originParts) {
        mapMarkers.push({ position: [originParts[0], originParts[1]], popupText: `Origen: ${activeDeliveryForMap.description}` });
        mapCenter = [originParts[0], originParts[1]];
    }
    if (destinationParts) {
        mapMarkers.push({ position: [destinationParts[0], destinationParts[1]], popupText: `Destino: ${activeDeliveryForMap.description}` });
        if (!originParts) mapCenter = [destinationParts[0], destinationParts[1]];
    }
}

// Lógica de filtrado para el conductor
const driverVehicleTypes = user?.vehicle_types || [];

const filteredAvailableDeliveries = availableDeliveries.filter(delivery => {
  if (!delivery.vehicle_requested_type) {
    return false; 
  }
  return driverVehicleTypes.includes(delivery.vehicle_requested_type);
});

const directDeliveries = filteredAvailableDeliveries.filter(delivery => delivery.service_id === 1);
const offerDeliveries = filteredAvailableDeliveries.filter(delivery => delivery.service_id === 2);

const groupedDirectDeliveries = groupDeliveriesByVehicleType(directDeliveries);
const groupedOfferDeliveries = groupDeliveriesByVehicleType(offerDeliveries);
const groupedAssignedDeliveries = groupDeliveriesByVehicleType(assignedDeliveries);
const groupedInProgressDeliveries = groupDeliveriesByVehicleType(inProgressDeliveries);

return (
  <div className="container">
    <header className="app-header">
      <h1>Panel de Conductor</h1>
      <div className="user-info">
        <span>Hola, {user?.first_name} {user?.last_name || ""}</span>
        <button onClick={logout} className="logout-button">Cerrar Sesión</button>
        <button onClick={() => setShowProfile(true)} className="primary-button small-button" style={{marginLeft: '10px'}}>Mi Perfil</button>
      </div>
    </header>

    {showProfile ? ( // Mostrar el perfil si showProfile es true
      <UserProfile onClose={() => setShowProfile(false)} />
    ) : (
      <> {/* Contenido principal si no se muestra el perfil */}
        <div className="driver-controls-section">
          <h2>Notificaciones Prioritarias</h2>
          {notifications.length === 0 ? <p>Sin notificaciones nuevas.</p> : notifications.slice(0,5).map((n) => (
            <div key={n.id} className="delivery-card" style={{marginBottom:'8px'}}>
              <p style={{fontWeight:700, marginBottom:4}}>{n.title}</p>
              <p>{n.message}</p>
            </div>
          ))}
        </div>


        <div className="driver-controls-section">
          <h2>Mi Disponibilidad</h2>
          <button onClick={toggleAvailability} className={`primary-button ${isDriverAvailable ? 'available' : 'unavailable'}`}>
            {isDriverAvailable ? 'Estoy Disponible (Online)' : 'No Disponible (Offline)'}
          </button>
          {driverError && <p className="error-message">{driverError}</p>}
        </div>

        {/* SECCIÓN DE GANANCIAS */}
        <div className="driver-controls-section">
          <h2>Mis Ganancias</h2>
          <p style={{fontSize: '1.2em', fontWeight: 'bold'}}>Total Acumulado: ₡{totalEarnings.toFixed(2)}</p>
          <button onClick={() => fetchEarnings('day')} className="primary-button small-button" style={{marginRight: '5px'}}>Hoy</button>
          <button onClick={() => fetchEarnings('week')} className="primary-button small-button" style={{marginRight: '5px'}}>Esta Semana</button>
          <button onClick={() => fetchEarnings('month')} className="primary-button small-button">Este Mes</button>
        </div>

        {/* SECCIÓN DE VIAJES DIRECTOS DISPONIBLES */}
        <div className="available-deliveries-section">
          <h2>Viajes Directos Disponibles</h2>
          {!isDriverAvailable ? (
            <p>Activa tu disponibilidad para ver viajes.</p>
          ) : Object.keys(groupedDirectDeliveries).length === 0 ? (
            <p>No hay viajes directos disponibles para tus vehículos en este momento.</p>
          ) : (
            Object.keys(groupedDirectDeliveries).map(vehicleType => (
              <div key={vehicleType} style={{marginBottom: '20px'}}>
                <h3>{formatVehicleType(vehicleType)}</h3>
                <div className="deliveries-grid">
                  {groupedDirectDeliveries[vehicleType].map((delivery) => (
                    <div key={delivery.id} className="delivery-card">
                      <h3>Entrega #{delivery.id}</h3>
                      <p>Cliente: {delivery.client_first_name} {delivery.client_last_name || ""}</p>
                      <p>Descripción: {delivery.description}</p>
                      <p>Origen: {delivery.origin}</p>
                      <p>Destino: {delivery.destination}</p>
                      <p>Estimado: ₡{delivery.price_estimate}</p>
                      <button onClick={() => handleAcceptDelivery(delivery.id)} className="primary-button">Aceptar Entrega</button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* SECCIÓN DE VIAJES CON OFERTA DISPONIBLES */}
        <div className="available-deliveries-section">
          <h2>Viajes con Oferta Disponibles (Pool)</h2>
          {!isDriverAvailable ? (
            <p>Activa tu disponibilidad para ver ofertas.</p>
          ) : Object.keys(groupedOfferDeliveries).length === 0 ? (
            <p>No hay viajes con oferta disponibles para tus vehículos en este momento.</p>
          ) : (
            Object.keys(groupedOfferDeliveries).map(vehicleType => (
              <div key={vehicleType} style={{marginBottom: '20px'}}>
                <h3>{formatVehicleType(vehicleType)}</h3>
                <div className="deliveries-grid">
                  {groupedOfferDeliveries[vehicleType].map((delivery) => (
                    <div key={delivery.id} className="delivery-card">
                      <h3>Entrega #{delivery.id} (Oferta)</h3>
                      <p>Cliente: {delivery.client_first_name} {delivery.client_last_name || ""}</p>
                      <p>Descripción: {delivery.description}</p>
                      <p>Origen: {delivery.origin}</p>
                      <p>Destino: {delivery.destination}</p>
                      <p>Oferta del Cliente: ₡{delivery.price_estimate}</p>
                      <button onClick={() => handleAcceptDelivery(delivery.id)} className="primary-button">Aceptar Oferta</button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* SECCIÓN MEJORADA: Entregas Asignadas (en espera de inicio) */}
        <div className="assigned-deliveries-section">
          <h2>Mis Entregas Asignadas ({assignedDeliveries.length})</h2>
          {assignedDeliveries.length === 0 ? (
              <p>No tienes entregas asignadas sin iniciar.</p>
          ) : (
              Object.keys(groupedAssignedDeliveries).map(vehicleType => (
                  <div key={vehicleType} style={{marginBottom: '20px'}}>
                      <h3>{formatVehicleType(vehicleType)}</h3>
                      <div className="deliveries-grid">
                          {groupedAssignedDeliveries[vehicleType].map((delivery) => (
                          <div key={delivery.id} className="delivery-card">
                              <h3>Entrega #{delivery.id} - {delivery.status.toUpperCase()}</h3>
                              <p>Cliente: {delivery.client_first_name} {delivery.client_last_name || ""}</p>
                              <p>Descripción: {delivery.description}</p>
                              <p>Origen: {delivery.origin}</p>
                              <p>Destino: {delivery.destination}</p>
                              <p>Precio Estimado: ₡{delivery.price_estimate}</p>
                              {/* BOTONES DE MAPS */}
                              <div style={{marginTop: '10px', marginBottom: '10px'}}>
                                <button 
                                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${toMapsQuery(delivery.origin)}`, '_blank')} 
                                  className="primary-button small-button" 
                                  style={{marginRight: '5px'}}
                                >
                                  Origen en Maps
                                </button>
                                <button 
                                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${toMapsQuery(delivery.destination)}`, '_blank')} 
                                  className="primary-button small-button"
                                >
                                  Destino en Maps
                                </button>
                              </div>
                              <button onClick={() => handleStartDelivery(delivery.id)} className="primary-button">Iniciar Entrega</button>
                          </div>
                          ))}
                      </div>
                  </div>
              ))
          )}
        </div>

        {/* SECCIÓN: Entregas en Curso */}
        <div className="assigned-deliveries-section">
          <h2>Mis Entregas en Curso ({inProgressDeliveries.length})</h2>
          {inProgressDeliveries.length === 0 ? (
              <p>No tienes entregas en curso.</p>
          ) : (
              Object.keys(groupedInProgressDeliveries).map(vehicleType => (
                  <div key={vehicleType} style={{marginBottom: '20px'}}>
                      <h3>{formatVehicleType(vehicleType)}</h3>
                      <div className="deliveries-grid">
                          {groupedInProgressDeliveries[vehicleType].map((delivery) => (
                          <div key={delivery.id} className="delivery-card">
                              <h3>Entrega #{delivery.id} - {delivery.status.toUpperCase()}</h3>
                              <p>Cliente: {delivery.client_first_name} {delivery.client_last_name || ""}</p>
                              <p>Descripción: {delivery.description}</p>
                              <p>Origen: {delivery.origin}</p>
                              <p>Destino: {delivery.destination}</p>
                              <p>Precio Estimado: ₡{delivery.price_estimate}</p>
                              {/* BOTONES DE MAPS */}
                              <div style={{marginTop: '10px', marginBottom: '10px'}}>
                                <button 
                                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${toMapsQuery(delivery.origin)}`, '_blank')} 
                                  className="primary-button small-button" 
                                  style={{marginRight: '5px'}}
                                >
                                  Origen en Maps
                                </button>
                                <button 
                                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${toMapsQuery(delivery.destination)}`, '_blank')} 
                                  className="primary-button small-button"
                                >
                                  Destino en Maps
                                </button>
                              </div>
                              {/* INPUT PARA EL PIN Y BOTÓN DE COMPLETAR */}
                              <input
                                  type="text"
                                  placeholder="Ingresa PIN de 4 dígitos"
                                  value={pinInput}
                                  onChange={(e) => setPinInput(e.target.value)}
                                  style={{width: 'calc(100% - 20px)', marginTop: '10px'}}
                              />
                              <button onClick={() => handleCompleteDelivery(delivery.id)} className="primary-button">Completar Entrega</button>
                          </div>
                          ))}
                      </div>
                  </div>
              ))
          )}
        </div>

        {/* Mapa para la entrega activa del conductor (solo la primera en curso) */}
        <div className="map-display-section">
          <h2>Mapa de Entrega Activa</h2>
          {inProgressDeliveries.length > 0 ? (
              <MapComponent center={mapCenter} markers={mapMarkers} height="400px" zoom={12} />
          ) : (
              <p>Inicia una entrega para verla en el mapa.</p>
          )}
        </div>
      </>
    )}
  </div>
);
}