import { useEffect, useState } from "react";
import { apiClient, API_ENDPOINTS } from "../../api";
import ValidatedField from "../../components/ValidatedField";
import LoadingSpinner from "../../components/LoadingSpinner";
import { serverFieldError, useFormValidation, validators } from "../../utils/formValidation";

const initial = { name: "", email: "", phone: "", defaultAddress: "", currentPassword: "", newPassword: "", confirmPassword: "" };
function Profile() {
  const [values, setValues] = useState(initial), [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const validation = useFormValidation(values, {
    name: validators.name, phone: validators.phone,
    currentPassword: (v) => v ? "" : "Enter your current password.",
    newPassword: validators.password, confirmPassword: validators.confirmPassword
  });
  useEffect(() => {
    let active = true;
    apiClient.get(API_ENDPOINTS.AUTH.ME).then((response) => { if (active) setValues((current) => ({ ...current, ...response.data })); })
      .catch((err) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const change = (name, value) => { const next = { ...values, [name]: value }; setValues(next); validation.changeField(name, value, next); setError(""); };
  const saveProfile = async (event) => {
    event.preventDefault(); setError(""); setMessage("");
    if (!validation.validateFields(["name", "phone"])) return;
    setSaving(true);
    try {
      const response = await apiClient.put(API_ENDPOINTS.AUTH.PROFILE, { name: values.name, phone: values.phone, defaultAddress: values.defaultAddress });
      setValues((current) => ({ ...current, ...response.data }));
      setMessage("Profile updated.");
    } catch (err) { setError(err.message); validation.setServerErrors(serverFieldError(err.message, { name: ["name"], phone: ["phone"], defaultAddress: ["address"] })); }
    finally { setSaving(false); }
  };
  const changePassword = async (event) => {
    event.preventDefault(); setError(""); setMessage("");
    if (!validation.validateFields(["currentPassword", "newPassword", "confirmPassword"])) return;
    setSaving(true);
    try {
      const response = await apiClient.post(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, { currentPassword: values.currentPassword, newPassword: values.newPassword });
      localStorage.setItem("authToken", response.data.token);
      setValues((current) => ({ ...current, currentPassword: "", newPassword: "", confirmPassword: "" }));
      validation.clearErrors();
      setMessage("Password changed. Your current session remains active.");
    } catch (err) { setError(err.message); validation.setServerErrors(serverFieldError(err.message, { currentPassword: ["current password"], newPassword: ["new password"] })); }
    finally { setSaving(false); }
  };
  const field = (name, label, placeholder, type = "text") => <ValidatedField id={name} key={name} name={name} label={label} type={type} value={values[name] || ""} placeholder={placeholder} hint={name === "newPassword" ? "At least 8 characters, one letter and one number" : undefined} disabled={saving} error={validation.errors[name]} onChange={(event) => change(name, event.target.value)} onBlur={validation.blurField} />;
  if (loading) return <div className="profile-page"><LoadingSpinner label="Loading profile…" /></div>;
  return <div className="profile-page"><header><span className="page-eyebrow">ACCOUNT</span><h1>My Profile</h1><p>Update your personal details and password.</p></header>
    {error && <p role="alert" className="error-message">{error}</p>}{message && <p role="status" className="page-message">{message}</p>}
    <section className="profile-card"><h2>Personal details</h2><form className="auth-form" noValidate onSubmit={saveProfile}>
      {field("name", "Name", "John Doe")}
      <label className="validated-field">Email<input type="email" value={values.email} readOnly disabled /></label>
      {field("phone", "Phone", "9876543210", "tel")}
      {field("defaultAddress", "Default address", "123 Main Street, Bengaluru")}
      <button className="primary-button" disabled={saving}>Save profile</button>
    </form></section>
    <section className="profile-card"><h2>Change password</h2><form className="auth-form" noValidate onSubmit={changePassword}>
      {field("currentPassword", "Current password", "Enter your current password", "password")}
      {field("newPassword", "New password", "Example@123", "password")}
      {field("confirmPassword", "Confirm new password", "Example@123", "password")}
      <button className="secondary-button" disabled={saving}>Change password</button>
    </form></section>
  </div>;
}
export default Profile;
