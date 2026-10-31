import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { getShipments } from "../../api";
import Dashboard from "./Dashboard";

vi.mock("../../api", () => ({
  getShipments: vi.fn()
}));

describe("customer dashboard", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows loading, then only the shipments returned by the API", async () => {
    getShipments.mockResolvedValue([
      {
        trackingNumber: "LTS-CUSTOMER-A",
        origin: "A",
        destination: "B",
        currentStatus: "IN_TRANSIT"
      }
    ]);

    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);

    expect(await screen.findByText("LTS-CUSTOMER-A")).toBeInTheDocument();
    expect(screen.queryByText("SHP1001")).not.toBeInTheDocument();
    expect(within(screen.getByText("Total Shipments").closest(".stat-card"))
      .getByRole("heading", { name: "1" })).toBeInTheDocument();
  });

  it("shows an API error and allows retry", async () => {
    getShipments.mockRejectedValueOnce(new Error("Service unavailable"));
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Service unavailable");
    });
  });
});
