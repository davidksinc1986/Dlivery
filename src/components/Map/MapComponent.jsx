import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetinaUrl,
  iconUrl: iconUrl,
  shadowUrl: shadowUrl,
});

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng);
    },
  });
  return null;
}

export default function MapComponent({
  center = [9.93, -84.08],
  zoom = 13,
  markers = [],
  circles = [],
  polylines = [],
  onMapClick,
  height = '300px'
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
      {circles.map((circle, index) => (
        <Circle
          key={`circle-${index}`}
          center={circle.center}
          radius={circle.radius || 3000}
          pathOptions={{ color: circle.color || '#2a9d8f', fillOpacity: circle.fillOpacity ?? 0.2 }}
        >
          {circle.popupText && <Popup>{circle.popupText}</Popup>}
        </Circle>
      ))}
      {polylines.map((line, index) => (
        <Polyline
          key={`polyline-${index}`}
          positions={line.positions}
          pathOptions={{ color: line.color || '#264653', weight: line.weight || 4 }}
        >
          {line.popupText && <Popup>{line.popupText}</Popup>}
        </Polyline>
      ))}
      {onMapClick && <MapClickHandler onMapClick={onMapClick} />}
    </MapContainer>
  );
}
