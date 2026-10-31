const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID, randomInt, randomBytes } = require("node:crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const Driver = require("../models/Driver");
const PasswordReset = require("../models/PasswordReset");
const { normalizeRole } = require("../middleware/requireRole");
const findAuthenticatedUser = require("../utils/authenticatedUser");
const sendControllerError = require("./responseHelpers");
const otpRequests = new Map();

const PASSWORD_RULE = /^(?=.*[a-z])(?=.*\d).{8,128}$/i;
const isSupportedResetRole = (role) => role === "customer" || role === "driver";

const publicUser = (user) => {
    const data = user.toJSON ? user.toJSON() : user;

    return {
        id: data.id,
        name: data.name,
        email: data.email,
        role: normalizeRole(data.role),
        phone: data.phone || "",
        defaultAddress: data.defaultAddress || ""
    };
};

const generateToken = (user) => jwt.sign(
    {
        id: user.id || user._id.toString(),
        email: user.email,
        role: normalizeRole(user.role)
        ,tokenVersion: user.tokenVersion || 0
    },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
);

const isValidEmail = (email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const register = async (req, res) => {
    const { name, email, password } = req.body || {};

    if (
        typeof name !== "string" ||
        !name.trim() ||
        name.trim().length > 100 ||
        typeof email !== "string" ||
        !isValidEmail(email.trim()) ||
        typeof password !== "string" ||
        password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password) ||
        password.length > 128
    ) {
        return res.status(400).json({
            success: false,
            message: "Provide a name, valid email, and password of at least 8 characters with one letter and one number"
        });
    }

    try {
        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "User with this email already exists"
            });
        }

        const user = await User.create({
            id: randomUUID(),
            name: name.trim(),
            email: normalizedEmail,
            password: await bcrypt.hash(password, 10),
            role: "customer"
        });

        return res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: {
                user: publicUser(user),
                token: generateToken(user)
            }
        });
    } catch (error) {
        return sendControllerError(res, error, "Registration failed");
    }
};

const login = async (req, res) => {
    const { email, password } = req.body || {};

    if (
        typeof email !== "string" ||
        !isValidEmail(email.trim()) ||
        typeof password !== "string" ||
        !password
    ) {
        return res.status(400).json({
            success: false,
            message: "A valid email and password are required"
        });
    }

    try {
        const user = await User.findOne({
            email: email.trim().toLowerCase()
        });

        if (!user || typeof user.password !== "string") {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid email or password"
            });
        }

        let approvalStatus;
        if (normalizeRole(user.role) === "driver" && user.driverProfile) {
            const driver = await Driver.findById(user.driverProfile).select("approvalStatus");
            approvalStatus = driver?.approvalStatus || "PENDING";
            if (approvalStatus === "REMOVED" || !driver) return res.status(401).json({ success: false, message: "Invalid email or password" });
        }
        return res.status(200).json({
            success: true,
            message: "Login successful",
            data: {
                user: { ...publicUser(user), ...(approvalStatus ? { approvalStatus } : {}) },
                token: generateToken(user)
            }
        });
    } catch (error) {
        return sendControllerError(res, error, "Login failed");
    }
};

const getMe = async (req, res) => {
    try {
        const user = await findAuthenticatedUser(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: publicUser(user)
        });
    } catch (error) {
        return sendControllerError(res, error, "Failed to fetch user");
    }
};

const forgotPassword = async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const role = req.body?.role;
    if (!isValidEmail(email) || !isSupportedResetRole(role)) return res.status(400).json({ success: false, message: "A valid email and reset role are required." });
    const neutral = { success: true, message: "If an account exists, we've sent a code." };
    const now = Date.now();
    const history = (otpRequests.get(email) || []).filter((time) => now - time < 60 * 60 * 1000);
    if (history.length >= 5) return res.status(429).json(neutral);
    otpRequests.set(email, [...history, now]);
    try {
        const user = await User.findOne({ email, role });
        if (!user) return res.json(neutral);
        await PasswordReset.deleteMany({ email, purpose: "PASSWORD_RESET" });
        const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
        const expiry = new Date(now + 10 * 60 * 1000);
        await PasswordReset.create({ user: user._id, email, role, purpose: "PASSWORD_RESET", otpHash: await bcrypt.hash(otp, 10), otpExpiresAt: expiry, expiresAt: expiry });
        const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
        if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && MAIL_FROM) {
            const transporter = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
            await transporter.sendMail({ from: MAIL_FROM, to: email, subject: "Your ShipTrack password reset code", text: `Your ShipTrack verification code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`, html: `<div style="font-family:Arial,sans-serif;color:#123a5e"><h2>ShipTrack</h2><p>Your password reset code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${otp}</p><p>This code expires in 10 minutes. If you did not request this, ignore this email.</p></div>` });
        } else if (process.env.NODE_ENV !== "production") {
            console.info(`[ShipTrack password reset] ${email} (${role}) OTP: ${otp}`);
        }
        return res.json(neutral);
    } catch (error) { return sendControllerError(res, error, "Unable to request password reset"); }
};

