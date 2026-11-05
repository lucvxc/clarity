function Spinner({
  label = "Loading",
  className = "size-5",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      aria-label={label}
      className={`block animate-spin rounded-full border-2 border-white/15 border-t-white/75 motion-reduce:animate-none ${className}`}
      role="status"
    />
  );
}

export default Spinner;
