import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { clearShipmentSession } from "../api";

function Navbar() {
  const role = localStorage.getItem("userRole")?.toLowerCase();
  const location = useLocation();
  const [drawer, setDrawer] = useState({ open: false, path: location.pathname });
  const open = drawer.open && drawer.path === location.pathname;
  const drawerRef = useRef(null);
  const buttonRef = useRef(null);
  const navigate = useNavigate();
  const authenticated = Boolean(localStorage.getItem("authToken") && role);
  const close = useCallback(() => setDrawer({ open: false, path: location.pathname }), [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector("a,button")?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { close(); buttonRef.current?.focus(); }
      if (event.key === "Tab" && drawerRef.current) {
        const items = [...drawerRef.current.querySelectorAll("a,button")];
        if (!items.length) return;
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = prior; document.removeEventListener("keydown", onKeyDown); };
  }, [open, close]);

  const logout = () => {
    clearShipmentSession(); localStorage.removeItem("authToken"); localStorage.removeItem("userRole"); localStorage.removeItem("driverApprovalStatus");
    close(); navigate(role === "driver" ? "/driver-login" : role === "operations" ? "/operations-login" : "/", { replace: true });
  };
  const links = authenticated ? role === "customer"
    ? [["Dashboard", "/dashboard"], ["Shipments", "/shipments"], ["Create shipment", "/create-shipment"], ["History", "/history"], ["Profile", "/profile"], ["Track Shipment", "/track"]]
    : role === "driver" ? [["Driver dashboard", "/driver"], ["Track Shipment", "/track"]]
      : [["Operations dashboard", "/operations"], ["Drivers", "/operations/drivers"], ["Track Shipment", "/track"]]
    : [["Track Shipment", "/track"], ["Customer Login", "/"], ["Driver Login", "/driver-login"], ["Operations Login", "/operations-login"]];
  const home = !authenticated ? "/" : role === "customer" ? "/dashboard" : role === "driver" ? "/driver" : "/operations";
  return <>
    <header className="site-navbar">
      <Link className="site-brand" to={home} onClick={close}>🚚 ShipTrack</Link>
      <nav className="site-nav-links" aria-label="Main navigation">
        {links.map(([label, path]) => <NavLink key={path} to={path} end={path === "/"} className={({ isActive }) => isActive ? "active" : ""}>{label}</NavLink>)}
        {authenticated && <button type="button" className="site-nav-logout" onClick={logout}>Logout</button>}
      </nav>
      <button ref={buttonRef} className="site-menu-button" type="button" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} aria-controls="site-mobile-drawer" onClick={() => setDrawer({ open: !open, path: location.pathname })}><span/><span/><span/></button>
    </header>
    {open && <div className="site-nav-overlay" aria-hidden="true" onClick={close}/>}
    <aside id="site-mobile-drawer" ref={drawerRef} className={`site-mobile-drawer ${open ? "open" : ""}`} aria-label="Mobile navigation" aria-hidden={!open}>
      <div className="site-drawer-heading"><strong>ShipTrack</strong><button type="button" aria-label="Close navigation menu" onClick={() => { close(); buttonRef.current?.focus(); }}>×</button></div>
      {links.map(([label, path]) => <NavLink key={path} to={path} end={path === "/"} onClick={close} className={({ isActive }) => isActive ? "active" : ""}>{label}</NavLink>)}
      {authenticated && <button type="button" className="site-nav-logout" onClick={logout}>Logout</button>}
    </aside>
  </>;
}
export default Navbar;