const verifyOtp = async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const { role, otp } = req.body || {};
    if (!isValidEmail(email) || !isSupportedResetRole(role) || !/^\d{6}$/.test(String(otp || ""))) return res.status(400).json({ success: false, message: "Enter a valid email and six-digit code." });
    try {
        const record = await PasswordReset.findOne({ email, role, purpose: "PASSWORD_RESET" }).sort({ createdAt: -1 });
        if (!record || record.resetTokenHash || record.otpExpiresAt <= new Date() || record.attempts >= 5) return res.status(400).json({ success: false, message: "That code is invalid or expired. Request a new code." });
        if (!await bcrypt.compare(String(otp), record.otpHash)) {
            record.attempts += 1;
            await record.save();
            return res.status(400).json({ success: false, message: record.attempts >= 5 ? "Too many attempts. Request a new code." : "That code is incorrect." });
        }
        const resetToken = randomBytes(32).toString("base64url");
        record.resetTokenHash = await bcrypt.hash(resetToken, 10);
        record.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await record.save();
        return res.json({ success: true, data: { resetToken, expiresIn: 600 } });
    } catch (error) { return sendControllerError(res, error, "Unable to verify code"); }
};

const resetPassword = async (req, res) => {
    const { resetToken, newPassword } = req.body || {};
    if (typeof resetToken !== "string" || !resetToken || typeof newPassword !== "string" || !PASSWORD_RULE.test(newPassword)) return res.status(400).json({ success: false, message: "Password must be at least 8 characters and contain one letter and one number." });
    try {
        const records = await PasswordReset.find({ resetTokenHash: { $ne: null }, expiresAt: { $gt: new Date() } });
        let matched;
        for (const record of records) if (await bcrypt.compare(resetToken, record.resetTokenHash)) { matched = record; break; }
        if (!matched) return res.status(400).json({ success: false, message: "Reset link is invalid or expired. Request a new code." });
        await User.updateOne({ _id: matched.user }, { $set: { password: await bcrypt.hash(newPassword, 10), passwordChangedAt: new Date() }, $inc: { tokenVersion: 1 } });
        await PasswordReset.deleteMany({ user: matched.user });
        return res.json({ success: true, message: "Password updated. You can now log in." });
    } catch (error) { return sendControllerError(res, error, "Unable to reset password"); }
};

const updateProfile = async (req, res) => {
    const { name, phone, defaultAddress } = req.body || {};
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100 ||
        typeof phone !== "string" || phone.trim().length > 30 ||
        typeof defaultAddress !== "string" || defaultAddress.trim().length > 300) {
        return res.status(400).json({ success: false, message: "Enter a valid name, phone and default address." });
    }
    try {
        const user = await findAuthenticatedUser(req.user.id);
        if (!user) return res.status(401).json({ success: false, message: "Authenticated user was not found." });
        user.name = name.trim(); user.phone = phone.trim(); user.defaultAddress = defaultAddress.trim();
        await user.save();
        return res.json({ success: true, message: "Profile updated.", data: publicUser(user) });
    } catch (error) { return sendControllerError(res, error, "Unable to update profile"); }
};

const changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== "string" || !currentPassword || typeof newPassword !== "string" || !PASSWORD_RULE.test(newPassword)) {
        return res.status(400).json({ success: false, message: "Enter your current password and a new password with at least 8 characters, one letter and one number." });
    }
    try {
        const user = await findAuthenticatedUser(req.user.id);
        if (!user) return res.status(401).json({ success: false, message: "Authenticated user was not found." });
        if (!await bcrypt.compare(currentPassword, user.password)) return res.status(400).json({ success: false, message: "Current password is incorrect." });
        user.password = await bcrypt.hash(newPassword, 10);
        user.passwordChangedAt = new Date();
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();
        return res.json({ success: true, message: "Password changed.", data: { token: generateToken(user) } });
    } catch (error) { return sendControllerError(res, error, "Unable to change password"); }
};

module.exports = {
    register,
    login,
    getMe,
    forgotPassword,
    verifyOtp,
    resetPassword,
    updateProfile,
    changePassword
};
