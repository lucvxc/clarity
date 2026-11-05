import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getTiers } from "./catalog";
import { rankName } from "./rank";
import { getRpcState, setRpcStatus, watchRpc } from "./rpcsettings";
import { useToast } from "../ui/toast";
import type { Account, OverviewStats, Tier } from "./types";

const CLARITY_ICON =
  "https://cdn.discordapp.com/attachments/1440860749768560751/1565547522284454050/clarity.png?ex=6ae54d3f&is=6ae3fbbf&hm=e7da882276f8c0c333ede8c596bcf2090bced9308421f850bfb2d4f27f5a4552";
const RETRY_MS = 5_000;
const SYNC_MS = 60_000;

type Props = {
  account: Account | null;
  stats: OverviewStats | null;
};

type RpcDebug = {
  state: string;
  gameState: string;
  presenceError: string | null;
};

function Rpc({ account, stats }: Props) {
  const [tiers, setTiers] = useState<Record<number, Tier>>({});
  const [prefs, setPrefs] = useState(getRpcState);
  const toast = useToast();
  const currentTier = stats?.currentTier ?? null;
  const recentTier =
    stats?.recentMatches.find((match) => match.competitive && match.tier != null)
      ?.tier ?? null;
  const peakTier = stats?.peakTier ?? null;
  const tier = currentTier ?? recentTier ?? peakTier;
  const tierSource =
    currentTier != null
      ? "current"
      : recentTier != null
        ? "recent match"
        : peakTier != null
          ? "peak"
          : "none";

  useEffect(() => watchRpc(setPrefs), []);

  useEffect(() => {
    let active = true;
    void getTiers()
      .then((value) => {
        if (active) setTiers(value);
      })
      .catch((error) => {
        console.error("[Clarity RPC] rank icon catalog failed", error);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let pending = false;
    let retryTimer: number | undefined;
    let retryDelay = RETRY_MS;

    function retrySoon() {
      if (!active || retryTimer !== undefined) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        void sync();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60_000);
    }

    async function sync() {
      if (pending) return;
      pending = true;
      if (!prefs.enabled) {
        try {
          const result = await invoke<RpcDebug>("sync_rpc", {
            update: { enabled: false },
          });
          console.info("[Clarity RPC] disabled", result);
        } catch (error) {
          console.error("[Clarity RPC] failed to disable", error);
          setRpcStatus("offline", String(error));
          pending = false;
          retrySoon();
          return;
        }
        setRpcStatus("disabled");
        pending = false;
        return;
      }

      const ranked = tier != null && tier >= 3;
      const info = tier == null ? undefined : tiers[tier];
      const unranked = tier != null && tier < 3 ? tiers[0] : undefined;
      const smallImage = prefs.showRank
        ? ranked
          ? info?.largeIcon || info?.smallIcon
          : unranked?.largeIcon || unranked?.smallIcon
        : null;
      const smallText = prefs.showRank
        ? ranked
          ? `${tierSource === "peak" ? "Peak " : ""}${rankName(tier, tiers)}`
          : tier != null && tier < 3
            ? "Unranked"
            : undefined
        : undefined;
      const update = {
        enabled: true,
        showParty: prefs.showParty,
        largeImage:
          prefs.image === "card"
            ? account?.playerCardId
              ? `https://media.valorant-api.com/playercards/${account.playerCardId}/largeart.png`
              : null
            : CLARITY_ICON,
        largeText:
          account && !prefs.hideUsername
            ? `${account.gameName}#${account.tagLine}`
            : null,
        smallImage: smallImage || null,
        smallText: smallText || null,
      };

      try {
        console.info("[Clarity RPC] publishing", {
          image: prefs.image,
          showRank: prefs.showRank,
          accountLoaded: Boolean(account),
          rankTier: tier,
          rankSource: tierSource,
          currentTier,
          recentTier,
          peakTier,
          rankImageLoaded: Boolean(update.smallImage),
        });
        const result = await invoke<RpcDebug>("sync_rpc", { update });
        console.info("[Clarity RPC] IPC result", result);
        if (retryTimer !== undefined) window.clearTimeout(retryTimer);
        retryTimer = undefined;
        if (result.presenceError) {
          console.warn("[Clarity RPC] game presence unavailable", result.presenceError);
        }
        if (active && result.state !== "stale")
          setRpcStatus(result.state === "disabled" ? "disabled" : "connected");
        retryDelay = RETRY_MS;
      } catch (error) {
        console.error("[Clarity RPC] failed to publish", error);
        if (active) {
          const previous = getRpcState().status;
          if (previous !== "offline") {
            toast.error(
              previous === "connected" ? "Discord disconnected" : "Discord unavailable",
              "Open the Discord desktop app to show Clarity Rich Presence.",
            );
          }
          setRpcStatus("offline", String(error));
          retrySoon();
        }
      }
      pending = false;
    }

    void sync();
    const timer = window.setInterval(() => {
      if (active) void sync();
    }, SYNC_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [account?.gameName, account?.tagLine, account?.playerCardId, tier, tierSource, currentTier, recentTier, peakTier, tiers, prefs.enabled, prefs.image, prefs.showRank, prefs.showParty, prefs.hideUsername, toast]);

  return null;
}

export default Rpc;
