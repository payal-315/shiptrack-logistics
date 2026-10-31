import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiClient, API_ENDPOINTS, clearShipmentSession } from "../../api";
import AuthLayout from "../../components/AuthLayout";
import ValidatedField from "../../components/ValidatedField";
import { serverFieldError, useFormValidation, validators } from "../../utils/formValidation";

function Login() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const validation = useFormValidation(values, { email: validators.email, password: validators.requiredPassword });

  const change = (name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
    validation.changeField(name, value);
    setError("");
  };
  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    if (!validation.validateAll()) return;
    setLoading(true);
    try {
      const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, values, { auth: false });
      if (response.success && response.data?.token) {
        clearShipmentSession();
        const role = String(response.data.user.role).toLowerCase();
        localStorage.setItem("authToken", response.data.token);
        localStorage.setItem("userRole", role);
        if (role === "driver") localStorage.setItem("driverApprovalStatus", response.data.user.approvalStatus || "PENDING");
        navigate(role === "operations" ? "/operations" : role === "driver" ? "/driver" : "/dashboard", { replace: true });
      } else setError(response.message || "Login failed");
    } catch (err) {
      setError(err.message || "Login failed. Please try again.");
      validation.setServerErrors(serverFieldError(err.message, { email: ["email"], password: ["password", "invalid email or password"] }));
    } finally { setLoading(false); }
  }

  return <AuthLayout title="Welcome Back" subtitle="Customer Login">
    {error && <div className="error-message" role="alert">{error}</div>}
    <form className="auth-form" noValidate onSubmit={handleLogin}>
      <ValidatedField id="login-email" name="email" label="Email" type="email" autoComplete="username" value={values.email} placeholder="name@example.test disabled={loading} error={validation.errors.email} onChange={(event) => change("email", event.target.value)} onBlur={validation.blurField} />
      <ValidatedField id="login-password" name="password" label="Password" type="password" autoComplete="current-password" value={values.password} placeholder="Example@123" hint="At least 8 characters, one letter and one number" disabled={loading} error={validation.errors.password} onChange={(event) => change("password", event.target.value)} onBlur={validation.blurField} />
      <p className="forgot-link"><Link to="/forgot-password">Forgot password?</Link></p>
      <button type="submit" className="login-button" disabled={loading}>{loading ? "Logging in…" : "Login"}</button>
    </form>
    <p className="auth-footer">Don’t have an account? <Link to="/signup">Sign up</Link></p>
  </AuthLayout>;
}
export default Login;
