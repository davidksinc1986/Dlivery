// backend/src/controllers/driverController.js

const pool = require("../db");
const jwt = require("jsonwebtoken");
const { TEST_BYPASS_EMAILS } = require("../bootstrapDb");

// Función para que un usuario se convierta en conductor (cambia su rol)
exports.becomeDriver = async (req, res) => {
try {
  const user_id = req.user.id;

  const result = await pool.query(
    "UPDATE users SET role = 'driver' WHERE id = $1 RETURNING id, first_name, last_name, email, role",
    [user_id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Usuario no encontrado." });
  }

  res.status(200).json({ 
    message: "Usuario actualizado a rol de conductor.",
    user: result.rows[0] 
  });

} catch (err) {
  console.error("Error al actualizar rol a conductor:", err.message);
  res.status(500).json({ error: "Error interno del servidor al actualizar rol." });
}
};

// Función para que un conductor actualice su disponibilidad (online/offline)
exports.updateAvailability = async (req, res) => {
try {
  const driver_id = req.user.id;
  const { is_available, latitude, longitude } = req.body; 

  const userCheck = await pool.query("SELECT role FROM users WHERE id = $1", [driver_id]);
  if (userCheck.rows.length === 0 || userCheck.rows[0].role !== 'driver') {
    return res.status(403).json({ error: "Solo los conductores pueden actualizar su disponibilidad." });
  }

  let updateFields = ["is_available = $1"];
  let params = [is_available];
  let paramCounter = 2;
  updateFields.push(`online_since = CASE WHEN $1 = TRUE THEN COALESCE(online_since, NOW()) ELSE NULL END`);

  if (is_available && latitude && longitude) {
      updateFields.push(`last_known_location = ST_SetSRID(ST_MakePoint($${paramCounter}, $${paramCounter + 1}), 4326)`);
      params.push(longitude, latitude);
      paramCounter += 2;
  } else {
      updateFields.push(`last_known_location = NULL`);
  }
  
  params.push(driver_id); 
  let query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCounter} RETURNING id, first_name, last_name, email, role, is_available, vehicle_types, ST_AsText(last_known_location) as last_known_location_wkt`;
  
  const result = await pool.query(query, params);

  res.status(200).json({ 
    message: "Disponibilidad de conductor actualizada.",
    user: result.rows[0] 
  });

} catch (err) {
  console.error("Error al actualizar disponibilidad:", err.message);
  res.status(500).json({ error: "Error interno del servidor al actualizar disponibilidad." });
}
};

// Función para que un conductor vea los viajes disponibles (el "pool de ofertas")
exports.getAvailableDeliveries = async (req, res) => {
try {
  const driver_id = req.user.id;
  const RADIUS_KM = 3; // Radio de sectorización en kilómetros (ej: 3km)

  const driverStatusResult = await pool.query(
    "SELECT role, is_available, vehicle_types, ST_AsText(last_known_location) as last_known_location_wkt FROM users WHERE id = $1", 
    [driver_id]
  );

  if (driverStatusResult.rows.length === 0 || driverStatusResult.rows[0].role !== 'driver' || !driverStatusResult.rows[0].is_available) {
    return res.status(403).json({ error: "Solo los conductores disponibles pueden ver el pool de ofertas." });
  }
  
  const driverLocationWKT = driverStatusResult.rows[0].last_known_location_wkt;
  
  let query = `
    SELECT d.*, u.first_name as client_first_name, u.last_name as client_last_name, u.email as client_email, u.profile_picture_url as client_profile_picture, u.rating as client_rating, s.name as service_name
  `;
  let queryParams = [];
  let paramCounter = 1;

  // Si el conductor tiene una ubicación registrada, añadimos el cálculo de distancia al SELECT
  if (driverLocationWKT) {
      query += `, ST_Distance(d.origin_location, ST_GeomFromText($${paramCounter}, 4326)::geography) / 1000 AS distance_from_driver_km`;
      queryParams.push(driverLocationWKT);
      paramCounter++;
  } else {
      query += `, NULL as distance_from_driver_km`; 
  }

  query += `
    FROM deliveries d 
    JOIN users u ON d.user_id = u.id
    JOIN services s ON d.service_id = s.id 
    WHERE d.driver_id IS NULL AND d.status = 'pending'
  `;
  
  // Añadir el filtro de distancia si el conductor tiene ubicación
  if (driverLocationWKT) {
      query += ` AND ST_DWithin(d.origin_location, ST_GeomFromText($${paramCounter}, 4326)::geography, $${paramCounter + 1} * 1000)`; // $1 * 1000 para metros
      queryParams.push(driverLocationWKT, RADIUS_KM);
      paramCounter += 2;
  }
  
  query += ` ORDER BY distance_from_driver_km ASC, d.created_at ASC`; 

  const result = await pool.query(query, queryParams);

  res.status(200).json(result.rows);

} catch (err) {
  console.error("Error al obtener entregas disponibles:", err.message);
  res.status(500).json({ error: "Error interno del servidor al obtener el pool de ofertas." });
}
};

// Función para que un conductor acepte un viaje del pool
exports.acceptDelivery = async (req, res) => {
try {
  const driver_id = req.user.id;
  const { delivery_id } = req.params;

  const driverStatus = await pool.query("SELECT role FROM users WHERE id = $1", [driver_id]);
  if (driverStatus.rows.length === 0 || driverStatus.rows[0].role !== 'driver') {
    return res.status(403).json({ error: "Solo los conductores pueden aceptar ofertas." });
  }

  const result = await pool.query(
    `UPDATE deliveries SET driver_id = $1, assigned_at = NOW(), status = 'assigned' 
     WHERE id = $2 AND driver_id IS NULL AND status = 'pending' RETURNING *`,
    [driver_id, delivery_id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Entrega no encontrada o ya asignada." });
  }

  res.status(200).json({ 
    message: "Entrega aceptada exitosamente.",
    delivery: result.rows[0] 
  });

} catch (err) {
  console.error("Error al aceptar entrega:", err.message);
  res.status(500).json({ error: "Error interno del servidor al aceptar entrega." });
}
};

// Función para iniciar una entrega (conductor)
exports.startDelivery = async (req, res) => {
try {
  const driver_id = req.user.id;
  const { delivery_id } = req.params;

  const result = await pool.query(
    `UPDATE deliveries SET status = 'in_progress' 
     WHERE id = $1 AND driver_id = $2 AND status = 'assigned' RETURNING *`,
    [delivery_id, driver_id]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Entrega no encontrada o no asignada a este conductor, o ya en progreso." });
  }

  res.status(200).json({
    message: "Entrega iniciada. Actualizaciones de ubicación activadas.",
    delivery: result.rows[0]
  });

} catch (err) {
  console.error("Error al iniciar entrega:", err.message);
  res.status(500).json({ error: "Error interno del servidor al iniciar entrega." });
}
};

// Función para completar una entrega (conductor)
exports.completeDelivery = async (req, res) => {
try {
  const driver_id = req.user.id;
  const { delivery_id } = req.params;
  const { pin } = req.body;

  const deliveryResult = await pool.query(
      "SELECT * FROM deliveries WHERE id = $1 AND driver_id = $2 AND status = 'in_progress'",
      [delivery_id, driver_id]
  );

  if (deliveryResult.rows.length === 0) {
    return res.status(404).json({ error: "Entrega no encontrada o no en progreso con este conductor." });
  }

  const delivery = deliveryResult.rows[0];

  if (!pin || delivery.confirmation_pin !== pin) {
      return res.status(400).json({ error: "PIN de confirmación incorrecto." });
  }

  const paymentResult = await pool.query(
    `SELECT p.*, u.email as client_email
     FROM payments p
     JOIN users u ON u.id = p.user_id
     WHERE p.delivery_id = $1
     ORDER BY p.id DESC LIMIT 1`,
    [delivery_id]
  );

  if (!paymentResult.rows.length) {
    return res.status(400).json({ error: "No existe hold de pago para esta entrega." });
  }

  const payment = paymentResult.rows[0];
  const bypass = TEST_BYPASS_EMAILS.includes(payment.client_email) || TEST_BYPASS_EMAILS.includes(req.user.email);

  if (!bypass) {
    if (payment.status === 'hold_released') {
      return res.status(400).json({ error: "El hold expiró (24h). Debes reautorizar el pago antes de completar." });
    }

    if (payment.status !== 'authorization_hold') {
      return res.status(400).json({ error: "El pago no está en estado de hold válido para captura." });
    }

    if (payment.hold_expires_at && new Date(payment.hold_expires_at) <= new Date()) {
      await pool.query("UPDATE payments SET status = 'hold_released' WHERE id = $1", [payment.id]);
      return res.status(400).json({ error: "El hold de pago expiró. No se capturó el cobro." });
    }

    await pool.query("UPDATE payments SET status = 'captured' WHERE id = $1", [payment.id]);
    await pool.query("UPDATE deliveries SET payment_status = 'captured' WHERE id = $1", [delivery_id]);
  } else {
    await pool.query("UPDATE payments SET status = 'test_bypass' WHERE id = $1", [payment.id]);
    await pool.query("UPDATE deliveries SET payment_status = 'test_bypass' WHERE id = $1", [delivery_id]);
  }

  const result = await pool.query(
    `UPDATE deliveries SET status = 'completed'
     WHERE id = $1 RETURNING *`,
    [delivery_id]
  );

  res.status(200).json({
    message: bypass
      ? "Entrega de prueba completada (modo bypass)."
      : "Entrega completada y pago capturado. Liquidación al conductor queda pendiente para el lunes siguiente.",
    delivery: result.rows[0],
    payment_processed: true
  });

} catch (err) {
  console.error("Error al completar entrega:", err.message);
  res.status(500).json({ error: "Error interno del servidor al completar entrega." });
}
};


// Notificaciones para conductor (viajes directos asignados por score)
exports.getNotifications = async (req, res) => {
try {
  const driver_id = req.user.id;
  const result = await pool.query(
    `SELECT id, delivery_id, title, message, is_read, created_at
     FROM driver_notifications
     WHERE driver_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [driver_id]
  );
  res.status(200).json(result.rows);
} catch (err) {
  console.error("Error al obtener notificaciones del conductor:", err.message);
  res.status(500).json({ error: "No se pudieron cargar notificaciones." });
}
};

// Obtener todas las entregas asignadas o en curso para el conductor actual
exports.getMyDeliveries = async (req, res) => {
try {
  const driver_id = req.user.id;

  const result = await pool.query(
    `SELECT d.*, u.first_name as client_first_name, u.last_name as client_last_name, u.email as client_email, u.profile_picture_url as client_profile_picture, u.rating as client_rating, s.name as service_name
     FROM deliveries d
     JOIN users u ON d.user_id = u.id
     JOIN services s ON d.service_id = s.id
     WHERE d.driver_id = $1 AND (d.status = 'assigned' OR d.status = 'in_progress')
     ORDER BY d.created_at DESC`,
    [driver_id]
  );

  res.status(200).json(result.rows);
} catch (err) {
  console.error("Error al obtener las entregas de mi conductor:", err.message);
  res.status(500).json({ error: "Error interno del servidor al obtener tus entregas." });
}
};