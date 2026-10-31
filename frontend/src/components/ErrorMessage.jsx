function ErrorMessage({ message, onRetry }) {
  if (!message) return null;

  return (
    <div className="page-error" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="secondary-button" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export default ErrorMessage;
