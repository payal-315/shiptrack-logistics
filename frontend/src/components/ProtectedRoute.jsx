import { Navigate } from "react-router-dom";

const homeByRole = {
  customer: "/dashboard",
  driver: "/driver",
  operations: "/operations"
};

function ProtectedRoute({ children, allowedRole, allowedRoles, loginPath = "/" }) {
  const role = localStorage.getItem("userRole")?.toLowerCase();
  const roles = allowedRoles || (allowedRole ? [allowedRole] : []);

  if (!role || !localStorage.getItem("authToken")) {
    return <Navigate to={loginPath} replace />;
  }

  if (!roles.includes(role)) {
    return <Navigate to={homeByRole[role] || "/"} replace />;
  }

  return children;
}

export default ProtectedRoute;

export function GuestRoute({ children }) {
  const role = localStorage.getItem("userRole")?.toLowerCase();
  if (localStorage.getItem("authToken") && role && homeByRole[role]) return <Navigate to={homeByRole[role]} replace />;
  return children;
}
