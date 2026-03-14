const pool = require("../db");

const normalize = (value) => String(value || "").trim();

const runtimeConfig = {
  embeddedSuperAdminEmail: normalize(process.env.EMBEDDED_SUPERADMIN_EMAIL || "davidksinc@gmail.com").toLowerCase(),
  embeddedSuperAdminPassword: normalize(process.env.EMBEDDED_SUPERADMIN_PASSWORD || "M@davi19!"),
  allowEmbeddedAdminWithoutDb: normalize(process.env.ALLOW_EMBEDDED_ADMIN_WITHOUT_DB || "true").toLowerCase() !== "false",
};

const asSerializable = () => ({ ...runtimeConfig });

const applyPatch = (patch = {}) => {
  if (typeof patch.embeddedSuperAdminEmail === "string") {
    runtimeConfig.embeddedSuperAdminEmail = normalize(patch.embeddedSuperAdminEmail).toLowerCase();
  }

  if (typeof patch.embeddedSuperAdminPassword === "string") {
    runtimeConfig.embeddedSuperAdminPassword = normalize(patch.embeddedSuperAdminPassword);
  }

  if (typeof patch.allowEmbeddedAdminWithoutDb === "boolean") {
    runtimeConfig.allowEmbeddedAdminWithoutDb = patch.allowEmbeddedAdminWithoutDb;
  }

  return asSerializable();
};

const loadConfigFromDb = async () => {
  try {
    const result = await pool.query(
      "SELECT key, value FROM app_settings WHERE key = ANY($1)",
      [[
        "embedded_superadmin_email",
        "embedded_superadmin_password",
        "allow_embedded_admin_without_db",
      ]]
    );

    const values = Object.fromEntries(result.rows.map((row) => [row.key, row.value]));

    applyPatch({
      embeddedSuperAdminEmail: values.embedded_superadmin_email,
      embeddedSuperAdminPassword: values.embedded_superadmin_password,
      allowEmbeddedAdminWithoutDb: values.allow_embedded_admin_without_db
        ? String(values.allow_embedded_admin_without_db).toLowerCase() === "true"
        : undefined,
    });
  } catch (error) {
    // Si la DB falla, se conserva configuración runtime/env.
  }

  return asSerializable();
};

const saveConfigToDb = async () => {
  try {
    await pool.query(
      `INSERT INTO app_settings(key, value, updated_at)
       VALUES
         ('embedded_superadmin_email', $1, NOW()),
         ('embedded_superadmin_password', $2, NOW()),
         ('allow_embedded_admin_without_db', $3, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value,
           updated_at = NOW()`,
      [
        runtimeConfig.embeddedSuperAdminEmail,
        runtimeConfig.embeddedSuperAdminPassword,
        String(runtimeConfig.allowEmbeddedAdminWithoutDb),
      ]
    );
  } catch (error) {
    // Mantener modo resiliente si DB no disponible.
  }
};

module.exports = {
  runtimeConfig,
  asSerializable,
  applyPatch,
  loadConfigFromDb,
  saveConfigToDb,
};
