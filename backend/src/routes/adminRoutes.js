const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");
const adminController = require("../controllers/adminController");

router.use(authMiddleware.verifyToken, adminMiddleware.verifyAdmin);

router.get("/overview", adminController.getOverview);
router.get("/users", adminController.getUsers);
router.get("/drivers", adminController.getDrivers);
router.get("/pricing", adminController.getPricing);
router.put("/pricing", adminController.updatePricing);
router.get("/payouts", adminController.getWeeklyPayouts);
router.put("/payouts/:id/pay", adminController.markPayoutAsPaid);

module.exports = router;
