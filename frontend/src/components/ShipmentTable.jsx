import { Link } from "react-router-dom";
import StatusBadge from "./StatusBadge";
import { formatEtaDate } from "../utils/status";

const shipmentNumber = (shipment) =>
  shipment.trackingNumber || shipment.trackingId || shipment.id;

function ShipmentTable({ shipments, showCustomer = false, history = false }) {
  if (!shipments.length) {
    return <p className="page-message">No shipments yet.</p>;
  }

  return (
    <div className="shipment-table-wrapper">
      <table className="shipment-table">
        <thead>
          <tr>
            <th>Tracking number</th>
            {showCustomer && <th>Customer</th>}
            <th>Destination</th>
            <th>Status</th>
            <th>{history ? "Delivered" : "Estimated delivery"}</th>
            <th>Track</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((shipment) => {
            const trackingNumber = shipmentNumber(shipment);
            return (
              <tr key={trackingNumber}>
                <td className="shipment-id" data-label="Tracking number">{trackingNumber}</td>
                {showCustomer && (
                  <td data-label="Customer">{shipment.senderName || shipment.sender?.name || "—"}</td>
                )}
                <td data-label="Destination">{shipment.destination}</td>
                <td data-label="Status">
                  <StatusBadge status={shipment.currentStatus || shipment.status} delayed={shipment.isDelayed} />
                </td>
                <td data-label={history ? "Delivered" : "Estimated delivery"}>
                  {history ? (shipment.deliveredAt ? new Date(shipment.deliveredAt).toLocaleString("en-IN") : "—") : formatEtaDate(shipment.estimatedDelivery)}
                </td>
                <td data-label="Track">
                  <Link to={`/shipments/${encodeURIComponent(shipment.id || trackingNumber)}`}>
                    Track
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default ShipmentTable;
