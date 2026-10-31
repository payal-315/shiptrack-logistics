const mongoose = require("mongoose");
const Shipment = require("../models/Shipment");
const TrackingEvent = require("../models/TrackingEvent");
const Driver = require("../models/Driver");
const { normalizeRole } = require("../middleware/requireRole");
const findAuthenticatedUser = require("../utils/authenticatedUser");
const geocodeRoute = require("../services/geocoding");
const { prepareCheckpoints, fillCheckpointNames } = require("../services/checkpoints");
const sendControllerError = require("./responseHelpers");
const { checkDriverEligibility } = require("../services/routeEligibility");
const { calculateEta, recomputeShipmentEta, forRole } = require("../services/eta");
const { updateDriverAfterDelivery, recomputeDriverAvailability, recomputeShipmentDriverAvailability } = require("../services/driverAvailability");
const { canonicalStatus, shipmentStatus } = require("../services/shipmentStatus");

const shipmentQuery = (id) => {
    const query = [
        { id },
        { trackingId: id },
        { trackingNumber: id }
    ];

    if (mongoose.Types.ObjectId.isValid(id)) {
        query.push({ _id: id });
    }

    return { $or: query };
};

const isPlainObject = (value) =>
    value !== null && typeof value === "object" && !Array.isArray(value);

const coordinatesAreValid = (coordinates) =>
    coordinates === null ||
    (isPlainObject(coordinates) &&
        Number.isFinite(coordinates.lat) &&
        coordinates.lat >= -90 &&
        coordinates.lat <= 90 &&
        Number.isFinite(coordinates.lng) &&
        coordinates.lng >= -180 &&
        coordinates.lng <= 180);

const sameLocation = (left, right) => {
    const fields = ["city", "state", "address"];
    if (fields.some((field) => (left?.[field] || "") !== (right?.[field] || ""))) {
        return false;
    }
    return left?.coordinates?.lat === right?.coordinates?.lat &&
        left?.coordinates?.lng === right?.coordinates?.lng;
};

const driverShipmentFilter = async (user) => {
    const driver = user.driverProfile
        ? await Driver.findById(user.driverProfile)
        : null;

    if (!driver) return null;
    if (driver.approvalStatus === "PENDING" || driver.approvalStatus === "REJECTED") return { _id: null };

    const conditions = [{ assignedDriver: driver._id }];

    const legacyDriverIds = [
        driver.id,
        driver.driverCode,
        driver._id.toString()
    ].filter(Boolean);

    if (legacyDriverIds.length > 0) {
        conditions.push({
            driverId: { $in: legacyDriverIds },
            $or: [{ assignedDriver: { $exists: false } }, { assignedDriver: null }]
        });
    }

    return { $or: conditions };
};

const customerShipmentFilter = (user) => ({
    $or: [
        { customer: user._id },
        {
            customerId: { $in: [...new Set([user.id, user._id.toString()].filter(Boolean))] },
            $or: [{ customer: { $exists: false } }, { customer: null }]
        }
    ]
});

const shipmentAccessFilter = async (user) => {
    const role = normalizeRole(user.role);
    if (role === "operations") return {};
    if (role === "customer") return customerShipmentFilter(user);
    if (role === "driver") return await driverShipmentFilter(user) || { _id: null };
    return { _id: null };
};

