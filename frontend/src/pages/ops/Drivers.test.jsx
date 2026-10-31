import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { getDriverSummaries, getPendingDrivers } from "../../api";
import Drivers from "./Drivers";

vi.mock("../../api", () => ({
  getDriverSummaries: vi.fn(),
  getPendingDrivers: vi.fn(),
  removeDriver: vi.fn(),
  reviewDriver: vi.fn()
}));

describe("operations driver location freshness", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows stale availability and its location freshness beside the location", async () => {
    getDriverSummaries.mockResolvedValue([{
      id: "driver-stale", name: "Ahnjk", phone: "2025550100", vehicleType: "Van", vehicleNumber: "V-1",
      approvalStatus: "APPROVED", availability: "AVAILABLE", effectiveAvailability: "UNAVAILABLE",
      availabilityReasons: ["Location update is stale"], locationFreshnessReason: "Location update is stale",
      currentLocation: { city: "Bangalore" }, currentLocationUpdatedAt: "2026-10-30T10:00:00.000Z", activeShipmentCount: 0
    }]);
    getPendingDrivers.mockResolvedValue([]);
    render(<MemoryRouter><Drivers /></MemoryRouter>);

    expect(await screen.findByText("UNAVAILABLE · Location update is stale")).toBeInTheDocument();
    expect(screen.getByText("Bangalore · Stale")).toBeInTheDocument();
  });

  it("shows a missing location timestamp consistently with the unavailable reason", async () => {
    getDriverSummaries.mockResolvedValue([{
      id: "driver-no-time", name: "No Time", phone: "2025550100", vehicleType: "Van", vehicleNumber: "V-2",
      approvalStatus: "APPROVED", availability: "AVAILABLE", effectiveAvailability: "UNAVAILABLE",
      availabilityReasons: ["No location timestamp"], locationFreshnessReason: "No location timestamp",
      currentLocation: { city: "Bangalore" }, currentLocationUpdatedAt: null, activeShipmentCount: 0
    }]);
    getPendingDrivers.mockResolvedValue([]);
    render(<MemoryRouter><Drivers /></MemoryRouter>);

    expect(await screen.findByText("UNAVAILABLE · No location timestamp")).toBeInTheDocument();
    expect(screen.getByText("Bangalore · No location update")).toBeInTheDocument();
  });
});
