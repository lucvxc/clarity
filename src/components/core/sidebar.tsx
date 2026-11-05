import { useEffect, useState } from "react";
import {
  IconAwardFilled,
  IconHomeFilled,
  IconLayoutGridFilled,
  IconMapPinFilled,
  IconShoppingCartFilled,
  IconSettingsFilled,
} from "@tabler/icons-react";
import Glass from "../ui/glass";
import Skeleton from "../ui/skeleton";
import type { Account, AccountStatus } from "./types";

export type SidebarTab = "home" | "match" | "history" | "store" | "lineups" | "settings";

type SidebarProps = {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  account: Account | null;
  accountStatus: AccountStatus;
};

function Sidebar({
  activeTab,
  onTabChange,
  account,
  accountStatus,
}: SidebarProps) {
  const [cardFailed, setCardFailed] = useState(false);

  useEffect(() => setCardFailed(false), [account?.playerCardId]);

  const cardId =
    account?.playerCardId && !cardFailed ? account.playerCardId : null;
  const cardUrl = cardId
    ? `https://media.valorant-api.com/playercards/${cardId}/smallart.png`
    : null;
  const backdropUrl = cardId
    ? `https://media.valorant-api.com/playercards/${cardId}/largeart.png`
    : null;

  function tab(
    tabName: SidebarTab,
    label: string,
    Icon:
      | typeof IconHomeFilled
      | typeof IconAwardFilled
      | typeof IconLayoutGridFilled
      | typeof IconMapPinFilled
      | typeof IconShoppingCartFilled
      | typeof IconSettingsFilled,
  ) {
    const selected = activeTab === tabName;

    return (
      <Glass active={false} className="w-full" hoverable>
        <button
          aria-current={selected ? "page" : undefined}
          className={[
            "relative z-20 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] font-normal leading-5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
            selected
              ? "bg-white/[0.09] text-white"
              : "text-zinc-400 hover:bg-white/[0.04] hover:text-white",
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
    <aside className="flex h-full w-56 shrink-0 flex-col bg-[#101010]">
      <div className="flex items-center gap-2.5 px-4 pt-5 pb-2">
        <img
          alt=""
          className="size-8 shrink-0 rounded-md object-cover"
          src="/clarity.png"
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-4 text-white">Clarity</div>
          <div className="mt-0.5 text-[10px] leading-3 text-zinc-500">v0.3</div>
        </div>
      </div>
      <nav
        aria-label="Main navigation"
        className="flex flex-1 flex-col gap-1 p-3 pt-0"
      >
        {tab("home", "Home", IconHomeFilled)}
        {tab("store", "Store", IconShoppingCartFilled)}
        {tab("lineups", "Lineups", IconMapPinFilled)}
        {tab("match", "Current Match", IconLayoutGridFilled)}
        {tab("history", "Match History", IconAwardFilled)}
      </nav>

      <div className="px-3 pb-2">
        {tab("settings", "Settings", IconSettingsFilled)}
      </div>

      <div className="px-2 pb-3">
        {account ? (
          <Glass className="h-[70px] min-w-0 p-2.5">
            {backdropUrl && (
              <img
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute -inset-6 z-0 h-[calc(100%+3rem)] w-[calc(100%+3rem)] object-cover opacity-35 blur-lg"
                onError={() => setCardFailed(true)}
                src={backdropUrl}
              />
            )}
            <div className="pointer-events-none absolute inset-0 z-0 bg-black/60" />
            <div className="relative z-20 flex h-full min-w-0 items-center gap-3">
              {cardUrl ? (
                <img
                  alt=""
                  className="size-12 shrink-0 rounded-lg object-cover"
                  onError={() => setCardFailed(true)}
                  src={cardUrl}
                />
              ) : (
                <div className="size-12 shrink-0 rounded-lg bg-white/[0.04]" />
              )}
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-white">
                  {account.gameName}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-white/60">
                  #{account.tagLine}
                </p>
              </div>
            </div>
          </Glass>
        ) : accountStatus === "checking" ? (
          <Glass className="h-[70px] min-w-0 p-2.5">
            <div className="relative z-20 flex h-full items-center gap-3">
              <Skeleton className="size-12 shrink-0 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-2.5 w-12" />
              </div>
            </div>
          </Glass>
        ) : (
          <Glass className="h-[70px] min-w-0 p-2.5">
            <div className="relative z-20 flex h-full items-center gap-3">
              <Skeleton className="size-12 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <Skeleton className="mb-1.5 h-3 w-20" />
                <p className="text-[10px] leading-3 text-zinc-500">
                  Launch VALORANT to show stats
                </p>
              </div>
            </div>
          </Glass>
        )}
      </div>
    </aside>
  );
}

export default Sidebar;