const createShipment = async (req, res) => {
    const body = req.body;
    const textFields = [
        "senderName",
        "senderPhone",
        "receiverName",
        "receiverPhone",
        "origin",
        "destination",
        "packageType"
    ];

    if (!isPlainObject(body)) {
        return res.status(400).json({
            success: false,
            message: "Shipment details are required"
        });
    }

    if (
        !["senderName", "receiverName", "origin", "destination"].every(
            (field) => typeof body[field] === "string" && body[field].trim()
        ) ||
        textFields.some(
            (field) => body[field] !== undefined &&
                (typeof body[field] !== "string" || body[field].length > 200)
        ) ||
        (body.weight !== undefined &&
            (!Number.isFinite(Number(body.weight)) || Number(body.weight) < 0))
    ) {
        return res.status(400).json({
            success: false,
            message: "Provide valid sender, receiver, route, and package details"
        });
    }

    try {
        const timestamp = Date.now();
        const user = await findAuthenticatedUser(req.user.id);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "Authenticated user was not found"
            });
        }

        const senderName = body.senderName.trim();
        const senderPhone = (body.senderPhone || "").trim();
        const receiverName = body.receiverName.trim();
        const receiverPhone = (body.receiverPhone || "").trim();
        const origin = body.origin.trim();
        const destination = body.destination.trim();
        const packageType = (body.packageType || "General").trim();
        const weight = body.weight === undefined ? 0 : Number(body.weight);
        const { originCoordinates, destinationCoordinates } =
            await geocodeRoute(origin, destination);
        const eta = await calculateEta(originCoordinates, destinationCoordinates);

        const shipment = await Shipment.create({
            id: timestamp.toString(),
            customer: normalizeRole(user.role) === "customer" ? user._id : undefined,
            customerId: normalizeRole(user.role) === "customer"
                ? user.id || user._id.toString()
                : undefined,
            trackingNumber: `LTS${timestamp}`,
            trackingId: `SHP${timestamp}`,
            sender: { name: senderName, phone: senderPhone, city: origin },
            receiver: { name: receiverName, phone: receiverPhone, city: destination },
            package: { type: packageType, weight },
            senderName,
            senderPhone,
            receiverName,
            receiverPhone,
            origin,
            destination,
            originCoordinates,
            destinationCoordinates,
            packageType,
            weight,
            status: "ORDER_CREATED",
            currentStatus: "ORDER_CREATED",
            currentLocation: { city: origin, ...(originCoordinates ? { coordinates: originCoordinates } : {}) },
            estimatedDelivery: eta,
            originalEstimatedDelivery: eta
        });

        // Route preparation must not add latency to shipment creation.
        setImmediate(() => {
            void prepareCheckpoints(shipment, { names: true }).catch((error) =>
                console.warn("Checkpoint generation failed:", error.message)
            );
        });

        return res.status(201).json({
            success: true,
            message: "Shipment created successfully",
            data: forRole(shipment, normalizeRole(user.role))
        });
    } catch (error) {
        return sendControllerError(res, error, "Failed to create shipment");
    }
};

const getShipments = async (req, res) => {
    try {
        const role = normalizeRole(req.user.role);
        let filter = {};

        if (role !== "operations") {
            const user = await findAuthenticatedUser(req.user.id);

            if (!user) {
                return res.status(401).json({
                    success: false,
                    message: "Authenticated user was not found"
                });
            }

            if (role === "customer") {
                filter = customerShipmentFilter(user);
            } else if (role === "driver") {
                filter = await driverShipmentFilter(user);

                if (!filter) {
                    return res.status(403).json({
                        success: false,
                        message: "Driver account is not linked to a driver profile"
                    });
                }
            }
        }

        const shipments = await Shipment.find(filter).populate("assignedDriver", "id name phone vehicleNumber status approvalStatus currentLocation currentLocationUpdatedAt availability assignmentLock").sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: shipments.length,
            data: shipments.map((shipment) => forRole(shipment, role))
        });
    } catch (error) {
        return sendControllerError(res, error, "Failed to fetch shipments");
    }
};

const getShipmentById = async (req, res) => {
    try {
        const user = await findAuthenticatedUser(req.user.id);
        if (!user) {
            return res.status(401).json({ success: false, message: "Authenticated user was not found" });
        }
        const accessFilter = await shipmentAccessFilter(user);
        const shipment = await Shipment.findOne({ $and: [shipmentQuery(req.params.id), accessFilter] })
            .populate("assignedDriver", "id name phone vehicleNumber status approvalStatus currentLocation currentLocationUpdatedAt availability assignmentLock");

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: "Shipment not found"
            });
        }

        return res.status(200).json({
            success: true,
            data: forRole(shipment, normalizeRole(user.role))
        });
    } catch (error) {
        return sendControllerError(res, error, "Failed to fetch shipment");
    }
};

