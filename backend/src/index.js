// backend/src/index.js

require("dotenv").config();

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const multer = require("multer"); // Importar Multer

const pool = require("./db");
const deliveryRoutes = require("./routes/deliveryRoutes");
const driverRoutes = require("./routes/driverRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const authMiddleware = require("./middleware/authMiddleware");
const authController = require("./controllers/authController"); 
const paymentController = require("./controllers/paymentController");
const adminRoutes = require("./routes/adminRoutes");
const { bootstrapDb } = require("./bootstrapDb");
const { startPaymentHoldReleaseJob } = require("./jobs/paymentHoldJobs");

const app = express();
const server = http.createServer(app);
let dbBootstrapReady = false;

const io = new Server(server, {
  cors: {
    origin: "*", // Permite conexiones WebSocket desde cualquier origen en desarrollo
    methods: ["GET", "POST"]
  }
});

app.use(cors({
    origin: process.env.FRONTEND_ORIGIN || true,
    credentials: true
}));

// CONFIGURACIÓN DE MULTER
const upload = multer({ storage: multer.memoryStorage() }); 

// Webhook de pagos (raw body parser antes del json parser)
app.post("/payments/webhook", express.raw({ type: 'application/json' }), paymentController.handleStripeWebhook);

app.use(express.json()); // Middleware para parsear JSON (después del webhook raw)

// --- Rutas HTTP (REST API) ---

// Rutas Públicas de Información
app.get("/", (req, res) => {
  res.send("Servidor funcionando correctamente 🚀");
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(dbBootstrapReady ? 200 : 503).json({
      status: dbBootstrapReady ? "ok" : "degraded",
      db: "connected",
      bootstrap: dbBootstrapReady ? "ready" : "pending",
    });
  } catch (err) {
    console.log("ERROR DB:", err.message);
    res.status(503).json({ status: "down", db: "disconnected", error: err.message });
  }
});

app.get("/services", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM services");
    res.json(result.rows);
  } catch (err) {
    console.log("ERROR AL OBTENER SERVICIOS:", err.message);
    res.status(500).json({ error: "Error interno del servidor al obtener el servicio." });
  }
});


app.get("/pricing-config", async (_req, res) => {
  try {
    const pricing = await pool.query("SELECT vehicle_type, first_km_price, per_km_price FROM pricing_rules ORDER BY vehicle_type");
    const commission = await pool.query("SELECT value FROM app_settings WHERE key = 'app_commission_percent'");
    res.json({ pricing: pricing.rows, commissionPercent: Number(commission.rows[0]?.value || 20) });
  } catch (err) {
    res.status(500).json({ error: "No se pudo cargar configuración de precios." });
  }
});
// RUTAS DE AUTENTICACIÓN CON MANEJO DE ARCHIVOS (VIA MULTER)
// El registro NO RECIBE ARCHIVOS. Solo se envían campos de texto.
app.post("/auth/register", upload.fields([
    { name: 'profilePicture', maxCount: 1 },
    { name: 'document', maxCount: 1 }
]), authController.register); 
app.post("/auth/login", authController.login); 
app.get("/auth/profile", authMiddleware.verifyToken, authController.getProfile);
// updateProfile SÍ recibe archivos (foto de perfil y/o documento)
app.put("/auth/profile", authMiddleware.verifyToken, upload.fields([
    { name: 'profilePicture', maxCount: 1 }, 
    { name: 'document', maxCount: 1 }      
]), authController.updateProfile);
app.put("/auth/change-password", authMiddleware.verifyToken, authController.changePassword);

// Las demás rutas siguen usando 'app.use' con sus routers
app.use("/deliveries", deliveryRoutes);
app.use("/drivers", driverRoutes);
app.use("/payments", paymentRoutes); 
app.use("/admin", adminRoutes);

