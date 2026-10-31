const express = require("express");
const { rateLimit } = require("express-rate-limit");

const {
    getTrackingInfo,
    getTrackingEvents,
    getPublicTrackingInfo,
    updateTrackingStatus
} = require("../controllers/trackingController");
const authMiddleware = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/requireRole");

const router = express.Router();

const publicTrackingLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many tracking requests. Please try again shortly"
    }
});

router.get(
    "/public/:trackingNumber",
    publicTrackingLimit,
    getPublicTrackingInfo
);

router.use(authMiddleware);

router.get(
    "/:trackingNumber/events",
    requireRole("customer", "driver", "operations"),
    getTrackingEvents
);

router.get(
    "/:trackingNumber",
    requireRole("customer", "driver", "operations"),
    getTrackingInfo
);

router.put(
    "/:trackingNumber/status",
    requireRole("driver", "operations"),
    updateTrackingStatus
);


module.exports = router;
