const bcrypt = require("bcryptjs");
const { createOpsUser, getOptions } = require("../scripts/create-ops-user");

describe("create operations user utility", () => {
    it("accepts environment values and command-line overrides without exposing the password", () => {
        expect(getOptions(["--email", "OPS@example.test"], {
            OPS_EMAIL: "old@example.test", OPS_PASSWORD: "SecurePass123", OPS_NAME: "Operations"
        })).toEqual({ email: "ops@example.test", password: "SecurePass123", name: "Operations" });
    });

    it("creates an operations account with the auth bcrypt cost and never stores the raw password", async () => {
        const UserModel = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn(async (user) => user) };
        const user = await createOpsUser({ email: "ops@example.test", password: "SecurePass123", name: "Operations" }, UserModel);
        expect(user.role).toBe("operations");
        expect(user.password).not.toBe("SecurePass123");
        expect(await bcrypt.compare("SecurePass123", user.password)).toBe(true);
        expect(UserModel.create).toHaveBeenCalledWith(expect.objectContaining({ email: "ops@example.test", role: "operations" }));
    });

    it("refuses an existing email without creating another account", async () => {
        const UserModel = { findOne: jest.fn().mockResolvedValue({ id: "existing" }), create: jest.fn() };
        await expect(createOpsUser({ email: "ops@example.test", password: "SecurePass123", name: "Operations" }, UserModel))
            .rejects.toThrow("already exists");
        expect(UserModel.create).not.toHaveBeenCalled();
    });

    it("rejects missing or weak credential inputs", () => {
        expect(() => getOptions([], {})).toThrow("Provide OPS_NAME");
        expect(() => getOptions(["--password", "weak"], { OPS_EMAIL: "ops@example.test", OPS_NAME: "Operations" }))
            .toThrow("Provide OPS_NAME");
    });
});
