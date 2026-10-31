const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const path = require("node:path");
const { once } = require("node:events");
const request = require("supertest");

jest.setTimeout(120000);

const testJwtSecret = randomBytes(32).toString("hex");

let testServer;
let baseUrl;

const startTestServer = () => new Promise((resolve, reject) => {
    // Keep the native MongoDB connection outside Jest's VM sandbox.
    const child = spawn(
        process.execPath,
        [path.join(__dirname, "memoryApiServer.js")],
        {
            env: {
                PATH: process.env.PATH,
                SystemRoot: process.env.SystemRoot,
                JWT_SECRET: testJwtSecret
            },
            stdio: ["ignore", "pipe", "pipe"]
        }
    );

    let output = "";
    let errors = "";
    const timeout = setTimeout(() => {
        child.kill();
        reject(new Error(`Test API server timed out: ${errors}`));
    }, 90000);

    child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        const match = output.match(/TEST_SERVER_PORT=(\d+)/);

        if (match) {
            clearTimeout(timeout);
            resolve({
                child,
                url: `http://127.0.0.1:${match[1]}`
            });
        }
    });

    child.stderr.on("data", (chunk) => {
        errors += chunk.toString();
    });

    child.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
    });

    child.once("exit", (code) => {
        if (!baseUrl) {
            clearTimeout(timeout);
            reject(new Error(`Test API server exited (${code}): ${errors}`));
        }
    });
});

beforeAll(async () => {
    testServer = await startTestServer();
    baseUrl = testServer.url;
});

afterAll(async () => {
    if (testServer?.child.exitCode === null) {
        testServer.child.kill();
        await once(testServer.child, "exit");
    }
});

const newCustomer = () => ({
    name: "Test Customer",
    email: `customer-${Date.now()}-${Math.random()}@example.com`,
    password: "password123"
});

const registerCustomer = async () => {
    const credentials = newCustomer();
    const result = await request(baseUrl).post("/api/auth/register").send(credentials).expect(201);
    return result.body.data;
};

const createShipmentFor = async (user, suffix, extra = {}) => {
    const result = await request(baseUrl).post("/_test/shipments")
        .send({ ...(user ? { userId: user.id } : {}), suffix, ...extra })
        .expect(201);
    return result.body.data;
};

const createDriver = async (suffix) => {
    const result = await request(baseUrl).post("/_test/driver").send({ suffix }).expect(201);
    return result.body.data;
};

const waitForTestOtp = async (email) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        const response = await request(baseUrl).get(`/_test/otp/${encodeURIComponent(email)}`);
        if (response.body.otp) return response.body.otp;
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error("Test OTP was not captured");
};

describe("authentication endpoints", () => {
    it("registers a customer and returns a signed token", async () => {
        const response = await request(baseUrl)
            .post("/api/auth/register")
            .send(newCustomer());

        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
        expect(response.body.data.user.role).toBe("customer");
        expect(response.body.data.token).toEqual(expect.any(String));
    });

    it("logs in with a valid password", async () => {
        const customer = newCustomer();
        await request(baseUrl)
            .post("/api/auth/register")
            .send(customer)
            .expect(201);

        const response = await request(baseUrl)
            .post("/api/auth/login")
            .send({
                email: customer.email,
                password: customer.password
            });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.token).toEqual(expect.any(String));
    });
});

describe("new shipment initialization", () => {
    it("starts at its origin and is not delayed while the buffered ETA is in the future", async () => {
        const customer = await registerCustomer();
        const response = await request(baseUrl).post("/api/shipments").set("Authorization", `Bearer ${customer.token}`).send({ senderName: "Sender", receiverName: "Receiver", origin: "Bangalore", destination: "Hyderabad", packageType: "General" }).expect(201);
        expect(response.body.data.currentLocation).toMatchObject({ city: "Bangalore", coordinates: { lat: 12.9716, lng: 77.5946 } });
        expect(response.body.data).toMatchObject({ status: "ORDER_CREATED", currentStatus: "ORDER_CREATED" });
        expect(new Date(response.body.data.estimatedDelivery).getTime()).toBeGreaterThan(Date.now());
        expect(response.body.data.originalEstimatedDelivery).toBe(response.body.data.estimatedDelivery);
        expect(response.body.data.isDelayed).toBe(false);
    });
});

describe("authorization endpoints", () => {
    it("rejects an unauthenticated shipment request", async () => {
        const response = await request(baseUrl).get("/api/shipments");

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({
            success: false,
            message: expect.any(String)
        });
    });

    it("forbids a customer from managing drivers", async () => {
        const registration = await request(baseUrl)
            .post("/api/auth/register")
            .send(newCustomer())
            .expect(201);

        const response = await request(baseUrl)
            .get("/api/drivers")
            .set("Authorization", `Bearer ${registration.body.data.token}`);

        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({
            success: false,
            message: expect.any(String)
        });
    });
});

describe("customer profile and password", () => {
    it("updates profile fields and changes password while invalidating prior tokens", async () => {
        const credentials = newCustomer();
        const registration = await request(baseUrl).post("/api/auth/register").send(credentials).expect(201);
        const oldToken = registration.body.data.token;
        const auth = `Bearer ${oldToken}`;
        const profile = await request(baseUrl).put("/api/auth/profile").set("Authorization", auth)
            .send({ name: "Updated Customer", phone: "2025550100", defaultAddress: "12 Main Street" }).expect(200);
        expect(profile.body.data).toMatchObject({ name: "Updated Customer", email: credentials.email, phone: "2025550100", defaultAddress: "12 Main Street" });
        const changed = await request(baseUrl).post("/api/auth/change-password").set("Authorization", auth)
            .send({ currentPassword: credentials.password, newPassword: "NewPass456" }).expect(200);
        expect(changed.body.data.token).toEqual(expect.any(String));
        await request(baseUrl).get("/api/auth/me").set("Authorization", auth).expect(401);
        await request(baseUrl).get("/api/auth/me").set("Authorization", `Bearer ${changed.body.data.token}`).expect(200);
        await request(baseUrl).post("/api/auth/login").send({ email: credentials.email, password: "NewPass456" }).expect(200);
    });
});

