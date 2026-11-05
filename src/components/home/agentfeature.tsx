import { useEffect, useState } from "react";
import Skeleton from "../ui/skeleton";
import type { AgentInfo } from "../core/catalog";

type Props = {
  agent: AgentInfo | null;
  status: "checking" | "ready" | "error";
  agentGames: number | null;
  recentGames: number | null;
};

function AgentFeature({ agent, status, agentGames, recentGames }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [agent]);

  return (
    <section
      aria-label="Most played agent"
      className="relative min-h-[315px] overflow-hidden"
    >
      {agent?.fullPortrait && !imageFailed ? (
        <img
          alt={agent.displayName}
          className="pointer-events-none absolute inset-0 size-full -translate-y-5 scale-110 object-contain object-right-bottom drop-shadow-[0_18px_32px_rgba(0,0,0,0.7)]"
          onError={() => setImageFailed(true)}
          src={agent.fullPortrait}
        />
      ) : agent?.displayIcon && !imageFailed ? (
        <img
          alt={agent.displayName}
          className="pointer-events-none absolute bottom-3 right-2 size-36 object-contain opacity-75"
          onError={() => setImageFailed(true)}
          src={agent.displayIcon}
        />
      ) : null}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#080808]/85 via-[#080808]/15 to-transparent" />
      <div className="relative z-10 p-3">
        <p className="text-[10px] font-medium text-zinc-500">Most Played</p>
        <p className="mt-1 text-lg font-semibold text-zinc-100">
          {agent?.displayName ??
            (status === "checking" ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              "No agent data"
            ))}
        </p>
        <p className="mt-1 text-[10px] text-zinc-400">
          {agent?.role?.displayName && `${agent.role.displayName} · `}
          {agentGames != null && recentGames != null
            ? `${agentGames} matches`
            : "From recent matches"}
        </p>
      </div>
    </section>
  );
}

export default AgentFeature;
