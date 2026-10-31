import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { getShipments } from "../../api";
import Shipments from "./Shipments";

vi.mock("../../api", () => ({
  getShipments: vi.fn()
}));

describe("customer shipments page", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows loading followed by API shipments", async () => {
    getShipments.mockResolvedValue([{
      trackingNumber: "LTS-TEST-100",
      destination: "Portland",
      currentStatus: "IN_TRANSIT"
    }]);

    render(<MemoryRouter><Shipments /></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    expect(await screen.findByText("LTS-TEST-100")).toBeInTheDocument();
    expect(screen.getByText("Portland")).toBeInTheDocument();
  });

  it("shows an empty state when there are no shipments", async () => {
    getShipments.mockResolvedValue([]);
    render(<MemoryRouter><Shipments /></MemoryRouter>);

    expect(await screen.findByText("No shipments yet.")).toBeInTheDocument();
  });

  it("shows an API error and retry action", async () => {
    getShipments.mockRejectedValueOnce(new Error("Unable to load shipments"));
    render(<MemoryRouter><Shipments /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Unable to load shipments");
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
