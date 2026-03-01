// backend/src/routes/paymentRoutes.js

const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");

// Ruta para que el cliente cree una intención de pago
router.post("/create-payment-intent", authMiddleware.verifyToken, paymentController.createPaymentIntent);

// El webhook se manejará directamente en index.js debido a su naturaleza 'raw'
// router.post("/webhook", paymentController.handleStripeWebhook); // <-- COMENTA O ELIMINA ESTA LÍNEA

module.exports = router;