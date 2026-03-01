// Función auxiliar para formatear el tipo de vehículo
export const formatVehicleType = (type) => {
  if (!type) return 'N/A';
  return type.replace('_', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

// Función para agrupar entregas por tipo de vehículo solicitado
export const groupDeliveriesByVehicleType = (deliveries) => {
  const grouped = {};
  deliveries.forEach(delivery => {
    const type = delivery.vehicle_requested_type || 'unspecified'; // Si no tiene tipo, lo agrupamos como 'unspecified'
    if (!grouped[type]) {
      grouped[type] = [];
    }
    grouped[type].push(delivery);
  });
  return grouped;
};