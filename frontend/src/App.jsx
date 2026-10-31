import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import AppLayout from "./components/AppLayout";
import ProtectedRoute, { GuestRoute } from "./components/ProtectedRoute";
import OperationsLogin from "./pages/auth/OperationsLogin";
import DriverDashboard from "./pages/driver/DriverDashboard";
import DriverLogin from "./pages/driver/DriverLogin";
import DriverLayout from "./components/DriverLayout";
import Operations from "./pages/ops/Operations";
import CreateShipment from "./pages/customer/CreateShipment";
import Dashboard from "./pages/customer/Dashboard";
import History from "./pages/customer/History";
import Login from "./pages/customer/Login";
import Profile from "./pages/customer/Profile";
import Shipments from "./pages/customer/Shipments";
import Signup from "./pages/customer/Signup";
import TrackShipment from "./pages/customer/TrackShipment";
import Navbar from "./components/Navbar";
import DriverSignup from "./pages/driver/DriverSignup";
import ForgotPassword from "./pages/auth/ForgotPassword";
import Drivers from "./pages/ops/Drivers";
import ShipmentDetail from "./pages/customer/ShipmentDetail";
import ErrorBoundary from "./components/ErrorBoundary";

function App() {
  return (
    <BrowserRouter>
      <SessionGuards />
      <Navbar />
      <Routes>
        <Route path="/" element={<GuestRoute><Login /></GuestRoute>} />
        <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
        <Route path="/operations-login" element={<GuestRoute><OperationsLogin /></GuestRoute>} />
        <Route path="/driver-login" element={<GuestRoute><DriverLogin /></GuestRoute>} />
        <Route path="/driver-signup" element={<GuestRoute><DriverSignup /></GuestRoute>} />
        <Route path="/forgot-password" element={<GuestRoute><ForgotPassword role="customer" /></GuestRoute>} />
        <Route path="/driver-forgot-password" element={<GuestRoute><ForgotPassword role="driver" /></GuestRoute>} />
        <Route path="/track" element={<TrackShipment />} />
        <Route path="/track/:trackingNumber" element={<TrackShipment />} />

        <Route element={(
          <ProtectedRoute allowedRoles={["customer"]}>
            <AppLayout />
          </ProtectedRoute>
        )}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/shipments" element={<Shipments />} />
          <Route path="/shipments/:id" element={<ShipmentDetail />} />
          <Route path="/create-shipment" element={<CreateShipment />} />
          <Route path="/history" element={<History />} />
          <Route path="/profile" element={<Profile />} />
        </Route>

        <Route element={(
          <ProtectedRoute allowedRoles={["driver"]} loginPath="/driver-login">
            <DriverLayout />
          </ProtectedRoute>
        )}>
          <Route path="/driver" element={<DriverDashboard />} />
        </Route>

        <Route element={(
          <ProtectedRoute allowedRoles={["operations"]} loginPath="/operations-login">
            <AppLayout />
          </ProtectedRoute>
        )}>
          <Route path="/operations" element={<ErrorBoundary><Operations /></ErrorBoundary>} />
          <Route path="/operations/drivers" element={<Drivers />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

const homeByRole = { customer: "/dashboard", driver: "/driver", operations: "/operations" };
const loginByRole = { customer: "/", driver: "/driver-login", operations: "/operations-login" };
const authPaths = new Set(["/", "/signup", "/driver-login", "/driver-signup", "/operations-login", "/forgot-password", "/driver-forgot-password"]);
function SessionGuards() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const redirect = (role) => navigate(loginByRole[role] || "/", { replace: true });
    const onExpired = (event) => redirect(event.detail?.role);
    const onRestore = () => {
      const role = localStorage.getItem("userRole")?.toLowerCase();
      const token = localStorage.getItem("authToken");
      if (token && role && authPaths.has(window.location.pathname)) navigate(homeByRole[role], { replace: true });
      else if (!token && (["/dashboard", "/create-shipment", "/history", "/profile", "/driver", "/operations", "/operations/drivers"].includes(window.location.pathname) || window.location.pathname.startsWith("/shipments"))) redirect(role);
    };
    const onPopState = () => {
      const role = localStorage.getItem("userRole")?.toLowerCase();
      if (!localStorage.getItem("authToken") || !role) return;
      const home = homeByRole[role];
      const protectedPaths = ["/dashboard", "/create-shipment", "/history", "/profile", "/driver", "/operations", "/operations/drivers"];
      if (window.location.pathname === home) window.history.pushState({ shiptrackDashboardGuard: true }, "", window.location.href);
      else if (protectedPaths.includes(window.location.pathname) || window.location.pathname.startsWith("/shipments")) navigate(home, { replace: true });
    };
    window.addEventListener("shiptrack:auth-expired", onExpired);
    window.addEventListener("pageshow", onRestore);
    window.addEventListener("popstate", onPopState);
    onRestore();
    const role = localStorage.getItem("userRole")?.toLowerCase();
    if (localStorage.getItem("authToken") && role && window.location.pathname === homeByRole[role] && !window.history.state?.shiptrackDashboardGuard) window.history.pushState({ shiptrackDashboardGuard: true }, "", window.location.href);
    return () => {
      window.removeEventListener("shiptrack:auth-expired", onExpired);
      window.removeEventListener("pageshow", onRestore);
      window.removeEventListener("popstate", onPopState);
    };
  }, [navigate, location.pathname]);
  return null;
}

export default App;
