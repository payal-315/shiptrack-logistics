const Shipment = require("../models/Shipment");
const TrackingEvent = require("../models/TrackingEvent");
const Driver = require("../models/Driver");
const { normalizeRole } = require("../middleware/requireRole");
const findAuthenticatedUser = require("../utils/authenticatedUser");
const sendControllerError = require("./responseHelpers");
const { recomputeShipmentEta, delayFields } = require("../services/eta");
const { updateDriverAfterDelivery, recomputeShipmentDriverAvailability } = require("../services/driverAvailability");
const geocodeRoute = require("../services/geocoding");
const { locationFromCoordinates, persistDriverLocation, displayLocation } = require("../services/driverLocation");
const { canonicalStatus, shipmentStatus } = require("../services/shipmentStatus");
const roleFor = (user) => normalizeRole(user.role);

const findShipment = (trackingNumber) => {
    const value = String(trackingNumber || "").trim();
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const identifier = new RegExp(`^${escaped}$`, "i");
    return Shipment.findOne({
        $or: [
            { trackingNumber: identifier },
            { trackingId: identifier }
        ]
    });
};

const canViewShipment = async (req, shipment) => {
    const role = roleFor(req.user);

    if (role === "operations") {
        return true;
    }

    const user = await findAuthenticatedUser(req.user.id);

    if (!user) {
        return false;
    }

    if (role === "customer") {
        return shipment.customer
            ? shipment.customer.toString() === user._id.toString()
            : [user.id, user._id.toString()].filter(Boolean).includes(shipment.customerId);
    }
    if (role !== "driver" || !user.driverProfile) return false;
    const Driver = require("../models/Driver");
    const driver = await Driver.findById(user.driverProfile);
    if (!driver) return false;
    return shipment.assignedDriver
        ? shipment.assignedDriver.toString() === driver._id.toString()
        : [driver.id, driver.driverCode, driver._id.toString()].filter(Boolean).includes(shipment.driverId);
};

const sameLocation = (left, right) => {
    const fields = ["city", "state", "address"];

    if (fields.some((field) => left?.[field] !== right?.[field])) {
        return false;
    }

    return left?.coordinates?.lat === right?.coordinates?.lat &&
        left?.coordinates?.lng === right?.coordinates?.lng;
};

const checkpointIndexForLocation = (shipment, location) => shipment.checkpoints.findIndex((point) =>
    (location?.city && point.name.toLowerCase() === location.city.toLowerCase()) ||
    (location?.coordinates && Math.abs(point.coordinates.lat - location.coordinates.lat) < 0.0001 && Math.abs(point.coordinates.lng - location.coordinates.lng) < 0.0001)
);

const getTrackingInfo = async (req, res) => {
    try {
        const shipment = await findShipment(req.params.trackingNumber);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: "Tracking number not found"
            });
        }

        if (!(await canViewShipment(req, shipment))) {
            return res.status(404).json({ success: false, message: "Tracking number not found" });
        }

        const assignedDriver = shipment.assignedDriver
            ? await Driver.findById(shipment.assignedDriver).select("currentLocation")
            : null;
        const currentLocation = assignedDriver?.currentLocation && !["DELIVERED", "CANCELLED"].includes(shipmentStatus(shipment))
            ? displayLocation(assignedDriver.currentLocation)
            : displayLocation(shipment.currentLocation);

        const events = await TrackingEvent.find({
            $or: [
                { trackingNumber: shipment.trackingNumber },
                { shipmentId: shipment.trackingId }
            ]
        }).sort({ timestamp: 1, createdAt: 1 });

        res.status(200).json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber || shipment.trackingId,
                trackingId: shipment.trackingId,
                status: shipmentStatus(shipment),
                currentLocation,
                origin: shipment.origin || shipment.sender?.city,
                destination: shipment.destination || shipment.receiver?.city,
                estimatedDelivery: shipment.estimatedDelivery || shipment.expectedDeliveryAt,
                originalEstimatedDelivery: shipment.originalEstimatedDelivery || null,
                ...delayFields(shipment),
                ...(["operations", "driver"].includes(roleFor(req.user)) ? { delayReason: shipment.delayReason || "" } : {}),
                events
            }
        });
    } catch (error) {
        return sendControllerError(
            res,
            error,
            "Failed to fetch tracking information"
        );
    }
};

