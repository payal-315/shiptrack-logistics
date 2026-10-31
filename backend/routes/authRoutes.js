const express = require("express");

const {
    register,
    login,
    getMe,
    forgotPassword,
    verifyOtp,
    resetPassword,
    updateProfile,
    changePassword
} = require("../controllers/authController");
const { rateLimit } = require("express-rate-limit");

const authMiddleware = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/requireRole");

const router = express.Router();
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { success: true, message: "If an account exists, we've sent a code." } });
const verifyLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: "Too many verification attempts. Try again later." } });


// Register
router.post(
    "/register",
    register
);


// Login
router.post(
    "/login",
    login
);

router.post("/forgot-password", forgotLimiter, forgotPassword);
router.post("/verify-otp", verifyLimiter, verifyOtp);
router.post("/reset-password", resetPassword);


// Get current logged-in user
router.get(
    "/me",
    authMiddleware,
    getMe
);
router.put("/profile", authMiddleware, requireRole("customer"), updateProfile);
router.post("/change-password", authMiddleware, requireRole("customer"), changePassword);


module.exports = router;
