import { useState } from "react";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const passwordPattern = /^(?=.*[a-z])(?=.*\d).{8,128}$/i;

export const validators = {
  requiredText: (value) => String(value || "").trim() ? "" : "This field is required.",
  requiredPassword: (value) => String(value || "") ? "" : "Enter your password.",
  email: (value) => emailPattern.test(String(value || "").trim()) ? "" : "Enter a valid email, e.g. name@example.test",
  password: (value) => passwordPattern.test(String(value || "")) ? "" : "Use at least 8 characters, one letter and one number (e.g. Example@123).",
  confirmPassword: (value, values) => value && value === values.password ? "" : "Passwords must match.",
  name: (value) => String(value || "").trim().length >= 2 ? "" : "Enter a name with at least 2 characters (e.g. John Doe).",
  phone: (value) => String(value || "").trim().length >= 7 ? "" : "Enter a valid phone number (e.g. 9876543210).",
  optionalPhone: (value) => !String(value || "").trim() || String(value).trim().length >= 7 ? "" : "Enter a valid phone number (e.g. 9876543210).",
  licenseNumber: (value) => String(value || "").trim().length >= 5 ? "" : "Enter a valid license number (e.g. KA0120200012345).",
  vehicleNumber: (value) => String(value || "").trim().length >= 4 ? "" : "Enter a valid vehicle number (e.g. KA01AB1234).",
  vehicleType: (value) => String(value || "").trim().length >= 2 ? "" : "Enter a vehicle type (e.g. Truck).",
  trackingNumber: (value) => String(value || "").trim() ? "" : "Enter a tracking number (e.g. LTS1793281464000).",
  weight: (value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0) ? "" : "Enter a non-negative weight in kilograms."
};

export function serverFieldError(message, fields) {
  const text = String(message || "");
  const normalized = text.toLowerCase();
  const field = Object.entries(fields).find(([, words]) => words.some((word) => normalized.includes(word)));
  return field ? { [field[0]]: text } : { _form: text };
}

export function useFormValidation(values, rules) {
  const [errors, setErrors] = useState({});
  const check = (name, value, currentValues = values) => {
    const rule = rules[name];
    return rule ? rule(value, currentValues) || "" : "";
  };
  const blurField = (name) => setErrors((current) => ({ ...current, [name]: check(name, values[name]) }));
  const changeField = (name, value, currentValues = values) => {
    const error = check(name, value, { ...currentValues, [name]: value });
    setErrors((current) => current[name] && !error ? { ...current, [name]: "" } : current);
  };
  const validateFields = (names = Object.keys(rules)) => {
    const next = Object.fromEntries(names.map((name) => [name, check(name, values[name])]));
    setErrors((current) => ({ ...current, ...next }));
    const first = names.find((name) => next[name]);
    if (first) (document.getElementById(first) || document.querySelector(`[name="${first}"]`))?.focus();
    return !first;
  };
  const setServerErrors = (next) => setErrors((current) => ({ ...current, ...next }));
  return { errors, blurField, changeField, validateAll: () => validateFields(), validateFields, setServerErrors, clearErrors: () => setErrors({}) };
}
