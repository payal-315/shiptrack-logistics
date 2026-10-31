import { afterEach, describe, expect, it, vi } from "vitest";
import { clearShipmentSession, getPublicTracking } from "./api";

describe("public tracking and session cleanup", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("calls public tracking without attaching a logged-in token", async () => {
    localStorage.setItem("authToken", "old-user-token");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: {} }) });
    vi.stubGlobal("fetch", fetchMock);

    await getPublicTracking(" SHP123 ");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/tracking/public/%20SHP123%20"),
      expect.objectContaining({ headers: {} })
    );
  });

  it("clears shipment caches and session state when the user changes", () => {
    localStorage.setItem("shipmentCache", "customer-a-data");
    localStorage.setItem("authToken", "customer-a-token");
    sessionStorage.setItem("lastShipment", "LTS-A");

    clearShipmentSession();

    expect(localStorage.getItem("shipmentCache")).toBeNull();
    expect(localStorage.getItem("authToken")).toBe("customer-a-token");
    expect(sessionStorage.length).toBe(0);
  });
});