const getShipmentCheckpoints = async (req, res) => {
    try {
        const user = await findAuthenticatedUser(req.user.id);
        if (!user) return res.status(401).json({ success: false, message: "Authenticated user was not found" });
        const accessFilter = await shipmentAccessFilter(user);
        const shipment = await Shipment.findOne({ $and: [shipmentQuery(req.params.id), accessFilter] });
        if (!shipment) return res.status(404).json({ success: false, message: "Shipment not found" });
        const coordinatesAreUsable = (coordinates) => coordinates &&
            Number.isFinite(coordinates.lat) && coordinates.lat >= -90 && coordinates.lat <= 90 &&
            Number.isFinite(coordinates.lng) && coordinates.lng >= -180 && coordinates.lng <= 180;
        const cachedRouteIsUsable = shipment.checkpoints?.length >= 2 && shipment.checkpoints.every((point) =>
            Number.isInteger(point.order) && coordinatesAreUsable(point.coordinates)
        );
        if (cachedRouteIsUsable) {
            if (shipment.checkpoints.some((point) => /^Checkpoint \d+$/.test(point.name))) fillCheckpointNames(shipment);
            return res.status(200).json({ success: true, data: shipment.checkpoints.slice().sort((a, b) => a.order - b.order).map((point, index) => ({ ...point.toJSON(), name: point.name || `Checkpoint ${index + 1}` })) });
        }
        if (shipment.checkpoints?.length) {
            console.warn(`[shipments/checkpoints] Invalid cached checkpoint coordinates for ${shipment.trackingNumber || shipment.id}; regenerating route`);
            shipment.checkpoints = [];
        }

        let { originCoordinates, destinationCoordinates } = shipment;
        if (!coordinatesAreUsable(originCoordinates) || !coordinatesAreUsable(destinationCoordinates)) {
            const resolved = await geocodeRoute(shipment.origin, shipment.destination);
            if (!coordinatesAreUsable(originCoordinates)) originCoordinates = resolved.originCoordinates;
            if (!coordinatesAreUsable(destinationCoordinates)) destinationCoordinates = resolved.destinationCoordinates;
        }
        if (!coordinatesAreUsable(originCoordinates)) {
            return res.status(422).json({ success: false, message: "Origin coordinates are missing or invalid. Edit the origin coordinates and retry." });
        }
        if (!coordinatesAreUsable(destinationCoordinates)) {
            return res.status(422).json({ success: false, message: "Destination coordinates are missing or invalid. Edit the destination coordinates and retry." });
        }
        shipment.originCoordinates = originCoordinates;
        shipment.destinationCoordinates = destinationCoordinates;
        try {
            await prepareCheckpoints(shipment);
        } catch (error) {
            console.error(`[shipments/checkpoints] Failed for ${shipment.trackingNumber || shipment.id}:`, error);
            return res.status(503).json({ success: false, message: `Route checkpoints could not be saved: ${error.message}` });
        }
        fillCheckpointNames(shipment);
        return res.status(200).json({ success: true, data: shipment.checkpoints });
    } catch (error) {
        return sendControllerError(res, error, "Failed to fetch shipment checkpoints");
    }
};

const shipmentUpdateFields = new Set([
    "senderName",
    "senderPhone",
    "receiverName",
    "receiverPhone",
    "origin",
    "destination",
    "packageType",
    "weight",
    "status",
    "currentStatus",
    "currentLocation",
    "estimatedDelivery",
    "expectedDeliveryAt",
    "deliveredAt",
    "sender",
    "receiver",
    "package",
    "originCoordinates",
    "destinationCoordinates",
    "delayReason"
]);

