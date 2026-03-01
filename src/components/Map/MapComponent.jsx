import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css'; // Estilos CSS de Leaflet

// Importar iconos para Leaflet (solución a un problema común de iconos rotos)
import L from 'leaflet';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Configurar iconos por defecto para react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetinaUrl,
  iconUrl: iconUrl,
  shadowUrl: shadowUrl,
});

// Componente para manejar clics en el mapa
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng); // Envía las coordenadas del clic al callback
    },
  });
  return null;
}

export default function MapComponent({ 
  center = [9.93, -84.08], // Centro por defecto (ej. San José, Costa Rica)
  zoom = 13, 
  markers = [], // Array de objetos { position: [lat, lng], popupText: "Texto" }
  onMapClick, // Función callback para cuando se haga clic en el mapa
  height = '300px' // Altura del mapa
}) {
  return (
    <MapContainer 
      center={center} 
      zoom={zoom} 
      scrollWheelZoom={true} 
      style={{ height: height, width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {markers.map((marker, index) => (
        <Marker key={index} position={marker.position}>
          {marker.popupText && <Popup>{marker.popupText}</Popup>}
        </Marker>
      ))}
      {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
    </MapContainer>
  );
}