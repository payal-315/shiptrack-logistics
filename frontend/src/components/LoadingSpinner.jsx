function LoadingSpinner({ label = "Loading..." }) {
  return (
    <p className="page-message" role="status">
      {label}
    </p>
  );
}

export default LoadingSpinner;
