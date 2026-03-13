const pool = require("../db");
const { TEST_BYPASS_EMAILS } = require("../bootstrapDb");

const generatePin = () => Math.floor(1000 + Math.random() * 9000).toString();

const getNextMonday = () => {
  const now = new Date();
  const day = now.getDay();
  const daysUntilMonday = ((8 - day) % 7) || 7;
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  return nextMonday;
};

const findBestDriver = async (client, originLng, originLat, vehicleType) => {
  const result = await client.query(
    `SELECT id,
            COALESCE(rating, 5) as rating,
            EXTRACT(EPOCH FROM (NOW() - COALESCE(online_since, NOW()))) / 60 AS waiting_minutes,
            ST_Distance(last_known_location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000 AS distance_km
     FROM users
     WHERE role='driver'
       AND is_available = TRUE
       AND last_known_location IS NOT NULL
       AND ($3 = ANY(vehicle_types))
     ORDER BY
        (COALESCE(rating,5)/5.0)*0.45 +
        LEAST((EXTRACT(EPOCH FROM (NOW() - COALESCE(online_since, NOW()))) / 60) / 60.0,1)*0.35 +
        GREATEST(0, 1 - ((ST_Distance(last_known_location::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) / 1000) / 10.0))*0.20 DESC,
        COALESCE(rating,5) DESC
     LIMIT 1`,
    [originLng, originLat, vehicleType]
  );
  return result.rows[0] || null;
};

exports.createDelivery = async (req, res) => {
  try {
    const user_id = req.user.id;
    const userEmail = req.user.email;
    const isBypassUser = TEST_BYPASS_EMAILS.includes(userEmail);

    const {
      service_id,
      description,
      origin,
      destination,
      price_estimate,
      vehicle_requested_type,
      status,
      scheduled_for,
      request_mode,
    } = req.body;

    if (!service_id || !description || !origin || !destination || !price_estimate || !vehicle_requested_type) {
      return res.status(400).json({ error: "Faltan campos obligatorios para la entrega." });
    }

    const confirmation_pin = generatePin();
    const originCoords = origin.match(/Lat: ([-+]?\d+\.\d+), Lng: ([-+]?\d+\.\d+)/);
    if (!originCoords || originCoords.length !== 3) {
      return res.status(400).json({ error: "Formato de origen inválido. Debe ser 'Lat: X.XXXX, Lng: Y.YYYY'." });
    }

    const originLat = parseFloat(originCoords[1]);
    const originLng = parseFloat(originCoords[2]);
    const isScheduled = Boolean(scheduled_for);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const deliveryResult = await client.query(
        `INSERT INTO deliveries(user_id, service_id, description, origin, destination, price_estimate, vehicle_requested_type, status, created_at, origin_location, confirmation_pin, payment_status, scheduled_for, request_mode)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, NOW(), ST_SetSRID(ST_MakePoint($9, $10), 4326), $11, $12, $13, $14)
         RETURNING *`,
        [
          user_id,
          service_id,
          description,
          origin,
          destination,
          price_estimate,
          vehicle_requested_type,
          isScheduled ? "scheduled" : (status || "pending"),
          originLng,
          originLat,
          confirmation_pin,
          isBypassUser ? "test_bypass" : "authorized_hold",
          scheduled_for || null,
          request_mode || (isScheduled ? "scheduled" : "instant"),
        ]
      );

      const delivery = deliveryResult.rows[0];
      const commissionResult = await client.query("SELECT value FROM app_settings WHERE key = 'app_commission_percent'");
      const commissionPercent = Number(commissionResult.rows[0]?.value || 20);
      const platformFee = Number(price_estimate) * (commissionPercent / 100);
      const driverEarning = Number(price_estimate) - platformFee;
      const payoutDueDate = getNextMonday();
      const holdExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await client.query(
        `INSERT INTO payments(delivery_id, user_id, amount, platform_fee, driver_earning, transaction_id, status, payout_due_date, hold_expires_at)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          delivery.id,
          user_id,
          Number(price_estimate),
          platformFee,
          driverEarning,
          `txn_hold_${delivery.id}_${Date.now()}`,
          isBypassUser ? "test_bypass" : "authorization_hold",
          payoutDueDate,
          isBypassUser ? null : holdExpiresAt,
        ]
      );

      if (!isScheduled && Number(service_id) === 1) {
        const bestDriver = await findBestDriver(client, originLng, originLat, vehicle_requested_type);
        if (bestDriver) {
          await client.query(
            `UPDATE deliveries SET driver_id = $1, assigned_at = NOW(), status = 'assigned' WHERE id = $2`,
            [bestDriver.id, delivery.id]
          );

          await client.query(
            `INSERT INTO driver_notifications(driver_id, delivery_id, title, message)
             VALUES($1, $2, 'Nuevo viaje directo asignado', $3)`,
            [bestDriver.id, delivery.id, `Te asignamos la entrega #${delivery.id} por score de prioridad (rating + espera + cercanía).`]
          );
        }
      }

      await client.query("COMMIT");
      return res.status(201).json({
        message: isBypassUser
          ? "Entrega creada en modo prueba (sin reglas de hold/captura)."
          : "Entrega creada con hold de pago. Se captura al completar; expira en 24h si no finaliza.",
        delivery,
        hold_expires_at: isBypassUser ? null : holdExpiresAt,
        payout_due_date: payoutDueDate,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error al crear la entrega:", err.message);
    res.status(500).json({ error: "Error interno del servidor al crear entrega y hold de pago." });
  }
};

exports.getUserDeliveries = async (req, res) => {
  try {
    const user_id = req.user.id;

    const result = await pool.query(
      `SELECT d.*, s.name as service_name,
              du.first_name as driver_first_name,
              du.last_name as driver_last_name,
              du.profile_picture_url as driver_profile_picture,
              du.rating as driver_rating
       FROM deliveries d
       JOIN services s ON d.service_id = s.id
       LEFT JOIN users du ON du.id = d.driver_id
       WHERE d.user_id = $1
       ORDER BY d.created_at DESC`,
      [user_id]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error al obtener entregas del usuario:", err.message);
    res.status(500).json({ error: "Error interno del servidor al obtener entregas." });
  }
};
