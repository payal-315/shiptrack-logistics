const delay = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

let lastRequestAt = 0;
let geocodingQueue = Promise.resolve();
const reverseGeocodeCache = new Map();

const geocodeAddress = async (address) => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", address);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");

    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": "ShipTrackLogistics/1.0 (shipment geocoding)"
            },
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) {
            throw new Error(`Nominatim returned HTTP ${response.status}`);
        }

        const results = await response.json();
        const firstResult = results[0];

        if (!firstResult) {
            throw new Error("Nominatim returned no matching location");
        }

        const coordinates = {
            lat: Number(firstResult.lat),
            lng: Number(firstResult.lon)
        };

        if (
            !Number.isFinite(coordinates.lat) ||
            !Number.isFinite(coordinates.lng) ||
            coordinates.lat < -90 ||
            coordinates.lat > 90 ||
            coordinates.lng < -180 ||
            coordinates.lng > 180
        ) {
            throw new Error("Nominatim returned invalid coordinates");
        }

        return coordinates;
    } catch (error) {
        console.warn(`Geocoding failed for "${address}": ${error.message}`);
        return null;
    }
};

const geocodeAtNominatimRate = (address) => {
    const request = geocodingQueue.then(async () => {
        const waitTime = 1100 - (Date.now() - lastRequestAt);

        if (waitTime > 0) {
            await delay(waitTime);
        }

        lastRequestAt = Date.now();
        return geocodeAddress(address);
    });

    geocodingQueue = request.catch(() => {});
    return request;
};

const reverseGeocode = (lat, lng) => {
    const key = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
    if (reverseGeocodeCache.has(key)) return Promise.resolve(reverseGeocodeCache.get(key));
    const request = geocodingQueue.then(async () => {
        const waitTime = 1100 - (Date.now() - lastRequestAt);
        if (waitTime > 0) await delay(waitTime);
        lastRequestAt = Date.now();
        const url = new URL("https://nominatim.openstreetmap.org/reverse");
        url.searchParams.set("lat", String(lat));
        url.searchParams.set("lon", String(lng));
        url.searchParams.set("format", "jsonv2");
        try {
            const response = await fetch(url, {
                headers: { "User-Agent": "ShipTrackLogistics/1.0 (shipment geocoding)" },
                signal: AbortSignal.timeout(5000)
            });
            if (!response.ok) throw new Error(`Nominatim returned HTTP ${response.status}`);
            const result = await response.json();
            const address = result.address || {};
            const name = address.city || address.town || address.village || address.county || result.name;
            const value = name ? `${name}${address.state ? `, ${address.state}` : ""}` : null;
            if (value) reverseGeocodeCache.set(key, value);
            return value;
        } catch (error) {
            console.warn(`Reverse geocoding failed: ${error.message}`);
            return null;
        }
    });
    geocodingQueue = request.catch(() => {});
    return request;
};

const geocodeRoute = async (origin, destination) => {
    const originCoordinates = await geocodeAtNominatimRate(origin);
    const destinationCoordinates = await geocodeAtNominatimRate(destination);

    return { originCoordinates, destinationCoordinates };
};

module.exports = geocodeRoute;
module.exports.reverseGeocode = reverseGeocode;
