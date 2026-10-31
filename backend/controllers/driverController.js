const mongoose = require("mongoose");
const Driver = require("../models/Driver");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { randomUUID } = require("node:crypto");
const Shipment = require("../models/Shipment");
const { activeStatus, assessDriverAvailability, checkDriverEligibility, locationFreshnessReason } = require("../services/routeEligibility");
const geocodeRoute = require("../services/geocoding");
const { locationFromCoordinates, persistDriverLocation } = require("../services/driverLocation");
const findAuthenticatedUser = require("../utils/authenticatedUser");
const { shipmentStatus } = require("../services/shipmentStatus");
const { recomputeDriverAvailability } = require("../services/driverAvailability");

const updateCurrentCity = async (req, res) => {
    const city = typeof req.body?.city === "string" ? req.body.city.trim() : "";
    if (!city || city.length > 120) return res.status(400).json({ success: false, message: "Enter a current city." });
    try {
        const user = await findAuthenticatedUser(req.user.id);
        if (!user?.driverProfile) return res.status(403).json({ success: false, message: "Driver profile is unavailable." });
        const coordinates = (await geocodeRoute(city, city)).originCoordinates;
        const location = { city: coordinates ? city : "Unknown location", ...(coordinates ? { coordinates } : {}), accuracy: null };
        const result = await persistDriverLocation(user.driverProfile, location);
        return res.json({ success: true, data: { currentLocation: result.currentLocation, currentLocationUpdatedAt: result.currentLocationUpdatedAt } });
    } catch (_error) { return res.status(500).json({ success: false, message: "Unable to update current city." }); }
};

const signupDriver = async (req, res) => {
    const { name, email, phone, password, licenseNumber, vehicleNumber, vehicleType, baseCity } = req.body || {};
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
        typeof phone !== "string" || phone.trim().length < 7 || phone.trim().length > 30 ||
        typeof password !== "string" || password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password) ||
        typeof licenseNumber !== "string" || !licenseNumber.trim() ||
        typeof vehicleNumber !== "string" || !vehicleNumber.trim() ||
        typeof vehicleType !== "string" || !vehicleType.trim() || typeof baseCity !== "string" || !baseCity.trim()) {
        return res.status(400).json({ success: false, message: "Enter valid driver details and a password with at least 8 characters, one letter, and one number." });
    }
    let user;
    let driver;
    try {
        if (await User.findOne({ email: normalizedEmail })) return res.status(409).json({ success: false, message: "An account with this email already exists." });
        const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (await Driver.findOne({ licenseNumber: new RegExp(`^${escapeRegExp(licenseNumber.trim())}$`, "i") })) return res.status(409).json({ success: false, message: "This license number is already registered." });
        if (await Driver.findOne({ vehicleNumber: new RegExp(`^${escapeRegExp(vehicleNumber.trim())}$`, "i") })) return res.status(409).json({ success: false, message: "This vehicle number is already registered." });
        user = await User.create({ id: randomUUID(), name: name.trim(), email: normalizedEmail, phone: phone.trim(), password: await bcrypt.hash(password, 10), role: "driver" });
        const city = baseCity.trim();
        const coordinates = (await geocodeRoute(city, city)).originCoordinates;
        const currentLocation = { city: coordinates ? city : "Unknown location", ...(coordinates ? { coordinates } : {}), accuracy: null };
        driver = await Driver.create({ id: randomUUID(), driverCode: `DRV${Date.now()}`, name: name.trim(), phone: phone.trim(), licenseNumber: licenseNumber.trim().toUpperCase(), vehicleNumber: vehicleNumber.trim().toUpperCase(), vehicleType: vehicleType.trim(), baseCity: city, baseLocation: { city, ...(coordinates ? { coordinates } : {}) }, currentLocation, currentLocationUpdatedAt: new Date(), status: "Pending approval", approvalStatus: "PENDING", availability: "OFFLINE" });
        user.driverProfile = driver._id;
        await user.save();
        return res.status(201).json({ success: true, message: "Driver application submitted. Operations must approve your account before you can receive shipments." });
    } catch (error) {
        if (driver) await Driver.deleteOne({ _id: driver._id }).catch(() => {});
        if (user) await User.deleteOne({ _id: user._id }).catch(() => {});
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0];
            const messages = { email: "An account with this email already exists.", licenseNumber: "This license number is already registered.", vehicleNumber: "This vehicle number is already registered." };
            return res.status(409).json({ success: false, message: messages[field] || "These driver details are already registered." });
        }
        return res.status(500).json({ success: false, message: "Unable to submit your driver application." });
    }
};

const getPendingDrivers = async (_req, res) => {
    try { return res.json({ success: true, data: await Driver.find({ approvalStatus: "PENDING" }).sort({ createdAt: 1 }) }); }
    catch (_error) { return res.status(500).json({ success: false, message: "Unable to load pending drivers." }); }
};

