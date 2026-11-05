type Props = {
  className?: string;
};

function You({ className = "" }: Props) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded bg-white/10 px-1 text-[8px] font-semibold text-zinc-300 ${className}`}>
      YOU
    </span>
  );
}

export default You;
