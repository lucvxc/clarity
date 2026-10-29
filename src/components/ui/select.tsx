import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";

type Option<T extends string | number> = { label: string; value: T };

type Props<T extends string | number> = {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  className?: string;
};

function Select<T extends string | number>({ label, value, options, onChange, className = "" }: Props<T>) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const selected = options.find((option) => option.value === value);

  function place() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;

    const width = Math.min(Math.max(rect.width, 144), window.innerWidth - 16);
    const height = Math.min(options.length * 32 + 8, window.innerHeight - 16);
    const above = rect.bottom + height + 6 > window.innerHeight && rect.top > height + 6;
    const top = above ? rect.top - height - 6 : rect.bottom + 6;
    const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8));
    setPosition({ left, top, width, maxHeight: Math.max(80, window.innerHeight - top - 8) });
  }

  useEffect(() => {
    if (!open) return;

    function update() {
      place();
    }
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) setOpen(false);
    }
    function keys(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keys);
    };
  }, [open, options.length]);

  return (
    <div className={`relative ${className}`}>
      <button
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-8 min-w-36 cursor-pointer items-center justify-between gap-5 rounded-md border border-white/10 bg-white/[0.045] px-3 text-[11px] text-zinc-200 transition-colors hover:border-white/20 hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${className.includes("w-full") ? "w-full" : ""}`}
        onClick={() => {
          if (open) setOpen(false);
          else {
            place();
            setOpen(true);
          }
        }}
        ref={trigger}
        type="button"
      >
        <span>{selected?.label ?? label}</span>
        <IconChevronDown aria-hidden="true" className={`size-3.5 shrink-0 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && position && createPortal(
        <div
          aria-label={label}
          className="fixed z-[1000] overflow-y-auto rounded-md border border-white/10 bg-[#171717]/95 p-1 font-[Google_Sans,sans-serif] shadow-xl backdrop-blur-xl"
          ref={menu}
          role="listbox"
          style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}
        >
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={`block w-full whitespace-nowrap rounded px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-white/[0.08] ${option.value === value ? "text-white" : "text-zinc-400"}`}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

export default Select;