const reviewDriver = async (req, res) => {
    const approvalStatus = req.params.action === "approve" ? "APPROVED" : "REJECTED";
    try {
        const driver = await Driver.findOneAndUpdate({ ...driverQuery(req.params.id), approvalStatus: "PENDING" }, { approvalStatus, status: approvalStatus === "APPROVED" ? "Available" : "Rejected", availability: approvalStatus === "APPROVED" ? "AVAILABLE" : "OFFLINE" }, { new: true });
        if (!driver) return res.status(404).json({ success: false, message: "Pending driver not found." });
        return res.json({ success: true, data: driver });
    } catch (_error) { return res.status(500).json({ success: false, message: "Unable to update driver approval." }); }
};

const driverQuery = (id) => {
    const query = [
        { id },
        { driverCode: id }
    ];

    if (mongoose.Types.ObjectId.isValid(id)) {
        query.push({ _id: id });
    }

    return { $or: query };
};

const createDriver = async (req, res) => {
    try {
        const {
            name,
            phone,
            licenseNumber,
            vehicleNumber,
            vehicleType
        } = req.body;

        if (!name || !phone || !licenseNumber || !vehicleNumber) {
            return res.status(400).json({
                success: false,
                message: "Required driver details are missing"
            });
        }

        const driver = await Driver.create({
            id: Date.now().toString(),
            driverCode: `DRV${Date.now()}`,
            name,
            phone,
            licenseNumber,
            vehicleNumber,
            vehicleType: vehicleType || "Delivery Van",
            status: "Available",
            availability: "AVAILABLE"
        });

        res.status(201).json({
            success: true,
            message: "Driver created successfully",
            data: driver
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to create driver",
            error: error.message
        });
    }
};

const getDrivers = async (req, res) => {
    try {
        let drivers = await Driver.find({ approvalStatus: "APPROVED" }).sort({ createdAt: -1 });
        if (req.query.shipmentId) {
            const shipment = await Shipment.findOne({ $or: [{ id: req.query.shipmentId }, { trackingNumber: req.query.shipmentId }, { trackingId: req.query.shipmentId }] });
            if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });
            drivers = await Promise.all(drivers.map(async (driver) => {
                const eligibility = await checkDriverEligibility(driver, shipment);
                return { ...driver.toJSON(), eligible: eligibility.eligible, ineligibleReason: eligibility.reason || "", ineligibleReasons: eligibility.reasons || [] };
            }));
        }

        res.status(200).json({
            success: true,
            count: drivers.length,
            data: drivers
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch drivers",
            error: error.message
        });
    }
};

const getAvailableDrivers = async (req, res) => {
    try {
        const shipment = await Shipment.findOne({ $or: [{ id: req.params.id }, { trackingNumber: req.params.id }, { trackingId: req.params.id }] });
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });
        const debugEnabled = process.env.NODE_ENV !== "production" && req.query.debug === "true";
        const drivers = await Driver.find(debugEnabled ? {} : { approvalStatus: "APPROVED" }).sort({ createdAt: -1 });
        const assignedId = shipment.assignedDriver?.toString() || "";
        const available = [];
        const debug = [];
        for (const driver of drivers) {
            const isAssigned = driver._id.toString() === assignedId;
            const eligibility = isAssigned
                ? { eligible: true, distanceKm: null }
                : await checkDriverEligibility(driver, shipment);
            if (debugEnabled) {
                const driverIds = [driver.id, driver.driverCode, driver._id?.toString()].filter(Boolean);
                const assignments = await Shipment.find({ $or: [{ assignedDriver: driver._id }, { driverId: { $in: driverIds } }] })
                    .select("id trackingNumber currentStatus status origin destination")
                    .lean();
                const blockingShipments = assignments.filter(activeStatus).map((assignment) => ({
                    id: assignment.id || assignment._id.toString(),
                    trackingNumber: assignment.trackingNumber,
                    status: shipmentStatus(assignment)
                }));
                debug.push({
                    id: driver.id || driver._id.toString(), name: driver.name,
                    approvalStatus: driver.approvalStatus,
                    currentLocation: driver.currentLocation || null,
                    currentLocationUpdatedAt: driver.currentLocationUpdatedAt || null,
                    included: Boolean(eligibility.eligible),
                    reason: isAssigned ? "Already assigned to this shipment" : eligibility.eligible ? "Eligible" : eligibility.reason,
                    reasons: isAssigned ? [] : eligibility.reasons || (eligibility.reason ? [eligibility.reason] : []),
                    distanceKm: eligibility.distanceKm ?? null,
                    activeShipments: assignments.filter(activeStatus).map((assignment) => ({ id: assignment.id || assignment._id.toString(), trackingNumber: assignment.trackingNumber, status: shipmentStatus(assignment), origin: assignment.origin, destination: assignment.destination })),
                    blockingShipments
                });
            }
            if (eligibility.eligible) {
                available.push({
                    ...driver.toJSON(),
                    eligible: true,
                    assigned: isAssigned,
                    distanceKm: eligibility.distanceKm
                });
            }
        }
        return res.json({ success: true, count: available.length, data: available, ...(debugEnabled ? { debug } : {}) });
    } catch (error) {
        console.error(`[drivers/available] Failed for shipment ${req.params.id}:`, error);
        return res.status(500).json({ success: false, message: "Unable to load drivers at this shipment's origin." });
    }
};

