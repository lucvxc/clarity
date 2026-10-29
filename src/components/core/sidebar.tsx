import { useEffect, useState } from "react";
import {
  IconHomeFilled,
  IconLayoutGridFilled,
  IconSettingsFilled,
} from "@tabler/icons-react";
import Glass from "../ui/glass";
import Skeleton from "../ui/skeleton";
import type { AccountStatus, ValAcc } from "./types";

export type SidebarTab = "home" | "match" | "settings";

type SidebarProps = {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  account: ValAcc | null;
  accountStatus: AccountStatus;
};

function Sidebar({ activeTab, onTabChange, account, accountStatus }: SidebarProps) {
  const [cardFailed, setCardFailed] = useState(false);

  useEffect(() => setCardFailed(false), [account?.playerCardId]);

  const cardId = account?.playerCardId && !cardFailed ? account.playerCardId : null;
  const cardUrl = cardId
    ? `https://media.valorant-api.com/playercards/${cardId}/smallart.png`
    : null;
  const backdropUrl = cardId
    ? `https://media.valorant-api.com/playercards/${cardId}/largeart.png`
    : null;

  function tab(
    tabName: SidebarTab,
    label: string,
    Icon: typeof IconHomeFilled | typeof IconLayoutGridFilled | typeof IconSettingsFilled,
  ) {
    const selected = activeTab === tabName;

    return (
      <Glass active={selected} className="w-full" hoverable>
        <button
          aria-current={selected ? "page" : undefined}
          className={[
            "relative z-20 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-normal leading-5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
            selected ? "text-white" : "text-zinc-400 hover:text-white",
          ].join(" ")}
          onClick={() => onTabChange(tabName)}
          type="button"
        >
          <Icon aria-hidden="true" className="size-4 shrink-0" />
          <span>{label}</span>
        </button>
      </Glass>
    );
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col bg-white/[0.035] backdrop-blur-2xl">
      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1 p-3 pt-12">
        {tab("home", "Home", IconHomeFilled)}
        {tab("match", "Current Match", IconLayoutGridFilled)}
      </nav>

      <div className="px-3 pb-2">{tab("settings", "Settings", IconSettingsFilled)}</div>

      <div className="px-3 pb-3">
        {account ? (
          <Glass className="h-[62px] p-2.5">
            {backdropUrl && (
              <img
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 h-full w-full scale-125 object-cover opacity-35 blur-xl"
                onError={() => setCardFailed(true)}
                src={backdropUrl}
              />
            )}
            <div className="pointer-events-none absolute inset-0 z-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative z-20 flex h-full min-w-0 items-center gap-3">
              {cardUrl ? (
                <img
                  alt=""
                  className="size-10 shrink-0 rounded-lg border border-white/15 object-cover"
                  onError={() => setCardFailed(true)}
                  src={cardUrl}
                />
              ) : (
                <div className="size-10 shrink-0 rounded-lg border border-white/10 bg-white/[0.04]" />
              )}
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-white">{account.gameName}</p>
                <p className="mt-0.5 truncate text-[11px] text-white/60">#{account.tagLine}</p>
              </div>
            </div>
          </Glass>
        ) : accountStatus === "checking" ? (
          <Glass className="h-[62px] p-2.5">
            <div className="relative z-20 flex h-full items-center gap-3">
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-2.5 w-12" />
              </div>
            </div>
          </Glass>
        ) : (
          <Glass className="px-3 py-3">
            <div className="relative z-20">
              <p className="text-xs font-medium text-zinc-300">
                No account detected
              </p>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                Open Riot Client to show your profile
              </p>
            </div>
          </Glass>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
