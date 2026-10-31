const EARTH_KM = 6371;
const { shipmentStatus } = require("./shipmentStatus");
const { displayLocation } = require("./driverLocation");
const DAY_MS = 24 * 60 * 60 * 1000;
const kmPerDay = () => Math.max(1, Number(process.env.ETA_KM_PER_DAY) || 400);
const minimumDays = () => Math.max(1, Number(process.env.ETA_MIN_DAYS) || 3);
const unassignedBufferDays = () => {
    const configured = Number(process.env.ETA_UNASSIGNED_BUFFER_DAYS);
    return Number.isFinite(configured) && configured >= 0 ? configured : 1;
};
const delayThresholdHours = () => {
    const configured = Number(process.env.DELAY_THRESHOLD_HOURS);
    return Number.isFinite(configured) && configured >= 0 ? configured : 24;
};

const straightLineKm = (origin, destination) => {
    const radians = (degrees) => degrees * Math.PI / 180;
    const lat = radians(destination.lat - origin.lat);
    const lng = radians(destination.lng - origin.lng);
    const a = Math.sin(lat / 2) ** 2 +
        Math.cos(radians(origin.lat)) * Math.cos(radians(destination.lat)) *
        Math.sin(lng / 2) ** 2;
    return 2 * EARTH_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const getRouteDistanceKm = async (origin, destination) => {
    if (!origin || !destination || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng) ||
        !Number.isFinite(destination.lat) || !Number.isFinite(destination.lng)) return null;
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
        const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
        const meters = response.ok ? (await response.json()).routes?.[0]?.distance : null;
        if (Number.isFinite(meters) && meters >= 0) return meters / 1000;
    } catch (_error) { /* Use a conservative distance estimate if OSRM is unavailable. */ }
    return straightLineKm(origin, destination) * 1.3;
};

const deliveryDays = (distanceKm) => Math.max(minimumDays(), Math.ceil(distanceKm / kmPerDay()));

const calculateEta = async (origin, destination, { assignedDriver = null, excludeShipmentId = null, now = Date.now() } = {}) => {
    const distanceKm = await getRouteDistanceKm(origin, destination);
    if (distanceKm === null) return null;
    let days = deliveryDays(distanceKm);
    let driverTravelMs = 0, waitMs = 0;
    if (!assignedDriver) {
        days += unassignedBufferDays();
    } else {
        const Driver = require("../models/Driver");
        const Shipment = require("../models/Shipment");
        const driver = await Driver.findById(assignedDriver).select("currentLocation baseCity");
        let current = driver?.currentLocation?.coordinates;
        if (!current && driver?.baseCity) {
            const geocodeRoute = require("./geocoding");
            current = (await geocodeRoute(driver.baseCity, driver.baseCity)).originCoordinates;
        }
        if (current && origin) {
            const reachPickupKm = await getRouteDistanceKm(current, origin);
            if (reachPickupKm !== null) driverTravelMs = reachPickupKm / kmPerDay() * DAY_MS;
        }
        const query = { assignedDriver, status: { $nin: ["DELIVERED", "CANCELLED", "CANCELED", "Delivered", "Cancelled"] } };
        if (excludeShipmentId) query._id = { $ne: excludeShipmentId };
        const active = await Shipment.find(query).select("estimatedDelivery expectedDeliveryAt currentStatus status").lean();
        waitMs = active.reduce((max, shipment) => {
            const status = shipmentStatus(shipment);
            if (["DELIVERED", "CANCELLED"].includes(status)) return max;
            const eta = shipment.estimatedDelivery || shipment.expectedDeliveryAt;
            return eta ? Math.max(max, new Date(eta).getTime() - now) : max;
        }, 0);
        waitMs = Math.max(0, waitMs);
    }
    return new Date(now + days * DAY_MS + driverTravelMs + waitMs);
};

const recomputeShipmentEta = async (shipment) => {
    const origin = shipment.currentLocation?.coordinates || shipment.originCoordinates;
    if (!origin || !shipment.destinationCoordinates) return null;
    const eta = await calculateEta(origin, shipment.destinationCoordinates, {
        assignedDriver: shipment.assignedDriver || null,
        excludeShipmentId: shipment._id
    });
    if (eta) shipment.estimatedDelivery = eta;
    return eta;
};

const delayFields = (shipment) => {
    const eta = shipment.estimatedDelivery || shipment.expectedDeliveryAt;
    const original = shipment.originalEstimatedDelivery;
    const delivered = shipmentStatus(shipment) === "DELIVERED";
    const thresholdMs = delayThresholdHours() * 60 * 60 * 1000;
    return { isDelayed: Boolean(eta && ((original && new Date(eta).getTime() - new Date(original).getTime() > thresholdMs) || (!delivered && new Date(eta) < new Date()))), originalEstimatedDelivery: original || null };
};
const forRole = (shipment, role) => {
    const data = shipment.toJSON ? shipment.toJSON() : { ...shipment };
    const canonical = shipmentStatus(data);
    if (canonical) {
        data.status = canonical;
        data.currentStatus = canonical;
    }
    if (data.assignedDriver?.currentLocation && !["DELIVERED", "CANCELLED"].includes(canonical)) {
        data.currentLocation = displayLocation(data.assignedDriver.currentLocation);
    }
    if (!(["operations", "driver"].includes(role))) delete data.delayReason;
    return { ...data, ...delayFields(data) };
};

module.exports = { calculateEta, delayFields, forRole, deliveryDays, getRouteDistanceKm, straightLineKm, recomputeShipmentEta, delayThresholdHours };
