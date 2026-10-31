const { buildResetPlan, isOperationsUser, parseOptions, userDeleteFilter } = require("../scripts/reset-data");

describe("safe reset data plan", () => {
    it("defaults to dry run and blocks production without an explicit override", () => {
        expect(parseOptions([], { NODE_ENV: "development" })).toMatchObject({ confirm: false, productionBlocked: false });
        expect(parseOptions([], { NODE_ENV: "production" }).productionBlocked).toBe(true);
        expect(parseOptions(["--force-production"], { NODE_ENV: "production" }).productionBlocked).toBe(false);
    });

    it("targets shipment-related data and preserves operations users", () => {
        const names = buildResetPlan(["users", "drivers", "shipments", "trackingevents", "passwordresets", "products"]);
        expect(names.map(({ name }) => name)).toEqual(["users", "drivers", "shipments", "trackingevents", "passwordresets"]);
        expect(names.find(({ name }) => name === "users").filter).toEqual(userDeleteFilter);
        expect(isOperationsUser({ role: "operations" })).toBe(true);
        expect(isOperationsUser({ role: "customer" })).toBe(false);
    });
});
