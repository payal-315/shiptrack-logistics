const jwt = require("jsonwebtoken");
const findAuthenticatedUser = require("../utils/authenticatedUser");
const { normalizeRole } = require("./requireRole");

const authMiddleware = async (req, res, next) => {
    res.set("Cache-Control", "no-store, private");
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Authentication is required"
            });
        }

        const parts = authHeader.split(" ");

        if (parts.length !== 2 || parts[0] !== "Bearer") {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication credentials"
            });
        }

        req.user = jwt.verify(parts[1], process.env.JWT_SECRET);
        const user = await findAuthenticatedUser(req.user.id);
        if (!user) return res.status(401).json({ success: false, message: "Invalid or expired token" });
        if ((req.user.tokenVersion || 0) !== (user.tokenVersion || 0)) return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
        if (normalizeRole(user.role) === "driver" && user.driverProfile) {
            const Driver = require("../models/Driver");
            const driver = await Driver.findById(user.driverProfile).select("approvalStatus");
            if (!driver || driver.approvalStatus === "REMOVED") return res.status(401).json({ success: false, message: "Driver account has been removed." });
        }
        if (user.passwordChangedAt && req.user.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
            return res.status(401).json({ success: false, message: "Your password changed. Please log in again." });
        }
        next();
    } catch (_error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
};

module.exports = authMiddleware;
