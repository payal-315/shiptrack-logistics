import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, API_ENDPOINTS, clearShipmentSession } from "../../api";
import AuthLayout from "../../components/AuthLayout";
import ValidatedField from "../../components/ValidatedField";
import { serverFieldError, useFormValidation, validators } from "../../utils/formValidation";

function Signup() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const validation = useFormValidation(values, { name: validators.name, email: validators.email, password: validators.password, confirmPassword: validators.confirmPassword });
  const change = (name, value) => { const next = { ...values, [name]: value }; setValues(next); validation.changeField(name, value, next); if (name === "password" && values.confirmPassword) validation.changeField("confirmPassword", values.confirmPassword, next); setError(""); };
  const submit = async (event) => {
    event.preventDefault(); setError("");
    if (!validation.validateAll()) return;
    setLoading(true);
    try {
      const response = await apiClient.post(API_ENDPOINTS.AUTH.REGISTER, { name: values.name.trim(), email: values.email.trim(), password: values.password }, { auth: false });
      clearShipmentSession(); localStorage.setItem("authToken", response.data.token); localStorage.setItem("userRole", "customer");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message || "Signup failed.");
      validation.setServerErrors(serverFieldError(err.message, { email: ["email"], name: ["name"] }));
    } finally { setLoading(false); }
  };
  const field = (name, label, type, placeholder, autoComplete) => <ValidatedField id={name} key={name} name={name} label={label} type={type} placeholder={placeholder} hint={name === "password" ? "At least 8 characters, one letter and one number" : undefined} autoComplete={autoComplete} value={values[name]} disabled={loading} error={validation.errors[name]} onChange={(event) => change(name, event.target.value)} onBlur={validation.blurField} />;
  return <AuthLayout title="Create Account" subtitle="Customer Signup">
    {error && <p className="error-message" role="alert">{error}</p>}
    <form className="auth-form" noValidate onSubmit={submit}>
      {field("name", "Full name", "text", "John Doe", "name")}
      {field("email", "Email", "email", "name@example.test, "email")}
      {field("password", "Password", "password", "Example@123", "new-password")}
      {field("confirmPassword", "Confirm password", "password", "Example@123", "new-password")}
      <button type="submit" className="login-button" disabled={loading}>{loading ? "Creating account…" : "Create Account"}</button>
    </form>
  </AuthLayout>;
}
export default Signup;
