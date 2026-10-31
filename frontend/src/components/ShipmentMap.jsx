import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow
});

const asLatLng = (coordinates) => {
  if (!coordinates ||
      !Number.isFinite(Number(coordinates.lat)) ||
      !Number.isFinite(Number(coordinates.lng))) {
    return null;
  }
  return [Number(coordinates.lat), Number(coordinates.lng)];
};

const findClosestRoutePoint = (route, point) => {
  if (!point || !route.length) return -1;

  return route.reduce((closestIndex, candidate, index) => {
    const closest = route[closestIndex];
    const distance = (candidate[0] - point[0]) ** 2 +
      (candidate[1] - point[1]) ** 2;
    const closestDistance = (closest[0] - point[0]) ** 2 +
      (closest[1] - point[1]) ** 2;
    return distance < closestDistance ? index : closestIndex;
  }, 0);
};

function FitRoute({ route, origin, destination }) {
  const map = useMap();

  useEffect(() => {
    const points = route.length ? route : [origin, destination].filter(Boolean);
    if (points.length) {
      map.fitBounds(points, { padding: [30, 30], maxZoom: 12 });
    }
  }, [map, route, origin, destination]);

  return null;
}

function MovingMarker({ position }) {
  const markerRef = useRef(null);
  const [mountPosition] = useState(position);
  const map = useMap();
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return undefined;
    const from = marker.getLatLng();
    const [toLat, toLng] = position;
    const startedAt = performance.now();
    let frame;
    const move = (now) => {
      const progress = Math.min(1, (now - startedAt) / 900);
      const eased = progress * (2 - progress);
      marker.setLatLng([
        from.lat + (toLat - from.lat) * eased,
        from.lng + (toLng - from.lng) * eased
      ]);
      if (progress < 1) frame = requestAnimationFrame(move);
    };
    frame = requestAnimationFrame(move);
    map.panTo(position, { animate: true, duration: 0.9 });
    return () => cancelAnimationFrame(frame);
  }, [position, map]);
  return <Marker ref={markerRef} position={mountPosition}><Popup>Current vehicle location</Popup></Marker>;
}

function ShipmentMap({ shipment }) {
  const originLatValue = shipment.originCoordinates?.lat;
  const originLngValue = shipment.originCoordinates?.lng;
  const destinationLatValue = shipment.destinationCoordinates?.lat;
  const destinationLngValue = shipment.destinationCoordinates?.lng;
  const currentCoordinates = shipment.currentLocationCoordinates ||
    shipment.currentLocation?.coordinates;
  const currentLatValue = currentCoordinates?.lat;
  const currentLngValue = currentCoordinates?.lng;
  const origin = useMemo(
    () => asLatLng({ lat: originLatValue, lng: originLngValue }),
    [originLatValue, originLngValue]
  );
  const destination = useMemo(
    () => asLatLng({ lat: destinationLatValue, lng: destinationLngValue }),
    [destinationLatValue, destinationLngValue]
  );
  const current = useMemo(
    () => asLatLng({ lat: currentLatValue, lng: currentLngValue }),
    [currentLatValue, currentLngValue]
  );
  const [routeState, setRouteState] = useState({ key: "", points: [] });
  const routeKey = [
    originLatValue,
    originLngValue,
    destinationLatValue,
    destinationLngValue
  ].join(":");

  useEffect(() => {
    if (!origin || !destination) return undefined;

    const controller = new AbortController();
    const coordinates = `${origin[1]},${origin[0]};${destination[1]},${destination[0]}`;
    fetch(
      `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`,
      { signal: controller.signal }
    )
      .then((response) => {
        if (!response.ok) throw new Error("Route lookup failed");
        return response.json();
      })
      .then((result) => {
        const routeCoordinates = result.routes?.[0]?.geometry?.coordinates;
        if (!routeCoordinates?.length) throw new Error("No route found");
        setRouteState({
          key: routeKey,
          points: routeCoordinates.map(([lng, lat]) => [lat, lng])
        });
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setRouteState({ key: routeKey, points: [origin, destination] });
        }
      });

    return () => controller.abort();
  }, [origin, destination, routeKey]);

  const route = routeState.key === routeKey
    ? routeState.points
    : [origin, destination].filter(Boolean);
  const closestPointIndex = useMemo(
    () => findClosestRoutePoint(route, current),
    [route, current]
  );
  const completedRoute = closestPointIndex >= 0
    ? route.slice(0, closestPointIndex + 1)
    : [];
  const remainingRoute = closestPointIndex >= 0
    ? route.slice(closestPointIndex)
    : route;
  const center = origin || destination || current || [20.5937, 78.9629];

  return (
    <div className="shipment-map">
      <MapContainer center={center} zoom={5} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitRoute route={route} origin={origin} destination={destination} />
        {origin && (
          <Marker position={origin}>
            <Popup>Origin</Popup>
          </Marker>
        )}
        {destination && (
          <Marker position={destination}>
            <Popup>Destination</Popup>
          </Marker>
        )}
        {current && (
          <MovingMarker position={current} />
        )}
        {completedRoute.length > 1 && (
          <Polyline positions={completedRoute} pathOptions={{ color: "#15803d", weight: 6 }} />
        )}
        {remainingRoute.length > 1 && (
          <Polyline positions={remainingRoute} pathOptions={{ color: "#1c5d8c", weight: 5 }} />
        )}
      </MapContainer>
      {!origin || !destination ? (
        <p className="map-note">Route coordinates are not available yet.</p>
      ) : null}
    </div>
  );
}

export default ShipmentMap;
