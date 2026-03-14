require("dotenv").config();
const { Pool } = require("pg");

const rawDatabaseUrl = process.env.DATABASE_URL;

if (!rawDatabaseUrl) {
  throw new Error("DATABASE_URL no está configurada.");
}

const parsedDatabaseUrl = new URL(rawDatabaseUrl);

// Asegura IPv4 cuando la URL usa localhost (evita intentos por ::1 en entornos sin IPv6).
if (parsedDatabaseUrl.hostname === "localhost") {
  parsedDatabaseUrl.hostname = "127.0.0.1";
}

const isLocalConnection = ["127.0.0.1", "localhost"].includes(parsedDatabaseUrl.hostname);
const useSsl = process.env.PG_SSL === "true" || (!isLocalConnection && process.env.PG_SSL !== "false");

const pool = new Pool({
  connectionString: parsedDatabaseUrl.toString(),
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 5000),
});

pool.on("error", (error) => {
  console.error("Error inesperado en el pool de PostgreSQL:", error.message);
});

module.exports = pool;
