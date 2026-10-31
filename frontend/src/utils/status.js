import statusConfig from "../../../shared/shipmentStatus.json";

export const SHIPMENT_STATUS = Object.freeze({ ...statusConfig.statuses });

export const normalizeStatus = (status) => {
  const value = String(status || "").trim().toUpperCase().replaceAll(" ", "_");
  return statusConfig.statuses[value] || value;
};

export const getStatusLabel = (status) =>
  statusConfig.labels[normalizeStatus(status)] || String(status || "Unknown");

export const isDeliveredStatus = (status) => normalizeStatus(status) === SHIPMENT_STATUS.DELIVERED;

export const formatEtaDate = (value) => {
  if (!value) return "—";
  const parts = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("weekday")}, ${part("day")} ${part("month")} ${part("year")}`;
};
