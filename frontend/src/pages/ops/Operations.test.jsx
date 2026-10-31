import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { assignDriver, getAvailableDrivers, getPendingDrivers, getShipmentCheckpoints, getShipments, updateTracking } from "../../api";
import Operations from "./Operations";

vi.mock("../../api", () => ({
  API_ENDPOINTS: { SHIPMENTS: { UPDATE: (id) => `/shipments/${id}` } },
  apiClient: { put: vi.fn() },
  assignDriver: vi.fn(),
  getAvailableDrivers: vi.fn(),
  getPendingDrivers: vi.fn(),
  getShipmentCheckpoints: vi.fn(),
  getShipments: vi.fn(),
  updateTracking: vi.fn()
}));

describe("operations shipment checkpoints", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("loads route checkpoints and sends the selected place name and coordinates", async () => {
    getShipments.mockResolvedValue([{
      id: "record-1", trackingNumber: "LTS-OPS", origin: "Origin", destination: "Destination",
      currentStatus: "IN_TRANSIT", currentLocation: { city: "Origin" }
    }]);
    getAvailableDrivers.mockResolvedValue([]);
    getPendingDrivers.mockResolvedValue([]);
    getShipmentCheckpoints.mockResolvedValue([{
      name: "Checkpoint North", coordinates: { lat: 12.3, lng: 45.6 }
    }]);
    updateTracking.mockResolvedValue({});
    render(<MemoryRouter><Operations /></MemoryRouter>);

    const locationSelect = await screen.findByLabelText("Route location");
    fireEvent.focus(locationSelect);
    expect(await screen.findByRole("option", { name: /Checkpoint North/ })).toBeInTheDocument();
    fireEvent.change(locationSelect, { target: { value: "0" } });

    await waitFor(() => expect(updateTracking).toHaveBeenCalledWith("LTS-OPS", {
      currentLocation: { city: "Checkpoint North", coordinates: { lat: 12.3, lng: 45.6 } }
    }));
    expect(getShipmentCheckpoints).toHaveBeenCalledWith("record-1");
    expect(assignDriver).not.toHaveBeenCalled();
  });

  it("retries a failed checkpoint request, clears the error, and shows the recovered route", async () => {
    getShipments.mockResolvedValue([{ id: "retry-route", trackingNumber: "LTS-RETRY", origin: "Hyderabad", destination: "Bangalore", currentStatus: "ORDER_CREATED" }]);
    getAvailableDrivers.mockResolvedValue([]);
    getPendingDrivers.mockResolvedValue([]);
    getShipmentCheckpoints.mockRejectedValueOnce(new Error("Routing service unavailable"))
      .mockResolvedValueOnce([{ name: "Hyderabad", coordinates: { lat: 17.385, lng: 78.4867 } }]);
    render(<MemoryRouter><Operations /></MemoryRouter>);

    expect(await screen.findByText("Routing service unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("option", { name: /Hyderabad/ })).toBeInTheDocument();
    expect(screen.queryByText("Routing service unavailable")).not.toBeInTheDocument();
  });

  it("lists only drivers that the server reports as eligible at the pickup", async () => {
    getShipments.mockResolvedValue([{ id: "record-2", trackingNumber: "LTS-DRIVERS", origin: "Bangalore", destination: "Hyderabad", currentStatus: "ORDER_CREATED", status: "Pending", currentLocation: { city: "Bangalore" } }]);
    getAvailableDrivers.mockResolvedValue([{ id: "good", name: "Asha", eligible: true, distanceKm: 2, currentLocation: { city: "Bangalore" } }]);
    getPendingDrivers.mockResolvedValue([]); getShipmentCheckpoints.mockResolvedValue([{ name: "Bangalore", coordinates: { lat: 12.97, lng: 77.59 } }]);
    render(<MemoryRouter><Operations /></MemoryRouter>);
    const eligible = await screen.findByRole("option", { name: /Asha/ });
    expect(eligible).not.toBeDisabled();
    expect(screen.queryByRole("option", { name: /Ravi/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/No drivers available/)).not.toBeInTheDocument();
  });

  it("explains when no approved drivers are eligible", async () => {
    getShipments.mockResolvedValue([{ id: "record-3", trackingNumber: "LTS-NONE", origin: "Bangalore", destination: "Hyderabad", currentStatus: "ORDER_CREATED", currentLocation: { city: "Bangalore" } }]);
    getAvailableDrivers.mockResolvedValue([]);
    getPendingDrivers.mockResolvedValue([]); getShipmentCheckpoints.mockResolvedValue([{ name: "Bangalore", coordinates: { lat: 12.97, lng: 77.59 } }]);
    render(<MemoryRouter><Operations /></MemoryRouter>);
    expect(await screen.findByRole("option", { name: "No drivers available at Bangalore" })).toBeInTheDocument();
    expect(screen.getByLabelText("Driver")).toBeDisabled();
  });

  it("renders an existing driver assignment without crashing", async () => {
    getShipments.mockResolvedValue([{ id: "record-assigned", trackingNumber: "LTS-ASSIGNED", origin: "Bangalore", destination: "Hyderabad", currentStatus: "IN_TRANSIT", currentLocation: { city: "Bangalore" }, assignedDriver: { id: "driver-1", name: "Asha" } }]);
    getAvailableDrivers.mockResolvedValue([{ id: "driver-1", name: "Asha", eligible: true }]);
    getPendingDrivers.mockResolvedValue([]);
    getShipmentCheckpoints.mockResolvedValue([{ name: "Bangalore", coordinates: { lat: 12.97, lng: 77.59 } }]);
    render(<MemoryRouter><Operations /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "LTS-ASSIGNED" })).toBeInTheDocument();
  });

  it("keeps delivered shipments in read-only Operations history", async () => {
    getShipments.mockResolvedValue([{ id: "record-done", trackingNumber: "LTS-DONE", origin: "Bangalore", destination: "Pune", currentStatus: "DELIVERED", deliveredAt: "2026-10-30T10:00:00.000Z" }]);
    getAvailableDrivers.mockResolvedValue([]);
    getPendingDrivers.mockResolvedValue([]);
    getShipmentCheckpoints.mockResolvedValue([]);
    render(<MemoryRouter><Operations /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("tab", { name: /History/ }));
    expect(await screen.findByRole("heading", { name: "LTS-DONE" })).toBeInTheDocument();
    expect(screen.getByText(/Delivered:/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
  });
});
