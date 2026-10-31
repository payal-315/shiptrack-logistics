import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getShipments } from "../../api";
import ErrorMessage from "../../components/ErrorMessage";
import LoadingSpinner from "../../components/LoadingSpinner";
import ShipmentTable from "../../components/ShipmentTable";
import { isDeliveredStatus, normalizeStatus } from "../../utils/status";

function Dashboard() {
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchShipments().then((result) => setShipments(Array.isArray(result) ? result : []))
        .catch((loadError) => setError(loadError.message));
    }, 15000);
    return () => window.clearInterval(timer);
  }, [fetchShipments]);

  const inTransit = shipments.filter((shipment) =>
    ["IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(
      normalizeStatus(shipment.currentStatus || shipment.status)
    )
  ).length;
  const delivered = shipments.filter((shipment) =>
    normalizeStatus(shipment.currentStatus || shipment.status) === "DELIVERED"
  ).length;
  const pending = shipments.filter((shipment) =>
    ["ORDER_CREATED", "PICKED_UP", "WAREHOUSE"].includes(
      normalizeStatus(shipment.currentStatus || shipment.status)
    )
  ).length;

  return (
    <div className="dashboard-page">
      <section className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>Your shipment overview.</p>
        </div>
        <Link to="/track" className="primary-button">Track Shipment</Link>
      </section>

      {loading ? (
        <LoadingSpinner label="Loading your shipments..." />
      ) : (
        <>
          <ErrorMessage message={error} onRetry={retry} />
          {!error && (
            <>
              <section className="stats-grid">
                <StatCard title="Total Shipments" value={shipments.length} />
                <StatCard title="In Transit" value={inTransit} />
                <StatCard title="Delivered" value={delivered} />
                <StatCard title="Pending" value={pending} />
              </section>

              <section className="dashboard-section">
                <div className="section-header">
                  <div>
                    <h2>Active Shipments</h2>
                    <p>Your latest shipments that are still in progress</p>
                  </div>
                  <div className="section-actions"><Link to="/shipments" className="view-link">View All</Link><Link to="/history" className="view-link">Shipment History</Link></div>
                </div>
                <ShipmentTable shipments={shipments.filter((shipment) => !isDeliveredStatus(shipment.currentStatus || shipment.status)).slice(0, 5)} />
              </section>

              {!shipments.length && (
                <section className="quick-actions">
                  <div>
                    <h2>No shipments yet</h2>
                    <p>Create your first shipment to see its progress here.</p>
                  </div>
                  <Link to="/create-shipment" className="primary-button">
                    Create Shipment
                  </Link>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ title, value }) {
  return (
    <div className="stat-card">
      <div>
        <p>{title}</p>
        <h2>{value}</h2>
      </div>
    </div>
  );
}

export default Dashboard;
