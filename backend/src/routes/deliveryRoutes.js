const express = require("express");
const router = express.Router();
const deliveryController = require("../controllers/deliveryController"); // Importa el controlador de entregas
const authMiddleware = require("../middleware/authMiddleware"); // Importa el middleware de autenticación

// Ruta POST /deliveries - Para crear una nueva entrega (protegida)
// El 'authMiddleware.verifyToken' se ejecuta primero para validar el usuario
router.post("/", authMiddleware.verifyToken, deliveryController.createDelivery);

// Ruta GET /deliveries - Para obtener todas las entregas del usuario autenticado (protegida)
router.get("/", authMiddleware.verifyToken, deliveryController.getUserDeliveries);

module.exports = router;