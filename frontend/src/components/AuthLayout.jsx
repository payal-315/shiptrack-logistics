function AuthLayout({ title, subtitle, children }) {
  return <section className="auth-page"><div className="auth-card">
    <div className="login-header"><h1>🚚 ShipTrack</h1><p>{subtitle || "Logistics Shipment Tracking System"}</p></div>
    <h2 className="auth-title">{title}</h2>{children}
  </div></section>;
}
export default AuthLayout;
