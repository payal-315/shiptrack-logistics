import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiClient, API_ENDPOINTS, getTrackingEvents } from "../../api";
import ErrorMessage from "../../components/ErrorMessage";
import LoadingSpinner from "../../components/LoadingSpinner";
import ShipmentMap from "../../components/ShipmentMap";
import StatusBadge from "../../components/StatusBadge";
import { formatEtaDate } from "../../utils/status";

export default function ShipmentDetail() {
  const { id } = useParams();
  const [shipment, setShipment] = useState(null), [events, setEvents] = useState([]), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await apiClient.get(API_ENDPOINTS.SHIPMENTS.GET_BY_ID(id)); setShipment(response.data); setEvents(await getTrackingEvents(response.data.trackingNumber || response.data.trackingId)); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);
  if (loading) return <LoadingSpinner label="Loading shipment details…" />;
  if (error) return <div className="shipments-page"><ErrorMessage message={error} onRetry={load} /><Link to="/shipments">← My Shipments</Link></div>;
  if (!shipment) return null;
  return <article className="shipments-page"><Link to="/shipments">← My Shipments</Link><header className="shipments-header"><div><span className="page-eyebrow">TRACKING NUMBER</span><h1>{shipment.trackingNumber || shipment.trackingId}</h1></div><StatusBadge status={shipment.currentStatus || shipment.status} delayed={shipment.isDelayed} /></header>
    <p>{shipment.origin} → {shipment.destination}</p><p>Estimated delivery: {formatEtaDate(shipment.estimatedDelivery)}</p>{shipment.isDelayed && <p role="status">Delayed · Updated ETA: {formatEtaDate(shipment.estimatedDelivery)}</p>}
    <section><h2>Live map</h2><ShipmentMap shipment={shipment} /></section><section><h2>Status timeline</h2><ol>{events.map((event, index) => <li key={event.id || event._id || index}><StatusBadge status={event.status} /><time>{new Date(event.timestamp || event.createdAt).toLocaleString()}</time><span>{event.location?.city || event.note || ""}</span></li>)}</ol></section>
  </article>;
}
