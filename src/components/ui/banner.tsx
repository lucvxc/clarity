import { IconRefresh, IconUserFilled } from "@tabler/icons-react";
import { useEffect, useState, type ReactNode } from "react";
import Glass from "./glass";
import Skeleton from "./skeleton";

type Props = {
  cardId: string | null;
  name: string | null;
  tag: string | null;
  loading: boolean;
  onRefresh?: () => void;
  children: ReactNode;
};

function Banner({ cardId, name, tag, loading, onRefresh, children }: Props) {
  const [wideFailed, setWideFailed] = useState(false);
  const [largeFailed, setLargeFailed] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  useEffect(() => {
    setWideFailed(false);
    setLargeFailed(false);
    setArtFailed(false);
  }, [cardId]);

  const url = cardId ? `https://media.valorant-api.com/playercards/${cardId}` : null;

  return (
    <Glass className="rounded-lg p-2.5 sm:p-3">
      {url && !largeFailed && (
        <img
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full scale-110 object-cover object-center opacity-35 blur-xl"
          onError={() => wideFailed ? setLargeFailed(true) : setWideFailed(true)}
          src={`${url}/${wideFailed ? "largeart" : "wideart"}.png`}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/80 via-black/65 to-black/70" />
      <div className="relative z-20">
        <div className="flex min-w-0 items-center gap-2.5">
          {url && !artFailed ? (
            <img
              alt=""
              className="size-10 shrink-0 rounded-md border border-white/15 object-cover"
              onError={() => setArtFailed(true)}
              src={`${url}/smallart.png`}
            />
          ) : name ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-md bg-white/[0.06]">
              <IconUserFilled aria-hidden="true" className="size-5 text-zinc-500" />
            </span>
          ) : (
            <Skeleton className="size-10 shrink-0 rounded-md" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">
              {name ?? <Skeleton className="h-4 w-28" />}
            </p>
            <p className="mt-0.5 truncate text-xs text-white/55">
              {tag ?? "Launch VALORANT to show stats"}
            </p>
          </div>
          {onRefresh && (
            <button
              aria-label="Refresh stats"
              className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[11px] text-zinc-300 transition-colors hover:bg-white/[0.09] hover:text-white disabled:cursor-wait disabled:opacity-50"
              disabled={loading}
              onClick={onRefresh}
              type="button"
            >
              <IconRefresh aria-hidden="true" className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Waiting" : "Refresh"}
            </button>
          )}
        </div>
        <div className="my-2 h-px bg-white/[0.09]" />
        {children}
      </div>
    </Glass>
  );
}

export default Banner;
