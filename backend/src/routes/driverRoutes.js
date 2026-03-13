// backend/src/routes/driverRoutes.js

const express = require("express");
const router = express.Router();
const driverController = require("../controllers/driverController");
const authMiddleware = require("../middleware/authMiddleware");

// Rutas existentes
router.post("/become", authMiddleware.verifyToken, driverController.becomeDriver);
router.put("/availability", authMiddleware.verifyToken, driverController.updateAvailability);
router.get("/deliveries/available", authMiddleware.verifyToken, driverController.getAvailableDeliveries);
router.post("/deliveries/:delivery_id/accept", authMiddleware.verifyToken, driverController.acceptDelivery);
router.post("/deliveries/:delivery_id/decline", authMiddleware.verifyToken, driverController.declineDelivery);
router.post("/deliveries/:delivery_id/start", authMiddleware.verifyToken, driverController.startDelivery);
router.post("/deliveries/:delivery_id/complete", authMiddleware.verifyToken, driverController.completeDelivery);

// NUEVA RUTA: Obtener todas mis entregas como conductor
router.get("/notifications", authMiddleware.verifyToken, driverController.getNotifications);
router.get("/my-deliveries", authMiddleware.verifyToken, driverController.getMyDeliveries);

module.exports = router;