const updateShipment = async (req, res) => {
    const body = req.body;

    if (
        !isPlainObject(body) ||
        Object.keys(body).length === 0 ||
        Object.keys(body).some((field) => !shipmentUpdateFields.has(field))
    ) {
        return res.status(400).json({
            success: false,
            message: "Provide valid shipment fields to update"
        });
    }

    if (
        ["senderName", "senderPhone", "receiverName", "receiverPhone", "origin",
            "destination", "packageType", "status", "currentStatus", "delayReason"]
            .some((field) => body[field] !== undefined &&
                typeof body[field] !== "string") ||
        (body.weight !== undefined &&
            (!Number.isFinite(Number(body.weight)) || Number(body.weight) < 0)) ||
        (body.currentLocation !== undefined &&
            !(typeof body.currentLocation === "string" ||
                isPlainObject(body.currentLocation))) ||
        (body.originCoordinates !== undefined &&
            !coordinatesAreValid(body.originCoordinates)) ||
        (body.destinationCoordinates !== undefined &&
            !coordinatesAreValid(body.destinationCoordinates)) ||
        (body.delayReason !== undefined && body.delayReason.length > 500)
    ) {
        return res.status(400).json({
            success: false,
            message: "Shipment update contains invalid field values"
        });
    }

    try {
        const updates = { ...body };
        const routeChanged = updates.originCoordinates !== undefined || updates.destinationCoordinates !== undefined;
        if (routeChanged) updates.checkpoints = [];
        let requestedStatus;

        if (typeof updates.currentLocation === "string") {
            updates.currentLocation = { city: updates.currentLocation.trim() };
        }

        if (updates.weight !== undefined) {
            updates.weight = Number(updates.weight);
        }

        const previous = await Shipment.findOne(shipmentQuery(req.params.id));
        if (!previous) {
            return res.status(404).json({ success: false, message: "Shipment not found" });
        }
        if (updates.status !== undefined || updates.currentStatus !== undefined) {
            requestedStatus = updates.currentStatus ?? updates.status;
            const priorStatus = shipmentStatus(previous);
            requestedStatus = canonicalStatus(requestedStatus);
            const nextStatus = requestedStatus;
            if (priorStatus === "DELIVERED" && nextStatus !== "DELIVERED") {
                return res.status(409).json({ success: false, message: "Delivered shipments cannot be changed to another status." });
            }
            updates.status = requestedStatus;
            updates.currentStatus = requestedStatus;
            if (String(requestedStatus).trim().toUpperCase().replaceAll(" ", "_") === "DELIVERED" && !previous.deliveredAt) {
                updates.deliveredAt = new Date();
            }
        }

        const shipment = await Shipment.findOneAndUpdate(
            shipmentQuery(req.params.id),
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: "Shipment not found"
            });
        }
        if (routeChanged || updates.currentLocation !== undefined || updates.status !== undefined || updates.currentStatus !== undefined) {
            await recomputeShipmentEta(shipment);
            await shipment.save();
        }
        if (requestedStatus !== undefined && requestedStatus !== shipmentStatus(previous)) {
            if (requestedStatus === "DELIVERED") await updateDriverAfterDelivery(shipment);
            else await recomputeShipmentDriverAvailability(shipment);
        }
        if (routeChanged) {
            setImmediate(() => {
                void prepareCheckpoints(shipment, { names: true }).catch((error) =>
                    console.warn("Checkpoint regeneration failed:", error.message)
                );
            });
        }

        const nextLocation = updates.currentLocation === undefined
            ? previous.currentLocation
            : typeof updates.currentLocation === "string"
                ? { city: updates.currentLocation.trim() }
                : updates.currentLocation;
        const statusChanged = requestedStatus !== undefined &&
            (requestedStatus !== previous.currentStatus || requestedStatus !== previous.status);
        const locationChanged = updates.currentLocation !== undefined && !sameLocation(nextLocation, previous.currentLocation);
        if (statusChanged || locationChanged) {
            await TrackingEvent.create({
                shipment: shipment._id,
                shipmentId: shipment.trackingId,
                trackingNumber: shipment.trackingNumber,
                status: shipmentStatus(shipment),
                location: shipment.currentLocation,
                note: locationChanged ? "Shipment location updated" : "Shipment status updated"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Shipment updated successfully",
            data: forRole(shipment, normalizeRole(req.user.role))
        });
    } catch (error) {
        return sendControllerError(res, error, "Failed to update shipment");
    }
};

