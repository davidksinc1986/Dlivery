const pool = require("../db");
const {
  asSerializable,
  applyPatch,
  loadConfigFromDb,
  saveConfigToDb,
} = require("../config/superAdminConfig");


exports.getOverview = async (_req, res) => {
  try {
    const [users, drivers, deliveries, payments, held] = await Promise.all([
      pool.query("SELECT COUNT(*)::int AS total FROM users"),
      pool.query("SELECT COUNT(*)::int AS total FROM users WHERE role = 'driver'"),
      pool.query("SELECT COUNT(*)::int AS total FROM deliveries"),
      pool.query("SELECT COALESCE(SUM(amount),0)::numeric AS total FROM payments"),
      pool.query("SELECT COALESCE(SUM(driver_earning),0)::numeric AS total FROM payments WHERE status = 'held_for_settlement'")
    ]);

    res.json({
      users: users.rows[0].total,
      drivers: drivers.rows[0].total,
      deliveries: deliveries.rows[0].total,
      grossRevenue: Number(payments.rows[0].total),
      pendingDriverPayouts: Number(held.rows[0].total),
    });
  } catch (error) {
    res.status(500).json({ error: "No se pudo cargar resumen administrativo." });
  }
};

exports.getUsers = async (_req, res) => {
  const result = await pool.query(
    `SELECT id, first_name, last_name, email, role, rating, rating_count, created_at, profile_picture_url
     FROM users ORDER BY created_at DESC LIMIT 300`
  );
  res.json(result.rows);
};

exports.getDrivers = async (_req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.is_available, u.rating, u.rating_count, u.profile_picture_url,
            COALESCE(json_agg(v.*) FILTER (WHERE v.id IS NOT NULL), '[]') as vehicles
     FROM users u
     LEFT JOIN vehicles v ON v.user_id = u.id
     WHERE u.role = 'driver'
     GROUP BY u.id
     ORDER BY u.created_at DESC`
  );
  res.json(result.rows);
};

exports.getPricing = async (_req, res) => {
  const pricing = await pool.query("SELECT vehicle_type, first_km_price, per_km_price FROM pricing_rules ORDER BY vehicle_type");
  const commission = await pool.query("SELECT value FROM app_settings WHERE key = 'app_commission_percent'");

  res.json({
    commissionPercent: Number(commission.rows[0]?.value || 20),
    pricing: pricing.rows,
  });
};

exports.updatePricing = async (req, res) => {
  const { commissionPercent, pricing } = req.body;
  if (commissionPercent === undefined || !Array.isArray(pricing)) {
    return res.status(400).json({ error: "Datos de pricing inválidos." });
  }

  await pool.query("UPDATE app_settings SET value = $1, updated_at = NOW() WHERE key = 'app_commission_percent'", [String(commissionPercent)]);

  for (const rule of pricing) {
    await pool.query(
      `INSERT INTO pricing_rules(vehicle_type, first_km_price, per_km_price, updated_at)
       VALUES($1, $2, $3, NOW())
       ON CONFLICT(vehicle_type) DO UPDATE
       SET first_km_price = EXCLUDED.first_km_price,
           per_km_price = EXCLUDED.per_km_price,
           updated_at = NOW()`,
      [rule.vehicle_type, rule.first_km_price, rule.per_km_price]
    );
  }

  res.json({ message: "Pricing actualizado." });
};

exports.getWeeklyPayouts = async (req, res) => {
  const weekStart = req.query.weekStart;
  const params = [];
  let where = "WHERE p.status IN ('held_for_settlement','paid_to_driver_manual')";

  if (weekStart) {
    where += " AND DATE_TRUNC('week', p.payout_due_date::timestamp) = DATE_TRUNC('week', $1::timestamp)";
    params.push(weekStart);
  }

  const result = await pool.query(
    `SELECT p.id, p.delivery_id, p.amount, p.driver_earning, p.platform_fee, p.status, p.payout_due_date, p.payout_receipt_note,
            p.paid_to_driver_at, d.driver_id, u.first_name, u.last_name
     FROM payments p
     JOIN deliveries d ON d.id = p.delivery_id
     LEFT JOIN users u ON u.id = d.driver_id
     ${where}
     ORDER BY p.payout_due_date ASC, p.id DESC`,
    params
  );

  res.json(result.rows);
};

exports.markPayoutAsPaid = async (req, res) => {
  const { id } = req.params;
  const { payout_receipt_note } = req.body;
  if (!payout_receipt_note) {
    return res.status(400).json({ error: "Debes registrar colilla o referencia del pago." });
  }

  const result = await pool.query(
    `UPDATE payments
     SET status = 'paid_to_driver_manual', payout_receipt_note = $1, paid_to_driver_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [payout_receipt_note, id]
  );

  if (!result.rows.length) return res.status(404).json({ error: "Pago no encontrado." });

  res.json({ message: "Pago semanal registrado.", payment: result.rows[0] });
};


exports.getSmartRoutePlans = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const result = await pool.query(
      `SELECT srp.id, srp.user_id, srp.company_name, srp.monthly_priority_active, srp.payload, srp.created_at,
              u.first_name, u.last_name, u.email
       FROM smart_route_plans srp
       LEFT JOIN users u ON u.id = srp.user_id
       ORDER BY srp.created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron cargar los planes inteligentes." });
  }
};


exports.getDriverLocationsLive = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id,
              u.first_name,
              u.last_name,
              u.email,
              u.is_available,
              u.online_since,
              u.rating,
              u.rating_count,
              ST_Y(u.last_known_location::geometry) AS lat,
              ST_X(u.last_known_location::geometry) AS lng,
              (SELECT dl.timestamp
               FROM driver_locations dl
               WHERE dl.driver_id = u.id
               ORDER BY dl.timestamp DESC
               LIMIT 1) AS last_location_at
       FROM users u
       WHERE u.role = 'driver'
         AND u.last_known_location IS NOT NULL
       ORDER BY u.is_available DESC, COALESCE(u.online_since, u.created_at) DESC`
    );

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron cargar las ubicaciones de conductores." });
  }
};


exports.getSystemConfig = async (_req, res) => {
  await loadConfigFromDb();
  res.json(asSerializable());
};

exports.updateSystemConfig = async (req, res) => {
  const { embeddedSuperAdminEmail, embeddedSuperAdminPassword, allowEmbeddedAdminWithoutDb } = req.body || {};

  const next = applyPatch({
    embeddedSuperAdminEmail,
    embeddedSuperAdminPassword,
    allowEmbeddedAdminWithoutDb,
  });

  await saveConfigToDb();

  res.json({
    message: "Configuración del sistema actualizada.",
    config: next,
  });
};
