import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_ENDPOINTS, apiClient } from "../../api";
import AuthLayout from "../../components/AuthLayout";
import ValidatedField from "../../components/ValidatedField";
import { serverFieldError, useFormValidation, validators } from "../../utils/formValidation";

const initial = { name: "", email: "", phone: "", password: "", confirmPassword: "", licenseNumber: "", vehicleNumber: "", vehicleType: "", baseCity: "" };
const rules = { name: validators.name, email: validators.email, phone: validators.phone, password: validators.password, confirmPassword: validators.confirmPassword, licenseNumber: validators.licenseNumber, vehicleNumber: validators.vehicleNumber, vehicleType: validators.vehicleType, baseCity: validators.requiredText };
function DriverSignup() {
  const navigate = useNavigate(); const [form, setForm] = useState(initial); const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(false);
  const validation = useFormValidation(form, rules);
  const change = (name, value) => { const next = { ...form, [name]: value }; setForm(next); validation.changeField(name, value, next); if (name === "password" && form.confirmPassword) validation.changeField("confirmPassword", form.confirmPassword, next); };
  const submit = async (event) => { event.preventDefault(); setError(""); setMessage(""); if (!validation.validateAll()) return; setLoading(true); try { const payload = { ...form }; delete payload.confirmPassword; const result = await apiClient.post(API_ENDPOINTS.DRIVERS.SIGNUP, payload, { auth: false }); setMessage(result.message); setTimeout(() => navigate("/driver-login", { replace: true }), 1400); } catch (err) { setError(err.message); validation.setServerErrors(serverFieldError(err.message, { email: ["email"], phone: ["phone"], licenseNumber: ["license"], vehicleNumber: ["vehicle"] })); } finally { setLoading(false); } };
  const fields = [["name", "Full name", "text", "John Doe"], ["email", "Email", "email", "name@example.test], ["phone", "Phone", "tel", "9876543210"], ["licenseNumber", "License number", "text", "KA0120200012345"], ["vehicleNumber", "Vehicle number", "text", "KA01AB1234"], ["vehicleType", "Vehicle type", "text", "Truck"], ["baseCity", "Base city", "text", "Bangalore"], ["password", "Password", "password", "Example@123"], ["confirmPassword", "Confirm password", "password", "Example@123"]];
  return <AuthLayout title="Driver Sign Up" subtitle="Join the ShipTrack driver network">{error && <p className="error-message" role="alert">{error}</p>}{message && <p className="page-message" role="status">{message}</p>}<form className="auth-form" noValidate onSubmit={submit}>{fields.map(([name, label, type, placeholder]) => <ValidatedField key={name} id={name} name={name} label={label} type={type} placeholder={placeholder} hint={name === "password" ? "At least 8 characters, one letter and one number" : undefined} value={form[name]} disabled={loading} error={validation.errors[name]} onChange={(event) => change(name, event.target.value)} onBlur={validation.blurField} autoComplete={name.toLowerCase().includes("password") ? "new-password" : name === "email" ? "email" : name} />)}<button className="login-button" disabled={loading}>{loading ? "Submitting…" : "Submit application"}</button></form><p className="auth-footer">Already registered? <Link to="/driver-login">Driver login</Link></p></AuthLayout>;
}
export default DriverSignup;
