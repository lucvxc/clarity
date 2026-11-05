import type { Tier } from "./types";

const RANKS = [
  "Iron",
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Ascendant",
  "Immortal",
];

export function rankName(tier: number | null, tiers: Record<number, Tier>) {
  if (tier == null) return "Unavailable";
  if (tier < 3) return "Unranked";

  const name = tiers[tier]?.tierName;
  if (name)
    return name
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  if (tier === 27) return "Radiant";

  const step = tier - 3;
  return `${RANKS[Math.floor(step / 3)] ?? "Rank"} ${(step % 3) + 1}`;
}
