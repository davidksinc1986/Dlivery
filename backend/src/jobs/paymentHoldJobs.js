const pool = require("../db");

const releaseExpiredPaymentHolds = async () => {
  await pool.query(
    `UPDATE payments p
     SET status = 'hold_released'
     FROM deliveries d
     WHERE p.delivery_id = d.id
       AND p.status = 'authorization_hold'
       AND p.hold_expires_at IS NOT NULL
       AND p.hold_expires_at <= NOW()
       AND d.status <> 'completed'`
  );
};

exports.startPaymentHoldReleaseJob = () => {
  releaseExpiredPaymentHolds().catch((error) => {
    console.error("Error liberando holds expirados:", error.message);
  });

  setInterval(() => {
    releaseExpiredPaymentHolds().catch((error) => {
      console.error("Error en job de liberación de holds:", error.message);
    });
  }, 60 * 1000);
};
