const express = require("express");

const {
    createShipment,
    getShipments,
    getShipmentById,
    getShipmentCheckpoints,
    updateShipment,
    assignDriver,
    deleteShipment
} = require("../controllers/shipmentController");
const { getAvailableDrivers } = require("../controllers/driverController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/requireRole");

const router = express.Router();

router.use(authMiddleware);

router.post("/", requireRole("customer", "operations"), createShipment);

router.get("/", requireRole("customer", "driver", "operations"), getShipments);

router.get("/:id", requireRole("customer", "driver", "operations"), getShipmentById);
router.get("/:id/checkpoints", requireRole("customer", "driver", "operations"), getShipmentCheckpoints);
router.get("/:id/available-drivers", requireRole("operations"), getAvailableDrivers);

router.put("/:id/assign", requireRole("operations"), assignDriver);

router.put("/:id", requireRole("operations"), updateShipment);

router.delete("/:id", requireRole("operations"), deleteShipment);


module.exports = router;