// --- MANEJO DE CONEXIONES SOCKET.IO ---
io.on("connection", (socket) => {
  console.log(`Usuario conectado por WebSocket: ${socket.id}`);

  socket.on("send_location", async (data) => {
    const { token, delivery_id, latitude, longitude } = data;

    try {
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "superSecretJWTKey");
      const driver_id = decoded.id;

      const delivery = await pool.query(
        "SELECT * FROM deliveries WHERE id = $1 AND driver_id = $2 AND status = 'in_progress'",
        [delivery_id, driver_id]
      );

      if (delivery.rows.length === 0) {
        console.warn(`Intento de ubicación de conductor ${driver_id} para entrega ${delivery_id} fallido: No asignado o no en progreso.`);
        return socket.emit("location_error", { message: "No asignado o entrega no en progreso." });
      }

      await pool.query(
        "INSERT INTO driver_locations(driver_id, delivery_id, latitude, longitude, timestamp) VALUES($1, $2, $3, $4, NOW())",
        [driver_id, delivery_id, latitude, longitude]
      );

      await pool.query(
        `UPDATE users
         SET last_known_location = ST_SetSRID(ST_MakePoint($1, $2), 4326),
             online_since = COALESCE(online_since, NOW())
         WHERE id = $3`,
        [longitude, latitude, driver_id]
      );

      socket.data.driver_id = driver_id;
      io.emit("admin_driver_location_update", {
        driver_id,
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
        is_available: true,
      });

      io.to(`delivery_${delivery_id}`).emit("update_location", {
        delivery_id,
        driver_id,
        latitude,
        longitude,
        timestamp: new Date().toISOString()
      });

      console.log(`Ubicación de entrega ${delivery_id} actualizada por conductor ${driver_id}: ${latitude}, ${longitude}`);

    } catch (err) {
      console.error("Error procesando ubicación por WebSocket:", err.message);
      socket.emit("location_error", { message: "Error al procesar la ubicación." });
    }
  });

  socket.on("join_delivery_room", async (data) => {
    const { token, delivery_id } = data;
    try {
      const jwt = require("jsonwebtoken");
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "superSecretJWTKey");
      const user_id = decoded.id;

      const delivery = await pool.query(
        "SELECT user_id, driver_id FROM deliveries WHERE id = $1",
        [delivery_id]
      );

      if (delivery.rows.length === 0) {
        return socket.emit("room_error", { message: "Entrega no encontrada." });
      }

      const isClient = delivery.rows[0].user_id === user_id;
      const isDriver = delivery.rows[0].driver_id === user_id;

      if (!isClient && !isDriver) {
        return socket.emit("room_error", { message: "No tienes permiso para unirte a esta sala." });
      }

      socket.join(`delivery_${delivery_id}`);
      console.log(`Usuario ${user_id} se unió a la sala delivery_${delivery_id}`);

      const lastLocation = await pool.query(
        "SELECT latitude, longitude FROM driver_locations WHERE delivery_id = $1 ORDER BY timestamp DESC LIMIT 1",
        [delivery_id]
      );
      if (lastLocation.rows.length > 0) {
        socket.emit("update_location", { ...lastLocation.rows[0], delivery_id });
      }

    } catch (err) {
      console.error("Error al unirse a la sala de entrega:", err.message);
      socket.emit("room_error", { message: "Error al unirse a la sala." });
    }
  });

  socket.on("disconnect", () => {
    if (socket.data?.driver_id) {
      io.emit("admin_driver_connection_change", {
        driver_id: socket.data.driver_id,
        is_available: false,
        disconnected_at: new Date().toISOString(),
      });
    }
    console.log(`Usuario desconectado de WebSocket: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3001;

bootstrapDb()
  .then(() => {
    dbBootstrapReady = true;
    console.log("✅ Bootstrap de DB completado correctamente.");
    startPaymentHoldReleaseJob();
  })
  .catch((error) => {
    dbBootstrapReady = false;
    console.error("Error en bootstrap de base de datos (modo degradado activo):", error.message);
  })
  .finally(() => {
    server.listen(PORT, () => {
      console.log(`Servidor de Express y Socket.IO corriendo en puerto ${PORT}`);
    });
  });
