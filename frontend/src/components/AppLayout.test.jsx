import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AppLayout from "./AppLayout";
import Navbar from "./Navbar";

describe("account session changes", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("clears shipment state and authentication on logout", () => {
    localStorage.setItem("authToken", "customer-a-token");
    localStorage.setItem("userRole", "customer");
    localStorage.setItem("shipmentCache", "customer-a-shipments");
    sessionStorage.setItem("lastShipment", "LTS-A");

    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Navbar />
        <Routes>
          <Route path="/" element={<p>Signed out</p>} />
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<p>Customer dashboard</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    expect(screen.getByText("Signed out")).toBeInTheDocument();
    expect(localStorage.getItem("authToken")).toBeNull();
    expect(localStorage.getItem("userRole")).toBeNull();
    expect(localStorage.getItem("shipmentCache")).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("shows visitor navigation and opens and closes the mobile drawer", () => {
    render(<MemoryRouter><Navbar /></MemoryRouter>);
    expect(screen.getAllByRole("link", { name: "Customer Login" })).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Driver Login" })).toHaveLength(1);
    const openButton = screen.getByRole("button", { name: "Open navigation menu" });
    fireEvent.click(openButton);
    expect(openButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("complementary", { name: "Mobile navigation" })).toHaveAttribute("aria-hidden", "false");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(openButton).toHaveAttribute("aria-expanded", "false");
  });

  it("shows only links for the signed-in role", () => {
    localStorage.setItem("authToken", "driver-token");
    localStorage.setItem("userRole", "driver");
    render(<MemoryRouter><Navbar /></MemoryRouter>);
    expect(screen.getAllByRole("link", { name: "Driver dashboard" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Customer Login" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Operations Login" })).not.toBeInTheDocument();
  });
});
