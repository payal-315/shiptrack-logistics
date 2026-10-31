import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { apiClient, clearShipmentSession } from "../../api";
import Login from "./Login";

vi.mock("../../api", () => ({
  apiClient: {
    post: vi.fn()
  },
  clearShipmentSession: vi.fn(),
  API_ENDPOINTS: {
    AUTH: {
      LOGIN: "/auth/login"
    }
  }
}));

describe("customer login", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
  });

  const renderLogin = () => render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<p>Customer dashboard</p>} />
      </Routes>
    </MemoryRouter>
  );

  it("shows validation for empty credentials without calling the API", async () => {
    renderLogin();
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    expect(await screen.findByText("Enter a valid email, e.g. name@example.test")).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  it("keeps login to email and password and removes duplicate tracking and operations links", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: "Login" }).closest("form")).toHaveClass("auth-form");
    expect(screen.queryByText("Sign in with email code")).not.toBeInTheDocument();
    expect(screen.queryByText("Track a shipment without signing in")).not.toBeInTheDocument();
    expect(screen.queryByText("Operations Login →")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Forgot password?" })).toBeInTheDocument();
  });

  it("stores the token and navigates after a successful login", async () => {
    apiClient.post.mockResolvedValue({
      success: true,
      data: {
        token: "customer-token",
        user: { role: "customer" }
      }
    });
    renderLogin();

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "customer@example.com" }
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() => {
      expect(screen.getByText("Customer dashboard")).toBeInTheDocument();
    });
    expect(apiClient.post).toHaveBeenCalledWith("/auth/login", {
      email: "customer@example.com",
      password: "password123"
    }, { auth: false });
    expect(localStorage.getItem("authToken")).toBe("customer-token");
    expect(localStorage.getItem("userRole")).toBe("customer");
    expect(clearShipmentSession).toHaveBeenCalled();
  });
});
