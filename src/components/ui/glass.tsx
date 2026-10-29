import type { HTMLAttributes } from "react";

type GlassProps = HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  hoverable?: boolean;
};

function Glass({ active = true, hoverable = false, children, className = "", ...props }: GlassProps) {
  return (
    <div
      {...props}
      className={[
        "group relative isolate overflow-hidden rounded-lg border transition-[border-color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
        active
          ? "border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_32px_rgba(0,0,0,0.25)]"
          : hoverable
            ? "border-transparent shadow-none hover:border-white/10 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_32px_rgba(0,0,0,0.25)]"
            : "border-transparent shadow-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-0 z-0 rounded-[inherit] bg-white/[0.055] backdrop-blur-2xl transition-opacity duration-200 ease-out motion-reduce:transition-none",
          active
            ? "opacity-100"
            : hoverable
              ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              : "opacity-0",
        ].join(" ")}
      />
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-white/[0.07] via-transparent to-white/[0.015] transition-opacity duration-200 ease-out motion-reduce:transition-none",
          active
            ? "opacity-100"
            : hoverable
              ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              : "opacity-0",
        ].join(" ")}
      />
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-x-3 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent transition-opacity duration-200 ease-out motion-reduce:transition-none",
          active
            ? "opacity-100"
            : hoverable
              ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              : "opacity-0",
        ].join(" ")}
      />
      {children}
    </div>
  );
}

export default Glass;
