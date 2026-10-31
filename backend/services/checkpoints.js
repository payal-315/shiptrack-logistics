const { reverseGeocode } = require("./geocoding");

const validCoordinates = (coordinates) => coordinates &&
    Number.isFinite(Number(coordinates.lat)) && Number(coordinates.lat) >= -90 && Number(coordinates.lat) <= 90 &&
    Number.isFinite(Number(coordinates.lng)) && Number(coordinates.lng) >= -180 && Number(coordinates.lng) <= 180;

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const routePoints = async (origin, destination) => {
    if (!validCoordinates(origin) || !validCoordinates(destination)) {
        throw new Error("Origin or destination coordinates are missing or invalid");
    }
    const url = `https://router.project-osrm.org/route/v1/driving/${Number(origin.lng)},${Number(origin.lat)};${Number(destination.lng)},${Number(destination.lat)}?overview=full&geometries=geojson`;
    let points = [];
    let providerError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!response.ok) throw new Error(`OSRM returned HTTP ${response.status}`);
            const result = await response.json();
            const route = result.routes?.[0];
            const coordinates = route?.geometry?.coordinates;
            if (!Array.isArray(coordinates) || coordinates.length < 2 || coordinates.some((point) =>
                !Array.isArray(point) || point.length < 2 || !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1]))
            )) throw new Error("OSRM returned an invalid route geometry");
            points = coordinates.map(([lng, lat]) => [Number(lng), Number(lat)]);
            break;
        } catch (error) {
            providerError = error;
            if (attempt < 2) await wait(200 * (2 ** attempt));
        }
    }
    if (providerError && points.length < 2) {
        console.warn(`[route checkpoints] OSRM failed after 3 attempts; using straight-line route: ${providerError.message}`);
        points = Array.from({ length: 8 }, (_, index) => {
            const ratio = index / 7;
            return [
                Number(origin.lng) + (Number(destination.lng) - Number(origin.lng)) * ratio,
                Number(origin.lat) + (Number(destination.lat) - Number(origin.lat)) * ratio
            ];
        });
    }
    const count = Math.min(8, Math.max(6, Math.round(points.length / 30)));
    return Array.from({ length: count }, (_, index) => {
        const point = points[Math.round(index * (points.length - 1) / (count - 1))];
        const coordinates = index === 0
            ? { lat: Number(origin.lat), lng: Number(origin.lng) }
            : index === count - 1
                ? { lat: Number(destination.lat), lng: Number(destination.lng) }
                : { lat: point[1], lng: point[0] };
        return { name: "", order: index, coordinates };
    });
};

const prepareCheckpoints = async (shipment, { names = false } = {}) => {
    if (!validCoordinates(shipment.originCoordinates)) throw new Error("Origin coordinates are missing or invalid");
    if (!validCoordinates(shipment.destinationCoordinates)) throw new Error("Destination coordinates are missing or invalid");
    const points = await routePoints(shipment.originCoordinates, shipment.destinationCoordinates);
    shipment.checkpoints = points.map((point, index) => ({
        ...point,
        name: index === 0 ? shipment.origin : index === points.length - 1 ? shipment.destination : `Checkpoint ${index + 1}`
    }));
    await shipment.save();
    if (names) fillCheckpointNames(shipment);
    return shipment.checkpoints;
};

const fillCheckpointNames = (shipment) => {
    const id = shipment._id;
    const points = shipment.checkpoints.map((item) => ({ order: item.order, coordinates: item.coordinates }));
    void (async () => {
        const Shipment = require("../models/Shipment");
        for (const point of points) {
            if (point.order === 0 || point.order === points.length - 1) continue;
            try {
                const name = await reverseGeocode(point.coordinates.lat, point.coordinates.lng);
                if (name) await Shipment.updateOne({ _id: id, [`checkpoints.${point.order}.order`]: point.order }, { $set: { [`checkpoints.${point.order}.name`]: name } });
            } catch (_error) { /* The fallback name remains available. */ }
        }
    })();
};

module.exports = { prepareCheckpoints, fillCheckpointNames };