const assignDriver = async (req, res) => {
    const { driverId } = req.body || {};

    if (driverId !== null && driverId !== undefined && (typeof driverId !== "string" || !driverId.trim())) {
        return res.status(400).json({
            success: false,
            message: "A driver ID is required"
        });
    }

    try {
        const shipment = await Shipment.findOne(shipmentQuery(req.params.id));

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: "Shipment not found"
            });
        }

        const previousDriverId = shipment.assignedDriver;
        if (!driverId) {
            shipment.assignedDriver = null;
            shipment.driverId = "";
            await recomputeShipmentEta(shipment);
            await shipment.save();
            if (previousDriverId) await TrackingEvent.create({ shipment: shipment._id, shipmentId: shipment.trackingId, trackingNumber: shipment.trackingNumber, status: shipmentStatus(shipment), location: shipment.currentLocation, note: "Driver assignment removed" });
            if (previousDriverId) await recomputeDriverAvailability(previousDriverId);
            return res.status(200).json({ success: true, message: "Driver unassigned successfully", data: forRole(shipment, "operations") });
        }
        const lookup = [
            { id: driverId.trim() },
            { driverCode: driverId.trim() }
        ];
        if (mongoose.Types.ObjectId.isValid(driverId)) lookup.push({ _id: driverId });
        let driver = await Driver.findOne({ $or: lookup });
        if (!driver) return res.status(404).json({ success: false, message: "Driver not found" });

        // Recover a stale reservation lock from canonical shipment state before
        // deciding whether this driver can take a new assignment.
        await recomputeDriverAvailability(driver._id);
        driver = await Driver.findById(driver._id);

        if (previousDriverId && previousDriverId.toString() === driver._id.toString()) {
            await shipment.populate("assignedDriver", "id name phone vehicleNumber status approvalStatus currentLocation currentLocationUpdatedAt availability assignmentLock");
            return res.status(200).json({ success: true, message: "Driver is already assigned", data: forRole(shipment, "operations") });
        }

        const eligibility = await checkDriverEligibility(driver, shipment, { excludeShipmentId: shipment._id });
        if (!eligibility.eligible) return res.status(409).json({ success: false, message: eligibility.reason });
        const priorDriverId = shipment.assignedDriver;
        const reservation = await Driver.findOneAndUpdate({
            _id: driver._id,
            approvalStatus: "APPROVED",
            assignmentLock: { $ne: true },
            currentLocationUpdatedAt: driver.currentLocationUpdatedAt
        }, { $set: { assignmentLock: true, availability: "BUSY", status: "On trip" } }, { new: true });
        if (!reservation) return res.status(409).json({ success: false, message: "Driver was assigned to another active shipment or is no longer available. Refresh the driver list." });
        try {
            shipment.assignedDriver = driver._id;
            shipment.driverId = driver.id || driver.driverCode || driver._id.toString();
            await recomputeShipmentEta(shipment);
            await shipment.save();
        } catch (assignmentError) {
            await recomputeDriverAvailability(driver._id);
            throw assignmentError;
        }
        if (priorDriverId && priorDriverId.toString() !== driver._id.toString()) {
            await recomputeDriverAvailability(priorDriverId);
        }
        if (!priorDriverId || priorDriverId.toString() !== driver._id.toString()) {
            await TrackingEvent.create({ shipment: shipment._id, shipmentId: shipment.trackingId, trackingNumber: shipment.trackingNumber, status: shipmentStatus(shipment), location: shipment.currentLocation, note: `Assigned to ${driver.name}` });
        }
        await shipment.populate("assignedDriver", "id name phone vehicleNumber status approvalStatus currentLocation currentLocationUpdatedAt availability assignmentLock");

        return res.status(200).json({
            success: true,
            message: "Driver assigned successfully",
            data: forRole(shipment, "operations")
        });
    } catch (error) {
        return sendControllerError(res, error, "Failed to assign driver");
    }
};

const deleteShipment = async (req, res) => {
    try {
        const deletedShipment = await Shipment.findOneAndDelete(
            shipmentQuery(req.params.id)
        );

        if (!deletedShipment) {
            return res.status(404).json({
                success: false,
                message: "Shipment not found"
            });
        }

        await recomputeShipmentDriverAvailability(deletedShipment);

        return res.status(200).json({
            success: true,
            message: "Shipment deleted successfully",
            data: deletedShipment
        });
    } catch (error) {
        return sendControllerError(res, error, "Failed to delete shipment");
    }
};

module.exports = {
    createShipment,
    getShipments,
    getShipmentById,
    getShipmentCheckpoints,
    updateShipment,
    assignDriver,
    deleteShipment
};
