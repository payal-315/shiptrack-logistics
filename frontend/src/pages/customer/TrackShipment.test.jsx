import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { getPublicTracking } from "../../api";
import TrackShipment from "./TrackShipment";

vi.mock("../../api", () => ({
  getPublicTracking: vi.fn()
}));

vi.mock("../../components/ShipmentMap", () => ({
  default: () => <div data-testid="shipment-map" />
}));

describe("public shipment tracking", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const renderTracking = () => render(
    <MemoryRouter initialEntries={["/track/LTS123"]}>
      <Routes>
        <Route path="/track/:trackingNumber" element={<TrackShipment />} />
      </Routes>
    </MemoryRouter>
  );

  it("shows safe tracking details when the shipment is found", async () => {
    getPublicTracking.mockResolvedValue({
      trackingNumber: "LTS123",
      status: "IN_TRANSIT",
      origin: "Origin",
      destination: "Destination",
      originCoordinates: null,
      destinationCoordinates: null,
      currentLocationCoordinates: null,
      customerName: "Private Customer",
      phone: "Private Phone",
      email: "private@example.test",
      driverPhone: "Private Driver Phone",
      customer: "internal-customer-id",
      events: []
    });

    renderTracking();
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(await screen.findByRole("heading", { name: "LTS123" })).toBeInTheDocument();
    expect(screen.getByText("Origin")).toBeInTheDocument();
    expect(screen.getByText("Destination")).toBeInTheDocument();
    expect(screen.getByTestId("shipment-map")).toBeInTheDocument();
    expect(screen.queryByText(/Private Customer|Private Phone|private@example\.test|Private Driver Phone|internal-customer-id/))
      .not.toBeInTheDocument();
  });

  it("shows a friendly message when the tracking number is unknown", async () => {
    getPublicTracking.mockRejectedValue(new Error("Tracking information not found"));
    renderTracking();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't find a shipment with that tracking number."
    );
  });

  it("shows a friendly network error", async () => {
    getPublicTracking.mockRejectedValue(new Error("Network unavailable"));
    renderTracking();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network unavailable");
    });
  });

  it("polls and shows a new location event without navigating or refreshing", async () => {
    getPublicTracking
      .mockResolvedValueOnce({
        trackingNumber: "LTS123", status: "IN_TRANSIT", origin: "Origin", destination: "Destination", events: []
      })
      .mockResolvedValueOnce({
        trackingNumber: "LTS123", status: "IN_TRANSIT", origin: "Origin", destination: "Destination",
        events: [{ status: "IN_TRANSIT", timestamp: "2026-01-01T00:00:00.000Z", locationCoordinates: { lat: 12.5, lng: 22.5 } }]
      });
    const intervalCallbacks = [];
    vi.spyOn(window, "setInterval").mockImplementation((callback) => {
      intervalCallbacks.push(callback);
      return 1;
    });
    vi.spyOn(window, "clearInterval").mockImplementation(() => {});
    renderTracking();
    expect(await screen.findByRole("heading", { name: "LTS123" })).toBeInTheDocument();

    await act(async () => {
      intervalCallbacks[0]();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText("12.5, 22.5")).toBeInTheDocument();
    expect(getPublicTracking).toHaveBeenCalledTimes(2);
  });

  it("shows a friendly rate-limit message", async () => {
    const error = new Error("Too many tracking requests");
    error.status = 429;
    getPublicTracking.mockRejectedValue(error);
    renderTracking();
    expect(await screen.findByRole("alert")).toHaveTextContent(/wait a minute/i);
  });
});
