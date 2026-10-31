const { calculateEta, delayFields, deliveryDays, getRouteDistanceKm, straightLineKm } = require("../services/eta");

describe("distance based shipment ETA", () => {
    const originalEnv = { min: process.env.ETA_MIN_DAYS, speed: process.env.ETA_KM_PER_DAY, buffer: process.env.ETA_UNASSIGNED_BUFFER_DAYS };
    const originalFetch = global.fetch;
    afterEach(() => {
        global.fetch = originalFetch;
        for (const [key, value] of Object.entries({ ETA_MIN_DAYS: originalEnv.min, ETA_KM_PER_DAY: originalEnv.speed, ETA_UNASSIGNED_BUFFER_DAYS: originalEnv.buffer })) {
            if (value === undefined) delete process.env[key]; else process.env[key] = value;
        }
    });

    it("uses the configured minimum delivery window and unassigned buffer", async () => {
        process.env.ETA_MIN_DAYS = "3";
        process.env.ETA_KM_PER_DAY = "400";
        process.env.ETA_UNASSIGNED_BUFFER_DAYS = "1";
        global.fetch = async () => new Response(JSON.stringify({ routes: [{ distance: 200000 }] }), { status: 200 });
        const now = Date.now();
        const eta = await calculateEta({ lat: 12, lng: 77 }, { lat: 13, lng: 78 }, { now });
        expect(deliveryDays(200)).toBe(3);
        expect(new Date(eta).getTime()).toBe(now + 4 * 86400000);
    });

    it("falls back to a 1.3 adjusted straight-line distance when OSRM fails", async () => {
        global.fetch = async () => { throw new Error("offline"); };
        const a = { lat: 12, lng: 77 }, b = { lat: 13, lng: 78 };
        expect(await getRouteDistanceKm(a, b)).toBeCloseTo(straightLineKm(a, b) * 1.3);
    });

    it("marks later and passed ETAs as delayed", () => {
        const original = new Date(Date.now() + 86400000);
        expect(delayFields({ estimatedDelivery: new Date(original.getTime() + 23 * 60 * 60 * 1000), originalEstimatedDelivery: original, status: "IN_TRANSIT" }).isDelayed).toBe(false);
        expect(delayFields({ estimatedDelivery: new Date(original.getTime() + 25 * 60 * 60 * 1000), originalEstimatedDelivery: original, status: "IN_TRANSIT" }).isDelayed).toBe(true);
        expect(delayFields({ estimatedDelivery: new Date(Date.now() - 1000), status: "IN_TRANSIT" }).isDelayed).toBe(true);
        expect(delayFields({ estimatedDelivery: new Date(Date.now() - 1000), status: "DELIVERED" }).isDelayed).toBe(false);
    });
});
