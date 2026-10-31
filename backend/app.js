const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/authRoutes");
const shipmentRoutes = require("./routes/shipmentRoutes");
const trackingRoutes = require("./routes/trackingRoutes");
const driverRoutes = require("./routes/driverRoutes");

const app = express();

const allowedOrigins = new Set(
    (process.env.CORS_ORIGIN || "http://localhost:5173")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
);
if (process.env.NODE_ENV !== "production") {
    for (const port of [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180]) {
        allowedOrigins.add(`http://localhost:${port}`);
        allowedOrigins.add(`http://127.0.0.1:${port}`);
    }
}

const corsOptions = {
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error("Origin is not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.use(express.json());

app.get("/", (_req, res) => {
    res.json({
        message: "Logistics Tracking API is running"
    });
});

app.use("/api/auth", authRoutes);
app.use("/api/shipments", shipmentRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/drivers", driverRoutes);

module.exports = app;