describe("driver signup and approval", () => {
    const driverApplication = (suffix, overrides = {}) => ({
        name: "New Driver", email: `new-driver-${suffix}@example.test`, phone: "2025550100",
        password: "DriverPass123", licenseNumber: `LIC-${suffix}`, vehicleNumber: `VEH-${suffix}`, vehicleType: "Van", baseCity: "Bangalore", ...overrides
    });

    it("creates pending drivers, hides them from assignment until operations approves", async () => {
        const suffix = `${Date.now()}-${Math.random()}`;
        const application = driverApplication(suffix);
        await request(baseUrl).post("/api/drivers/signup").send(application).expect(201);
        const login = await request(baseUrl).post("/api/auth/login").send({ email: application.email, password: application.password }).expect(200);
        expect(login.body.data.user.approvalStatus).toBe("PENDING");
        const operations = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const auth = `Bearer ${operations.body.data.token}`;
        expect((await request(baseUrl).get("/api/drivers").set("Authorization", auth).expect(200)).body.data).toHaveLength(0);
        const pending = await request(baseUrl).get("/api/drivers/pending").set("Authorization", auth).expect(200);
        expect(pending.body.data).toHaveLength(1);
        await request(baseUrl).post(`/api/drivers/${pending.body.data[0].id}/approve`).set("Authorization", auth).send({}).expect(200);
        expect((await request(baseUrl).get("/api/drivers").set("Authorization", auth).expect(200)).body.data).toHaveLength(1);
    });

    it("requires a base city on driver applications", async () => {
        const application = driverApplication(`${Date.now()}-no-city`);
        delete application.baseCity;
        await request(baseUrl).post("/api/drivers/signup").send(application).expect(400);
    });

    it("returns friendly errors for duplicate email, license and vehicle numbers", async () => {
        const suffix = `${Date.now()}-${Math.random()}`;
        const first = driverApplication(suffix);
        await request(baseUrl).post("/api/drivers/signup").send(first).expect(201);
        expect((await request(baseUrl).post("/api/drivers/signup").send(driverApplication(`${suffix}-email`, { email: first.email }))).body.message).toMatch(/email already exists/i);
        expect((await request(baseUrl).post("/api/drivers/signup").send(driverApplication(`${suffix}-license`, { licenseNumber: first.licenseNumber }))).body.message).toMatch(/license number is already registered/i);
        expect((await request(baseUrl).post("/api/drivers/signup").send(driverApplication(`${suffix}-vehicle`, { vehicleNumber: first.vehicleNumber }))).body.message).toMatch(/vehicle number is already registered/i);
    });
});

describe("password reset OTP flow", () => {
    const requestOtp = async (email) => {
        await request(baseUrl).post("/api/auth/forgot-password").send({ email, role: "customer" }).expect(200);
        return waitForTestOtp(email);
    };

    it("returns the neutral message for unknown emails and locks an OTP after five wrong attempts", async () => {
        const customer = newCustomer();
        await request(baseUrl).post("/api/auth/register").send(customer).expect(201);
        const known = await request(baseUrl).post("/api/auth/forgot-password").send({ email: customer.email, role: "customer" }).expect(200);
        const unknown = await request(baseUrl).post("/api/auth/forgot-password").send({ email: `missing-${customer.email}`, role: "customer" }).expect(200);
        expect(known.body.message).toBe(unknown.body.message);
        const validCode = await waitForTestOtp(customer.email);
        const wrongCode = validCode === "000000" ? "000001" : "000000";
        for (let attempt = 0; attempt < 5; attempt += 1) {
            await request(baseUrl).post("/api/auth/verify-otp").send({ email: customer.email, role: "customer", otp: wrongCode }).expect(400);
        }
        await request(baseUrl).post("/api/auth/verify-otp").send({ email: customer.email, role: "customer", otp: validCode }).expect(400);
    });

    it("binds verification to role and makes the reset token single-use while invalidating old login tokens", async () => {
        const credentials = newCustomer();
        const registered = await request(baseUrl).post("/api/auth/register").send(credentials).expect(201);
        const code = await requestOtp(credentials.email);
        await request(baseUrl).post("/api/auth/verify-otp").send({ email: credentials.email, role: "driver", otp: code }).expect(400);
        const verified = await request(baseUrl).post("/api/auth/verify-otp").send({ email: credentials.email, role: "customer", otp: code }).expect(200);
        await request(baseUrl).post("/api/auth/verify-otp").send({ email: credentials.email, role: "customer", otp: code }).expect(400);
        await request(baseUrl).post("/api/auth/reset-password").send({ resetToken: verified.body.data.resetToken, newPassword: "NewPass456" }).expect(200);
        await request(baseUrl).get("/api/auth/me").set("Authorization", `Bearer ${registered.body.data.token}`).expect(401);
        await request(baseUrl).post("/api/auth/reset-password").send({ resetToken: verified.body.data.resetToken, newPassword: "AnotherPass789" }).expect(400);
        await request(baseUrl).post("/api/auth/login").send({ email: credentials.email, password: "NewPass456" }).expect(200);
    });

    it("rejects an expired OTP", async () => {
        const customer = newCustomer();
        await request(baseUrl).post("/api/auth/register").send(customer).expect(201);
        const code = await requestOtp(customer.email);
        await request(baseUrl).post("/_test/expire-reset").send({ email: customer.email, role: "customer" }).expect(200);
        await request(baseUrl).post("/api/auth/verify-otp").send({ email: customer.email, role: "customer", otp: code }).expect(400);
    });
});

