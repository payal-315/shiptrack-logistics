const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/User");
const Driver = require("../models/Driver");
const Shipment = require("../models/Shipment");
const TrackingEvent = require("../models/TrackingEvent");
const PasswordReset = require("../models/PasswordReset");
const { prepareCheckpoints } = require("../services/checkpoints");

let failRoutingProvider = false;
let failGeocodingProvider = false;
global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("nominatim.openstreetmap.org/search")) {
        const city = new URL(url).searchParams.get("q")?.trim().toLowerCase();
        const coordinates = city === "hyderabad"
            ? { lat: "17.3850", lon: "78.4867" }
            : city === "pune"
                ? { lat: "18.5204", lon: "73.8567" }
                : city === "mumbai"
                    ? { lat: "19.0760", lon: "72.8777" }
                    : { lat: "12.9716", lon: "77.5946" };
        return new Response(JSON.stringify(failGeocodingProvider ? [] : [coordinates]), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("nominatim.openstreetmap.org/reverse")) {
        const query = new URL(url).searchParams;
        const lat = Number(query.get("lat"));
        const lng = Number(query.get("lon"));
        const city = lat > 16 && lat < 18 ? "Hyderabad" : lat > 14 && lat < 15 ? "Aluru" : lat > 18 && lat < 19 && lng > 73 && lng < 74 ? "Pune" : "Bangalore";
        const state = city === "Aluru" ? "Karnataka" : city === "Hyderabad" ? "Telangana" : "Karnataka";
        return new Response(JSON.stringify({ name: city, address: { city, state } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.includes("router.project-osrm.org")) {
        if (failRoutingProvider) return new Response(JSON.stringify({ code: "NoRoute", message: "test provider outage" }), { status: 503, headers: { "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ routes: [{ distance: 200000, geometry: { coordinates: [[77.5946, 12.9716], [78, 14], [79, 15], [80, 16], [81, 17], [78.4867, 17.385]] } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error(`Unexpected test network request: ${url}`);
};

app.post("/_test/routing-provider", (req, res) => {
    failRoutingProvider = Boolean(req.body?.fail);
    failGeocodingProvider = Boolean(req.body?.failGeocoding);
    return res.json({ success: true });
});

const testOtps = new Map();
const originalInfo = console.info.bind(console);
console.info = (...args) => {
    const match = String(args[0] || "").match(/^\[ShipTrack password reset\] (\S+) \(\w+\) OTP: (\d{6})$/);
    if (match) testOtps.set(match[1], match[2]);
    originalInfo(...args);
};

// These fixture routes exist only in this disposable test server, never in the app used by server.js.
app.post("/_test/shipments", async (req, res) => {
    const owner = req.body.userId ? await User.findOne({ id: req.body.userId }) : null;
    const shipment = await Shipment.create({
        id: `test-${req.body.suffix}`,
        trackingNumber: `LTS-${req.body.suffix}`,
        trackingId: `SHP-${req.body.suffix}`,
        ...(owner ? { customer: owner._id, customerId: req.body.customerId ?? owner.id } : {}),
        senderName: "Test Sender",
        receiverName: "Test Receiver",
        origin: req.body.origin || "Origin City",
        destination: req.body.destination || "Destination City",
        status: "IN_TRANSIT",
        currentStatus: "IN_TRANSIT",
        currentLocation: req.body.currentLocation || { city: "Checkpoint", coordinates: { lat: 12.1, lng: 23.2 } },
        ...(req.body.originCoordinates ? { originCoordinates: req.body.originCoordinates } : {}),
        ...(req.body.destinationCoordinates ? { destinationCoordinates: req.body.destinationCoordinates } : {}),
        ...(req.body.estimatedDelivery ? { estimatedDelivery: req.body.estimatedDelivery } : {}),
        ...(req.body.originalEstimatedDelivery ? { originalEstimatedDelivery: req.body.originalEstimatedDelivery } : {}),
        ...(req.body.delayReason ? { delayReason: req.body.delayReason } : {}),
        ...(req.body.checkpoints ? { checkpoints: req.body.checkpoints } : {}),
        ...(req.body.assignedDriver ? { assignedDriver: req.body.assignedDriver } : {}),
        ...(req.body.driverId ? { driverId: req.body.driverId } : {})
    });
    res.status(201).json({ data: shipment });
});

app.post("/_test/driver", async (req, res) => {
    const driver = await Driver.create({
        id: `driver-${req.body.suffix}`,
        driverCode: `DRV-${req.body.suffix}`,
        name: "Test Driver",
        phone: "2025550100",
        licenseNumber: `LICENSE-${req.body.suffix}`,
        vehicleNumber: `VEHICLE-${req.body.suffix}`,
        currentLocation: req.body.currentLocation || { city: "Bengaluru", coordinates: { lat: 12.97, lng: 77.59 } },
        currentLocationUpdatedAt: req.body.noTimestamp ? null : new Date(req.body.updatedAt || Date.now()),
        ...(req.body.approvalStatus ? { approvalStatus: req.body.approvalStatus } : {})
    });
    const user = await User.create({
        id: `driver-user-${req.body.suffix}`,
        name: "Test Driver",
        email: `driver-${req.body.suffix}@example.test`,
        password: "test-password-hash",
        role: "driver",
        driverProfile: driver._id
    });
    const token = jwt.sign({ id: user.id, email: user.email, role: "driver" }, process.env.JWT_SECRET);
    res.status(201).json({ data: { token, userId: user.id, driverId: driver.id, driverObjectId: driver._id.toString() } });
});

app.post("/_test/driver-location", async (req, res) => {
    const driver = await Driver.findOneAndUpdate(
        { id: req.body.driverId },
        { $set: { currentLocation: req.body.currentLocation, currentLocationUpdatedAt: new Date(req.body.updatedAt || Date.now()) } },
        { new: true }
    );
    if (!driver) return res.status(404).json({ success: false });
    return res.json({ success: true });
});

app.post("/_test/events", async (req, res) => {
    const shipment = await Shipment.findOne({ trackingNumber: req.body.trackingNumber });
    const event = await TrackingEvent.create({
        shipment: shipment._id,
        shipmentId: shipment.trackingId,
        trackingNumber: shipment.trackingNumber,
        status: req.body.status,
        location: req.body.location
    });
    res.status(201).json({ data: event });
});

app.post("/_test/operations", async (_req, res) => {
    const user = await User.create({ id: `operations-${Date.now()}`, name: "Test Operations", email: `ops-${Date.now()}@example.test`, password: "unused", role: "operations" });
    const token = jwt.sign({ id: user.id, email: user.email, role: "operations" }, process.env.JWT_SECRET);
    res.status(201).json({ data: { token, userId: user.id } });
});

app.get("/_test/otp/:email", (req, res) => res.json({ otp: testOtps.get(req.params.email) || null }));

app.post("/_test/expire-reset", async (req, res) => {
    await PasswordReset.updateOne({ email: req.body.email, role: req.body.role }, { $set: { otpExpiresAt: new Date(Date.now() - 1000) } });
    res.json({ success: true });
});

app.post("/_test/checkpoints", async (req, res) => {
    const shipment = await Shipment.create({ id: `route-${Date.now()}`, trackingNumber: `ROUTE-${Date.now()}`, trackingId: `ROUTE-${Date.now()}`, senderName: "Route Sender", receiverName: "Route Receiver", origin: "Bengaluru", destination: "Mumbai", originCoordinates: { lat: 12.97, lng: 77.59 }, destinationCoordinates: { lat: 19.07, lng: 72.87 }, status: "IN_TRANSIT", currentStatus: "IN_TRANSIT", currentLocation: { city: "Bengaluru" } });
    const originalFetch = global.fetch;
    global.fetch = async (url, options) => String(url).includes("router.project-osrm.org")
        ? new Response(JSON.stringify({ routes: [{ geometry: { coordinates: [[77.59, 12.97], [78, 13.5], [79, 14], [80, 15], [81, 16], [82, 17], [83, 18], [72.87, 19.07]] } }] }), { status: 200, headers: { "Content-Type": "application/json" } })
        : originalFetch(url, options);
    try { await prepareCheckpoints(shipment); res.status(201).json({ data: shipment.checkpoints, shipmentId: shipment.id, trackingNumber: shipment.trackingNumber }); }
    finally { global.fetch = originalFetch; }
});

let mongoServer;
let httpServer;
let mongoDataDirectory;

const start = async () => {
    mongoDataDirectory = fs.mkdtempSync(path.join(__dirname, ".mongo-test-"));
    mongoServer = await MongoMemoryServer.create({
        instance: { dbPath: mongoDataDirectory }
    });
    await mongoose.connect(mongoServer.getUri());
    httpServer = app.listen(0, "127.0.0.1", () => {
        console.log(`TEST_SERVER_PORT=${httpServer.address().port}`);
    });
};

const stop = async () => {
    if (httpServer) {
        await new Promise((resolve) => httpServer.close(resolve));
    }

    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
    if (mongoDataDirectory) {
        fs.rmSync(mongoDataDirectory, { recursive: true, force: true });
        mongoDataDirectory = null;
    }
};

process.once("SIGTERM", () => {
    stop().finally(() => process.exit(0));
});

start().catch((error) => {
    console.error(error);
    stop().finally(() => process.exit(1));
});
