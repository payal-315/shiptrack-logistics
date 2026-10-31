const Shipment = require("../models/Shipment");
const { shipmentStatus } = require("./shipmentStatus");

const originRadiusKm = () => {
    const value = Number(process.env.DRIVER_ORIGIN_RADIUS_KM);
    return Number.isFinite(value) && value > 0 ? value : 30;
};

const locationMaxAgeMinutes = () => {
    if (process.env.DRIVER_LOCATION_MAX_AGE_MINUTES === "0") return 0;
    const value = Number(process.env.DRIVER_LOCATION_MAX_AGE_MINUTES);
    return Number.isFinite(value) && value > 0 ? value : 30;
};
const maxAccuracyMeters = () => {
    const value = Number(process.env.DRIVER_MAX_LOCATION_ACCURACY_METERS);
    return Number.isFinite(value) && value >= 0 ? value : 5000;
};

const activeStatus = (shipment) => !["DELIVERED", "CANCELLED", "CANCELED"].includes(shipmentStatus(shipment));

const distanceKm = (a, b) => {
    const radians = (value) => value * Math.PI / 180;
    const dLat = radians(b.lat - a.lat);
    const dLng = radians(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const validCoordinates = (coordinates) => coordinates &&
    Number.isFinite(coordinates.lat) && coordinates.lat >= -90 && coordinates.lat <= 90 &&
    Number.isFinite(coordinates.lng) && coordinates.lng >= -180 && coordinates.lng <= 180;

const normalizedCity = (city) => {
    const normalized = String(city || "").toLocaleLowerCase("en-IN").replace(/[^a-z0-9]+/g, "");
    // Bengaluru and Bangalore are commonly used interchangeably, including in
    // reverse-geocoder results such as "Bengaluru, Karnataka".
    return normalized.replace(/bengaluru|bangalore/g, "bangalore");
};

const locationProblems = (driver, now = Date.now()) => {
    const location = driver.currentLocation;
    if (!location || (!validCoordinates(location.coordinates) && !normalizedCity(location.city))) return ["No location set"];
    const problems = [];
    const maxAge = locationMaxAgeMinutes();
    if (maxAge !== 0) {
        const timestamp = driver.currentLocationUpdatedAt && new Date(driver.currentLocationUpdatedAt).getTime();
        if (!Number.isFinite(timestamp)) problems.push("No location timestamp");
        else if (now - timestamp > maxAge * 60 * 1000) problems.push("Location update is stale");
    }
    const accuracy = Number(location.accuracy);
    if (Number.isFinite(accuracy) && location.accuracy !== null && accuracy > maxAccuracyMeters()) problems.push(`Location is approximate (±${(accuracy / 1000).toFixed(1)} km)`);
    return problems;
};

const locationFreshnessReason = (driver, now = Date.now()) => locationProblems(driver, now)[0] || null;
const hasFreshLocation = (driver, now = Date.now()) => !locationFreshnessReason(driver, now);

async function assessDriverAvailability(driver, { excludeShipmentId } = {}) {
    const reasons = [];
    if (!driver || driver.approvalStatus !== "APPROVED") reasons.push("Driver is not approved");
    if (driver) reasons.push(...locationProblems(driver));
    const driverIds = [driver?.id, driver?.driverCode, driver?._id?.toString()].filter(Boolean);
    const assigned = driver?._id ? await Shipment.find({
        $or: [
            { assignedDriver: driver._id },
            { driverId: { $in: driverIds } }
        ]
    }).select("_id id trackingNumber status currentStatus origin destination").lean() : [];
    const active = assigned.filter((item) =>
        activeStatus(item) && (!excludeShipmentId || item._id.toString() !== excludeShipmentId.toString())
    );
    if (active.length) reasons.push("Already assigned to an active shipment");
    return { available: reasons.length === 0, reasons, activeShipments: active };
}

async function checkDriverEligibility(driver, shipment, { excludeShipmentId = shipment?._id } = {}) {
    const availability = await assessDriverAvailability(driver, { excludeShipmentId });
    const reasons = [...availability.reasons];
    if (!driver) return { eligible: false, reason: reasons[0] || "Driver is unavailable", reasons, activeShipments: availability.activeShipments };

    const driverCoordinates = driver.currentLocation?.coordinates;
    const originCoordinates = shipment?.originCoordinates;
    if (validCoordinates(driverCoordinates) && validCoordinates(originCoordinates)) {
        const distance = distanceKm(driverCoordinates, originCoordinates);
        const roundedDistance = Math.round(distance);
        const city = driver.currentLocation?.city || "Current location";
        if (distance > originRadiusKm()) reasons.push(`In ${city}, ${roundedDistance} km from pickup`);
        return { eligible: reasons.length === 0, ...(reasons.length ? { reason: reasons[0] } : {}), reasons, activeShipments: availability.activeShipments, distanceKm: roundedDistance };
    }

    const driverCity = normalizedCity(driver.currentLocation?.city);
    const originCity = normalizedCity(shipment?.origin);
    const cityMatches = driverCity && originCity && (driverCity === originCity || driverCity.includes(originCity) || originCity.includes(driverCity));
    if (!cityMatches) reasons.push(!driverCity || !originCity
        ? "Current location or shipment origin is unavailable"
        : `Currently in ${driver.currentLocation.city}; shipment origin is ${shipment.origin}`);
    return { eligible: reasons.length === 0, ...(reasons.length ? { reason: reasons[0] } : {}), reasons, activeShipments: availability.activeShipments, distanceKm: null };
}

module.exports = {
    checkDriverEligibility,
    assessDriverAvailability,
    activeStatus,
    distanceKm,
    corridorKm: originRadiusKm,
    originRadiusKm,
    locationMaxAgeMinutes,
    maxAccuracyMeters,
    hasFreshLocation,
    locationFreshnessReason,
    locationProblems,
    validCoordinates
};