describe("route checkpoints", () => {
    it("returns ordered automatic coordinates and records name-plus-coordinate updates", async () => {
        const generated = await request(baseUrl).post("/_test/checkpoints").send({}).expect(201);
        expect(generated.body.data.length).toBeGreaterThanOrEqual(6);
        expect(generated.body.data.length).toBeLessThanOrEqual(10);
        expect(generated.body.data[0]).toMatchObject({ name: "Bengaluru", order: 0, coordinates: { lat: 12.97, lng: 77.59 } });
        expect(generated.body.data.at(-1)).toMatchObject({ name: "Mumbai", order: generated.body.data.length - 1 });
        const owner = await registerCustomer();
        const shipment = await createShipmentFor(owner.user, "ROUTE-EVENT", { checkpoints: generated.body.data });
        const savedRoute = await request(baseUrl).get(`/api/shipments/${shipment.id}/checkpoints`).set("Authorization", `Bearer ${owner.token}`).expect(200);
        expect(savedRoute.body.data.map((point) => point.order)).toEqual(generated.body.data.map((point) => point.order));
        const selected = generated.body.data[1];
        await request(baseUrl).put(`/api/tracking/${shipment.trackingNumber}/status`).set("Authorization", `Bearer ${owner.token}`).send({ currentLocation: { city: selected.name, coordinates: selected.coordinates } }).expect(403);
        const operations = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        await request(baseUrl).put(`/api/shipments/${shipment.trackingNumber}`).set("Authorization", `Bearer ${operations.body.data.token}`).send({ currentLocation: { city: selected.name, coordinates: selected.coordinates } }).expect(200);
        const publicTrack = await request(baseUrl).get(`/api/tracking/public/${shipment.trackingNumber}`).expect(200);
        expect(publicTrack.body.data.currentLocation).toMatchObject({ city: selected.name, coordinates: selected.coordinates });
        expect(publicTrack.body.data.events).toHaveLength(1);
    });

    it("returns straight-line checkpoints with a logged fallback when OSRM is unavailable", async () => {
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const shipment = await createShipmentFor(null, "ROUTE-FALLBACK", {
            origin: "Hyderabad", destination: "Bangalore",
            originCoordinates: { lat: 17.385, lng: 78.4867 },
            destinationCoordinates: { lat: 12.9716, lng: 77.5946 }
        });
        await request(baseUrl).post("/_test/routing-provider").send({ fail: true }).expect(200);
        const response = await request(baseUrl).get(`/api/shipments/${shipment.id}/checkpoints`)
            .set("Authorization", `Bearer ${ops.body.data.token}`).expect(200);
        await request(baseUrl).post("/_test/routing-provider").send({ fail: false }).expect(200);
        expect(response.body.data.length).toBeGreaterThanOrEqual(6);
        expect(response.body.data[0]).toMatchObject({ name: "Hyderabad", order: 0, coordinates: { lat: 17.385, lng: 78.4867 } });
        expect(response.body.data.at(-1)).toMatchObject({ name: "Bangalore", coordinates: { lat: 12.9716, lng: 77.5946 } });
    });

    it("returns a specific coordinate error when geocoding cannot resolve an incomplete route", async () => {
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const shipment = await createShipmentFor(null, "ROUTE-NO-COORDS");
        await request(baseUrl).post("/_test/routing-provider").send({ failGeocoding: true }).expect(200);
        const response = await request(baseUrl).get(`/api/shipments/${shipment.id}/checkpoints`)
            .set("Authorization", `Bearer ${ops.body.data.token}`).expect(422);
        await request(baseUrl).post("/_test/routing-provider").send({ failGeocoding: false }).expect(200);
        expect(response.body.message).toMatch(/Origin coordinates are missing or invalid/);
    });

    it("recovers an invalid saved coordinate before generating a route", async () => {
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const shipment = await createShipmentFor(null, "ROUTE-INVALID-COORD", {
            origin: "Hyderabad", destination: "Bangalore",
            originCoordinates: { lat: null, lng: null },
            destinationCoordinates: { lat: 12.9716, lng: 77.5946 }
        });
        const response = await request(baseUrl).get(`/api/shipments/${shipment.id}/checkpoints`)
            .set("Authorization", `Bearer ${ops.body.data.token}`).expect(200);
        expect(response.body.data[0]).toMatchObject({ name: "Hyderabad", coordinates: { lat: 17.385, lng: 78.4867 } });
    });
});

