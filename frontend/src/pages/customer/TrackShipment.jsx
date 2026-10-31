import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getPublicTracking } from "../../api";
import ErrorMessage from "../../components/ErrorMessage";
import LoadingSpinner from "../../components/LoadingSpinner";
import ShipmentMap from "../../components/ShipmentMap";
import StatusBadge from "../../components/StatusBadge";
import { formatEtaDate, normalizeStatus } from "../../utils/status";
import PublicTrackingNav from "../../components/PublicTrackingNav";

const lifecycle = [
  "ORDER_CREATED",
  "PICKED_UP",
  "WAREHOUSE",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED"
];

function TrackShipment() {
  const { trackingNumber: routeTrackingNumber } = useParams();
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState(routeTrackingNumber || "");
  const trackingNumber = routeTrackingNumber || "";
  const [trackingResult, setTrackingResult] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const currentStatus = useRef("");
  const pollingInterval = useRef(null);
  const [retryCount, setRetryCount] = useState(0);
  const visibleResult = trackingResult?.trackingNumber === trackingNumber
    ? trackingResult
    : null;
  const shipment = visibleResult?.shipment || null;
  useEffect(() => {
    currentStatus.current = shipment?.status || "";
  }, [shipment?.status]);
  const loading = Boolean(trackingNumber && !visibleResult);
  const error = visibleResult?.error || "";

  const loadTracking = useCallback(async (number, signal) => {
    if (!number) return;

    try {
      const result = await getPublicTracking(number, { signal });
      if (!signal.aborted) {
        setLastUpdatedAt(new Date());
        setTrackingResult({
          trackingNumber: number,
          shipment: result,
          error: ""
        });
      }
    } catch (loadError) {
      if (signal.aborted) return;
      setTrackingResult({
        trackingNumber: number,
        shipment: null,
          error: loadError.status === 429
            ? "Too many tracking requests. Please wait a minute and try again."
            : loadError.message === "Tracking information not found"
          ? "We couldn't find a shipment with that tracking number."
          : loadError.message || "Unable to load tracking information. Check your connection and try again."
      });
    }
  }, []);

  useEffect(() => {
    if (!trackingNumber) return undefined;

    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      loadTracking(trackingNumber, controller.signal);
    };

    load();
    const interval = window.setInterval(() => {
      if (normalizeStatus(currentStatus.current) === "DELIVERED") {
        window.clearInterval(interval);
        pollingInterval.current = null;
        return;
      }
      load();
    }, 5000);
    pollingInterval.current = interval;

    return () => {
      controller.abort();
      window.clearInterval(interval);
      if (pollingInterval.current === interval) pollingInterval.current = null;
    };
  }, [trackingNumber, loadTracking, retryCount]);

  const retry = () => {
    setRetryCount((count) => count + 1);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const value = searchValue.trim();
    if (value) {
      setSearchValue(value);
      navigate(`/track/${encodeURIComponent(value)}`);
    }
  };

  const status = normalizeStatus(shipment?.status);
  const currentIndex = lifecycle.indexOf(status);

  return (
    <>
      <PublicTrackingNav />
      <div className="track-page">
      <div className="track-page-content">
        <h1>Track a Shipment</h1>
        <p>Enter a tracking number to view its latest public status and route.</p>
        <form className="tracking-search" onSubmit={handleSubmit}>
          <label className="visually-hidden" htmlFor="tracking-number">
            Tracking number
          </label>
          <input
            id="tracking-number"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Enter tracking number"
          />
          <button className="primary-button" type="submit">Track</button>
        </form>

        {loading && <LoadingSpinner label="Loading tracking details..." />}
        <ErrorMessage
          message={error}
          onRetry={retry}
        />

        {!loading && shipment && (
          <section className="tracking-result" aria-label="Tracking details">
            <div className="tracking-summary">
              <div>
                <span className="page-eyebrow">TRACKING NUMBER</span>
                <h2>{shipment.trackingNumber}</h2>
              </div>
              <StatusBadge status={shipment.status} delayed={shipment.isDelayed} />
            </div>
            <p>Estimated delivery: {formatEtaDate(shipment.estimatedDelivery)} {shipment.isDelayed && <strong>Delayed · Updated ETA</strong>}</p>

            <div className="tracking-route">
              <div><small>ORIGIN</small><strong>{shipment.origin}</strong></div>
              <span aria-hidden="true">→</span>
              <div><small>DESTINATION</small><strong>{shipment.destination}</strong></div>
            </div>

            <section className="tracking-progress">
              <h2>Shipment progress</h2>
              <ol>
                {lifecycle.map((step, index) => (
                  <li className={index <= currentIndex ? "completed" : ""} key={step}>
                    {step.replaceAll("_", " ")}
                  </li>
                ))}
              </ol>
            </section>

            <section className="tracking-map-section">
              <h2>Shipment route</h2>
              <ShipmentMap shipment={shipment} />
            </section>

            <section className="tracking-events">
              <h2>Tracking history</h2>
              {!shipment.events?.length ? (
                <p className="page-message">No tracking updates have been recorded yet.</p>
              ) : (
                <ol>
                  {shipment.events.map((event, index) => (
                    <li key={`${event.timestamp}-${event.status}-${index}`}>
                      <StatusBadge status={event.status} />
                      <time dateTime={event.timestamp}>
                        {new Date(event.timestamp).toLocaleString()}
                      </time>
                      {event.locationCoordinates && (
                        <span>
                          {event.locationCoordinates.lat}, {event.locationCoordinates.lng}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
            <p className="tracking-refresh-note"><span aria-label="Live updates">● Live</span> · Last updated {lastUpdatedAt?.toLocaleTimeString() || "just now"} · Refreshes every 5 seconds</p>
          </section>
        )}
        <p className="track-login-link"><button type="button" className="text-button" onClick={() => {
          const role = localStorage.getItem("userRole")?.toLowerCase();
          navigate(role === "customer" ? "/dashboard" : role === "driver" ? "/driver" : role === "operations" ? "/operations" : "/", { replace: true });
        }}>← Back</button></p>
      </div>
      </div>
    </>
  );
}

export default TrackShipment;
