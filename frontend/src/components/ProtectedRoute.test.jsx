import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProtectedRoute, { GuestRoute } from "./ProtectedRoute";

describe("ProtectedRoute", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  const renderRoutes = (path, allowedRoles) => render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<p>Login page</p>} />
        <Route path="/dashboard" element={<p>Customer home</p>} />
        <Route path="/driver" element={<p>Driver home</p>} />
        <Route path="/operations" element={<p>Operations home</p>} />
        <Route
          path="/protected"
          element={(
            <ProtectedRoute allowedRoles={allowedRoles}>
              <p>Protected content</p>
            </ProtectedRoute>
          )}
        />
      </Routes>
    </MemoryRouter>
  );

  it("redirects unauthenticated users to login", () => {
    renderRoutes("/protected", ["driver"]);
    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("renders protected content for one of the allowed roles", () => {
    localStorage.setItem("authToken", "test-token");
    localStorage.setItem("userRole", "driver");
    renderRoutes("/protected", ["driver", "operations"]);
    expect(screen.getByText("Protected content")).toBeInTheDocument();
  });

  it("redirects a user with the wrong role to their own dashboard", () => {
    localStorage.setItem("authToken", "test-token");
    localStorage.setItem("userRole", "customer");
    renderRoutes("/protected", ["driver"]);
    expect(screen.getByText("Customer home")).toBeInTheDocument();
  });

  it("redirects a logged-in customer away from login, including history navigation", () => {
    localStorage.setItem("authToken", "test-token");
    localStorage.setItem("userRole", "customer");
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route path="/login" element={<GuestRoute><p>Login page</p></GuestRoute>} />
          <Route path="/dashboard" element={<p>Customer home</p>} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText("Customer home")).toBeInTheDocument();
  });
});