const recomputeAvailability = async (req, res) => {
    try {
        const driver = await Driver.findOne(driverQuery(req.params.id)).select("_id id");
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });
        const result = await recomputeDriverAvailability(driver._id);
        return res.json({ success: true, data: result });
    } catch (_error) {
        return res.status(500).json({ success: false, message: "Unable to recompute driver availability." });
    }
};

const getDriverSummaries = async (_req, res) => {
    try {
        const drivers = await Driver.aggregate([
            { $match: { approvalStatus: "APPROVED" } },
            {
                $lookup: {
                    from: Shipment.collection.name,
                    let: { driverObjectId: "$_id", driverIds: ["$id", "$driverCode", { $toString: "$_id" }] },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        {
                                            $or: [
                                                { $eq: ["$assignedDriver", "$$driverObjectId"] },
                                                {
                                                    $and: [
                                                        { $in: [{ $ifNull: ["$assignedDriver", null] }, [null]] },
                                                        { $in: ["$driverId", "$$driverIds"] }
                                                    ]
                                                }
                                            ]
                                        },
                                        {
                                            $not: [{
                                                $in: [
                                                    { $toUpper: { $ifNull: ["$currentStatus", "$status"] } },
                                                    ["DELIVERED", "CANCELLED", "CANCELED"]
                                                ]
                                            }]
                                        }
                                    ]
                                }
                            }
                        },
                        { $count: "total" }
                    ],
                    as: "activeShipmentCount"
                }
            },
            { $addFields: { activeShipmentCount: { $ifNull: [{ $arrayElemAt: ["$activeShipmentCount.total", 0] }, 0] } } },
            { $sort: { createdAt: -1 } }
        ]);
        const data = await Promise.all(drivers.map(async (driver) => {
            const availability = await assessDriverAvailability(driver);
            return {
                ...driver,
                effectiveAvailability: availability.available ? "AVAILABLE" : "UNAVAILABLE",
                availabilityReasons: availability.reasons,
                locationFreshnessReason: locationFreshnessReason(driver),
                activeShipmentCount: availability.activeShipments.length
            };
        }));
        return res.json({ success: true, count: data.length, data });
    } catch (_error) {
        return res.status(500).json({ success: false, message: "Unable to load driver summaries." });
    }
};

const getDriverById = async (req, res) => {
    try {
        const driver = await Driver.findOne(driverQuery(req.params.id));

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        res.status(200).json({
            success: true,
            data: driver
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to fetch driver",
            error: error.message
        });
    }
};

const updateDriver = async (req, res) => {
    try {
        const updates = { ...req.body };
        let locationUpdate;
        if (updates.currentLocation !== undefined) {
            const incoming = updates.currentLocation;
            if (incoming?.coordinates) locationUpdate = await locationFromCoordinates(incoming.coordinates, incoming.accuracy);
            else {
                const city = typeof incoming === "string" ? incoming.trim() : String(incoming?.city || "").trim();
                if (!city) return res.status(400).json({ success: false, message: "Enter a location city or valid coordinates." });
                const coordinates = (await geocodeRoute(city, city)).originCoordinates;
                locationUpdate = { city: coordinates ? city : "Unknown location", ...(coordinates ? { coordinates } : {}), accuracy: null };
            }
            delete updates.currentLocation;
        }
        const driver = await Driver.findOneAndUpdate(
            driverQuery(req.params.id),
            updates,
            {
                new: true,
                runValidators: true
            }
        );

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        const persistedLocation = locationUpdate ? await persistDriverLocation(driver._id, locationUpdate) : null;

        res.status(200).json({
            success: true,
            message: "Driver updated successfully",
            data: persistedLocation?.driver || driver
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to update driver",
            error: error.message
        });
    }
};

const deleteDriver = async (req, res) => {
    try {
        const existing = await Driver.findOne(driverQuery(req.params.id));
        if (!existing || existing.approvalStatus === "REMOVED") return res.status(404).json({ success: false, message: "Driver not found" });
        const assigned = await Shipment.find({ assignedDriver: existing._id }).select("status currentStatus");
        const active = assigned.filter(activeStatus).length;
        if (active) return res.status(409).json({ success: false, message: "Reassign or unassign this driver's active shipments before removal." });
        const deletedDriver = await Driver.findByIdAndUpdate(existing._id, { $set: { approvalStatus: "REMOVED", status: "REMOVED", availability: "OFFLINE" }, $inc: { tokenVersion: 1 } }, { new: true });
        await User.updateOne({ driverProfile: existing._id }, { $inc: { tokenVersion: 1 } });

        if (!deletedDriver) {
            return res.status(404).json({
                success: false,
                message: "Driver not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Driver deleted successfully",
            data: deletedDriver
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: "Failed to delete driver",
            error: error.message
        });
    }
};

module.exports = {
    signupDriver,
    updateCurrentCity,
    getPendingDrivers,
    reviewDriver,
    createDriver,
    getDrivers,
    getAvailableDrivers,
    getDriverSummaries,
    getDriverById,
    recomputeAvailability,
    updateDriver,
    deleteDriver
};
