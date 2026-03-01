// backend/src/controllers/deliveryController.js

const pool = require("../db");

// Función para generar un PIN aleatorio de 4 dígitos
const generatePin = () => Math.floor(1000 + Math.random() * 9000).toString();

// Función para crear una nueva entrega
exports.createDelivery = async (req, res) => {
try {
  const user_id = req.user.id; 
  const { service_id, description, origin, destination, price_estimate, vehicle_requested_type, status } = req.body;

  // Validar que no falten datos esenciales
  if (!service_id || !description || !origin || !destination || !price_estimate || !vehicle_requested_type) {
    return res.status(400).json({ error: "Faltan campos obligatorios para la entrega." });
  }

  const confirmation_pin = generatePin();

  // Parsear las coordenadas de origen para PostGIS
  const originCoords = origin.match(/Lat: ([-+]?\d+\.\d+), Lng: ([-+]?\d+\.\d+)/);
  if (!originCoords || originCoords.length !== 3) {
      return res.status(400).json({ error: "Formato de origen inválido. Debe ser 'Lat: X.XXXX, Lng: Y.YYYY'." });
  }
  const originLat = parseFloat(originCoords[1]);
  const originLng = parseFloat(originCoords[2]);

  // Insertar la nueva entrega en la tabla 'deliveries'
  const result = await pool.query(
    `INSERT INTO deliveries(user_id, service_id, description, origin, destination, price_estimate, vehicle_requested_type, status, created_at, origin_location, confirmation_pin) 
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, NOW(), ST_SetSRID(ST_MakePoint($9, $10), 4326), $11) RETURNING *`, 
    [user_id, service_id, description, origin, destination, price_estimate, vehicle_requested_type, status || 'pending', originLng, originLat, confirmation_pin]
  );

  res.status(201).json({ 
    message: "Entrega creada exitosamente.",
    delivery: result.rows[0] 
  });

} catch (err) {
  console.error("Error al crear la entrega:", err.message);
  res.status(500).json({ error: "Error interno del servidor al crear la entrega." });
}
};

// Función para obtener todas las entregas de un usuario autenticado
exports.getUserDeliveries = async (req, res) => {
try {
  const user_id = req.user.id; 

  const result = await pool.query(
    `SELECT d.*, s.name as service_name 
     FROM deliveries d 
     JOIN services s ON d.service_id = s.id
     WHERE user_id = $1 
     ORDER BY created_at DESC`,
    [user_id]
  );

  res.status(200).json(result.rows);
} catch (err) {
  console.error("Error al obtener entregas del usuario:", err.message);
  res.status(500).json({ error: "Error interno del servidor al obtener entregas." });
}
};