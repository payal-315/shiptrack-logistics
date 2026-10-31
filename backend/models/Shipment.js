const mongoose = require("mongoose");
const { canonicalStatus } = require("../services/shipmentStatus");

const shipmentSchema = new mongoose.Schema(
    {
        id: {
            type: String,
            index: true
        },
        trackingNumber: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
            trim: true
        },
        trackingId: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
            trim: true
        },
        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            index: true
        },
        customerId: String,
        sender: {
            name: String,
            phone: String,
            email: String,
            address: String,
            city: String,
            state: String
        },
        receiver: {
            name: String,
            phone: String,
            email: String,
            address: String,
            city: String,
            state: String
        },
        package: {
            type: {
                type: String
            },
            weight: Number,
            description: String
        },
        senderName: {
            type: String,
            trim: true
        },
        senderPhone: {
            type: String,
            default: "",
            trim: true
        },
        receiverName: {
            type: String,
            required: true,
            trim: true
        },
        receiverPhone: {
            type: String,
            default: "",
            trim: true
        },
        origin: {
            type: String,
            required: true,
            trim: true
        },
        destination: {
            type: String,
            required: true,
            trim: true
        },
        packageType: {
            type: String,
            default: "General",
            trim: true
        },
        weight: {
            type: Number,
            default: 0
        },
        status: {
            type: String,
            default: "Pending",
            trim: true
        },
        currentLocation: {
            city: String,
            state: String,
            coordinates: {
                lat: Number,
                lng: Number
            },
            accuracy: { type: Number, min: 0, default: null },
            address: String
        },
        checkpoints: [{
            name: { type: String, required: true },
            order: { type: Number, default: 0 },
            coordinates: {
                lat: { type: Number, required: true },
                lng: { type: Number, required: true }
            }
        }],
        originCoordinates: {
            lat: Number,
            lng: Number
        },
        destinationCoordinates: {
            lat: Number,
            lng: Number
        },
        currentStatus: String,
        driverId: String,
        assignedDriver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Driver",
            default: null,
            index: true
        },
        estimatedDelivery: {
            type: Date,
            default: null
        },
        expectedDeliveryAt: {
            type: Date,
            default: null
        },
        originalEstimatedDelivery: { type: Date, default: null },
        delayReason: { type: String, default: "", trim: true, maxlength: 500 },
        deliveredAt: {
            type: Date,
            default: null
        }
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

shipmentSchema.pre("validate", function synchronizeStatusFields() {
    if (!this.isModified("status") && !this.isModified("currentStatus")) return;
    const source = this.isModified("currentStatus") ? this.currentStatus : this.status;
    const canonical = canonicalStatus(source);
    this.status = canonical;
    this.currentStatus = canonical;
});

shipmentSchema.pre("findOneAndUpdate", function synchronizeStatusUpdate() {
    const update = this.getUpdate() || {};
    const fields = update.$set || update;
    if (Object.prototype.hasOwnProperty.call(fields, "status") || Object.prototype.hasOwnProperty.call(fields, "currentStatus")) {
        const source = Object.prototype.hasOwnProperty.call(fields, "currentStatus") ? fields.currentStatus : fields.status;
        const canonical = canonicalStatus(source);
        fields.status = canonical;
        fields.currentStatus = canonical;
        if (update.$set) update.$set = fields;
        this.setUpdate(update);
    }
});

module.exports = mongoose.model("Shipment", shipmentSchema, "shipments");
