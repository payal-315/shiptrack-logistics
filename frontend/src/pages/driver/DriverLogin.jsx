import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_ENDPOINTS, apiClient, clearShipmentSession } from "../../api";
import AuthLayout from "../../components/AuthLayout";
import ValidatedField from "../../components/ValidatedField";
import { useFormValidation, validators } from "../../utils/formValidation";

function DriverLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const values = { email, password };
  const validation = useFormValidation(values, { email: validators.email, password: validators.requiredPassword });
  const change = (name, value) => { if (name === "email") setEmail(value); else setPassword(value); validation.changeField(name, value); };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!validation.validateAll()) return;
    setLoading(true);
    try {
      const response = await apiClient.post(API_ENDPOINTS.AUTH.LOGIN, { email, password }, { auth: false });
      if (String(response.data?.user?.role).toLowerCase() !== "driver") {
        setError("This account does not have driver access.");
        return;
      }
      clearShipmentSession();
      localStorage.setItem("authToken", response.data.token);
      localStorage.setItem("userRole", "driver");
      localStorage.setItem("driverApprovalStatus", response.data.user.approvalStatus || "PENDING");
      navigate("/driver", { replace: true });
    } catch (loginError) {
      setError(loginError.message || "Unable to log in.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <AuthLayout title="Driver Login" subtitle="Driver portal">
      {error && <p role="alert" className="error-message">{error}</p>}
      <form className="auth-form" noValidate onSubmit={submit}>
        <ValidatedField id="driver-email" name="email" label="Email" type="email" autoComplete="username" placeholder="name@example.test value={email} onChange={(event) => change("email", event.target.value)} onBlur={validation.blurField} error={validation.errors.email} />
        <ValidatedField id="driver-password" name="password" label="Password" type="password" autoComplete="current-password" placeholder="Example@123" hint="At least 8 characters, one letter and one number" value={password} onChange={(event) => change("password", event.target.value)} onBlur={validation.blurField} error={validation.errors.password} />
        <button className="login-button" type="submit" disabled={loading}>{loading ? "Logging in…" : "Login"}</button>
      </form>
      <div className="auth-footer"><Link to="/driver-forgot-password">Forgot password?</Link> · <Link to="/driver-signup">Driver Sign Up</Link></div>
      <button className="text-button" type="button" onClick={() => navigate("/")}>← Back</button>
    </AuthLayout>
  );
}

export default DriverLogin;
