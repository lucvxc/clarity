function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block animate-pulse rounded bg-white/10 ${className}`} />;
}

export default Skeleton;
