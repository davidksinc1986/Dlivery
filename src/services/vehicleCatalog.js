export const VEHICLE_CATALOG = {
  moto: {
    key: "moto",
    title: "Express Moto",
    icon: "🏍️",
    description: "Entregas urgentes de comida, farmacia y paquetes pequeños.",
    maxLoad: "Hasta 10 kg",
    eta: "15-30 min",
  },
  camion_liviano: {
    key: "camion_liviano",
    title: "Vehículo Liviano",
    icon: "🚚",
    description: "Ideal para muebles pequeños, cajas medianas y compras.",
    maxLoad: "Hasta 500 kg",
    eta: "30-60 min",
  },
  camion_pesado: {
    key: "camion_pesado",
    title: "Camión Pesado",
    icon: "🚛",
    description: "Carga robusta para mudanzas, ganado y mercancía pesada.",
    maxLoad: "Más de 500 kg",
    eta: "60-120 min",
  },
};

export const VEHICLE_OPTIONS = Object.values(VEHICLE_CATALOG);
