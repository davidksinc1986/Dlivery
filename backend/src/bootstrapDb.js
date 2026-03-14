const pool = require("./db");
const bcrypt = require("bcrypt");

const TEST_USER_EMAIL = "usertest@dlivery.local";
const TEST_DRIVER_EMAIL = "drivertest@dlivery.local";

const setupSchema = async () => {
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
      ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;
  `);

  await pool.query(`
    ALTER TABLE deliveries
      ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMP,
      ADD COLUMN IF NOT EXISTS request_mode TEXT DEFAULT 'instant';
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
      ADD COLUMN IF NOT EXISTS hold_expires_at TIMESTAMP;
  `).catch(() => {});

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
    VALUES ('app_commission_percent', '20')
    ON CONFLICT (key) DO NOTHING;
  `);
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
    ["davidksinc@gmail.com", "davidksiinc@gmail.com", "davidksinc@gmail.com"]
  );

  const adminId = await upsertUserByEmail({
    email: "davidksinc@gmail.com",
    firstName: "David",
    lastName: "Admin",
    password: "M@davi19!",
    role: "admin",
    idNumber: "ADMIN-ID",
    address: "Oficina central",
  });

  const userTestId = await upsertUserByEmail({
    email: TEST_USER_EMAIL,
    firstName: "Usuario",
    lastName: "Test",
    password: "usertest",
    role: "client",
    idNumber: "TEST-CLIENT",
    address: "Sandbox client",
  });

  const driverTestId = await upsertUserByEmail({
    email: TEST_DRIVER_EMAIL,
    firstName: "Chofer",
    lastName: "Test",
    password: "drivertest",
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

  console.log(`✅ Admin fijo asegurado: davidksinc@gmail.com (id ${adminId})`);
  console.log(`✅ Usuario de prueba: ${TEST_USER_EMAIL} / usertest (id ${userTestId})`);
  console.log(`✅ Chofer de prueba: ${TEST_DRIVER_EMAIL} / drivertest (id ${driverTestId})`);
};

exports.TEST_BYPASS_EMAILS = [TEST_USER_EMAIL, TEST_DRIVER_EMAIL];

exports.bootstrapDb = async () => {
  await setupSchema();
  await seedUsers();
};
