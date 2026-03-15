const bcrypt = require("bcrypt");
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


exports.createUser = async (req, res) => {
  try {
    const { first_name, last_name, email, password, role = "client" } = req.body || {};
    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ error: "Nombre, apellido, email y contraseña son obligatorios." });
    }

    const hash = await bcrypt.hash(String(password), 10);
    const result = await pool.query(
      `INSERT INTO users(first_name, last_name, email, password, role, created_at)
       VALUES($1, $2, LOWER($3), $4, $5, NOW())
       RETURNING id, first_name, last_name, email, role, rating, rating_count, created_at, profile_picture_url`,
      [first_name, last_name, email, hash, role]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (String(error.message || "").includes("users_email_key")) {
      return res.status(400).json({ error: "Ya existe un usuario con este correo." });
    }
    res.status(500).json({ error: "No se pudo crear el usuario." });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email, role, password } = req.body || {};

    const current = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    if (!current.rows.length) return res.status(404).json({ error: "Usuario no encontrado." });

    const next = current.rows[0];
    const nextPassword = password ? await bcrypt.hash(String(password), 10) : next.password;

    const result = await pool.query(
      `UPDATE users
       SET first_name = $1,
           last_name = $2,
           email = LOWER($3),
           role = $4,
           password = $5
       WHERE id = $6
       RETURNING id, first_name, last_name, email, role, rating, rating_count, created_at, profile_picture_url`,
      [first_name ?? next.first_name, last_name ?? next.last_name, email ?? next.email, role ?? next.role, nextPassword, id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "No se pudo actualizar el usuario." });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [id]);
    if (!result.rows.length) return res.status(404).json({ error: "Usuario no encontrado." });
    res.json({ message: "Usuario eliminado." });
  } catch (error) {
    res.status(500).json({ error: "No se pudo eliminar el usuario." });
  }
};

exports.createDriver = async (req, res) => {
  req.body = { ...(req.body || {}), role: "driver" };
  return exports.createUser(req, res);
};

exports.updateDriver = async (req, res) => {
  req.body = { ...(req.body || {}), role: "driver" };
  return exports.updateUser(req, res);
};

exports.deleteDriver = async (req, res) => {
  return exports.deleteUser(req, res);
};

exports.getCompanies = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, contact_name, contact_email, phone, status, notes, created_at, updated_at
       FROM companies
       ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: "No se pudieron cargar las empresas." });
  }
};

exports.createCompany = async (req, res) => {
  try {
    const { name, contact_name, contact_email, phone, status = "active", notes = "" } = req.body || {};
    if (!name) return res.status(400).json({ error: "El nombre de la empresa es obligatorio." });

    const result = await pool.query(
      `INSERT INTO companies(name, contact_name, contact_email, phone, status, notes, created_at, updated_at)
       VALUES($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id, name, contact_name, contact_email, phone, status, notes, created_at, updated_at`,
      [name, contact_name || null, contact_email || null, phone || null, status, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "No se pudo crear la empresa." });
  }
};

exports.updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, contact_name, contact_email, phone, status, notes } = req.body || {};

    const result = await pool.query(
      `UPDATE companies
       SET name = $1,
           contact_name = $2,
           contact_email = $3,
           phone = $4,
           status = $5,
           notes = $6,
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, name, contact_name, contact_email, phone, status, notes, created_at, updated_at`,
      [name, contact_name || null, contact_email || null, phone || null, status || "active", notes || null, id]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Empresa no encontrada." });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: "No se pudo actualizar la empresa." });
  }
};

exports.deleteCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("DELETE FROM companies WHERE id = $1 RETURNING id", [id]);
    if (!result.rows.length) return res.status(404).json({ error: "Empresa no encontrada." });
    res.json({ message: "Empresa eliminada." });
  } catch (error) {
    res.status(500).json({ error: "No se pudo eliminar la empresa." });
  }
};
