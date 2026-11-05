import Banner from "../ui/banner";
import Skeleton from "../ui/skeleton";
import { rankName } from "../core/rank";
import type { Account, LoadStatus, PlayerStats, Tier } from "../core/types";
import type { ActInfo } from "../core/catalog";

type Props = {
  account: Account | null;
  profile: PlayerStats | null;
  status: LoadStatus;
  tiers: Record<number, Tier>;
  acts: ActInfo[] | null;
};

function Profile({ account, profile, status, tiers, acts }: Props) {
  if (!account) return null;

  const level = profile?.level;
  const tag = `#${account.tagLine}${level != null ? ` · Lvl ${level}` : ""}`;
  const currentAct = acts?.find((act) => isActive(act));
  const peakAct = profile?.peakActId
    ? acts?.find(
        (act) =>
          act.uuid?.toLowerCase() === profile.peakActId?.toLowerCase(),
      )
    : null;
  const loading = status === "checking";
  const peakActValue =
    profile?.peakTier == null
      ? loading ? null : "No peak yet"
      : peakAct?.displayName ?? (acts == null ? null : "Act unavailable");

  return (
    <Banner
      cardId={account.playerCardId}
      name={account.gameName}
      tag={tag}
      loading={loading}
    >
      <div className="grid grid-cols-2 divide-x divide-white/[0.08] md:grid-cols-4">
        <TextCell
          label="Current act"
          value={
            currentAct?.displayName ??
            (acts == null ? null : "Act unavailable")
          }
          loading={acts == null}
        />
        <RankCell
          label="Current rank"
          tier={profile?.currentTier ?? null}
          rating={profile?.rating ?? null}
          tiers={tiers}
          loading={loading}
          peak={false}
        />
        <RankCell
          label="Peak rank"
          tier={profile?.peakTier ?? null}
          tiers={tiers}
          loading={loading}
          peak
        />
        <TextCell
          label="Peak act"
          value={peakActValue}
          loading={loading || (profile?.peakTier != null && acts == null)}
        />
      </div>
    </Banner>
  );
}

function RankCell({
  label,
  tier,
  rating,
  tiers,
  loading,
  peak,
}: {
  label: string;
  tier: number | null;
  rating?: number | null;
  tiers: Record<number, Tier>;
  loading: boolean;
  peak: boolean;
}) {
  const icon =
    tier == null ? null : tiers[tier]?.smallIcon || tiers[tier]?.largeIcon;
  const value =
    tier != null
      ? rankName(tier, tiers)
      : loading
        ? null
        : peak
          ? "No peak yet"
          : "Unranked";
  const detail = !peak && rating != null ? `${rating} RR` : null;

  return (
    <div className="min-h-[52px] min-w-0 px-2 first:pl-0 last:pr-0 md:px-3">
      <p className="text-[10px] leading-3 text-zinc-500">{label}</p>
      <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
        {icon && <img alt="" className="size-5 shrink-0 object-contain" src={icon} />}
        {loading ? (
          <Skeleton className="h-4 w-20" />
        ) : (
          <p className="truncate text-[13px] font-medium text-zinc-100">
            {value}
          </p>
        )}
      </div>
      {detail && <p className="mt-0.5 text-[10px] text-zinc-500">{detail}</p>}
    </div>
  );
}

function TextCell({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | null;
  loading: boolean;
}) {
  return (
    <div className="min-h-[52px] min-w-0 px-2 first:pl-0 last:pr-0 md:px-3">
      <p className="text-[10px] leading-3 text-zinc-500">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-4 w-16" />
      ) : (
        <p className="mt-0.5 truncate text-[13px] font-medium text-zinc-100">
          {value}
        </p>
      )}
    </div>
  );
}

function isActive(act: ActInfo) {
  const now = Date.now();
  const start = Date.parse(act.startTime);
  const end = Date.parse(act.endTime);
  return (
    act.type?.toLowerCase().endsWith("act") &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    start <= now &&
    now < end
  );
}

export default Profile;
