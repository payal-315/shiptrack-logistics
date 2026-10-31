const Driver = require("../models/Driver");
const Shipment = require("../models/Shipment");
const { reverseGeocode } = require("./geocoding");
const { activeStatus } = require("./routeEligibility");

const maxAccuracyMeters = () => {
    const configured = Number(process.env.DRIVER_MAX_LOCATION_ACCURACY_METERS);
    return Number.isFinite(configured) && configured >= 0 ? configured : 5000;
};

const displayLocation = (location) => {
    if (!location) return location;
    const accuracy = normalizeAccuracy(location.accuracy);
    if (accuracy !== null && accuracy > maxAccuracyMeters()) {
        return { city: `Approximate location (±${(accuracy / 1000).toFixed(1)} km)`, accuracy };
    }
    return { ...location };
};

const normalizedCoordinates = (coordinates) => {
    if (!coordinates) return null;
    const lat = Number(coordinates.lat), lng = Number(coordinates.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
    return { lat, lng };
};

const normalizeAccuracy = (accuracy) => Number.isFinite(Number(accuracy)) && accuracy !== null && accuracy !== ""
    ? Math.max(0, Number(accuracy))
    : null;

const locationFromCoordinates = async (coordinates, accuracy) => {
    const normalized = normalizedCoordinates(coordinates);
    if (!normalized) throw new Error("Location coordinates are missing or invalid");
    const accuracyMeters = normalizeAccuracy(accuracy);
    const approximate = accuracyMeters !== null && accuracyMeters > maxAccuracyMeters();
    const city = approximate ? "Unknown location" : await reverseGeocode(normalized.lat, normalized.lng) || "Unknown location";
    return { city, coordinates: normalized, accuracy: accuracyMeters };
};

const persistDriverLocation = async (driverId, location, { syncActiveShipments = true } = {}) => {
    const coordinates = normalizedCoordinates(location?.coordinates);
    const accuracy = normalizeAccuracy(location?.accuracy);
    const city = typeof location?.city === "string" && location.city.trim() ? location.city.trim() : "Unknown location";
    const currentLocation = { city, ...(coordinates ? { coordinates } : {}), accuracy };
    const currentLocationUpdatedAt = new Date();
    const driver = await Driver.findByIdAndUpdate(driverId, {
        $set: { currentLocation, currentLocationUpdatedAt }
    }, { new: true });
    if (!driver) return null;

    if (syncActiveShipments) {
        const ids = [driver.id, driver.driverCode, driver._id.toString()].filter(Boolean);
        const assigned = await Shipment.find({ $or: [
            { assignedDriver: driver._id },
            { driverId: { $in: ids } }
        ] }).select("_id id status currentStatus").lean();
        const activeIds = assigned.filter(activeStatus).map((shipment) => shipment._id);
        if (activeIds.length) await Shipment.updateMany({ _id: { $in: activeIds } }, { $set: { currentLocation: displayLocation(currentLocation) } });
    }

    return { driver, currentLocation, currentLocationUpdatedAt };
};

module.exports = { maxAccuracyMeters, normalizeAccuracy, normalizedCoordinates, locationFromCoordinates, persistDriverLocation, displayLocation };