describe("shipment privacy and public tracking", () => {
    it("allows public tracking by trimmed, case-insensitive trackingId and returns only safe fields", async () => {
        const owner = await registerCustomer();
        const shipment = await createShipmentFor(owner.user, "PUBLIC");
        await request(baseUrl).post("/_test/events").send({
            trackingNumber: shipment.trackingNumber,
            status: "IN_TRANSIT",
            location: { coordinates: { lat: 12.1, lng: 23.2 } }
        }).expect(201);

        const response = await request(baseUrl)
            .get(`/api/tracking/public/%20${shipment.trackingId.toLowerCase()}%20`)
            .expect(200);
        expect(response.body.data).toMatchObject({ trackingNumber: shipment.trackingNumber, status: "IN_TRANSIT" });
        expect(response.body.data.events).toHaveLength(1);
        expect(Object.keys(response.body.data).sort()).toEqual([
            "currentLocation", "currentLocationCoordinates", "destination", "destinationCoordinates",
            "estimatedDelivery", "originalEstimatedDelivery", "isDelayed", "events", "origin", "originCoordinates", "status", "trackingNumber"
        ].sort());
        expect(JSON.stringify(response.body)).not.toMatch(/customer|driver|_id|shipmentId|email|phone/i);
    });

    it("does not list, fetch, or track another customer's shipment", async () => {
        const customerA = await registerCustomer();
        const customerB = await registerCustomer();
        const owned = await createShipmentFor(customerA.user, "OWNED");
        const privateShipment = await createShipmentFor(customerB.user, "PRIVATE", {
            customerId: customerA.user.id
        });
        const auth = `Bearer ${customerA.token}`;

        const list = await request(baseUrl).get("/api/shipments").set("Authorization", auth).expect(200);
        expect(list.body.data.map((item) => item.trackingNumber)).toContain(owned.trackingNumber);
        expect(list.body.data.map((item) => item.trackingNumber)).not.toContain(privateShipment.trackingNumber);
        await request(baseUrl).get(`/api/shipments/${privateShipment.id}`).set("Authorization", auth).expect(404);
        await request(baseUrl).get(`/api/tracking/${privateShipment.trackingNumber}`).set("Authorization", auth).expect(404);
        await request(baseUrl).get(`/api/tracking/${privateShipment.trackingNumber}/events`).set("Authorization", auth).expect(404);
    });

    it("limits drivers to linked assignments and rejects status updates on unassigned shipments", async () => {
        const driver = await createDriver("ASSIGNED");
        const assigned = await createShipmentFor(null, "ASSIGNED", { assignedDriver: driver.driverObjectId, driverId: driver.driverId });
        const unassigned = await createShipmentFor(null, "UNASSIGNED", { driverId: "other-driver" });
        const auth = `Bearer ${driver.token}`;

        const list = await request(baseUrl).get("/api/shipments").set("Authorization", auth).expect(200);
        expect(list.body.data.map((item) => item.trackingNumber)).toContain(assigned.trackingNumber);
        expect(list.body.data.map((item) => item.trackingNumber)).not.toContain(unassigned.trackingNumber);
        await request(baseUrl).put(`/api/tracking/${unassigned.trackingNumber}/status`)
            .set("Authorization", auth).send({ status: "DELIVERED" }).expect(404);
    });

    it("records location checkpoint updates and exposes them on the public tracking endpoint", async () => {
        const driver = await createDriver("EVENTS");
        const shipment = await createShipmentFor(null, "EVENT", {
            assignedDriver: driver.driverObjectId,
            driverId: driver.driverId
        });
        await request(baseUrl).put(`/api/tracking/${shipment.trackingNumber}/status`)
            .set("Authorization", `Bearer ${driver.token}`)
            .send({ currentLocation: { city: "Next checkpoint", coordinates: { lat: 13, lng: 24 } } })
            .expect(200);

        const publicResult = await request(baseUrl).get(`/api/tracking/public/${shipment.trackingNumber}`).expect(200);
        expect(publicResult.body.data.currentLocation).toMatchObject({ city: "Bangalore, Karnataka", coordinates: { lat: 13, lng: 24 } });
        expect(publicResult.body.data.events).toHaveLength(1);
        expect(publicResult.body.data.events[0]).toMatchObject({ status: "IN_TRANSIT", locationCoordinates: { lat: 13, lng: 24 } });
    });

    it("keeps the ETA and delay flag while stripping the delay reason from customer and public responses", async () => {
        const owner = await registerCustomer();
        const original = new Date(Date.now() + 86400000).toISOString();
        const later = new Date(Date.now() + 172800000).toISOString();
        const shipment = await createShipmentFor(owner.user, "DELAY", { estimatedDelivery: later, originalEstimatedDelivery: original, delayReason: "Weather closure" });
        const customerResponse = await request(baseUrl).get(`/api/shipments/${shipment.id}`).set("Authorization", `Bearer ${owner.token}`).expect(200);
        expect(customerResponse.body.data).toMatchObject({ isDelayed: true, estimatedDelivery: later });
        expect(customerResponse.body.data).not.toHaveProperty("delayReason");
        const publicResponse = await request(baseUrl).get(`/api/tracking/public/${shipment.trackingNumber}`).expect(200);
        expect(publicResponse.body.data.isDelayed).toBe(true);
        expect(publicResponse.body.data).not.toHaveProperty("delayReason");
    });

    it("lets the assigned driver save a delay reason while stripping it from customers and public tracking", async () => {
        const owner = await registerCustomer();
        const driver = await createDriver("DELAY-DRIVER");
        const shipment = await createShipmentFor(owner.user, "DRIVER-DELAY", { assignedDriver: driver.driverObjectId, driverId: driver.driverId });
        await request(baseUrl).put(`/api/tracking/${shipment.trackingNumber}/status`).set("Authorization", `Bearer ${driver.token}`).send({ delayReason: "Traffic" }).expect(200);
        const customer = await request(baseUrl).get(`/api/shipments/${shipment.id}`).set("Authorization", `Bearer ${owner.token}`).expect(200);
        const publicResponse = await request(baseUrl).get(`/api/tracking/public/${shipment.trackingNumber}`).expect(200);
        const driverView = await request(baseUrl).get(`/api/tracking/${shipment.trackingNumber}`).set("Authorization", `Bearer ${driver.token}`).expect(200);
        expect(customer.body.data).not.toHaveProperty("delayReason");
        expect(publicResponse.body.data).not.toHaveProperty("delayReason");
        expect(driverView.body.data.delayReason).toBe("Traffic");
    });
});