const getTrackingEvents = async (req, res) => {
    try {
        const shipment = await findShipment(req.params.trackingNumber);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: "Tracking number not found"
            });
        }

        if (!(await canViewShipment(req, shipment))) {
            return res.status(404).json({ success: false, message: "Tracking number not found" });
        }

        const events = await TrackingEvent.find({
            $or: [
                { trackingNumber: shipment.trackingNumber },
                { shipmentId: shipment.trackingId }
            ]
        }).sort({ timestamp: -1, createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: events.length,
            data: events
        });
    } catch (error) {
        return sendControllerError(
            res,
            error,
            "Failed to fetch tracking events"
        );
    }
};

const getPublicTrackingInfo = async (req, res) => {
    try {
        const shipment = await findShipment(req.params.trackingNumber);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: "Tracking information not found"
            });
        }

        const assignedDriver = shipment.assignedDriver
            ? await Driver.findById(shipment.assignedDriver).select("currentLocation")
            : null;
        const currentLocation = assignedDriver?.currentLocation && !["DELIVERED", "CANCELLED"].includes(shipmentStatus(shipment))
            ? displayLocation(assignedDriver.currentLocation)
            : displayLocation(shipment.currentLocation);

        const events = await TrackingEvent.find({
            $or: [
                { trackingNumber: shipment.trackingNumber },
                { shipmentId: shipment.trackingId }
            ]
        })
            .select("status timestamp location.coordinates")
            .sort({ timestamp: -1, createdAt: -1 })
            .lean();

        const eventHistory = events.map((event) => ({
            status: event.status,
            timestamp: event.timestamp,
            locationCoordinates: event.location?.coordinates || null
        }));

        return res.status(200).json({
            success: true,
            data: {
                trackingNumber: shipment.trackingNumber || shipment.trackingId,
            status: shipmentStatus(shipment),
                origin: shipment.origin || shipment.sender?.city,
                destination: shipment.destination || shipment.receiver?.city,
                originCoordinates: shipment.originCoordinates || null,
                destinationCoordinates: shipment.destinationCoordinates || null,
                currentLocationCoordinates:
                    currentLocation?.coordinates || null,
                currentLocation: currentLocation ? {
                    city: currentLocation.city || "",
                    coordinates: currentLocation.coordinates || null,
                    accuracy: currentLocation.accuracy ?? null
                } : null,
                estimatedDelivery:
                    shipment.estimatedDelivery || shipment.expectedDeliveryAt || null,
                originalEstimatedDelivery: shipment.originalEstimatedDelivery || null,
                ...delayFields(shipment),
                events: eventHistory
            }
        });
    } catch (error) {
        return sendControllerError(
            res,
            error,
            "Failed to fetch public tracking information"
        );
    }
};

