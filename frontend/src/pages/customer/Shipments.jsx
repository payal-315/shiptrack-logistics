import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getShipments } from "../../api";
import ErrorMessage from "../../components/ErrorMessage";
import LoadingSpinner from "../../components/LoadingSpinner";
import ShipmentTable from "../../components/ShipmentTable";

function Shipments() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");

  const fetchShipments = useCallback(
    (signal) => getShipments({ signal }),
    []
  );

  const retry = () => {
    setLoading(true);
    setError("");
    fetchShipments()
      .then((result) => {
        setShipments(result);
        setError("");
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchShipments(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setShipments(result);
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

  return (
    <div className="shipments-page">
      <div className="shipments-header">
        <div>
          <h1>Shipments</h1>
          <p>View your shipments and their latest status.</p>
        </div>
        <Link to="/create-shipment" className="primary-button">
          + Create Shipment
        </Link>
      </div>
      {loading ? (
        <LoadingSpinner label="Loading shipments..." />
      ) : (
        <>
          <ErrorMessage message={error} onRetry={retry} />
          {!error && (
            <>
              <p className="shipment-count">
                <strong>{shipments.length}</strong> shipments found
              </p>
              <div role="tablist" aria-label="Filter shipments" className="shipment-tabs">{["All", "In transit", "Delivered"].map((tab) => <button key={tab} role="tab" aria-selected={filter === tab} className={filter === tab ? "active" : ""} onClick={() => setFilter(tab)}>{tab}</button>)}</div>
              <ShipmentTable shipments={shipments.filter((item) => filter === "All" || (filter === "Delivered" ? String(item.currentStatus || item.status).toUpperCase().includes("DELIVERED") : ["IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(String(item.currentStatus || item.status).toUpperCase().replaceAll(" ", "_"))))} />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default Shipments;
