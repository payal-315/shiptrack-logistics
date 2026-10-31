import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { API_ENDPOINTS, apiClient, getShipmentCheckpoints, getShipments, updateTracking } from "../../api";
import ErrorMessage from "../../components/ErrorMessage";
import LoadingSpinner from "../../components/LoadingSpinner";
import ShipmentMap from "../../components/ShipmentMap";
import StatusBadge from "../../components/StatusBadge";
import { getStatusLabel, isDeliveredStatus, normalizeStatus, formatEtaDate } from "../../utils/status";
import { passedCheckpointIndex, currentCheckpointIndex } from "../../utils/checkpoints";

const driverStatuses = [
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED"
];

const trackingId = (shipment) =>
  shipment.trackingNumber || shipment.trackingId || shipment.id;

function DriverDashboard() {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [checkpoints, setCheckpoints] = useState({});
  const [delayReasonDrafts, setDelayReasonDrafts] = useState({});
  const [delayReasonErrors, setDelayReasonErrors] = useState({});
  const requestedCheckpoints = useRef(new Set());
  const liveWatch = useRef(null);
  const liveWatchShipmentId = useRef("");
  const lastSentAt = useRef(0);
  const [liveShipmentId, setLiveShipmentId] = useState("");
  const [currentCity, setCurrentCity] = useState("");
  const [shipmentTab, setShipmentTab] = useState("active");

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
    shipments.forEach((shipment) => {
      const id = trackingId(shipment);
      if (!requestedCheckpoints.current.has(id)) loadCheckpoints(shipment);
    });
  }, [shipments]);

  useEffect(() => () => {
    if (liveWatch.current !== null) navigator.geolocation?.clearWatch(liveWatch.current);
  }, []);

  const stopLiveLocation = (shipmentId = "") => {
    if (liveWatch.current !== null && (!shipmentId || liveWatchShipmentId.current === shipmentId)) {
      navigator.geolocation?.clearWatch(liveWatch.current);
      liveWatch.current = null;
      liveWatchShipmentId.current = "";
      setLiveShipmentId("");
    }
  };

  const changeShipment = async (shipment, update) => {
    const id = trackingId(shipment);
    setUpdatingId(id);
    setError("");
    setMessage("");
    try {
      const response = await updateTracking(id, update);
      const delivered = isDeliveredStatus(update.status ?? response?.data?.currentStatus ?? response?.data?.status);
      if (delivered) stopLiveLocation(id);
      setShipments((current) => current.map((item) => trackingId(item) === id
        ? { ...item, ...(response?.data || {}), ...(update.status ? { status: update.status, currentStatus: update.status } : {}) }
        : item));
      const latest = await fetchShipments();
      setShipments(Array.isArray(latest) ? latest : []);
      setMessage(`Shipment ${id} updated.`);
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setLoading(false);
      setUpdatingId("");
    }
  };

  const updateLocation = (shipment) => {
    if (!navigator.geolocation) {
      setError("This browser does not support location sharing.");
      return;
    }

    setMessage("Requesting your location...");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        changeShipment(shipment, {
          currentLocation: {
            coordinates: { lat: coords.latitude, lng: coords.longitude },
            accuracy: coords.accuracy
          }
        });
      },
      (locationError) => {
        setMessage("");
        setError(locationError.code === locationError.PERMISSION_DENIED
          ? "Location permission was denied. Allow location access in your browser to share your position."
          : "Your location could not be read. Please try again.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const loadCheckpoints = async (shipment) => {
    const id = trackingId(shipment);
    if (requestedCheckpoints.current.has(id)) return;
    requestedCheckpoints.current.add(id);
    setCheckpoints((current) => ({ ...current, [id]: { loading: true, data: [] } }));
    try {
      const data = await getShipmentCheckpoints(shipment.id || id);
      if (!data.length) throw new Error("No route checkpoints are available yet.");
      setCheckpoints((current) => ({ ...current, [id]: { loading: false, data } }));
    } catch (loadError) {
      requestedCheckpoints.current.delete(id);
      setCheckpoints((current) => ({ ...current, [id]: { loading: false, data: [], error: loadError.message } }));
    }
  };

  const toggleLiveLocation = (shipment) => {
    const id = trackingId(shipment);
    if (liveWatch.current !== null) {
      stopLiveLocation();
      setMessage("Live location sharing stopped.");
      return;
    }
    if (!navigator.geolocation) {
      setError("This browser does not support location sharing.");
      return;
    }
    setLiveShipmentId(id);
    liveWatchShipmentId.current = id;
    setMessage("Live location sharing is on.");
    lastSentAt.current = 0;
    liveWatch.current = navigator.geolocation.watchPosition(({ coords }) => {
      if (Date.now() - lastSentAt.current < 10000) return;
      lastSentAt.current = Date.now();
      changeShipment(shipment, { currentLocation: { coordinates: { lat: coords.latitude, lng: coords.longitude }, accuracy: coords.accuracy } });
    }, (locationError) => {
      navigator.geolocation.clearWatch(liveWatch.current);
      liveWatch.current = null;
      liveWatchShipmentId.current = "";
      setLiveShipmentId("");
      setError(locationError.code === locationError.PERMISSION_DENIED
        ? "Location permission was denied. Allow location access to share your position."
        : "Your location could not be read. Live sharing was stopped.");
    }, { enableHighAccuracy: true, maximumAge: 5000 });
  };

  const today = new Date().toDateString();
  const activeShipments = shipments.filter((item) => !isDeliveredStatus(item.currentStatus || item.status));
  const deliveredShipments = shipments.filter((item) => isDeliveredStatus(item.currentStatus || item.status));
  const visibleShipments = shipmentTab === "active" ? activeShipments : deliveredShipments;
  const inTransitCount = activeShipments.filter((item) => ["IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(normalizeStatus(item.currentStatus || item.status))).length;
  const deliveredTodayCount = shipments.filter((item) => item.deliveredAt && new Date(item.deliveredAt).toDateString() === today).length;

  return (
    <div className="shipments-page">
      <div className="shipments-header">
        <div>
          <h1>Driver Dashboard</h1>
          <p>Manage shipments assigned to you.</p>
        </div>
      </div>
      {message && <p className="page-message" role="status">{message}</p>}
      <form className="driver-city-form" onSubmit={async (event) => { event.preventDefault(); try { await apiClient.put(API_ENDPOINTS.DRIVERS.CURRENT_LOCATION, { city: currentCity }); setMessage("Current city updated."); } catch (err) { setError(err.message); } }}>
        <label htmlFor="driver-current-city">Current city</label><input id="driver-current-city" value={currentCity} onChange={(event) => setCurrentCity(event.target.value)} placeholder="Bangalore" required />
        <button className="secondary-button" type="submit">Save current city</button>
      </form>
      {loading ? (
        <LoadingSpinner label="Loading assigned shipments..." />
      ) : (
        <>
          <ErrorMessage message={error} onRetry={retry} />
          {!error && <section className="stats-grid">
            <StatCard label="Assigned" value={activeShipments.length} />
            <StatCard label="In transit" value={inTransitCount} />
            <StatCard label="Delivered today" value={deliveredTodayCount} />
          </section>}
          {!error && localStorage.getItem("driverApprovalStatus") === "PENDING" && (
            <p className="page-message" role="status">Your account is awaiting approval by operations. You will see assigned shipments after approval.</p>
          )}
          {!error && <div role="tablist" aria-label="Driver shipments" className="shipment-tabs">
            <button type="button" role="tab" aria-selected={shipmentTab === "active"} className={shipmentTab === "active" ? "active" : ""} onClick={() => setShipmentTab("active")}>Active ({activeShipments.length})</button>
            <button type="button" role="tab" aria-selected={shipmentTab === "history"} className={shipmentTab === "history" ? "active" : ""} onClick={() => setShipmentTab("history")}>Shipment History ({deliveredShipments.length})</button>
          </div>}
          {!error && !visibleShipments.length && (
            <p className="page-message">{shipmentTab === "history" ? "No delivered shipments in your history yet." : "No active shipments are assigned to you."}</p>
          )}
          {!error && shipmentTab === "history" && deliveredShipments.map((shipment) => {
            const id = trackingId(shipment);
            return <article className="driver-shipment-card" key={id}>
              <div className="tracking-summary"><h2>{id}</h2><StatusBadge status="DELIVERED" /></div>
              <p>{shipment.origin || "—"} → {shipment.destination || "—"}</p>
              <p>Delivered: {shipment.deliveredAt ? new Date(shipment.deliveredAt).toLocaleString("en-IN") : "—"}</p>
              <Link className="secondary-button" to={`/track/${encodeURIComponent(shipment.trackingNumber || shipment.trackingId || id)}`}>View tracking details and map</Link>
            </article>;
          })}
          {!error && shipmentTab === "active" && activeShipments.map((shipment) => {
            const id = trackingId(shipment);
            return (
              <article className="driver-shipment-card" key={id}>
                <div className="tracking-summary">
                  <h2>{id}</h2>
                  <StatusBadge status={shipment.currentStatus || shipment.status} delayed={shipment.isDelayed} />
                </div>
                <p>{shipment.origin} → {shipment.destination}</p>
                <div className="driver-shipment-actions">
                  <label htmlFor={`status-${id}`}>Update status</label>
                  <select
                    id={`status-${id}`}
                    value={normalizeStatus(shipment.currentStatus || shipment.status)}
                    disabled={updatingId === id}
                    onChange={(event) => changeShipment(shipment, { status: event.target.value })}
                  >
                    {!driverStatuses.includes(normalizeStatus(shipment.currentStatus || shipment.status)) && (
                      <option value={normalizeStatus(shipment.currentStatus || shipment.status)}>
                        {getStatusLabel(shipment.currentStatus || shipment.status)}
                      </option>
                    )}
                    {driverStatuses.map((status) => <option key={status} value={status}>{getStatusLabel(status)}</option>)}
                  </select>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={updatingId === id}
                    onClick={() => updateLocation(shipment)}
                  >
                    Update my location
                  </button>
                  <button className="secondary-button" type="button" onClick={() => toggleLiveLocation(shipment)}>
                    {liveShipmentId === id ? "Stop live location" : "Share live location"}
                  </button>
                  <label htmlFor={`checkpoint-${id}`}>Route checkpoint</label>
                  <select id={`checkpoint-${id}`} value={(() => { const points = checkpoints[id]?.data || []; const current = currentCheckpointIndex(points, shipment.currentLocation); return current >= 0 ? String(current) : ""; })()} onChange={(event) => {
                    const checkpoint = checkpoints[id]?.data?.[Number(event.target.value)];
                    if (checkpoint) changeShipment(shipment, { currentLocation: { city: checkpoint.name, coordinates: checkpoint.coordinates } });
                  }}>
                    <option value="" disabled>{checkpoints[id]?.loading ? "Loading route…" : "Select route checkpoint"}</option>
                    {(checkpoints[id]?.data || []).map((checkpoint, index) => {
                      const current = currentCheckpointIndex(checkpoints[id]?.data, shipment.currentLocation);
                      const passed = normalizeStatus(shipment.currentStatus || shipment.status) === "ORDER_CREATED" ? -1 : passedCheckpointIndex(checkpoints[id]?.data, shipment.currentLocation);
                      const marker = current === index ? "Current · " : index < passed ? "Passed · " : "";
                      return <option key={`${checkpoint.name}-${index}`} value={index} disabled={index < passed}>{marker}{checkpoint.name}</option>;
                    })}
                  </select>
                  {checkpoints[id]?.error && <span className="checkpoint-error" role="status">{checkpoints[id].error} <button type="button" className="text-button" onClick={() => loadCheckpoints(shipment)}>Retry</button></span>}
                  <div className="delay-reason-row driver-delay-reason">
                    <label htmlFor={`delay-quick-${id}`}>Delay reason</label>
                    <select id={`delay-quick-${id}`} aria-label="Quick delay reason" value={["Traffic", "Weather", "Vehicle issue", "Pickup delay"].includes(shipment.delayReason) ? shipment.delayReason : ""} onChange={(event) => {
                      if (event.target.value) changeShipment(shipment, { delayReason: event.target.value });
                    }}>
                      <option value="">Choose a quick reason</option>
                      {["Traffic", "Weather", "Vehicle issue", "Pickup delay"].map((reason) => <option key={reason} value={reason}>{reason}</option>)}
                    </select>
                    <input id={`delay-reason-${id}`} aria-label="Delay reason free text" aria-invalid={Boolean(delayReasonErrors[id])} aria-describedby={delayReasonErrors[id] ? `delay-reason-error-${id}` : `delay-reason-hint-${id}`} value={delayReasonDrafts[id] ?? shipment.delayReason ?? ""} placeholder="Other delay reason" onChange={(event) => { const value = event.target.value; setDelayReasonDrafts((current) => ({ ...current, [id]: value })); setDelayReasonErrors((current) => ({ ...current, [id]: value.length > 500 ? "Delay reason must be 500 characters or fewer." : "" })); }} />
                    {delayReasonErrors[id] ? <span className="field-error" id={`delay-reason-error-${id}`}>{delayReasonErrors[id]}</span> : <span className="field-hint" id={`delay-reason-hint-${id}`}>Up to 500 characters</span>}
                    <button type="button" className="secondary-button" disabled={updatingId === id || Boolean(delayReasonErrors[id])} onClick={() => changeShipment(shipment, { delayReason: delayReasonDrafts[id] ?? shipment.delayReason ?? "" })}>Save</button>
                  </div>
                </div>
                <details>
                  <summary>Shipment details and live map</summary>
                  <p>Package: {shipment.packageType || shipment.package?.type || "General"} · {shipment.weight || shipment.package?.weight || 0} kg</p>
                  <p>Current location: {shipment.currentLocation?.city || "Not reported"}</p>
                  <p>Estimated delivery: {formatEtaDate(shipment.estimatedDelivery)} {shipment.isDelayed && <strong className="shipment-status delayed">Delayed</strong>}</p>
                  <ShipmentMap shipment={shipment} />
                </details>
              </article>
            );
          })}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return <div className="stat-card"><div><p>{label}</p><h2>{value}</h2></div></div>;
}

export default DriverDashboard;
