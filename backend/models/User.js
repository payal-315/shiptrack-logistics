const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        role: {
            type: String,
            enum: [
                "customer",
                "driver",
                "operations",
                "CUSTOMER",
                "DRIVER",
                "OPERATIONS",
                "user",
                "admin"
            ],
            default: "customer"
        },
        driverProfile: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver",
            default: null
        },
        phone: {
            type: String,
            default: "",
            trim: true
        },
        defaultAddress: {
            type: String,
            default: "",
            trim: true,
            maxlength: 300
        },
        passwordChangedAt: { type: Date, default: null },
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

module.exports = mongoose.model("User", userSchema, "users");
