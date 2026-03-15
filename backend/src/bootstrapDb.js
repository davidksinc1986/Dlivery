const pool = require("./db");
const bcrypt = require("bcrypt");

const normalizeEmail = (value, fallback) => String(value || fallback).trim().toLowerCase();
const normalizePassword = (value, fallback) => String(value || fallback).trim();

const SEED_SUPERADMIN_EMAIL = normalizeEmail(process.env.SEED_SUPERADMIN_EMAIL, "davidksinc@gmail.com");
const SEED_SUPERADMIN_PASSWORD = normalizePassword(process.env.SEED_SUPERADMIN_PASSWORD, "M@davi19!");
const SEED_TEST_USER_EMAIL = normalizeEmail(process.env.SEED_TEST_USER_EMAIL, "usertest@dlivery.local");
const SEED_TEST_USER_PASSWORD = normalizePassword(process.env.SEED_TEST_USER_PASSWORD, "usertest");
const SEED_TEST_DRIVER_EMAIL = normalizeEmail(process.env.SEED_TEST_DRIVER_EMAIL, "drivertest@dlivery.local");
const SEED_TEST_DRIVER_PASSWORD = normalizePassword(process.env.SEED_TEST_DRIVER_PASSWORD, "drivertest");

const BOOTSTRAP_LOCK_KEY = 432118;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForDb = async ({ retries = 8, baseDelayMs = 1200 } = {}) => {
  let attempt = 0;

  while (attempt < retries) {
    attempt += 1;
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), 10000);
      console.warn(`⚠️ DB no disponible (intento ${attempt}/${retries}). Reintentando en ${delay}ms...`);
      await wait(delay);
    }
  }
};

