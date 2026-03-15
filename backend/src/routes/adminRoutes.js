const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const adminController = require("../controllers/adminController");

router.use(authMiddleware.verifyToken, adminMiddleware.verifyAdmin);

router.get("/overview", adminController.getOverview);
router.get("/users", adminController.getUsers);
router.post("/users", adminController.createUser);
router.put("/users/:id", adminController.updateUser);
router.delete("/users/:id", adminController.deleteUser);
router.get("/drivers", adminController.getDrivers);
router.post("/drivers", adminController.createDriver);
router.put("/drivers/:id", adminController.updateDriver);
router.delete("/drivers/:id", adminController.deleteDriver);
router.get("/companies", adminController.getCompanies);
router.post("/companies", adminController.createCompany);
router.put("/companies/:id", adminController.updateCompany);
router.delete("/companies/:id", adminController.deleteCompany);
router.get("/drivers/live-locations", adminController.getDriverLocationsLive);
router.get("/pricing", adminController.getPricing);
router.put("/pricing", adminController.updatePricing);
router.get("/system-config", adminController.getSystemConfig);
router.put("/system-config", adminController.updateSystemConfig);
router.get("/payouts", adminController.getWeeklyPayouts);
router.get("/smart-routes", adminController.getSmartRoutePlans);
router.put("/payouts/:id/pay", adminController.markPayoutAsPaid);

module.exports = router;