describe("driver assignment and removal", () => {
    it("keeps the status fields synchronized and canonical across both update routes", async () => {
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const auth = `Bearer ${ops.body.data.token}`;
        const shipment = await createShipmentFor(null, "STATUS-SYNC");

        const edited = await request(baseUrl).put(`/api/shipments/${shipment.id}`).set("Authorization", auth)
            .send({ currentStatus: "Picked up" }).expect(200);
        expect(edited.body.data).toMatchObject({ status: "PICKED_UP", currentStatus: "PICKED_UP" });

        const tracked = await request(baseUrl).put(`/api/tracking/${shipment.trackingNumber}/status`).set("Authorization", auth)
            .send({ status: "OUT_FOR_DELIVERY" }).expect(200);
        expect(tracked.body.data).toMatchObject({ status: "OUT_FOR_DELIVERY", currentStatus: "OUT_FOR_DELIVERY" });

        const fetched = await request(baseUrl).get(`/api/shipments/${shipment.id}`).set("Authorization", auth).expect(200);
        expect(fetched.body.data.status).toBe(fetched.body.data.currentStatus);
        const events = await request(baseUrl).get(`/api/tracking/${shipment.trackingNumber}/events`).set("Authorization", auth).expect(200);
        expect(events.body.data[0].status).toBe("OUT_FOR_DELIVERY");
    });

    it("lists only fresh, origin-local, free drivers and releases a driver at the delivered destination", async () => {
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const hyderabad = await createDriver("AVAILABLE-HYD");
        const bangalore = await createDriver("AVAILABLE-BLR");
        const stale = await createDriver("AVAILABLE-STALE");
        const busy = await createDriver("AVAILABLE-BUSY");
        const atHyderabad = { city: " Hyderabad ", coordinates: { lat: 17.385, lng: 78.4867 } };
        const atBangalore = { city: "Bangalore", coordinates: { lat: 12.9716, lng: 77.5946 } };
        const setLocation = (driver, currentLocation, updatedAt) => request(baseUrl).post("/_test/driver-location")
            .send({ driverId: driver.driverId, currentLocation, ...(updatedAt ? { updatedAt } : {}) }).expect(200);
        await request(baseUrl).put("/api/drivers/me/location").set("Authorization", `Bearer ${hyderabad.token}`).send({ city: " Hyderabad " }).expect(200);
        const hyderabadAfterCityUpdate = await request(baseUrl).get(`/api/drivers/${hyderabad.driverId}`).set("Authorization", `Bearer ${ops.body.data.token}`).expect(200);
        expect(hyderabadAfterCityUpdate.body.data.currentLocation).toMatchObject({ city: "Hyderabad", coordinates: { lat: 17.385, lng: 78.4867 } });
        expect(new Date(hyderabadAfterCityUpdate.body.data.currentLocationUpdatedAt).getTime()).toBeGreaterThan(Date.now() - 5000);
        await request(baseUrl).put("/api/drivers/me/location").set("Authorization", `Bearer ${bangalore.token}`).send({ city: "Bangalore" }).expect(200);
        await setLocation(stale, atHyderabad, new Date(Date.now() - 31 * 60 * 1000).toISOString());
        await request(baseUrl).put("/api/drivers/me/location").set("Authorization", `Bearer ${busy.token}`).send({ city: "Hyderabad" }).expect(200);

        const active = await createShipmentFor(null, "BUSY-HYD-TRIP", {
            assignedDriver: busy.driverObjectId, driverId: busy.driverId,
            origin: "Hyderabad", destination: "Bangalore",
            originCoordinates: atHyderabad.coordinates, destinationCoordinates: atBangalore.coordinates
        });
        const pickup = await createShipmentFor(null, "PICKUP-HYD", {
            origin: "Hyderabad", destination: "Bangalore",
            originCoordinates: atHyderabad.coordinates, destinationCoordinates: atBangalore.coordinates
        });
        const eligible = await request(baseUrl).get(`/api/shipments/${pickup.id}/available-drivers`)
            .set("Authorization", `Bearer ${ops.body.data.token}`).expect(200);
        expect(eligible.body.data.map((driver) => driver.id)).toContain(hyderabad.driverId);
        expect(eligible.body.data.map((driver) => driver.id)).not.toEqual(expect.arrayContaining([bangalore.driverId, stale.driverId, busy.driverId]));
        const rejected = await request(baseUrl).put(`/api/shipments/${pickup.id}/assign`)
            .set("Authorization", `Bearer ${ops.body.data.token}`).send({ driverId: busy.driverId }).expect(409);
        expect(rejected.body.message).toMatch(/active shipment/i);

        await request(baseUrl).put(`/api/shipments/${pickup.id}/assign`)
            .set("Authorization", `Bearer ${ops.body.data.token}`).send({ driverId: hyderabad.driverId }).expect(200);
        const secondPickup = await createShipmentFor(null, "PICKUP-HYD-SECOND", {
            origin: "Hyderabad", destination: "Bangalore",
            originCoordinates: atHyderabad.coordinates, destinationCoordinates: atBangalore.coordinates
        });
        const afterAssignment = await request(baseUrl).get(`/api/shipments/${secondPickup.id}/available-drivers`)
            .set("Authorization", `Bearer ${ops.body.data.token}`).expect(200);
        expect(afterAssignment.body.data.map((driver) => driver.id)).not.toContain(hyderabad.driverId);

        await request(baseUrl).put(`/api/tracking/${pickup.trackingNumber}/status`)
            .set("Authorization", `Bearer ${hyderabad.token}`).send({ status: "DELIVERED" }).expect(200);
        const bangalorePickup = await createShipmentFor(null, "PICKUP-BLR-AFTER-DELIVERY", {
            origin: "Bangalore", destination: "Hyderabad",
            originCoordinates: atBangalore.coordinates, destinationCoordinates: atHyderabad.coordinates
        });
        const afterDelivery = await request(baseUrl).get(`/api/shipments/${bangalorePickup.id}/available-drivers`)
            .set("Authorization", `Bearer ${ops.body.data.token}`).expect(200);
        expect(afterDelivery.body.data.map((driver) => driver.id)).toContain(hyderabad.driverId);
        expect(active.id).toBeTruthy();
    });

    it("matches Bengaluru and Bangalore for fresh free drivers and explains other exclusions in dev debug", async () => {
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const auth = `Bearer ${ops.body.data.token}`;
        const bengaluru = await createDriver("ALIAS-FRESH");
        const pending = await request(baseUrl).post("/_test/driver").send({ suffix: "ALIAS-PENDING", approvalStatus: "PENDING" }).expect(201);
        const stale = (await request(baseUrl).post("/_test/driver").send({ suffix: "ALIAS-STALE", currentLocation: { city: "Bengaluru, Karnataka" }, updatedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString() }).expect(201)).body.data;
        const missingTimestamp = (await request(baseUrl).post("/_test/driver").send({ suffix: "ALIAS-NO-TIMESTAMP", noTimestamp: true }).expect(201)).body.data;
        const busy = await createDriver("ALIAS-BUSY");
        await request(baseUrl).post("/_test/driver-location").send({ driverId: bengaluru.driverId, currentLocation: { city: " Bengaluru, Karnataka " } }).expect(200);
        await request(baseUrl).post("/_test/driver-location").send({ driverId: busy.driverId, currentLocation: { city: "Bengaluru" } }).expect(200);
        await createShipmentFor(null, "ALIAS-BUSY-ACTIVE", { assignedDriver: busy.driverObjectId, driverId: busy.driverId });
        const pickup = await createShipmentFor(null, "ALIAS-PICKUP", { origin: "Bangalore", destination: "Delhi" });

        const normal = await request(baseUrl).get(`/api/shipments/${pickup.id}/available-drivers`).set("Authorization", auth).expect(200);
        expect(normal.body.data.map((driver) => driver.id)).toContain(bengaluru.driverId);
        expect(normal.body.data.map((driver) => driver.id)).not.toEqual(expect.arrayContaining([stale.driverId, busy.driverId, pending.body.data.driverId]));

        const debug = await request(baseUrl).get(`/api/shipments/${pickup.id}/available-drivers?debug=true`).set("Authorization", auth).expect(200);
        expect(debug.body.debug).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: bengaluru.driverId, included: true, reason: "Eligible" }),
            expect.objectContaining({ id: stale.driverId, included: false, reason: "Location update is stale" }),
            expect.objectContaining({ id: missingTimestamp.driverId, included: false, reason: "No location timestamp" }),
            expect.objectContaining({ id: busy.driverId, included: false, reason: "Already assigned to an active shipment", blockingShipments: [expect.objectContaining({ trackingNumber: "LTS-ALIAS-BUSY-ACTIVE", status: "IN_TRANSIT" })] }),
            expect.objectContaining({ id: pending.body.data.driverId, included: false, reason: "Driver is not approved" })
        ]));
        const summaries = await request(baseUrl).get("/api/drivers/summary").set("Authorization", auth).expect(200);
        const missingSummary = summaries.body.data.find((item) => item.id === missingTimestamp.driverId);
        expect(missingSummary).toMatchObject({ effectiveAvailability: "UNAVAILABLE", locationFreshnessReason: "No location timestamp" });
        expect(missingSummary.availabilityReasons).toContain("No location timestamp");
    });

    it("keeps Driver and shipment-card locations synchronized through city and GPS updates", async () => {
        const driver = await createDriver("LOCATION-WRITE");
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const auth = `Bearer ${ops.body.data.token}`;
        const shipment = await createShipmentFor(null, "LOCATION-WRITE", {
            assignedDriver: driver.driverObjectId, driverId: driver.driverId,
            originCoordinates: { lat: 12.97, lng: 77.59 }, destinationCoordinates: { lat: 17.385, lng: 78.4867 }
        });
        const before = await request(baseUrl).get(`/api/drivers/${driver.driverId}`).set("Authorization", auth).expect(200);
        expect(before.body.data.currentLocation).toMatchObject({ city: "Bengaluru", coordinates: { lat: 12.97, lng: 77.59 } });

        await request(baseUrl).put("/api/drivers/me/location").set("Authorization", `Bearer ${driver.token}`).send({ city: "Hyderabad" }).expect(200);
        const afterCity = await request(baseUrl).get(`/api/drivers/${driver.driverId}`).set("Authorization", auth).expect(200);
        const shipmentAfterCity = await request(baseUrl).get(`/api/shipments/${shipment.id}`).set("Authorization", auth).expect(200);
        expect(afterCity.body.data.currentLocation).toMatchObject({ city: "Hyderabad", coordinates: { lat: 17.385, lng: 78.4867 }, accuracy: null });
        expect(new Date(afterCity.body.data.currentLocationUpdatedAt).getTime()).toBeGreaterThan(new Date(before.body.data.currentLocationUpdatedAt).getTime());
        expect(shipmentAfterCity.body.data.currentLocation).toMatchObject({ city: "Hyderabad", coordinates: { lat: 17.385, lng: 78.4867 } });

        const updated = await request(baseUrl).put(`/api/tracking/${shipment.trackingNumber}/status`)
            .set("Authorization", `Bearer ${driver.token}`).send({ currentLocation: { coordinates: { lat: 12.9716, lng: 77.5946 }, accuracy: 30 } }).expect(200);
        expect(updated.body.data.currentLocation).toMatchObject({ city: "Bangalore, Karnataka", coordinates: { lat: 12.9716, lng: 77.5946 }, accuracy: 30 });
        const stored = await request(baseUrl).get(`/api/drivers/${driver.driverId}`).set("Authorization", auth).expect(200);
        const shipmentAfterGps = await request(baseUrl).get(`/api/shipments/${shipment.id}`).set("Authorization", auth).expect(200);
        expect(stored.body.data.currentLocation).toMatchObject({ city: "Bangalore, Karnataka", coordinates: { lat: 12.9716, lng: 77.5946 }, accuracy: 30 });
        expect(new Date(stored.body.data.currentLocationUpdatedAt).getTime()).toBeGreaterThan(new Date(afterCity.body.data.currentLocationUpdatedAt).getTime());
        expect(shipmentAfterGps.body.data.currentLocation).toMatchObject({ city: stored.body.data.currentLocation.city, coordinates: stored.body.data.currentLocation.coordinates, accuracy: 30 });
    });

    it("marks poor browser accuracy approximate and does not expose it as an exact shipment position", async () => {
        const driver = await createDriver("LOCATION-APPROX");
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const auth = `Bearer ${ops.body.data.token}`;
        const shipment = await createShipmentFor(null, "LOCATION-APPROX", { assignedDriver: driver.driverObjectId, driverId: driver.driverId });
        await request(baseUrl).put(`/api/tracking/${shipment.trackingNumber}/status`).set("Authorization", `Bearer ${driver.token}`)
            .send({ currentLocation: { coordinates: { lat: 12.9716, lng: 77.5946 }, accuracy: 12000 } }).expect(200);
        const stored = await request(baseUrl).get(`/api/drivers/${driver.driverId}`).set("Authorization", auth).expect(200);
        expect(stored.body.data.currentLocation).toMatchObject({ city: "Unknown location", coordinates: { lat: 12.9716, lng: 77.5946 }, accuracy: 12000 });
        const shipmentView = await request(baseUrl).get(`/api/shipments/${shipment.id}`).set("Authorization", auth).expect(200);
        expect(shipmentView.body.data.currentLocation.city).toMatch(/Approximate location/);
        expect(shipmentView.body.data.currentLocation).not.toHaveProperty("coordinates");
    });

    it("recomputes a stale busy flag from canonical shipment state", async () => {
        const driver = await createDriver("RECOMPUTE-FLAG");
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const auth = `Bearer ${ops.body.data.token}`;
        await request(baseUrl).put(`/api/drivers/${driver.driverId}`).set("Authorization", auth)
            .send({ availability: "BUSY", assignmentLock: true, status: "On trip" }).expect(200);
        const result = await request(baseUrl).post(`/api/drivers/${driver.driverId}/recompute-availability`).set("Authorization", auth).send({}).expect(200);
        expect(result.body.data).toMatchObject({ available: true, activeShipmentCount: 0 });
        const record = await request(baseUrl).get(`/api/drivers/${driver.driverId}`).set("Authorization", auth).expect(200);
        expect(record.body.data).toMatchObject({ availability: "AVAILABLE", assignmentLock: false, status: "Available" });
    });

    it("releases drivers after delivery, cancellation, and shipment deletion", async () => {
        const driver = await createDriver("RELEASE-TERMINAL");
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const auth = `Bearer ${ops.body.data.token}`;
        const driverRecord = () => request(baseUrl).get(`/api/drivers/${driver.driverId}`).set("Authorization", auth);
        const origin = { lat: 12.97, lng: 77.59 };
        const destination = { lat: 17.385, lng: 78.4867 };
        const delivered = await createShipmentFor(null, "RELEASE-DELIVERED", {
            assignedDriver: driver.driverObjectId, driverId: driver.driverId,
            originCoordinates: origin, destinationCoordinates: destination
        });
        await request(baseUrl).put(`/api/tracking/${delivered.trackingNumber}/status`).set("Authorization", `Bearer ${driver.token}`).send({ status: "DELIVERED" }).expect(200);
        let stored = await driverRecord().expect(200);
        expect(stored.body.data).toMatchObject({ availability: "AVAILABLE", assignmentLock: false });

        const cancelled = await createShipmentFor(null, "RELEASE-CANCELLED", {
            origin: "Hyderabad", destination: "Bangalore", originCoordinates: destination, destinationCoordinates: origin
        });
        await request(baseUrl).put(`/api/shipments/${cancelled.id}/assign`).set("Authorization", auth).send({ driverId: driver.driverId }).expect(200);
        stored = await driverRecord().expect(200);
        expect(stored.body.data).toMatchObject({ availability: "BUSY", assignmentLock: true });
        await request(baseUrl).put(`/api/shipments/${cancelled.id}`).set("Authorization", auth).send({ status: "CANCELLED" }).expect(200);
        stored = await driverRecord().expect(200);
        expect(stored.body.data).toMatchObject({ availability: "AVAILABLE", assignmentLock: false });

        const deleted = await createShipmentFor(null, "RELEASE-DELETED", {
            origin: "Hyderabad", destination: "Bangalore", originCoordinates: destination, destinationCoordinates: origin
        });
        await request(baseUrl).put(`/api/shipments/${deleted.id}/assign`).set("Authorization", auth).send({ driverId: driver.driverId }).expect(200);
        await request(baseUrl).delete(`/api/shipments/${deleted.id}`).set("Authorization", auth).expect(200);
        stored = await driverRecord().expect(200);
        expect(stored.body.data).toMatchObject({ availability: "AVAILABLE", assignmentLock: false });
    });

    it("prevents a delivered shipment from being reopened through tracking or shipment updates", async () => {
        const owner = await registerCustomer();
        const driver = await createDriver("DELIVERED-LOCK");
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const shipment = await createShipmentFor(owner.user, "DELIVERED-LOCK", { assignedDriver: driver.driverObjectId, driverId: driver.driverId });
        await request(baseUrl).put(`/api/tracking/${shipment.trackingNumber}/status`).set("Authorization", `Bearer ${ops.body.data.token}`).send({ status: "DELIVERED" }).expect(200);
        const driverUpdate = await request(baseUrl).put(`/api/tracking/${shipment.trackingNumber}/status`).set("Authorization", `Bearer ${driver.token}`).send({ status: "IN_TRANSIT" }).expect(409);
        expect(driverUpdate.body.message).toMatch(/Delivered shipments cannot be changed/);
        const opsUpdate = await request(baseUrl).put(`/api/shipments/${shipment.id}`).set("Authorization", `Bearer ${ops.body.data.token}`).send({ status: "IN_TRANSIT" }).expect(409);
        expect(opsUpdate.body.message).toMatch(/Delivered shipments cannot be changed/);
    });

    it("returns server-aggregated active shipment totals and protects the summary route", async () => {
        const driver = await createDriver("SUMMARY");
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const active = await createShipmentFor(null, "SUMMARY-ACTIVE", { assignedDriver: driver.driverObjectId, driverId: driver.driverId });
        const delivered = await createShipmentFor(null, "SUMMARY-DONE", { assignedDriver: driver.driverObjectId, driverId: driver.driverId });
        await request(baseUrl).put(`/api/tracking/${delivered.trackingNumber}/status`).set("Authorization", `Bearer ${ops.body.data.token}`).send({ status: "DELIVERED" }).expect(200);
        const result = await request(baseUrl).get("/api/drivers/summary").set("Authorization", `Bearer ${ops.body.data.token}`).expect(200);
        expect(result.body.data.find((item) => item.id === driver.driverId).activeShipmentCount).toBe(1);
        expect(active.id).toBeTruthy();
        const customer = await registerCustomer();
        await request(baseUrl).get("/api/drivers/summary").set("Authorization", `Bearer ${customer.token}`).expect(403);
    });

    it("persists an eligible assignment, returns the driver's name, and records a tracking event", async () => {
        const driver = await createDriver("ROUTE-OK");
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const shipment = await createShipmentFor(null, "ROUTE-OK", { originCoordinates: { lat: 12.9716, lng: 77.5946 }, destinationCoordinates: { lat: 18.5204, lng: 73.8567 } });
        await request(baseUrl).put(`/api/shipments/${shipment.id}/assign`).set("Authorization", `Bearer ${ops.body.data.token}`).send({ driverId: driver.driverId }).expect(200);
        const list = await request(baseUrl).get("/api/shipments").set("Authorization", `Bearer ${ops.body.data.token}`).expect(200);
        expect(list.body.data.find((item) => item.id === shipment.id).assignedDriver.name).toBe("Test Driver");
        const driverList = await request(baseUrl).get("/api/shipments").set("Authorization", `Bearer ${driver.token}`).expect(200);
        expect(driverList.body.data.map((item) => item.id)).toContain(shipment.id);
        const events = await request(baseUrl).get(`/api/tracking/${shipment.trackingNumber}/events`).set("Authorization", `Bearer ${ops.body.data.token}`).expect(200);
        expect(events.body.data.some((event) => /Assigned to Test Driver/.test(event.note))).toBe(true);
    });

    it("rejects a driver whose current location is outside the configured route corridor", async () => {
        const driver = await createDriver("ROUTE-BAD");
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const shipment = await createShipmentFor(null, "ROUTE-BAD", { originCoordinates: { lat: 28.6139, lng: 77.209 }, destinationCoordinates: { lat: 19.076, lng: 72.8777 } });
        const result = await request(baseUrl).put(`/api/shipments/${shipment.id}/assign`).set("Authorization", `Bearer ${ops.body.data.token}`).send({ driverId: driver.driverId }).expect(409);
        expect(result.body.message).toMatch(/Bengaluru, \d+ km from pickup/);
    });

    it("atomically rejects a concurrent second assignment for the same driver", async () => {
        const driver = await createDriver("RACE-LOCK");
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const first = await createShipmentFor(null, "RACE-FIRST", { originCoordinates: { lat: 12.9716, lng: 77.5946 } });
        const second = await createShipmentFor(null, "RACE-SECOND", { originCoordinates: { lat: 12.9716, lng: 77.5946 } });
        const assign = (shipment) => request(baseUrl).put(`/api/shipments/${shipment.id}/assign`)
            .set("Authorization", `Bearer ${ops.body.data.token}`).send({ driverId: driver.driverId });
        const results = await Promise.all([assign(first), assign(second)]);
        expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    });

    it("returns approved drivers for the route with eligibility and a location reason", async () => {
        const eligible = await createDriver("LIST-ELIGIBLE");
        const distant = await createDriver("LIST-DISTANT");
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        await request(baseUrl).put(`/api/drivers/${distant.driverId}`).set("Authorization", `Bearer ${ops.body.data.token}`).send({ currentLocation: { city: "Pune", coordinates: { lat: 18.5204, lng: 73.8567 } } }).expect(200);
        const shipment = await createShipmentFor(null, "LIST-ROUTE", { originCoordinates: { lat: 12.9716, lng: 77.5946 }, destinationCoordinates: { lat: 17.385, lng: 78.4867 } });
        const response = await request(baseUrl).get(`/api/drivers?shipmentId=${shipment.id}`).set("Authorization", `Bearer ${ops.body.data.token}`).expect(200);
        expect(response.body.data).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: eligible.driverId, eligible: true }),
            expect.objectContaining({ id: distant.driverId, eligible: false, ineligibleReason: expect.stringMatching(/Pune.*km from pickup/) })
        ]));
    });

    it("rejects any additional assignment while the driver has an active shipment", async () => {
        const driver = await createDriver("ACTIVE-CORRIDOR");
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const bengaluru = { lat: 12.9716, lng: 77.5946 };
        const pune = { lat: 18.5204, lng: 73.8567 };
        const mumbai = { lat: 19.076, lng: 72.8777 };
        const active = await createShipmentFor(null, "ACTIVE-ROUTE", {
            assignedDriver: driver.driverObjectId, driverId: driver.driverId,
            originCoordinates: bengaluru, destinationCoordinates: mumbai,
            currentLocation: { city: "Bengaluru", coordinates: bengaluru },
            checkpoints: [{ name: "Bengaluru", order: 0, coordinates: bengaluru }, { name: "Pune", order: 1, coordinates: pune }, { name: "Mumbai", order: 2, coordinates: mumbai }]
        });
        const additional = await createShipmentFor(null, "ROUTE-PUNE", { originCoordinates: bengaluru, destinationCoordinates: pune });
        const busyResponse = await request(baseUrl).put(`/api/shipments/${additional.id}/assign`).set("Authorization", `Bearer ${ops.body.data.token}`).send({ driverId: driver.driverId }).expect(409);
        expect(busyResponse.body.message).toMatch(/active shipment/i);
        const delhi = await createShipmentFor(null, "ROUTE-DELHI", { originCoordinates: { lat: 28.6139, lng: 77.209 }, destinationCoordinates: mumbai });
        await request(baseUrl).put(`/api/shipments/${delhi.id}/assign`).set("Authorization", `Bearer ${ops.body.data.token}`).send({ driverId: driver.driverId }).expect(409);
        expect(active.id).toBeTruthy();
    });

    it("blocks soft removal while a driver has an active shipment", async () => {
        const driver = await createDriver("REMOVE-BLOCKED");
        const ops = await request(baseUrl).post("/_test/operations").send({}).expect(201);
        const active = await createShipmentFor(null, "REMOVE-BLOCKED", { assignedDriver: driver.driverObjectId, driverId: driver.driverId });
        const result = await request(baseUrl).delete(`/api/drivers/${driver.driverId}`).set("Authorization", `Bearer ${ops.body.data.token}`).expect(409);
        expect(result.body.message).toMatch(/active shipments/i);
        await request(baseUrl).put(`/api/shipments/${active.id}/assign`).set("Authorization", `Bearer ${ops.body.data.token}`).send({ driverId: null }).expect(200);
        const removed = await request(baseUrl).delete(`/api/drivers/${driver.driverId}`).set("Authorization", `Bearer ${ops.body.data.token}`).expect(200);
        expect(removed.body.data).toMatchObject({ approvalStatus: "REMOVED", status: "REMOVED" });
        await request(baseUrl).get("/api/shipments").set("Authorization", `Bearer ${driver.token}`).expect(401);
    });
});

describe("supported authentication routes", () => {
    it("does not expose Google or email-code authentication endpoints", async () => {
        await request(baseUrl).post("/api/auth/email-login-code").send({}).expect(404);
        await request(baseUrl).post("/api/auth/verify-email-login-code").send({}).expect(404);
        await request(baseUrl).post("/api/auth/google").send({}).expect(404);
    });
});