const setupSchema = async () => {
  await pool.query("CREATE EXTENSION IF NOT EXISTS postgis;").catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      email TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'client',
      profile_picture_url TEXT,
      document_url TEXT,
      id_number TEXT,
      address TEXT,
      vehicle_types TEXT[],
      is_available BOOLEAN DEFAULT FALSE,
      online_since TIMESTAMP,
      rating NUMERIC(3,2) DEFAULT 5.0,
      rating_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      last_known_location geometry(Point, 4326)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS offers (
      id SERIAL PRIMARY KEY,
      service_id INTEGER REFERENCES services(id),
      description TEXT,
      price NUMERIC,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS deliveries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      service_id INTEGER REFERENCES services(id),
      offer_id INTEGER REFERENCES offers(id),
      driver_id INTEGER REFERENCES users(id),
      description TEXT,
      origin TEXT,
      destination TEXT,
      price_estimate NUMERIC,
      final_cost NUMERIC,
      vehicle_requested_type TEXT,
      status TEXT DEFAULT 'pending',
      payment_status TEXT DEFAULT 'unpaid',
      confirmation_pin TEXT,
      assigned_at TIMESTAMP,
      scheduled_for TIMESTAMP,
      request_mode TEXT DEFAULT 'instant',
      created_at TIMESTAMP DEFAULT NOW(),
      origin_location geometry(Point, 4326)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      plate_number TEXT UNIQUE NOT NULL,
      color TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      delivery_id INTEGER REFERENCES deliveries(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      amount NUMERIC(12,2) NOT NULL,
      platform_fee NUMERIC(12,2) DEFAULT 0,
      driver_earning NUMERIC(12,2) DEFAULT 0,
      transaction_id TEXT,
      status TEXT DEFAULT 'pending',
      payout_due_date DATE,
      paid_to_driver_at TIMESTAMP,
      payout_receipt_note TEXT,
      hold_expires_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS driver_locations (
      id SERIAL PRIMARY KEY,
      driver_id INTEGER REFERENCES users(id),
      delivery_id INTEGER REFERENCES deliveries(id),
      latitude NUMERIC(10,7) NOT NULL,
      longitude NUMERIC(10,7) NOT NULL,
      timestamp TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'client',
      ADD COLUMN IF NOT EXISTS profile_picture_url TEXT,
      ADD COLUMN IF NOT EXISTS document_url TEXT,
      ADD COLUMN IF NOT EXISTS id_number TEXT,
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS vehicle_types TEXT[],
      ADD COLUMN IF NOT EXISTS is_available BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS online_since TIMESTAMP,
      ADD COLUMN IF NOT EXISTS rating NUMERIC(3,2) DEFAULT 5.0,
      ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS first_name TEXT,
      ADD COLUMN IF NOT EXISTS last_name TEXT,
      ADD COLUMN IF NOT EXISTS password TEXT,
      ADD COLUMN IF NOT EXISTS last_known_location geometry(Point, 4326);
  `);

  await pool.query(`
    ALTER TABLE deliveries
      ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP,
      ADD COLUMN IF NOT EXISTS request_mode TEXT DEFAULT 'instant',
      ADD COLUMN IF NOT EXISTS driver_id INTEGER REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS origin TEXT,
      ADD COLUMN IF NOT EXISTS destination TEXT,
      ADD COLUMN IF NOT EXISTS price_estimate NUMERIC,
      ADD COLUMN IF NOT EXISTS final_cost NUMERIC,
      ADD COLUMN IF NOT EXISTS vehicle_requested_type TEXT,
      ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid',
      ADD COLUMN IF NOT EXISTS confirmation_pin TEXT,
      ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS origin_location geometry(Point, 4326);
  `).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS driver_notifications (
      id SERIAL PRIMARY KEY,
      driver_id INTEGER REFERENCES users(id),
      delivery_id INTEGER REFERENCES deliveries(id),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pricing_rules (
      id SERIAL PRIMARY KEY,
      vehicle_type TEXT UNIQUE NOT NULL,
      first_km_price NUMERIC(10,2) NOT NULL,
      per_km_price NUMERIC(10,2) NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS delivery_driver_declines (
      id SERIAL PRIMARY KEY,
      delivery_id INTEGER REFERENCES deliveries(id),
      driver_id INTEGER REFERENCES users(id),
      reason TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(delivery_id, driver_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS smart_route_plans (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      company_name TEXT,
      monthly_priority_active BOOLEAN DEFAULT FALSE,
      payload JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS payout_due_date DATE,
      ADD COLUMN IF NOT EXISTS paid_to_driver_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS payout_receipt_note TEXT,
      ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS driver_earning NUMERIC(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
  `).catch(() => {});

  await pool.query("CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON deliveries(driver_id);");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_driver_locations_delivery_id ON driver_locations(delivery_id);");

  await pool.query(`
    INSERT INTO services(name)
    VALUES ('Mensajería express')
    ON CONFLICT DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO pricing_rules(vehicle_type, first_km_price, per_km_price)
    VALUES
      ('moto', 1200, 320),
      ('camion_liviano', 5500, 1300),
      ('camion_pesado', 16000, 2600)
    ON CONFLICT (vehicle_type) DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO app_settings(key, value)
    VALUES
      ('app_commission_percent', '20'),
      ('embedded_superadmin_email', $1),
      ('embedded_superadmin_password', $2),
      ('allow_embedded_admin_without_db', 'true')
    ON CONFLICT (key) DO NOTHING;
  `, [SEED_SUPERADMIN_EMAIL, SEED_SUPERADMIN_PASSWORD]);
};

const upsertUserByEmail = async ({ email, firstName, lastName, password, role, idNumber, address, vehicleTypes = null }) => {
  const hash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    `UPDATE users
     SET first_name = $1,
         last_name = $2,
         password = $3,
         role = $4,
         id_number = $5,
         address = $6,
         vehicle_types = $7,
         is_available = FALSE
     WHERE email = $8
     RETURNING id`,
    [firstName, lastName, hash, role, idNumber, address, vehicleTypes, email]
  );

  if (result.rows.length) return result.rows[0].id;

  const insert = await pool.query(
    `INSERT INTO users(first_name, last_name, email, password, role, created_at, is_available, id_number, address, vehicle_types)
     VALUES($1, $2, $3, $4, $5, NOW(), FALSE, $6, $7, $8)
     RETURNING id`,
    [firstName, lastName, email, hash, role, idNumber, address, vehicleTypes]
  );

  return insert.rows[0].id;
};

const seedUsers = async () => {
  await pool.query(
    `UPDATE users
     SET email = $1
     WHERE LOWER(email) = $2
       AND NOT EXISTS (SELECT 1 FROM users WHERE LOWER(email) = $3)`,
    [SEED_SUPERADMIN_EMAIL, "davidksiinc@gmail.com", SEED_SUPERADMIN_EMAIL]
  );

  const adminId = await upsertUserByEmail({
    email: SEED_SUPERADMIN_EMAIL,
    firstName: "David",
    lastName: "Admin",
    password: SEED_SUPERADMIN_PASSWORD,
    role: "admin",
    idNumber: "ADMIN-ID",
    address: "Oficina central",
  });

  const userTestId = await upsertUserByEmail({
    email: SEED_TEST_USER_EMAIL,
    firstName: "Usuario",
    lastName: "Test",
    password: SEED_TEST_USER_PASSWORD,
    role: "client",
    idNumber: "TEST-CLIENT",
    address: "Sandbox client",
  });

  const driverTestId = await upsertUserByEmail({
    email: SEED_TEST_DRIVER_EMAIL,
    firstName: "Chofer",
    lastName: "Test",
    password: SEED_TEST_DRIVER_PASSWORD,
    role: "driver",
    idNumber: "TEST-DRIVER",
    address: "Sandbox driver",
    vehicleTypes: ["moto"],
  });

  await pool.query(
    `INSERT INTO vehicles(user_id, type, plate_number, color)
     VALUES($1, 'moto', 'TEST-DRV-001', 'negro')
     ON CONFLICT (plate_number) DO NOTHING`,
    [driverTestId]
  ).catch(() => {});

  console.log(`✅ Admin fijo asegurado: ${SEED_SUPERADMIN_EMAIL} (id ${adminId})`);
  console.log(`✅ Usuario de prueba: ${SEED_TEST_USER_EMAIL} / ${SEED_TEST_USER_PASSWORD} (id ${userTestId})`);
  console.log(`✅ Chofer de prueba: ${SEED_TEST_DRIVER_EMAIL} / ${SEED_TEST_DRIVER_PASSWORD} (id ${driverTestId})`);
};

exports.TEST_BYPASS_EMAILS = [SEED_TEST_USER_EMAIL, SEED_TEST_DRIVER_EMAIL];

exports.bootstrapDb = async () => {
  await waitForDb();
  await pool.query("SELECT pg_advisory_lock($1)", [BOOTSTRAP_LOCK_KEY]);

  try {
    await setupSchema();
    await seedUsers();
  } finally {
    await pool.query("SELECT pg_advisory_unlock($1)", [BOOTSTRAP_LOCK_KEY]).catch(() => {});
  }
};
