const mongoose = require("mongoose");

const trackingEventSchema = new mongoose.Schema(
    {
        shipment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Shipment"
        },
        shipmentId: {
            type: String,
            index: true,
            trim: true
        },
        trackingNumber: {
            type: String,
            index: true,
            trim: true
        },
        status: {
            type: String,
            required: true,
            trim: true
        },
        location: {
            city: String,
            state: String,
            coordinates: {
                lat: Number,
                lng: Number
            },
            address: String
        },
        notes: {
            type: String,
            default: "",
            trim: true
        },
        note: {
            type: String,
            default: "",
            trim: true
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        updatedBy: {
            type: String,
            default: "",
            trim: true
        }
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret) => {
                ret.id = ret._id.toString();
                delete ret._id;
                delete ret.__v;
                return ret;
            }
        }
    }
);

module.exports = mongoose.model("TrackingEvent", trackingEventSchema, "trackingEvents");
