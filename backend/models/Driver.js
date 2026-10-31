const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            index: true
        },
        driverCode: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
            trim: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        phone: {
            type: String,
            required: true,
            trim: true
        },
        licenseNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        vehicleNumber: {
            type: String,
            required: true,
            unique: true,
            sparse: true,
            index: true,
            trim: true
        },
        vehicleType: {
            type: String,
            default: "Delivery Van",
            trim: true
        },
        status: {
            type: String,
            default: "Available",
            trim: true
        },
        approvalStatus: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED", "REMOVED"],
            default: "APPROVED",
            index: true
        },
        availability: {
            type: String,
            enum: ["AVAILABLE", "BUSY", "OFFLINE"],
            default: "AVAILABLE"
        },
        assignmentLock: { type: Boolean, default: false, index: true },
        currentLocation: {
            city: String,
            state: String,
            coordinates: {
                lat: Number,
                lng: Number
            },
            accuracy: { type: Number, min: 0, default: null }
        },
        currentLocationUpdatedAt: { type: Date, default: null, index: true },
        baseCity: { type: String, trim: true, default: "" },
        baseLocation: { city: String, coordinates: { lat: Number, lng: Number } },
        tokenVersion: { type: Number, default: 0 }
    },
    {
        timestamps: true,
        id: false,
        toJSON: {
            transform: (_doc, ret) => {
                ret.id = ret.id || ret._id.toString();
                delete ret._id;
                delete ret.__v;
                return ret;
            }
        }
    }
);

module.exports = mongoose.model("Driver", driverSchema, "drivers");
