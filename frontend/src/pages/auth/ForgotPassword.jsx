import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { API_ENDPOINTS, apiClient } from "../../api";
import AuthLayout from "../../components/AuthLayout";
import ValidatedField from "../../components/ValidatedField";
import { useFormValidation, validators } from "../../utils/formValidation";

function ForgotPassword({ role }) {
  const navigate = useNavigate(); const [step, setStep] = useState(1); const [email, setEmail] = useState("");
  const [otp, setOtp] = useState(Array(6).fill("")); const refs = useRef([]);
  const [seconds, setSeconds] = useState(0); const [resetToken, setResetToken] = useState("");
  const [expiresAt, setExpiresAt] = useState(null);
  const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const validation = useFormValidation({ email, password, confirmPassword }, { email: validators.email, password: validators.password, confirmPassword: validators.confirmPassword });
  const loginPath = role === "driver" ? "/driver-login" : "/";
  useEffect(() => { if (!seconds) return undefined; const timer = setInterval(() => setSeconds((value) => value - 1), 1000); return () => clearInterval(timer); }, [seconds]);
  const send = async () => {
    if (!validation.validateFields(["email"])) return;
    setBusy(true); setError("");
    try { await apiClient.post(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, { email, role }, { auth: false }); setStep(2); setSeconds(60); setExpiresAt(new Date(Date.now() + 10 * 60 * 1000)); setNotice("If an account exists, we've sent a code."); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const changeDigit = (index, value) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length > 1) {
      const next = [...otp]; digits.slice(0, 6).split("").forEach((digit, offset) => { if (index + offset < 6) next[index + offset] = digit; }); setOtp(next); refs.current[Math.min(index + digits.length, 5)]?.focus(); return;
    }
    const next = [...otp]; next[index] = digits; setOtp(next); if (digits && index < 5) refs.current[index + 1]?.focus();
  };
  const verify = async () => {
    setBusy(true); setError("");
    try { const result = await apiClient.post(API_ENDPOINTS.AUTH.VERIFY_OTP, { email, role, otp: otp.join("") }, { auth: false }); setResetToken(result.data.resetToken); setStep(3); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const reset = async (event) => {
    event.preventDefault(); setError("");
    if (!validation.validateFields(["password", "confirmPassword"])) return;
    setBusy(true);
    try { await apiClient.post(API_ENDPOINTS.AUTH.RESET_PASSWORD, { resetToken, newPassword: password }, { auth: false }); setNotice("Password updated successfully. Taking you to login…"); setTimeout(() => navigate(loginPath), 1400); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <AuthLayout title="Forgot password?" subtitle={role === "driver" ? "Driver account recovery" : "Customer account recovery"}>
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="page-message" role="status">{notice}</p>}
    {step === 1 && <form className="auth-form" noValidate onSubmit={(event) => { event.preventDefault(); send(); }}><ValidatedField id="forgot-email" name="email" label="Email" type="email" value={email} placeholder="name@example.test error={validation.errors.email} onChange={(event) => { setEmail(event.target.value); validation.changeField("email", event.target.value); }} onBlur={validation.blurField} required autoComplete="email" /><button className="login-button" disabled={busy}>{busy ? "Sending…" : "Send OTP"}</button></form>}
    {step === 2 && <div className="auth-form"><p>Enter the six-digit code. Code expires at {expiresAt?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.</p><div className="otp-inputs">{otp.map((digit, index) => <input key={index} ref={(node) => { refs.current[index] = node; }} aria-label={`Digit ${index + 1}`} inputMode="numeric" autoComplete={index === 0 ? "one-time-code" : "off"} maxLength={1} value={digit} onChange={(event) => changeDigit(index, event.target.value)} onKeyDown={(event) => { if (event.key === "Backspace" && index) { if (otp[index]) { const next = [...otp]; next[index] = ""; setOtp(next); event.preventDefault(); } refs.current[index - 1]?.focus(); } }} onPaste={(event) => { event.preventDefault(); changeDigit(index, event.clipboardData.getData("text")); }} />)}</div><button className="login-button" onClick={verify} disabled={busy || otp.join("").length !== 6}>{busy ? "Verifying…" : "Verify code"}</button><button className="text-button" onClick={send} disabled={busy || seconds > 0}>Resend code {seconds > 0 ? `(${seconds}s)` : ""}</button></div>}
    {step === 3 && <form className="auth-form" noValidate onSubmit={reset}><ValidatedField id="reset-password" name="password" label="New password" type={showPassword ? "text" : "password"} value={password} placeholder="Example@123" hint="At least 8 characters, one letter and one number" error={validation.errors.password} onChange={(event) => { setPassword(event.target.value); validation.changeField("password", event.target.value); }} onBlur={validation.blurField} required autoComplete="new-password" /><ValidatedField id="reset-confirm-password" name="confirmPassword" label="Confirm new password" type={showPassword ? "text" : "password"} value={confirmPassword} placeholder="Example@123" error={validation.errors.confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); validation.changeField("confirmPassword", event.target.value); }} onBlur={validation.blurField} required autoComplete="new-password" /><label className="show-password"><input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} /> Show password</label><button className="login-button" disabled={busy}>{busy ? "Saving…" : "Set new password"}</button></form>}
    <p className="auth-footer"><Link to={loginPath}>← Back to login</Link></p>
  </AuthLayout>;
}
export default ForgotPassword;
