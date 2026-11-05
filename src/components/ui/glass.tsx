import type { HTMLAttributes } from "react";

type GlassProps = HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  hoverable?: boolean;
  borderless?: boolean;
};

function Glass({
  active = true,
  hoverable = false,
  borderless = false,
  children,
  className = "",
  ...props
}: GlassProps) {
  const surface = borderless
    ? "bg-transparent"
    : active
      ? "bg-[#141414]"
      : hoverable
        ? "bg-transparent hover:bg-[#171717]"
        : "bg-[#141414]";

  return (
    <div
      {...props}
      className={`relative isolate overflow-hidden rounded-lg transition-colors duration-150 ${surface} ${className}`}
    >
      {children}
    </div>
  );
}

export default Glass;
