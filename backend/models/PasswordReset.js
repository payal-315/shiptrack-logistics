const mongoose = require("mongoose");

const passwordResetSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    role: { type: String, enum: ["customer", "driver"], required: true },
    purpose: { type: String, enum: ["PASSWORD_RESET"], default: "PASSWORD_RESET", index: true },
    otpHash: { type: String, required: true },
    otpExpiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    resetTokenHash: { type: String, default: null },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }
}, { timestamps: true });

module.exports = mongoose.model("PasswordReset", passwordResetSchema);
