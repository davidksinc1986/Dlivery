require("dotenv").config();
const { Pool } = require("pg");

const rawDatabaseUrl = process.env.DATABASE_URL;
let pool;

if (!rawDatabaseUrl) {
  console.warn("⚠️ DATABASE_URL no está configurada. Se ejecutará en modo degradado sin DB.");
  pool = {
    async query() {
      const error = new Error("DATABASE_URL no está configurada.");
      error.code = "DB_NOT_CONFIGURED";
      throw error;
    },
    on() {},
  };
} else {
  const parsedDatabaseUrl = new URL(rawDatabaseUrl);

  if (parsedDatabaseUrl.hostname === "localhost") {
    parsedDatabaseUrl.hostname = "127.0.0.1";
  }

  const isLocalConnection = ["127.0.0.1", "localhost"].includes(parsedDatabaseUrl.hostname);
  const useSsl = process.env.PG_SSL === "true" || (!isLocalConnection && process.env.PG_SSL !== "false");

  pool = new Pool({
    connectionString: parsedDatabaseUrl.toString(),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 5000),
  });

  pool.on("error", (error) => {
    console.error("Error inesperado en el pool de PostgreSQL:", error.message);
  });
}

module.exports = pool;
