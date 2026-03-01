// backend/src/routes/authRoutes.js
// Ya no usamos este archivo para register/profile/change-password
// porque Multer necesita ser aplicado directamente en index.js para esas rutas.

// Este router solo se usará para cualquier otra ruta de autenticación
// que no necesite manejo de archivos. Por ahora, puede quedarse vacío
// o manejar solo login si no hubiéramos desacoplado login de multer.

// Como hemos movido register/profile/change-password a index.js para multer,
// este archivo authRoutes.js está prácticamente obsoleto en este punto.
// Podemos eliminarlo o dejarlo como placeholder si esperamos agregar más rutas de auth sin archivos.
// Para mantenerlo consistente, dejemoslo como si Multer NO estuviera.

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");

// Rutas públicas
// router.post("/register", authController.register); // Ya definida en index.js con multer
// router.post("/login", authController.login);       // Ya definida en index.js sin multer (JSON)

// Rutas protegidas (requieren JWT)
// router.get("/profile", authMiddleware.verifyToken, authController.getProfile); // Ya definida en index.js
// router.put("/profile", authMiddleware.verifyToken, authController.updateProfile); // Ya definida en index.js
// router.put("/change-password", authMiddleware.verifyToken, authController.changePassword); // Ya definida en index.js

// Por simplicidad, y como las rutas con multer están en index.js,
// este router de authRoutes.js no manejará nada directamente.
// Podrías incluso no importarlo en index.js si todas las rutas de auth están allí.
// Pero para mantener la estructura, dejemos que apunte a las funciones,
// solo que no se usará su app.use()
router.post("/login", authController.login);
router.get("/profile", authMiddleware.verifyToken, authController.getProfile);
router.put("/change-password", authMiddleware.verifyToken, authController.changePassword);
// Las rutas de register y put /profile (con archivos) están directamente en index.js
// para aplicar el middleware de multer.

module.exports = router;