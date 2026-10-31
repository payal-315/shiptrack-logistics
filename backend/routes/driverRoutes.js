const express = require("express");

const {
    signupDriver,
    updateCurrentCity,
    getPendingDrivers,
    reviewDriver,
    createDriver,
    getDrivers,
    getDriverSummaries,
    getDriverById,
    recomputeAvailability,
    updateDriver,
    deleteDriver
} = require("../controllers/driverController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/requireRole");

const router = express.Router();

router.post("/signup", signupDriver);
router.put("/me/location", authMiddleware, requireRole("driver"), updateCurrentCity);

router.use(authMiddleware, requireRole("operations"));

router.get("/pending", getPendingDrivers);
router.get("/summary", getDriverSummaries);
router.post("/:id/approve", (req, res) => { req.params.action = "approve"; return reviewDriver(req, res); });
router.post("/:id/reject", (req, res) => { req.params.action = "reject"; return reviewDriver(req, res); });

router.post("/", createDriver);

router.get("/", getDrivers);

router.get("/:id", getDriverById);

router.post("/:id/recompute-availability", recomputeAvailability);

router.put("/:id", updateDriver);

router.delete("/:id", deleteDriver);


module.exports = router;
