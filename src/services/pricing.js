const FALLBACK_PRICING_RULES = {
  moto: { first_km_price: 1200, per_km_price: 320 },
  camion_liviano: { first_km_price: 5500, per_km_price: 1300 },
  camion_pesado: { first_km_price: 16000, per_km_price: 2600 },
};

export function calculatePrice(serviceType, distanceKm, commissionPercent = 20, pricingRules = FALLBACK_PRICING_RULES) {
  const rule = pricingRules[serviceType];
  if (!rule || distanceKm <= 0) return null;

  const firstKmPrice = Number(rule.first_km_price);
  const perKmPrice = Number(rule.per_km_price);
  const extraDistance = Math.max(0, distanceKm - 1);
  const subtotal = firstKmPrice + extraDistance * perKmPrice;
  const serviceFee = subtotal * (Number(commissionPercent) / 100);

  return {
    subtotal: Math.round(subtotal),
    expressFee: 0,
    serviceFee: Math.round(serviceFee),
    total: Math.round(subtotal + serviceFee),
  };
}
