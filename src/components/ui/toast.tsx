import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  IconAlertCircleFilled,
  IconCircleCheckFilled,
  IconInfoCircleFilled,
  IconX,
} from "@tabler/icons-react";
import Glass from "./glass";

type Kind = "success" | "error" | "info";
type Toast = {
  id: number;
  kind: Kind;
  title: string;
  detail?: string;
};
type ToastApi = {
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
  info: (title: string, detail?: string) => void;
  dismiss: (id: number) => void;
};

const Context = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (kind: Kind, title: string, detail?: string) => {
      const id = ++nextId.current;
      setItems((current) => [...current.slice(-3), { id, kind, title, detail }]);
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, detail) => push("success", title, detail),
      error: (title, detail) => push("error", title, detail),
      info: (title, detail) => push("info", title, detail),
      dismiss,
    }),
    [dismiss, push],
  );

  return (
    <Context.Provider value={api}>
      {children}
      <div
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
        role="region"
      >
        {items.map((item) => (
          <ToastItem key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </Context.Provider>
  );
}

function ToastItem({
  item,
  onDismiss,
}: {
  item: Toast;
  onDismiss: (id: number) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const Icon =
    item.kind === "success"
      ? IconCircleCheckFilled
      : item.kind === "error"
        ? IconAlertCircleFilled
        : IconInfoCircleFilled;
  const color =
    item.kind === "success"
      ? "text-emerald-400"
      : item.kind === "error"
        ? "text-rose-400"
        : "text-sky-300";

  useEffect(() => {
    const element = node.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    element.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 180, easing: "ease-out" },
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), 4200);
    return () => window.clearTimeout(timer);
  }, [item.id, onDismiss]);

  return (
    <div ref={node} className="pointer-events-auto">
      <Glass className="rounded-lg p-3" role={item.kind === "error" ? "alert" : "status"}>
        <div className="relative z-20 flex items-start gap-2.5">
          <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${color}`} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-zinc-100">{item.title}</p>
            {item.detail && (
              <p className="mt-1 text-[11px] leading-4 text-zinc-400">
                {item.detail}
              </p>
            )}
          </div>
          <button
            aria-label="Dismiss notification"
            className="-mr-1 -mt-1 rounded p-1 text-zinc-500 transition-colors hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
            onClick={() => onDismiss(item.id)}
            type="button"
          >
            <IconX aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      </Glass>
    </div>
  );
}

export function useToast() {
  const value = useContext(Context);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}
