import { useCallback, useEffect, useState } from "react";
import { getDriverSummaries, getPendingDrivers, removeDriver, reviewDriver } from "../../api";
import ErrorMessage from "../../components/ErrorMessage";
import LoadingSpinner from "../../components/LoadingSpinner";

const formatLocationFreshness = (driver) => {
  if (!driver.currentLocationUpdatedAt) return "No location update";
  if (driver.locationFreshnessReason === "Location update is stale") return "Stale";
  if (driver.locationFreshnessReason?.startsWith("Location is approximate")) {
    const accuracy = Number(driver.currentLocation?.accuracy);
    return Number.isFinite(accuracy) ? `Approximate (±${(accuracy / 1000).toFixed(1)} km)` : "Approximate";
  }
  if (driver.locationFreshnessReason) return driver.locationFreshnessReason;
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(driver.currentLocationUpdatedAt).getTime()) / 60000));
  return minutes < 1 ? "Updated just now" : `Updated ${minutes} min ago`;
};

function Drivers() {
  const [drivers, setDrivers] = useState([]), [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const [d, p] = await Promise.all([getDriverSummaries(), getPendingDrivers()]); setDrivers(d); setPending(p); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
  const decide = async (driver, action) => { try { await reviewDriver(driver.id, action); setMessage(driver.name + " " + action + "d."); await load(); } catch (e) { setError(e.message); } };
  const remove = async (driver) => {
    if (!window.confirm("Remove " + driver.name + "? This blocks login and future assignments.")) return;
    try { await removeDriver(driver.id); setMessage(driver.name + " was removed."); await load(); } catch (e) { setError(e.message); }
  };
  const counts = { total: drivers.length + pending.length, approved: drivers.filter((d) => d.approvalStatus === "APPROVED").length, pending: pending.length, available: drivers.filter((d) => d.effectiveAvailability === "AVAILABLE").length, onTrip: drivers.filter((d) => d.activeShipmentCount > 0).length };
  return <section className="shipments-page operations-page"><h1>Drivers</h1><p>Review applications and manage the active driver roster.</p>
    {message && <p role="status" className="page-message">{message}</p>}{error && <ErrorMessage message={error} onRetry={load} />}
    {loading ? <LoadingSpinner label="Loading drivers…" /> : <>
      <section className="stats-grid">{Object.entries(counts).map(([label, value]) => <div className="stat-card" key={label}><p>{label === "onTrip" ? "On a trip" : label[0].toUpperCase() + label.slice(1)}</p><h2>{value}</h2></div>)}</section>
      <section className="pending-drivers-panel"><h2>Pending applications</h2>{pending.length ? pending.map((d) => <div className="pending-driver-row" key={d.id}><span><strong>{d.name}</strong><small>{d.phone} · {d.vehicleType} · {d.vehicleNumber}</small></span><div><button className="secondary-button" onClick={() => decide(d, "approve")}>Approve</button><button className="secondary-button" onClick={() => decide(d, "reject")}>Reject</button></div></div>) : <p>No pending applications.</p>}</section>
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Vehicle</th><th>Status</th><th>Current location</th><th>Active shipments</th><th>Actions</th></tr></thead><tbody>{drivers.map((d) => {
        const location = d.currentLocation?.city || d.baseCity || "—";
        const locationStatus = formatLocationFreshness(d);
        const availability = d.effectiveAvailability === "AVAILABLE"
          ? "AVAILABLE"
          : `UNAVAILABLE · ${(d.availabilityReasons || []).join("; ") || d.availability || "Not eligible"}`;
        return <tr key={d.id}><td>{d.name}</td><td>{d.phone}</td><td>{d.vehicleType} · {d.vehicleNumber}</td><td>{availability}</td><td>{location} · {locationStatus}</td><td>{d.activeShipmentCount ?? 0}</td><td><button className="secondary-button" onClick={() => remove(d)}>Remove driver</button></td></tr>;
      })}</tbody></table></div>
    </>}</section>;
}
export default Drivers;