const updateTrackingStatus = async (req, res) => {
    const body = req.body;

    if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        (!body.status && !body.currentLocation && !body.estimatedDelivery && body.delayReason === undefined) ||
        (body.status !== undefined &&
            (typeof body.status !== "string" ||
                !body.status.trim() ||
                body.status.length > 100)) ||
        (body.currentLocation !== undefined &&
            !(typeof body.currentLocation === "string" ||
                (body.currentLocation &&
                    typeof body.currentLocation === "object" &&
                    !Array.isArray(body.currentLocation)))) ||
        (typeof body.currentLocation === "string" &&
            !body.currentLocation.trim()) ||
        (body.estimatedDelivery !== undefined &&
            Number.isNaN(Date.parse(body.estimatedDelivery))) ||
        (body.delayReason !== undefined && (typeof body.delayReason !== "string" || body.delayReason.length > 500))
    ) {
        return res.status(400).json({
            success: false,
            message: "Provide a valid status, location, or estimated delivery date"
        });
    }

    if (
        roleFor(req.user) === "driver" &&
        (body.estimatedDelivery !== undefined ||
        (body.status === undefined && body.currentLocation === undefined && body.delayReason === undefined))
    ) {
        return res.status(403).json({
            success: false,
            message: "Drivers may only update shipment status or location"
        });
    }

    try {
        const { status, currentLocation, estimatedDelivery, delayReason } = body;

        const shipment = await findShipment(req.params.trackingNumber);

        if (!shipment) {
            return res.status(404).json({
                success: false,
                message: "Tracking number not found"
            });
        }

        if (!(await canViewShipment(req, shipment))) {
            return res.status(404).json({ success: false, message: "Tracking number not found" });
        }

        const previousStatus = shipmentStatus(shipment);
        const normalizedPreviousStatus = previousStatus;
        const normalizedRequestedStatus = status === undefined ? undefined : canonicalStatus(status);
        if (normalizedPreviousStatus === "DELIVERED" && status !== undefined && normalizedRequestedStatus !== "DELIVERED") {
            return res.status(409).json({ success: false, message: "Delivered shipments cannot be changed to another status." });
        }
        const previousLocation = shipment.currentLocation;
        let nextLocation = currentLocation === undefined
            ? previousLocation
            : typeof currentLocation === "string"
                ? { city: currentLocation.trim() }
                : currentLocation;
        const statusChanged = status !== undefined && normalizedRequestedStatus !== previousStatus;
        let driverProfile = null;
        if (currentLocation !== undefined && ["driver", "operations"].includes(roleFor(req.user))) {
            if (roleFor(req.user) === "driver") {
                const user = await findAuthenticatedUser(req.user.id);
                if (user?.driverProfile) driverProfile = await Driver.findById(user.driverProfile).select("_id");
            } else if (shipment.assignedDriver) {
                driverProfile = await Driver.findById(shipment.assignedDriver).select("_id");
            }
            if (driverProfile && nextLocation?.coordinates) {
                nextLocation = await locationFromCoordinates(nextLocation.coordinates, nextLocation.accuracy);
            } else if (driverProfile && nextLocation?.city) {
                const city = nextLocation.city.trim();
                const coordinates = (await geocodeRoute(city, city)).originCoordinates;
                nextLocation = { city: coordinates ? city : "Unknown location", ...(coordinates ? { coordinates } : {}), accuracy: null };
            }
        }
        const locationChanged = currentLocation !== undefined && !sameLocation(previousLocation, nextLocation);

        const resetsRoute = roleFor(req.user) === "operations" &&
            [normalizedRequestedStatus, previousStatus].some((value) => value !== undefined &&
                ["ORDER_CREATED", "PENDING"].includes(String(value).trim().toUpperCase().replaceAll(" ", "_")));
        if (currentLocation !== undefined && !resetsRoute && shipment.checkpoints?.length) {
            const previousIndex = checkpointIndexForLocation(shipment, previousLocation);
            const nextIndex = checkpointIndexForLocation(shipment, nextLocation);
            if (previousIndex >= 0 && nextIndex >= 0 && nextIndex < previousIndex) {
                return res.status(400).json({ success: false, message: "A shipment cannot move back to a checkpoint it has already passed. Operations must reset the route status first." });
            }
        }

        if (status !== undefined) {
            shipment.status = normalizedRequestedStatus;
            shipment.currentStatus = normalizedRequestedStatus;
            if (normalizedRequestedStatus === "DELIVERED" && !shipment.deliveredAt) {
                shipment.deliveredAt = new Date();
            }
        }

        if (currentLocation !== undefined) {
            if (driverProfile) {
                await persistDriverLocation(driverProfile._id, nextLocation);
                shipment.currentLocation = displayLocation(nextLocation);
            } else {
                shipment.currentLocation = nextLocation;
            }
        }

        if (estimatedDelivery !== undefined) {
            shipment.estimatedDelivery = estimatedDelivery;
        }
        if (delayReason !== undefined) shipment.delayReason = delayReason.trim();

        if (statusChanged || locationChanged) await recomputeShipmentEta(shipment);

        await shipment.save();
        if (statusChanged) {
            if (normalizedRequestedStatus === "DELIVERED") await updateDriverAfterDelivery(shipment);
            else await recomputeShipmentDriverAvailability(shipment);
        }

        if (statusChanged || locationChanged || delayReason !== undefined) {
            await TrackingEvent.create({
                shipment: shipment._id,
                shipmentId: shipment.trackingId,
                trackingNumber: shipment.trackingNumber,
                status: shipmentStatus(shipment),
                location: shipment.currentLocation,
                note: delayReason !== undefined && !statusChanged && !locationChanged ? "Delay reason updated" : currentLocation !== undefined ? "Shipment location updated" : "Shipment status updated"
            });
        }

        return res.status(200).json({
            success: true,
            message: "Tracking information updated",
            data: shipment
        });
    } catch (error) {
        return sendControllerError(
            res,
            error,
            "Failed to update tracking information"
        );
    }
};

module.exports = {
    getTrackingInfo,
    getTrackingEvents,
    getPublicTrackingInfo,
    updateTrackingStatus
};
