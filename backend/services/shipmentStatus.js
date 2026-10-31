const statusConfig = require("../../shared/shipmentStatus.json");

const normalizeStatus = (status) => String(status || "").trim().toUpperCase().replaceAll(" ", "_");
const canonicalStatus = (status) => {
    const normalized = normalizeStatus(status);
    return statusConfig.statuses[normalized] || normalized;
};
const shipmentStatus = (shipment) => canonicalStatus(shipment?.currentStatus || shipment?.status);

module.exports = { canonicalStatus, normalizeStatus, shipmentStatus, statusConfig };
