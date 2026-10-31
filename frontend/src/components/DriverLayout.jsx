import { Outlet } from "react-router-dom";

function DriverLayout() {
  return (
    <div className="app-shell">
      <main><Outlet /></main>
    </div>
  );
}

export default DriverLayout;
