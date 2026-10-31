import { useCallback, useEffect, useState } from "react";
import { getShipments } from "../../api";
import ErrorMessage from "../../components/ErrorMessage";
import LoadingSpinner from "../../components/LoadingSpinner";
import ShipmentTable from "../../components/ShipmentTable";
import { normalizeStatus } from "../../utils/status";

function History() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchShipments = useCallback(
    (signal) => getShipments({ signal }),
    []
  );

  const retry = () => {
    setLoading(true);
    setError("");
    fetchShipments()
      .then((records) => {
        setShipments(records.filter((shipment) =>
          normalizeStatus(shipment.currentStatus || shipment.status) === "DELIVERED"
        ));
        setError("");
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchShipments(controller.signal)
      .then((records) => {
        if (!controller.signal.aborted) {
          setShipments(records.filter((shipment) =>
            normalizeStatus(shipment.currentStatus || shipment.status) === "DELIVERED"
          ));
          setError("");
        }
      })
      .catch((loadError) => {
        if (!controller.signal.aborted && loadError.name !== "AbortError") {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fetchShipments]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchShipments().then((records) => setShipments((Array.isArray(records) ? records : []).filter((shipment) =>
        normalizeStatus(shipment.currentStatus || shipment.status) === "DELIVERED"
      ))).catch((loadError) => setError(loadError.message));
    }, 15000);
    return () => window.clearInterval(timer);
  }, [fetchShipments]);

  return (
    <div className="shipments-page">
      <div className="shipments-header">
        <div>
          <h1>Shipment History</h1>
          <p>Previously delivered shipments.</p>
        </div>
      </div>
      {loading ? (
        <LoadingSpinner label="Loading shipment history..." />
      ) : (
        <>
          <ErrorMessage message={error} onRetry={retry} />
          {!error && (
            <>
              <p className="shipment-count">
                <strong>{shipments.length}</strong> delivered shipments
              </p>
              {shipments.length
                ? <ShipmentTable shipments={shipments} history />
                : <p className="page-message">No delivered shipments yet.</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default History;
