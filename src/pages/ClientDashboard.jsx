// src/pages/ClientDashboard.jsx

import { useState, useEffect, useRef } from "react";
import ServiceCard from "../components/ServiceCard";
import { useAppContext } from "../context/AppContext";
import { calculatePrice } from "../services/pricing";
import MapComponent from "../components/Map/MapComponent";
import { io } from "socket.io-client";
import { formatVehicleType, groupDeliveriesByVehicleType } from "../utils/deliveryUtils";
import UserProfile from "../components/UserProfile"; // Importa el nuevo componente

const SOCKET_SERVER_URL = "http://localhost:3001";

export default function ClientDashboard() {
const {
  serviceType, setServiceType, distance, setDistance, priceData, setPriceData,
  offer, setOffer, deliveries, logout, user, createDelivery, fetchDeliveries, token
} = useAppContext();

// Estados para el formulario de creación de entrega
const [deliveryDescription, setDeliveryDescription] = useState("");
const [deliveryOrigin, setDeliveryOrigin] = useState("");
const [deliveryDestination, setDeliveryDestination] = useState("");
const [originCoords, setOriginCoords] = useState(null);
const [destinationCoords, setDestinationCoords] = useState(null);
const [deliveryError, setDeliveryError] = useState("");
const [isCreatingDelivery, setIsCreatingDelivery] = useState(false);

// Estados para el mapa de selección de origen/destino
const [mapMarkers, setMapMarkers] = useState([]);
const [mapInitialCenter, setMapInitialCenter] = useState([9.93, -84.08]); // Centro por defecto (San José, Costa Rica)

// Estados para el tracking de una entrega en curso
const socketRef = useRef(null);
const [trackingLocation, setTrackingLocation] = useState(null);
const [deliveryBeingTracked, setDeliveryBeingTracked] = useState(null); 
const [trackingError, setTrackingError] = useState("");

const [showProfile, setShowProfile] = useState(false); // Estado para mostrar/ocultar perfil

// Efecto para obtener la ubicación del usuario al cargar el componente y centrar el mapa
useEffect(() => {
  if (navigator.geolocation) {
    console.log("Intentando obtener ubicación del usuario para centrar el mapa...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setMapInitialCenter([latitude, longitude]);
        console.log(`Ubicación del usuario obtenida para mapa inicial: ${latitude}, ${longitude}`);
      },
      (error) => {
        console.warn("No se pudo obtener la ubicación del usuario para centrar el mapa. Razón:", error.code, error.message);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  } else {
    console.warn("Geolocalización no soportada por el navegador para centrar el mapa.");
  }
}, []);

// Efecto para inicializar Socket.IO y unirse a la sala de tracking si una entrega se está trackeando
useEffect(() => {
  if (deliveryBeingTracked && token) {
    if (!socketRef.current) {
      socketRef.current = io(SOCKET_SERVER_URL);

      socketRef.current.on("connect", () => {
        console.log("Cliente conectado a WebSocket para tracking:", socketRef.current.id);
        socketRef.current.emit("join_delivery_room", { 
          token: token, 
          delivery_id: deliveryBeingTracked.id 
        });
      });

      socketRef.current.on("update_location", (locationData) => {
        console.log("Cliente recibió actualización de ubicación:", locationData);
        setTrackingLocation(locationData);
      });

      socketRef.current.on("room_error", (error) => {
        console.error("Error del cliente al unirse a la sala de tracking:", error.message);
        setTrackingError(`Error de tracking: ${error.message}`);
      });

      socketRef.current.on("disconnect", () => {
        console.log("Cliente desconectado de WebSocket para tracking.");
        setTrackingLocation(null);
      });
    }
  } else {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setTrackingLocation(null);
  }

  return () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };
}, [deliveryBeingTracked, token, user]);

// LÓGICA DE SELECCIÓN INTUITIVA DE MAPA
const handleMapClick = (latlng) => {
  const newMarkers = [];
  let newOriginCoords = originCoords;
  let newDestinationCoords = destinationCoords;

  if (!originCoords) {
    newOriginCoords = latlng;
    setDeliveryOrigin(`Lat: ${latlng.lat.toFixed(4)}, Lng: ${latlng.lng.toFixed(4)}`);
    newMarkers.push({ position: latlng, popupText: "Origen" });
    alert("Origen seleccionado. Ahora, haz clic para seleccionar el destino.");
  } else if (!destinationCoords) {
    newDestinationCoords = latlng;
    setDeliveryDestination(`Lat: ${latlng.lat.toFixed(4)}, Lng: ${latlng.lng.toFixed(4)}`);
    newMarkers.push({ position: originCoords, popupText: "Origen" });
    newMarkers.push({ position: latlng, popupText: "Destino" });
    alert("Destino seleccionado. Puedes recalcular el precio.");
  } else {
    newOriginCoords = null;
    newDestinationCoords = null;
    setDeliveryOrigin("");
    setDeliveryDestination("");
    alert("Origen y Destino reseteados. Haz clic para seleccionar un nuevo Origen.");
  }
  setOriginCoords(newOriginCoords);
  setDestinationCoords(newDestinationCoords);
  setMapMarkers(newMarkers);
  setPriceData(null);
  setOffer("");
};

// Función para resetear origen/destino
const resetMapSelection = () => {
  setOriginCoords(null);
  setDestinationCoords(null);
  setDeliveryOrigin("");
  setDeliveryDestination("");
  setMapMarkers([]);
  setPriceData(null);
  setOffer("");
  alert("Selección de Origen y Destino limpiada.");
};

// Calcular el precio estimado del viaje
const handleCalculate = () => {
  if (!serviceType || !originCoords || !destinationCoords) {
    alert("Por favor, selecciona un servicio y marca el origen y destino en el mapa.");
    return;
  }
  
  const lat1 = originCoords.lat;
  const lon1 = originCoords.lng;
  const lat2 = destinationCoords.lat;
  const lon2 = destinationCoords.lng;

  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const simulatedDistanceKm = Math.ceil(R * c); // Redondea al siguiente entero

  setDistance(simulatedDistanceKm); 

  const result = calculatePrice(serviceType, simulatedDistanceKm, true); 
  setPriceData(result);
  setOffer(result.total); 
};

// Manejar la creación de la entrega
const handleCreateDelivery = async () => {
  setDeliveryError(""); 

  if (!deliveryDescription || !originCoords || !destinationCoords || !serviceType || !priceData?.total) {
    setDeliveryError("Por favor, completa la descripción, marca origen/destino y calcula el precio.");
    return;
  }

  const deliveryTypeStatus = getTripStatus(); 
  let deliveryServiceId;
  let actualPriceToSend;

  if (deliveryTypeStatus === "POOL DE OFERTAS") {
    deliveryServiceId = 2; 
    actualPriceToSend = Number(offer); 
  } else {
    deliveryServiceId = 1; 
    actualPriceToSend = priceData.total; 
  }
  
  setIsCreatingDelivery(true);
  try {
    await createDelivery({ 
      service_id: deliveryServiceId, 
      description: deliveryDescription,
      origin: `Lat: ${originCoords.lat.toFixed(4)}, Lng: ${originCoords.lng.toFixed(4)}`,
      destination: `Lat: ${destinationCoords.lat.toFixed(4)}, Lng: ${destinationCoords.lng.toFixed(4)}`,
      price_estimate: actualPriceToSend, 
      vehicle_requested_type: serviceType, // Enviamos el tipo de vehículo solicitado
    });
    alert("¡Entrega creada con éxito!");
    fetchDeliveries(); // Recargar la lista completa después de crear
    
    // Limpiar el formulario
    setDeliveryDescription("");
    setDeliveryOrigin("");
    setDeliveryDestination("");
    setOriginCoords(null);
    setDestinationCoords(null);
    setMapMarkers([]);
    setServiceType(null);
    setDistance(0);
    setPriceData(null);
    setOffer("");
  } catch (error) {
    setDeliveryError(error.message || "No se pudo crear la entrega.");
  } finally {
    setIsCreatingDelivery(false);
  }
};

// Determinar si es "VIAJE DIRECTO" o "POOL DE OFERTAS"
const getTripStatus = () => {
  if (!priceData) return "";

  if (offer === "" || Number(offer) === priceData.total) {
    return "VIAJE DIRECTO";
  }
  if (Number(offer) < priceData.total) {
    return "POOL DE OFERTAS";
  }
  return "VIAJE DIRECTO"; 
};

// Lógica para el mapa de tracking del cliente
const trackingMapMarkers = [];
let trackingMapCenter = [9.93, -84.08];

if (deliveryBeingTracked) {
    const originParts = deliveryBeingTracked.origin.split(', ').map(Number);
    const destinationParts = deliveryBeingTracked.destination.split(', ').map(Number);

    if (originParts.length === 2 && !isNaN(originParts[0]) && !isNaN(originParts[1])) {
        trackingMapMarkers.push({ position: [originParts[0], originParts[1]], popupText: `Origen: ${deliveryBeingTracked.description}` });
        trackingMapCenter = [originParts[0], originParts[1]];
    }
    if (destinationParts.length === 2 && !isNaN(destinationParts[0]) && !isNaN(destinationParts[1])) {
        trackingMapMarkers.push({ position: [destinationParts[0], destinationParts[1]], popupText: `Destino: ${deliveryBeingTracked.description}` });
    }

    if (trackingLocation && trackingLocation.latitude && trackingLocation.longitude) {
        trackingMapMarkers.push({ 
            position: [trackingLocation.latitude, trackingLocation.longitude], 
            popupText: `Conductor ID: ${trackingLocation.driver_id}`,
        });
        trackingMapCenter = [trackingLocation.latitude, trackingLocation.longitude];
    }
}

// Agrupar las entregas del cliente por tipo de vehículo
const groupedClientDeliveries = groupDeliveriesByVehicleType(deliveries);

return (
  <div className="container">
    <header className="app-header">
      <h1>Sistema de Entregas (Cliente)</h1>
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
        {/* Sección de Tracking en Vivo si hay una entrega trackeada */}
        {deliveryBeingTracked && (
          <div className="tracking-section">
            <h2>Tracking de Entrega #{deliveryBeingTracked.id}</h2>
            <p>Estado: {deliveryBeingTracked.status.toUpperCase()}</p>
            {trackingError && <p className="error-message">{trackingError}</p>}
            {trackingLocation && (
                <p>Última ubicación del conductor: {trackingLocation.latitude.toFixed(4)}, {trackingLocation.longitude.toFixed(4)}</p>
            )}
            <MapComponent center={trackingMapCenter} markers={trackingMapMarkers} height="400px" zoom={13} />
            <button onClick={() => setDeliveryBeingTracked(null)} className="primary-button back-to-deliveries-button">Volver a Mis Entregas</button>
          </div>
        )}

        {/* Formulario para crear una entrega (solo si NO se está trackeando una entrega) */}
        {!deliveryBeingTracked && (
          <div className="create-delivery-section">
            <h2>Crear Nueva Entrega</h2>
            <div className="form-group">
                <label htmlFor="deliveryDescription">Descripción:</label>
                <input
                    id="deliveryDescription"
                    type="text"
                    value={deliveryDescription}
                    onChange={(e) => setDeliveryDescription(e.target.value)}
                    placeholder="Describe lo que vas a enviar"
                    required 
                />
            </div>
            
            {/* Controles y mapa para selección de origen/destino */}
            <div className="map-selection-section">
                <h3>Selecciona Origen y Destino en el Mapa</h3>
                {/* Botón de Reset */}
                {(originCoords || destinationCoords) && (
                  <button onClick={resetMapSelection} className="primary-button small-button" style={{marginBottom: '10px', backgroundColor: '#dc3545'}}>
                      Limpiar Selección de Mapa
                  </button>
                )}
                {originCoords && <p>Origen: {originCoords.lat.toFixed(4)}, {originCoords.lng.toFixed(4)}</p>}
                {destinationCoords && <p>Destino: {destinationCoords.lat.toFixed(4)}, {destinationCoords.lng.toFixed(4)}</p>}
                
                <MapComponent center={mapInitialCenter} onMapClick={handleMapClick} markers={mapMarkers} height="400px" />
            </div>

            <h2>Seleccione Servicio</h2>
            <div className="services">
              <ServiceCard title="Express Moto" type="moto" />
              <ServiceCard title="Camión Liviano" type="camion_liviano" />
              <ServiceCard title="Camión Pesado" type="camion_pesado" />
            </div>

            {serviceType && ( 
              <div className="input-section">
                <h2>Distancia Calculada (KM): {distance.toFixed(2)}</h2>
                <button onClick={handleCalculate} className="primary-button">Calcular Precio</button>
              </div>
            )}

            {priceData && ( 
              <div className="price-offer-section">
                <h2>Precio Sugerido: ₡{priceData.total}</h2>

                <h3>Oferta del Cliente</h3>
                <input
                  type="number"
                  value={offer} 
                  onChange={(e) => setOffer(e.target.value)}
                  placeholder="¿Cuánto quieres ofrecer?"
                />

                <p className="trip-status">{getTripStatus()}</p>
                
                {deliveryError && <p className="error-message">{deliveryError}</p>}
                <button 
                    onClick={handleCreateDelivery} 
                    className="primary-button" 
                    disabled={isCreatingDelivery || !priceData?.total} 
                >
                    {isCreatingDelivery ? "Creando..." : (offer === "" || Number(offer) === priceData.total) ? "Pedir Ahora (Precio Sugerido)" : "Hacer Pedido (Mi Oferta)"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Listado de entregas del usuario, agrupadas por tipo de vehículo */}
        <div className="delivery-list-section">
          <h2>Mis Entregas ({deliveries.length})</h2>
          {deliveries.length === 0 ? (
            <p>No tienes entregas registradas aún.</p>
          ) : (
            Object.keys(groupedClientDeliveries).map(vehicleType => (
              <div key={vehicleType} style={{marginBottom: '20px'}}>
                <h3>{formatVehicleType(vehicleType)}</h3>
                <div className="deliveries-grid">
                  {groupedClientDeliveries[vehicleType].map((delivery) => (
                    <div key={delivery.id} className="delivery-card">
                      <h3>Entrega #{delivery.id} - {delivery.status.toUpperCase()}</h3>
                      {delivery.status === 'pending' || delivery.status === 'assigned' || delivery.status === 'in_progress' ? (
                        <p style={{fontWeight: 'bold', color: 'green'}}>PIN de Confirmación: {delivery.confirmation_pin}</p>
                      ) : null}
                      <p>Descripción: {delivery.description}</p>
                      <p>Origen: {delivery.origin}</p>
                      <p>Destino: {delivery.destination}</p>
                      <p>Precio Estimado: ₡{delivery.price_estimate}</p>
                      <p>Estado de Pago: {delivery.payment_status}</p>
                      <p>Tipo de Servicio: {delivery.service_id === 1 ? 'Directo' : 'Pool de Ofertas'}</p>
                      <p>Vehículo Solicitado: {delivery.vehicle_requested_type ? formatVehicleType(delivery.vehicle_requested_type) : 'N/A'}</p>
                      
                      {/* Botón de Tracking Condicional */}
                      {(delivery.status === 'assigned' || delivery.status === 'in_progress') && (
                          <button 
                              onClick={() => setDeliveryBeingTracked(delivery)} 
                              className="primary-button small-button" 
                              style={{marginTop: '10px'}}
                          >
                              Ver Tracking
                          </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </>
    )}
  </div>
);
}