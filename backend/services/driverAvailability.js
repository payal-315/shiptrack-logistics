const Driver = require("../models/Driver");
const Shipment = require("../models/Shipment");
const { activeStatus } = require("./routeEligibility");
const { shipmentStatus } = require("./shipmentStatus");
const { locationFromCoordinates, persistDriverLocation } = require("./driverLocation");

const resolveShipmentDriver = async (shipment) => {
    const assignedId = shipment.assignedDriver?._id || shipment.assignedDriver;
    if (assignedId) return Driver.findById(assignedId);
    if (!shipment.driverId) return null;
    return Driver.findOne({ $or: [
        { id: shipment.driverId },
        { driverCode: shipment.driverId },
        ...(Driver.db.base.Types.ObjectId.isValid(shipment.driverId) ? [{ _id: shipment.driverId }] : [])
    ] });
};

const recomputeDriverAvailability = async (driverId) => {
    const driver = await Driver.findById(driverId);
    if (!driver) return null;
    const driverIds = [driver.id, driver.driverCode, driver._id.toString()].filter(Boolean);
    const assigned = await Shipment.find({ $or: [
        { assignedDriver: driver._id },
        { driverId: { $in: driverIds } }
    ] }).select("status currentStatus").lean();
    const blockers = assigned.filter(activeStatus);
    if (driver.approvalStatus !== "APPROVED") {
        await Driver.updateOne({ _id: driver._id }, { $set: { availability: "OFFLINE", assignmentLock: false } });
        return { driverId: driver.id, available: false, activeShipmentCount: blockers.length };
    }
    const busy = blockers.length > 0;
    await Driver.updateOne({ _id: driver._id }, { $set: {
        availability: busy ? "BUSY" : "AVAILABLE",
        assignmentLock: busy,
        status: busy ? "On trip" : "Available"
    } });
    return { driverId: driver.id, available: !busy, activeShipmentCount: blockers.length };
};

const recomputeShipmentDriverAvailability = async (shipment) => {
    const driver = await resolveShipmentDriver(shipment);
    return driver ? recomputeDriverAvailability(driver._id) : null;
};

const updateDriverAfterDelivery = async (shipment) => {
    if (shipmentStatus(shipment) !== "DELIVERED") return null;
    const driver = await resolveShipmentDriver(shipment);
    if (!driver) return null;
    const destinationLocation = shipment.destinationCoordinates && Number.isFinite(shipment.destinationCoordinates.lat) && Number.isFinite(shipment.destinationCoordinates.lng)
        ? await locationFromCoordinates(shipment.destinationCoordinates, null)
        : { city: shipment.destination || "Unknown location", accuracy: null };
    await persistDriverLocation(driver._id, destinationLocation);
    await Shipment.updateOne({ _id: shipment._id }, { $set: { currentLocation: destinationLocation } });
    return recomputeDriverAvailability(driver._id);
};

module.exports = { updateDriverAfterDelivery, recomputeDriverAvailability, recomputeShipmentDriverAvailability };
