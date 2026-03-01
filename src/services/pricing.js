// src/services/pricing.js

export function calculatePrice(serviceType, distanceKm, isExpress) {
  let base = 0;
  let perKm = 0;

  switch (serviceType) {
    case "moto":
      base = 1000;
      perKm = 300;
      break;

    case "camion_liviano":
      base = 5000;
      perKm = 1200;
      break;

    case "camion_pesado":
      base = 15000;
      perKm = 2500;
      break;

    default:
      return null;
  }

  const subtotal = base + perKm * distanceKm;
  const extra = isExpress ? subtotal * 0.2 : 0;
  const total = subtotal + extra;

  return {
    subtotal,
    extra,
    total
  };
}