import { getStatusLabel, normalizeStatus } from "../utils/status";

function StatusBadge({ status, delayed = false }) {
  const normalized = normalizeStatus(status);
  const tone = normalized === "DELIVERED"
    ? "delivered"
    : ["IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(normalized)
      ? "in-transit"
      : normalized === "ORDER_CREATED" || normalized === "PENDING" ? "pending" : "in-transit";

  return (
    <><span className={`shipment-status ${tone}`}>{getStatusLabel(status)}</span>{delayed && <span className="shipment-status delayed">Delayed</span>}</>
  );
}

export default StatusBadge;
