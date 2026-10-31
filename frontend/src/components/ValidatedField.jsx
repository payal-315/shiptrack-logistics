function ValidatedField({ id, name, label, error, hint, onBlur, ...inputProps }) {
  const inputId = id || name;
  const errorId = inputId + "-error";
  return <div className="validated-field">
    <label htmlFor={inputId}>{label}</label>
    <input id={inputId} name={name} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : hint ? inputId + "-hint" : undefined} onBlur={() => onBlur?.(name)} {...inputProps} />
    {error && <span className="field-error" id={errorId}>{error}</span>}
    {!error && hint && <span className="field-hint" id={inputId + "-hint"}>{hint}</span>}
  </div>;
}
export default ValidatedField;
