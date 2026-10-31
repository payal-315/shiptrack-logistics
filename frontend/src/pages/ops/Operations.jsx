import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_ENDPOINTS,
  apiClient,
  assignDriver,
  getAvailableDrivers,
  getPendingDrivers,
  getShipmentCheckpoints,
  getShipments,
  updateTracking,
  reviewDriver
} from "../../api";
import ErrorMessage from "../../components/ErrorMessage";
import LoadingSpinner from "../../components/LoadingSpinner";
import StatusBadge from "../../components/StatusBadge";
import ShipmentMap from "../../components/ShipmentMap";
import { formatEtaDate, getStatusLabel, isDeliveredStatus, normalizeStatus } from "../../utils/status";
import { passedCheckpointIndex, currentCheckpointIndex } from "../../utils/checkpoints";

const statuses = [
  "ORDER_CREATED",
  "PICKED_UP",
  "WAREHOUSE",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED"
];

const shipmentNumber = (shipment) =>
  shipment.trackingNumber || shipment.trackingId || shipment.id;

const assignedDriverId = (shipment) =>
  typeof shipment.assignedDriver === "object"
    ? shipment.assignedDriver?.id || shipment.assignedDriver?._id || ""
    : shipment.assignedDriver || "";

function Operations() {
  const [shipments, setShipments] = useState([]);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [message, setMessage] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [checkpoints, setCheckpoints] = useState({});
  const [eligibleDrivers, setEligibleDrivers] = useState({});
  const [delayReasons, setDelayReasons] = useState({});
  const [delayErrors, setDelayErrors] = useState({});
  const [shipmentTab, setShipmentTab] = useState("active");
  const requestedCheckpoints = useRef(new Set());

  const fetchOperationsData = useCallback(
    (signal) => Promise.all([
        getShipments({ signal }),
        getPendingDrivers({ signal })
      ]),
    []
  );

  const retry = () => {
    setLoading(true);
    setError("");
    fetchOperationsData()
      .then(([shipmentData, pendingData]) => {
        setShipments(shipmentData);
        setPendingDrivers(pendingData);
        setError("");
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchOperationsData(controller.signal)
      .then(([shipmentData, pendingData]) => {
        if (!controller.signal.aborted) {
          setShipments(shipmentData);
          setPendingDrivers(pendingData);
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
  }, [fetchOperationsData]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      fetchOperationsData().then(([shipmentData, pendingData]) => {
        setShipments(Array.isArray(shipmentData) ? shipmentData : []);
        setPendingDrivers(Array.isArray(pendingData) ? pendingData : []);
      }).catch((loadError) => setToast(loadError.message));
    }, 15000);
    return () => window.clearInterval(timer);
  }, [fetchOperationsData]);

  useEffect(() => {
    shipments.forEach((shipment) => {
      const id = shipmentNumber(shipment);
      if (!requestedCheckpoints.current.has(id)) loadCheckpoints(shipment);
    });
  }, [shipments]);

  useEffect(() => {
    let active = true;
    setEligibleDrivers((current) => Object.fromEntries(shipments.map((shipment) => {
      const id = shipmentNumber(shipment);
      return [id, { ...(current[id] || { data: [] }), loading: true }];
    })));
    Promise.all(shipments.map(async (shipment) => {
      try { return [shipmentNumber(shipment), { data: await getAvailableDrivers(shipment.id || shipmentNumber(shipment)), error: "" }]; }
      catch (err) { return [shipmentNumber(shipment), { data: null, error: err.message || "Available drivers could not be loaded." }]; }
    })).then((entries) => {
      if (!active) return;
      setEligibleDrivers((current) => {
        const next = { ...current };
        for (const [id, result] of entries) {
          next[id] = result.data === null
            ? { ...(current[id] || { data: [] }), error: result.error, loading: false }
            : { data: result.data, error: "", loading: false };
        }
        return next;
      });
    });
    return () => { active = false; };
  }, [shipments]);

  const retryAvailableDrivers = async (shipment) => {
    const id = shipmentNumber(shipment);
    setEligibleDrivers((current) => ({ ...current, [id]: { ...(current[id] || { data: [] }), loading: true, error: "" } }));
    try {
      const data = await getAvailableDrivers(shipment.id || id);
      setEligibleDrivers((current) => ({ ...current, [id]: { data, loading: false, error: "" } }));
    } catch (loadError) {
      setEligibleDrivers((current) => ({ ...current, [id]: { ...(current[id] || { data: [] }), loading: false, error: loadError.message } }));
    }
  };

  const saveAction = async (shipment, action) => {
    const id = shipmentNumber(shipment);
    setUpdatingId(id);
    setError("");
    setMessage("");
    try {
      await action(id);
      setLoading(true);
      const [shipmentData, pendingData] = await fetchOperationsData();
      setShipments(shipmentData);
      setPendingDrivers(pendingData);
      setMessage(`Shipment ${id} was updated.`);
    } catch (actionError) {
      setToast(actionError.message);
    } finally {
      setLoading(false);
      setUpdatingId("");
    }
  };

  const changeStatus = (shipment, status) => saveAction(
    shipment,
    (id) => updateTracking(id, { status })
  );

  const loadCheckpoints = async (shipment) => {
    const id = shipmentNumber(shipment);
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

  const decideDriver = async (driver, decision) => {
    try {
      await reviewDriver(driver._id || driver.id, decision);
      const [, pending] = await fetchOperationsData();
      setPendingDrivers(pending);
      setMessage(`Driver ${driver.name} ${decision === "approve" ? "approved" : "rejected"}.`);
    } catch (reviewError) { setToast(reviewError.message); }
  };

  const editCoordinates = (shipment, field) => {
    const existing = shipment[field] || {};
    const lat = window.prompt(`Enter ${field === "originCoordinates" ? "origin" : "destination"} latitude:`, existing.lat ?? "");
    if (lat === null) return;
    const lng = window.prompt(`Enter ${field === "originCoordinates" ? "origin" : "destination"} longitude:`, existing.lng ?? "");
    if (lng === null) return;

    const coordinates = { lat: Number(lat), lng: Number(lng) };
    if (!Number.isFinite(coordinates.lat) || coordinates.lat < -90 || coordinates.lat > 90 ||
        !Number.isFinite(coordinates.lng) || coordinates.lng < -180 || coordinates.lng > 180) {
      setError("Enter a valid latitude (-90 to 90) and longitude (-180 to 180).");
      return;
    }

    const shipmentId = shipmentNumber(shipment);
    requestedCheckpoints.current.delete(shipmentId);
    setCheckpoints((current) => ({ ...current, [shipmentId]: { loading: true, data: [] } }));

    saveAction(shipment, () => apiClient.put(
      API_ENDPOINTS.SHIPMENTS.UPDATE(shipment.id || shipmentNumber(shipment)),
      { [field]: coordinates }
    ));
  };

  const totals = {
    total: shipments.length,
    moving: shipments.filter((item) =>
      ["IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(
        normalizeStatus(item.currentStatus || item.status)
      )
    ).length,
    pending: shipments.filter((item) =>
      ["ORDER_CREATED", "PICKED_UP", "WAREHOUSE"].includes(
        normalizeStatus(item.currentStatus || item.status)
      )
    ).length,
    delivered: shipments.filter((item) =>
      normalizeStatus(item.currentStatus || item.status) === "DELIVERED"
    ).length
  };
  const activeShipments = shipments.filter((shipment) => !isDeliveredStatus(shipment.currentStatus || shipment.status));
  const deliveredShipments = shipments.filter((shipment) => isDeliveredStatus(shipment.currentStatus || shipment.status));
  const visibleShipments = shipmentTab === "history" ? deliveredShipments : activeShipments;

  return (
    <div className="shipments-page operations-page">
      <div className="shipments-header">
        <div>
          <h1>Operations Dashboard</h1>
          <p>Manage shipments, drivers, and delivery progress.</p>
        </div>
      </div>

      {message && <p className="page-message" role="status">{message}</p>}
      {toast && <div className="operation-toast" role="alert">{toast}<button type="button" aria-label="Dismiss error" onClick={() => setToast("")}>×</button></div>}
      {loading ? (
        <LoadingSpinner label="Loading operations data..." />
      ) : (
        <>
          <ErrorMessage message={error} onRetry={retry} />
          {!error && (
            <>
              <section className="stats-grid">
                <StatCard label="Total" value={totals.total} />
                <StatCard label="In transit" value={totals.moving} />
                <StatCard label="Pending" value={totals.pending} />
                <StatCard label="Delivered" value={totals.delivered} />
              </section>

              <section className="pending-drivers-panel" aria-labelledby="pending-drivers-heading">
                <h2 id="pending-drivers-heading">Pending drivers</h2>
                {!pendingDrivers.length ? <p>No driver applications are waiting for review.</p> : pendingDrivers.map((driver) => <div className="pending-driver-row" key={driver._id || driver.id}>
                  <span><strong>{driver.name}</strong><small>{driver.phone} · License {driver.licenseNumber} · {driver.vehicleNumber} ({driver.vehicleType})</small></span>
                  <div><button className="secondary-button" type="button" onClick={() => decideDriver(driver, "approve")}>Approve</button><button className="secondary-button" type="button" onClick={() => decideDriver(driver, "reject")}>Reject</button></div>
                </div>)}
              </section>

              <div role="tablist" aria-label="Operations shipments" className="shipment-tabs">
                <button type="button" role="tab" aria-selected={shipmentTab === "active"} className={shipmentTab === "active" ? "active" : ""} onClick={() => setShipmentTab("active")}>Active ({activeShipments.length})</button>
                <button type="button" role="tab" aria-selected={shipmentTab === "history"} className={shipmentTab === "history" ? "active" : ""} onClick={() => setShipmentTab("history")}>History ({deliveredShipments.length})</button>
              </div>
              {!visibleShipments.length ? (
                <p className="page-message">{shipmentTab === "history" ? "No delivered shipments in history yet." : shipments.length ? "No active shipments." : "No shipments have been created."}</p>
              ) : (
                <div className="operations-list">
                  {visibleShipments.map((shipment) => {
                    const id = shipmentNumber(shipment);
                    const status = normalizeStatus(shipment.currentStatus || shipment.status);
                    const driverId = assignedDriverId(shipment);
                    const delivered = isDeliveredStatus(status);
                    const availableDrivers = eligibleDrivers[id]?.data || [];
                    const driversLoading = eligibleDrivers[id]?.loading && !availableDrivers.length;
                    return (
                      <article className="operations-shipment" key={id}>
                        <div className="tracking-summary">
                          <div>
                            <span className="page-eyebrow">SHIPMENT</span>
                            <h2>{id}</h2>
                          </div>
                          <StatusBadge status={status} delayed={shipment.isDelayed} />
                        </div>
                        <p>{shipment.origin} → {shipment.destination}</p>
                        <p>Estimated delivery: {formatEtaDate(shipment.estimatedDelivery)} {shipment.isDelayed && <strong className="shipment-status delayed">Delayed</strong>}</p>
                        {delivered && <p>Delivered: {shipment.deliveredAt ? new Date(shipment.deliveredAt).toLocaleString("en-IN") : "—"}</p>}
                        {!delivered && <>
                        <div className="delay-reason-row"><label htmlFor={`ops-delay-${id}`}>Delay reason<input id={`ops-delay-${id}`} aria-invalid={Boolean(delayErrors[id])} aria-describedby={delayErrors[id] ? `ops-delay-error-${id}` : `ops-delay-hint-${id}`} value={delayReasons[id] ?? shipment.delayReason ?? ""} onChange={(event) => { const value = event.target.value; setDelayReasons((current) => ({ ...current, [id]: value })); setDelayErrors((current) => ({ ...current, [id]: value.length > 500 ? "Delay reason must be 500 characters or fewer." : "" })); }} /></label>{delayErrors[id] ? <span className="field-error" id={`ops-delay-error-${id}`}>{delayErrors[id]}</span> : <span className="field-hint" id={`ops-delay-hint-${id}`}>Up to 500 characters</span>}
                          <button type="button" className="secondary-button" disabled={updatingId === id || Boolean(delayErrors[id])} onClick={() => saveAction(shipment, () => apiClient.put(API_ENDPOINTS.SHIPMENTS.UPDATE(shipment.id || id), { delayReason: delayReasons[id] ?? shipment.delayReason ?? "" }))}>Save delay reason</button></div>
                        <div className="operations-controls">
                          <label>
                            Driver
                            <select
                              value={driverId}
                              disabled={updatingId === id || driversLoading || (!availableDrivers.length && !driverId)}
                              onChange={(event) => {
                                saveAction(shipment, () => assignDriver(shipment.id || id, event.target.value || null))
                              }}
                            >
                              <option value="">{driversLoading ? "Loading available drivers…" : availableDrivers.length ? "Unassigned" : `No drivers available at ${shipment.origin || "the shipment origin"}`}</option>
                              {shipment.assignedDriver && !availableDrivers.some((driver) => driver.id === driverId || driver._id === driverId) && <option value={driverId}>{shipment.assignedDriver.name || "Current driver"} · current assignment</option>}
                              {availableDrivers.map((driver) => (
                                <option key={driver.id || driver._id} value={driver.id || driver._id}>
                                  {driver.name}{driver.distanceKm == null ? "" : ` · ${driver.currentLocation?.city || shipment.origin} · ${driver.distanceKm} km`}
                                </option>
                              ))}
                            </select>
                            {eligibleDrivers[id]?.error && <span className="field-error" role="alert">{eligibleDrivers[id].error} <button type="button" className="text-button" onClick={() => retryAvailableDrivers(shipment)}>Retry</button></span>}
                          </label>
                          <label>
                            Status
                            <select
                              value={status}
                              disabled={updatingId === id}
                              onChange={(event) => changeStatus(shipment, event.target.value)}
                            >
                              {statuses.map((item) => (
                                <option value={item} key={item}>{getStatusLabel(item)}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Route location
                            <select
                              value={(() => { const list = checkpoints[id]?.data || []; const current = currentCheckpointIndex(list, shipment.currentLocation); return current >= 0 ? String(current) : ""; })()}
                              disabled={updatingId === id}
                              onChange={(event) => {
                                const selected = Number(event.target.value);
                                const checkpoint = checkpoints[id]?.data?.[selected];
                                if (checkpoint) saveAction(shipment, (number) => updateTracking(number, {
                                  currentLocation: { city: checkpoint.name, coordinates: checkpoint.coordinates }
                                }));
                              }}
                            >
                              <option value="" disabled>{checkpoints[id]?.loading ? "Loading route…" : checkpoints[id]?.error ? "Route unavailable — Retry below" : "Current location not at a checkpoint"}</option>
                              {(checkpoints[id]?.data || []).map((checkpoint, index) => {
                                const currentIndex = currentCheckpointIndex(checkpoints[id]?.data, shipment.currentLocation);
                                const passedIndex = status === "ORDER_CREATED" ? -1 : passedCheckpointIndex(checkpoints[id]?.data, shipment.currentLocation);
                                const marker = index === currentIndex ? "Current · " : index < passedIndex ? "Passed · " : "";
                                return <option key={`${checkpoint.name}-${index}`} value={index} disabled={status !== "ORDER_CREATED" && index < passedIndex}>{marker}{checkpoint.name}</option>;
                              })}
                            </select>
                            {checkpoints[id]?.error && <span className="checkpoint-error" role="status">{checkpoints[id].error} <button type="button" className="text-button" onClick={() => loadCheckpoints(shipment)}>Retry</button></span>}
                          </label>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => editCoordinates(shipment, "originCoordinates")}
                          >
                            Edit origin coordinates
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => editCoordinates(shipment, "destinationCoordinates")}
                          >
                            Edit destination coordinates
                          </button>
                        </div>
                        <p>
                          Current location: {shipment.currentLocation?.city || "Not reported"}
                        </p>
                        </>}
                        <details><summary>Live route map</summary><ShipmentMap shipment={shipment} /></details>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="stat-card">
      <div><p>{label}</p><h2>{value}</h2></div>
    </div>
  );
}

export default Operations;
