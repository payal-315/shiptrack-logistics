import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, API_ENDPOINTS, clearShipmentSession } from "../../api";
import AuthLayout from "../../components/AuthLayout";
import ValidatedField from "../../components/ValidatedField";
import { useFormValidation, validators } from "../../utils/formValidation";

function OperationsLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  const values = { email, password }; const validation = useFormValidation(values, { email: validators.email, password: validators.requiredPassword });
  async function handleLogin(event) {
    event.preventDefault(); setError(""); if (!validation.validateAll()) return; setLoading(true);
    try {
      const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, { email, password });
      if (response.success && String(response.data.user.role).toLowerCase() === "operations") {
        clearShipmentSession(); localStorage.setItem("authToken", response.data.token); localStorage.setItem("userRole", "operations"); navigate("/operations", { replace: true });
      } else setError(response.success ? "You don't have operations access" : response.message || "Login failed");
    } catch (err) { setError(err.message || "Unable to log in to operations."); }
    finally { setLoading(false); }
  }
  return <AuthLayout title="Operations Login" subtitle="Manage ShipTrack shipments and drivers">
    {error && <p className="error-message" role="alert">{error}</p>}
    <form className="auth-form" noValidate onSubmit={handleLogin}>
      <ValidatedField id="ops-email" name="email" label="Email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); validation.changeField("email", event.target.value); }} onBlur={validation.blurField} error={validation.errors.email} placeholder="name@example.test disabled={loading} autoComplete="username" />
      <ValidatedField id="ops-password" name="password" label="Password" type="password" value={password} onChange={(event) => { setPassword(event.target.value); validation.changeField("password", event.target.value); }} onBlur={validation.blurField} error={validation.errors.password} placeholder="Enter your password" disabled={loading} autoComplete="current-password" />
      <button className="login-button" type="submit" disabled={loading}>{loading ? "Logging in…" : "Login to Operations"}</button>
    </form>
    <p className="auth-footer">Operations accounts are created by an administrator.</p>
    <button className="text-button" type="button" onClick={() => navigate("/")}>← Back</button>
  </AuthLayout>;
}
export default OperationsLogin;
